import { locationPath } from "./tree";
import type { Item, Location, Tag } from "./types";

// A tag whose name ends in "box" (e.g. "Small box", "Extra large box") marks
// an item as a storage box of that size.
export function isSizeTag(tag: Tag): boolean {
  return /\bbox(es)?$/i.test(tag.name.trim());
}

// Smallest first; sizes without a recognised word go last, alphabetically.
function sizeRank(name: string): number {
  const n = name.toLowerCase();
  if (/extra[\s-]*small|\bxs\b/.test(n)) return 0;
  if (/extra[\s-]*large|\bxl\b/.test(n)) return 4;
  if (/small|mini/.test(n)) return 1;
  if (/medium|\bmed\b/.test(n)) return 2;
  if (/large|big/.test(n)) return 3;
  return 5;
}

export function sortSizes(tags: Tag[]): Tag[] {
  return [...tags].sort(
    (a, b) => sizeRank(a.name) - sizeRank(b.name) || a.name.localeCompare(b.name, undefined, { numeric: true }),
  );
}

// Items named like a numbered packing box, e.g. "11 Box", "02 Carton",
// "03 Green Plastic Box" or "Box 6 - Deco". Names such as "Lunch Box" don't match.
export function looksLikeBox(name: string): boolean {
  return /^\s*\d+\b.*\b(box|carton|crate)\b/i.test(name) || /^\s*(box|carton|crate)\s*\d+/i.test(name);
}

export type BoxLine = { tag: Tag; count: number };

export type BoxSummary = {
  sizes: Tag[];
  total: number;
  bySize: BoxLine[];
  byLocation: { locationId: string | null; path: string; total: number; bySize: BoxLine[] }[];
  missing: Item[];
  // Items counted as boxes (have a size tag), after the tag filter.
  boxes: Item[];
};

// Counts boxes by quantity, so an item "Box" with quantity 3 counts as 3 boxes.
// `filterTagId` limits everything to items that also carry that tag.
export function summariseBoxes(
  items: Item[],
  tags: Tag[],
  locationById: Map<string, Location>,
  filterTagId: string | null,
): BoxSummary {
  const sizes = sortSizes(tags.filter(isSizeTag));
  const sizeIds = new Set(sizes.map((t) => t.id));
  const qty = (it: Item) => Math.max(it.quantity, 0);
  const inFilter = (it: Item) => !filterTagId || it.item_tags.some((t) => t.tag_id === filterTagId);

  const sizeTotals = new Map<string, number>();
  const locTotals = new Map<string | null, Map<string, number>>();
  const boxes: Item[] = [];
  const missing: Item[] = [];

  for (const it of items) {
    if (!inFilter(it)) continue;
    const itemSizes = it.item_tags.map((t) => t.tag_id).filter((id) => sizeIds.has(id));
    if (!itemSizes.length) {
      if (looksLikeBox(it.name)) missing.push(it);
      continue;
    }
    boxes.push(it);
    // An item tagged with two sizes by mistake counts once, under the first size.
    const size = sizes.find((s) => itemSizes.includes(s.id))!.id;
    sizeTotals.set(size, (sizeTotals.get(size) ?? 0) + qty(it));
    const loc = locTotals.get(it.location_id) ?? new Map<string, number>();
    loc.set(size, (loc.get(size) ?? 0) + qty(it));
    locTotals.set(it.location_id, loc);
  }

  const lines = (m: Map<string, number>) =>
    sizes.filter((s) => m.get(s.id)).map((tag) => ({ tag, count: m.get(tag.id)! }));
  const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0);

  return {
    sizes,
    total: sum(sizeTotals),
    bySize: sizes.map((tag) => ({ tag, count: sizeTotals.get(tag.id) ?? 0 })),
    byLocation: [...locTotals.entries()]
      .map(([locationId, m]) => ({
        locationId,
        path: locationPath(locationId, locationById) || "(unspecified)",
        total: sum(m),
        bySize: lines(m),
      }))
      .sort((a, b) => b.total - a.total || a.path.localeCompare(b.path)),
    missing,
    boxes,
  };
}
