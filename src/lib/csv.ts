import Papa from "papaparse";
import { supabase } from "./supabase";
import { locationPath, PATH_SEPARATOR } from "./tree";
import type { Category, Item, Location, Tag } from "./types";

export type ImportField =
  | "name"
  | "description"
  | "location"
  | "category"
  | "tags"
  | "quantity"
  | "value"
  | "currency"
  | "purchase_date"
  | "purchased_from"
  | "brand"
  | "model"
  | "serial_number"
  | "barcode"
  | "notes"
  | "condition";

export const IMPORT_FIELDS: { field: ImportField; label: string; guesses: string[] }[] = [
  { field: "name", label: "Name", guesses: ["name", "item", "item name", "title"] },
  { field: "description", label: "Description", guesses: ["description", "desc"] },
  { field: "location", label: "Location", guesses: ["location", "location path", "room", "place"] },
  { field: "category", label: "Category", guesses: ["category", "type"] },
  { field: "tags", label: "Tags", guesses: ["tags", "tag", "labels"] },
  { field: "quantity", label: "Quantity", guesses: ["quantity", "qty", "count"] },
  {
    field: "value",
    label: "Value",
    guesses: ["value", "price", "purchase price", "cost", "current value", "replacement value"],
  },
  { field: "currency", label: "Currency", guesses: ["currency"] },
  { field: "purchase_date", label: "Purchase date", guesses: ["purchase date", "date purchased", "purchased", "date"] },
  { field: "purchased_from", label: "Purchased from", guesses: ["purchased from", "store", "vendor", "retailer", "shop"] },
  { field: "brand", label: "Brand", guesses: ["brand", "make", "manufacturer"] },
  { field: "model", label: "Model", guesses: ["model", "model number"] },
  { field: "serial_number", label: "Serial number", guesses: ["serial number", "serial", "serial no"] },
  { field: "barcode", label: "Barcode", guesses: ["barcode", "upc", "ean"] },
  { field: "notes", label: "Notes", guesses: ["notes", "note", "comments"] },
  { field: "condition", label: "Condition (added to notes)", guesses: ["condition"] },
];

export type Mapping = Partial<Record<ImportField, string>>;
export type DateFormat = "DMY" | "MDY" | "YMD";

export type ImportOptions = {
  mapping: Mapping;
  locationSeparator: string; // "" = treat the whole value as one location name
  tagSeparator: string;
  dateFormat: DateFormat;
  defaultCurrency: string;
};

