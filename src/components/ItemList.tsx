"use client";

import { useMemo, useState } from "react";
import { addTagToItems, deleteItems, moveItems } from "@/lib/data";
import { errorMessage, formatTotals } from "@/lib/format";
import { flattenTree, locationPath } from "@/lib/tree";
import type { Item, Location } from "@/lib/types";
import { BackIcon, PencilIcon, PlusIcon } from "./icons";
import type { InventoryData } from "./Inventory";
import Modal from "./Modal";

type SortKey = "name" | "updated" | "value";

export default function ItemList({
  data,
  title,
  items,
  showPaths,
  selectedId,
  onOpen,
  onAdd,
  onBack,
  location,
  onEditLocation,
  includeSub,
  onIncludeSub,
  onChanged,
}: {
  data: InventoryData;
  title: string;
  items: Item[];
  showPaths: boolean;
  selectedId: string | null;
  onOpen: (id: string) => void;
  onAdd: () => void;
  onBack: () => void;
  location?: Location;
  onEditLocation?: () => void;
  includeSub: boolean;
  onIncludeSub?: (v: boolean) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [sort, setSort] = useState<SortKey>("name");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<"move" | "tag" | null>(null);
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => {
    const list = [...items];
    const byName = (a: Item, b: Item) => a.name.localeCompare(b.name, undefined, { numeric: true });
    if (sort === "name") list.sort(byName);
    if (sort === "updated") list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    if (sort === "value") list.sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || byName(a, b));
    return list;
  }, [items, sort]);

  const totals = formatTotals(items);
  const pickedIds = [...picked].filter((id) => items.some((i) => i.id === id));

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await onChanged();
      setPicked(new Set());
      setSelecting(false);
      setBulk(null);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex h-full w-full flex-col border-r border-line bg-panel">
      <header className="border-b border-line px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-1">
          <button className="rounded-lg p-2 text-accent md:hidden" onClick={onBack} aria-label="Back">
            <BackIcon />
          </button>
          <div className="min-w-0 flex-1 text-center md:text-left">
            <h2 className="flex items-center justify-center gap-1 truncate font-semibold md:justify-start">
              <span className="truncate">{title}</span>
              {onEditLocation && (
                <button className="shrink-0 rounded p-1 text-muted hover:bg-bg" onClick={onEditLocation} aria-label="Edit location">
                  <PencilIcon className="h-3.5 w-3.5" />
                </button>
              )}
            </h2>
            <p className="truncate text-xs text-muted">
              {items.length} {items.length === 1 ? "item" : "items"}
              {totals && ` · ${totals}`}
            </p>
            {location?.description && <p className="truncate text-xs text-muted">{location.description}</p>}
          </div>
          <button className="btn-primary h-10 w-10 shrink-0 rounded-full px-0" onClick={onAdd} aria-label="Add item">
            <PlusIcon />
          </button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <select className="rounded-md border border-line bg-panel px-2 py-1" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Sort">
            <option value="name">Name</option>
            <option value="updated">Recently changed</option>
            <option value="value">Value</option>
          </select>
          {onIncludeSub && (
            <label className="flex items-center gap-1 text-muted">
              <input type="checkbox" checked={includeSub} onChange={(e) => onIncludeSub(e.target.checked)} />
              Sub-locations
            </label>
          )}
          <span className="flex-1" />
          <button
            className="rounded-md px-2 py-1 font-medium text-accent hover:bg-bg"
            onClick={() => {
              setSelecting(!selecting);
              setPicked(new Set());
            }}
          >
            {selecting ? "Done" : "Select"}
          </button>
        </div>
      </header>

      <ul className="flex-1 overflow-y-auto">
        {sorted.map((it) => {
          const active = selecting ? picked.has(it.id) : it.id === selectedId;
          // No need to repeat the location for items sitting directly in it.
          const path = showPaths && it.location_id !== (location?.id ?? undefined)
            ? locationPath(it.location_id, data.locationById) || "(unspecified)"
            : null;
          return (
            <li key={it.id}>
              <button
                className={`flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left ${active ? "bg-accent text-white" : "hover:bg-bg"}`}
                onClick={() => (selecting ? togglePick(it.id) : onOpen(it.id))}
              >
                {selecting && (
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${active ? "border-white bg-white text-accent" : "border-line"}`}>
                    {active && "✓"}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    {it.name}
                    {it.quantity > 1 && <span className={active ? "text-white/80" : "text-muted"}> ×{it.quantity}</span>}
                  </span>
                  {(it.description || path) && (
                    <span className={`block truncate text-xs ${active ? "text-white/80" : "text-muted"}`}>
                      {[it.description, path].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                {it.item_tags.slice(0, 3).map((t) => {
                  const tag = data.tagById.get(t.tag_id);
                  return tag ? <span key={t.tag_id} className="h-2 w-2 shrink-0 rounded-full" style={{ background: tag.color }} title={tag.name} /> : null;
                })}
              </button>
            </li>
          );
        })}
        {items.length === 0 && <li className="p-8 text-center text-sm text-muted">No items here yet.</li>}
      </ul>

      {selecting && (
        <footer className="flex items-center gap-2 border-t border-line p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] text-sm">
          <button className="rounded-md px-2 py-1 text-accent" onClick={() => setPicked(new Set(pickedIds.length === items.length ? [] : items.map((i) => i.id)))}>
            {pickedIds.length === items.length && items.length > 0 ? "None" : "All"}
          </button>
          <span className="flex-1 text-muted">{pickedIds.length} selected</span>
          <button className="btn" disabled={!pickedIds.length || busy} onClick={() => setBulk("move")}>Move</button>
          <button className="btn" disabled={!pickedIds.length || busy || !data.tags.length} onClick={() => setBulk("tag")}>Tag</button>
          <button
            className="btn-danger"
            disabled={!pickedIds.length || busy}
            onClick={() => {
              if (confirm(`Delete ${pickedIds.length} item(s) and their photos and files? This can't be undone.`)) {
                runBulk(() => deleteItems(pickedIds));
              }
            }}
          >
            Delete
          </button>
        </footer>
      )}

      {bulk === "move" && (
        <PickerModal
          title={`Move ${pickedIds.length} item(s) to…`}
          options={[
            { id: "", label: "(unspecified)", depth: 0 },
            ...flattenTree(data.children).map(({ loc, depth }) => ({ id: loc.id, label: loc.name, depth })),
          ]}
          busy={busy}
          onClose={() => setBulk(null)}
          onPick={(id) => runBulk(() => moveItems(pickedIds, id || null))}
        />
      )}
      {bulk === "tag" && (
        <PickerModal
          title={`Add a tag to ${pickedIds.length} item(s)`}
          options={data.tags.map((t) => ({ id: t.id, label: t.name, depth: 0, color: t.color }))}
          busy={busy}
          onClose={() => setBulk(null)}
          onPick={(id) => runBulk(() => addTagToItems(pickedIds, id))}
        />
      )}
    </section>
  );
}

function PickerModal({
  title,
  options,
  busy,
  onClose,
  onPick,
}: {
  title: string;
  options: { id: string; label: string; depth: number; color?: string }[];
  busy: boolean;
  onClose: () => void;
  onPick: (id: string) => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <ul className="-mx-2">
        {options.map((o) => (
          <li key={o.id}>
            <button
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg py-2 pr-2 text-left text-sm hover:bg-bg"
              style={{ paddingLeft: 8 + o.depth * 16 }}
              onClick={() => onPick(o.id)}
            >
              {o.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />}
              {o.label}
            </button>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