export function parseCsv(text: string) {
  const res = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  return { headers: res.meta.fields ?? [], rows: res.data, errors: res.errors };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Matches columns to fields by header name, ignoring columns with no data
// (UnderMyRoof exports an empty "Value" column next to a filled "Price").
export function guessMapping(headers: string[], rows: Record<string, string>[]): Mapping {
  const mapping: Mapping = {};
  const used = new Set(headers.filter((h) => !rows.some((r) => cell(r, h))));
  for (const { field, guesses } of IMPORT_FIELDS) {
    const hit = guesses
      .map((g) => headers.find((h) => !used.has(h) && norm(h) === g))
      .find(Boolean);
    if (hit) {
      mapping[field] = hit;
      used.add(hit);
    }
  }
  return mapping;
}

export function guessLocationSeparator(values: string[]): string {
  for (const sep of ["→", ">", "/", "\\", ":"]) {
    if (values.some((v) => v.includes(sep))) return sep;
  }
  return ">";
}

export function guessTagSeparator(values: string[]): string {
  return values.some((v) => v.includes(";")) ? ";" : ",";
}

const CURRENCY_SYMBOLS: [string, string][] = [
  ["NZ$", "NZD"], ["A$", "AUD"], ["US$", "USD"], ["S$", "SGD"], ["HK$", "HKD"],
  ["RM", "MYR"], ["£", "GBP"], ["€", "EUR"], ["¥", "JPY"],
];

// The currency a price is written in, e.g. "MYR 673.00" or "NZ$ 40".
export function parseCurrency(raw: string): string | null {
  const s = raw.trim();
  const code = s.match(/^([A-Z]{3})\b/);
  if (code) return code[1];
  return CURRENCY_SYMBOLS.find(([sym]) => s.startsWith(sym))?.[1] ?? null;
}

// Reads the first amount in the text, so "MYR 673.00 (NZ$ 237.76)" gives 673.
export function parseMoney(raw: string): number | null {
  const s = raw.match(/\d[\d.,]*/)?.[0] ?? "";
  if (!s) return null;
  // "1.234,56" style: comma is the decimal separator.
  const normalised = /,\d{1,2}$/.test(s) && !/\.\d{1,2}$/.test(s)
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(/,/g, "");
  const n = Number(normalised);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export function parseDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  let y: number, m: number, d: number;
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const parts = s.split(/[\/.\-\s]+/).map(Number);
    if (parts.length < 3 || parts.some((p) => !Number.isFinite(p))) {
      const t = Date.parse(s);
      if (Number.isNaN(t)) return null;
      const dt = new Date(t);
      [y, m, d] = [dt.getFullYear(), dt.getMonth() + 1, dt.getDate()];
    } else if (format === "YMD") {
      [y, m, d] = parts;
    } else if (format === "MDY") {
      [m, d, y] = parts;
    } else {
      [d, m, y] = parts;
    }
  }
  if (y < 100) y += y < 50 ? 2000 : 1900;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// UnderMyRoof fills blank fields with placeholders such as "(unspecified)".
const PLACEHOLDER = /^\((unspecified|uncategorized|uncategorised|uncollected|none)\)$/i;

function cell(row: Record<string, string>, col: string | undefined): string {
  const v = col ? (row[col] ?? "").trim() : "";
  return PLACEHOLDER.test(v) ? "" : v;
}

export type ImportResult = {
  items: number;
  locations: number;
  categories: number;
  tags: number;
  skipped: number;
};

// Creates any missing locations, categories and tags, then inserts the items.
export async function importRows(
  hid: string,
  rows: Record<string, string>[],
  opts: ImportOptions,
  existing: { locations: Location[]; categories: Category[]; tags: Tag[] },
  onProgress: (msg: string) => void,
): Promise<ImportResult> {
  const { mapping } = opts;
  const result: ImportResult = { items: 0, locations: 0, categories: 0, tags: 0, skipped: 0 };

  // Locations, keyed by their lower-cased full path.
  const byId = new Map(existing.locations.map((l) => [l.id, l]));
  const pathToId = new Map<string, string>();
  for (const l of existing.locations) pathToId.set(locationPath(l.id, byId).toLowerCase(), l.id);

  async function locationFor(raw: string): Promise<string | null> {
    const parts = (opts.locationSeparator ? raw.split(opts.locationSeparator) : [raw])
      .map((p) => p.trim())
      .filter(Boolean);
    let parent: string | null = null;
    const path: string[] = [];
    for (const name of parts) {
      path.push(name);
      const key = path.join(PATH_SEPARATOR).toLowerCase();
      let id = pathToId.get(key);
      if (!id) {
        const res = await supabase
          .from("locations")
          .insert({ household_id: hid, parent_id: parent, name })
          .select("id")
          .single();
        if (res.error) throw res.error;
        id = res.data.id as string;
        pathToId.set(key, id);
        result.locations++;
      }
      parent = id;
    }
    return parent;
  }

  const categoryIds = new Map(existing.categories.map((c) => [c.name.toLowerCase(), c.id]));
  async function categoryFor(name: string): Promise<string | null> {
    if (!name) return null;
    let id = categoryIds.get(name.toLowerCase());
    if (!id) {
      const res = await supabase.from("categories").insert({ household_id: hid, name }).select("id").single();
      if (res.error) throw res.error;
      id = res.data.id as string;
      categoryIds.set(name.toLowerCase(), id);
      result.categories++;
    }
    return id;
  }

  const tagIds = new Map(existing.tags.map((t) => [t.name.toLowerCase(), t.id]));
  async function tagFor(name: string): Promise<string> {
    let id = tagIds.get(name.toLowerCase());
    if (!id) {
      const res = await supabase.from("tags").insert({ household_id: hid, name }).select("id").single();
      if (res.error) throw res.error;
      id = res.data.id as string;
      tagIds.set(name.toLowerCase(), id);
      result.tags++;
    }
    return id;
  }

  const items: Record<string, unknown>[] = [];
  const links: { item_id: string; tag_id: string }[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = cell(row, mapping.name);
    if (!name) {
      result.skipped++;
      continue;
    }
    if (i % 50 === 0) onProgress(`Preparing row ${i + 1} of ${rows.length}…`);
    const locRaw = cell(row, mapping.location);
    const qty = parseInt(cell(row, mapping.quantity).replace(/[^\d]/g, ""), 10);
    const priceRaw = cell(row, mapping.value);
    const currency = (cell(row, mapping.currency) || parseCurrency(priceRaw) || "").toUpperCase();
    const condition = cell(row, mapping.condition);
    const notes = [cell(row, mapping.notes), condition && `Condition: ${condition}`].filter(Boolean).join("\n");
    const id = crypto.randomUUID();
    items.push({
      id,
      household_id: hid,
      name,
      description: cell(row, mapping.description) || null,
      location_id: locRaw ? await locationFor(locRaw) : null,
      category_id: await categoryFor(cell(row, mapping.category)),
      quantity: Number.isFinite(qty) ? qty : 1,
      value: parseMoney(priceRaw),
      currency: /^[A-Z]{3}$/.test(currency) ? currency : opts.defaultCurrency,
      purchase_date: parseDate(cell(row, mapping.purchase_date), opts.dateFormat),
      purchased_from: cell(row, mapping.purchased_from) || null,
      brand: cell(row, mapping.brand) || null,
      model: cell(row, mapping.model) || null,
      serial_number: cell(row, mapping.serial_number) || null,
      barcode: cell(row, mapping.barcode) || null,
      notes: notes || null,
    });
    const tagNames = cell(row, mapping.tags)
      .split(opts.tagSeparator || ",")
      .map((t) => t.trim())
      .filter(Boolean);
    for (const t of new Set(tagNames)) links.push({ item_id: id, tag_id: await tagFor(t) });
  }

  for (let i = 0; i < items.length; i += 200) {
    onProgress(`Saving items ${i + 1}–${Math.min(i + 200, items.length)} of ${items.length}…`);
    const res = await supabase.from("items").insert(items.slice(i, i + 200));
    if (res.error) throw res.error;
    result.items += Math.min(200, items.length - i);
  }
  for (let i = 0; i < links.length; i += 500) {
    const res = await supabase.from("item_tags").insert(links.slice(i, i + 500));
    if (res.error) throw res.error;
  }
  return result;
}

export function exportCsv(
  items: Item[],
  locations: Location[],
  categories: Category[],
  tags: Tag[],
): string {
  const byId = new Map(locations.map((l) => [l.id, l]));
  const cat = new Map(categories.map((c) => [c.id, c.name]));
  const tag = new Map(tags.map((t) => [t.id, t.name]));
  return Papa.unparse(
    items.map((it) => ({
      Name: it.name,
      Description: it.description ?? "",
      Location: locationPath(it.location_id, byId),
      Category: it.category_id ? (cat.get(it.category_id) ?? "") : "",
      Tags: it.item_tags.map((t) => tag.get(t.tag_id)).filter(Boolean).join("; "),
      Quantity: it.quantity,
      Value: it.value ?? "",
      Currency: it.currency,
      "Purchase Date": it.purchase_date ?? "",
      "Purchased From": it.purchased_from ?? "",
      Brand: it.brand ?? "",
      Model: it.model ?? "",
      "Serial Number": it.serial_number ?? "",
      Barcode: it.barcode ?? "",
      Notes: it.notes ?? "",
    })),
  );
}
