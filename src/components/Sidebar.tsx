"use client";

import { useMemo, useState } from "react";
import type { Location, Selection } from "@/lib/types";
import { ChevronIcon, GearIcon, PencilIcon, PlusIcon, SearchIcon } from "./icons";
import type { InventoryData } from "./Inventory";

export type SidebarMode = "locations" | "categories" | "tags";

const MODES: { mode: SidebarMode; label: string }[] = [
  { mode: "locations", label: "Locations" },
  { mode: "categories", label: "Categories" },
  { mode: "tags", label: "Tags" },
];

export default function Sidebar({
  data,
  mode,
  onModeChange,
  selection,
  onSelect,
  query,
  onQuery,
  onAddLocation,
  onEditLocation,
  onSettings,
}: {
  data: InventoryData;
  mode: SidebarMode;
  onModeChange: (m: SidebarMode) => void;
  selection: Selection | null;
  onSelect: (s: Selection) => void;
  query: string;
  onQuery: (q: string) => void;
  onAddLocation: (parentId: string | null) => void;
  onEditLocation: (loc: Location) => void;
  onSettings: () => void;
}) {
  // Item counts per location (including sub-locations), category and tag.
  const counts = useMemo(() => {
    const direct = new Map<string | null, number>();
    const byCategory = new Map<string | null, number>();
    const byTag = new Map<string, number>();
    for (const it of data.items) {
      direct.set(it.location_id, (direct.get(it.location_id) ?? 0) + 1);
      byCategory.set(it.category_id, (byCategory.get(it.category_id) ?? 0) + 1);
      for (const t of it.item_tags) byTag.set(t.tag_id, (byTag.get(t.tag_id) ?? 0) + 1);
    }
    const total = new Map<string, number>();
    const sum = (id: string): number => {
      if (total.has(id)) return total.get(id)!;
      total.set(id, 0); // guards against cycles
      const n = (direct.get(id) ?? 0) + (data.children.get(id) ?? []).reduce((a, c) => a + sum(c.id), 0);
      total.set(id, n);
      return n;
    };
    for (const l of data.locations) sum(l.id);
    return { unspecified: direct.get(null) ?? 0, location: total, byCategory, byTag };
  }, [data]);

  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Expand the tree down to the selected location whenever the selection changes.
  const selectedLocation = selection?.kind === "location" ? selection.id : null;
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  if (selectedLocation && selectedLocation !== expandedFor) {
    setExpandedFor(selectedLocation);
    const ancestors: string[] = [];
    let cur = data.locationById.get(selectedLocation);
    while (cur?.parent_id && ancestors.length < 100) {
      ancestors.push(cur.parent_id);
      cur = data.locationById.get(cur.parent_id);
    }
    if (ancestors.some((id) => !open.has(id))) setOpen(new Set([...open, ...ancestors]));
  }

  const isSel = (s: Selection) =>
    selection !== null &&
    selection.kind === s.kind &&
    ("id" in selection ? selection.id : null) === ("id" in s ? s.id : null);

  return (
    <aside className="flex h-full w-full flex-col border-r border-line bg-sidebar">
      <header className="flex items-center gap-2 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold" title={data.household.name}>
          {data.household.name}
        </h1>
        <button className="rounded-lg p-2 text-muted hover:bg-bg" onClick={onSettings} aria-label="Settings">
          <GearIcon />
        </button>
      </header>

      <div className="px-4 pb-3">
        <label className="relative block">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted">
            <SearchIcon className="h-4 w-4" />
          </span>
          <input
            className="input pl-9"
            type="search"
            placeholder="Search all items"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
          />
        </label>
      </div>

      <div className="mx-4 mb-2 grid grid-cols-3 rounded-lg bg-bg p-0.5 text-sm">
        {MODES.map((m) => (
          <button
            key={m.mode}
            className={`rounded-md py-1.5 font-medium ${mode === m.mode ? "bg-accent text-white shadow-sm" : "text-muted"}`}
            onClick={() => onModeChange(m.mode)}
          >
            {m.label}
          </button>
        ))}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        <Row
          label="All items"
          count={data.items.length}
          selected={isSel({ kind: "all" })}
          onClick={() => onSelect({ kind: "all" })}
        />
        {mode === "locations" && (
          <>
            <Row
              label="(unspecified)"
              hint="Items not placed in a specific location"
              count={counts.unspecified}
              selected={isSel({ kind: "location", id: null })}
              onClick={() => onSelect({ kind: "location", id: null })}
            />
            <LocationTree
              data={data}
              parentId={null}
              depth={0}
              counts={counts.location}
              isSelected={(id) => isSel({ kind: "location", id })}
              onSelect={(id) => onSelect({ kind: "location", id })}
              onAdd={onAddLocation}
              onEdit={onEditLocation}
              open={open}
              toggle={toggle}
            />
          </>
        )}
        {mode === "categories" && (
          <>
            {data.categories.map((c) => (
              <Row
                key={c.id}
                label={c.name}
                count={counts.byCategory.get(c.id) ?? 0}
                selected={isSel({ kind: "category", id: c.id })}
                onClick={() => onSelect({ kind: "category", id: c.id })}
              />
            ))}
            <Row
              label="(no category)"
              count={counts.byCategory.get(null) ?? 0}
              selected={isSel({ kind: "category", id: null })}
              onClick={() => onSelect({ kind: "category", id: null })}
            />
            <p className="px-3 pt-3 text-xs text-muted">Add categories while editing an item, or in Settings.</p>
          </>
        )}
        {mode === "tags" && (
          <>
            {data.tags.map((t) => (
              <Row
                key={t.id}
                label={t.name}
                dot={t.color}
                count={counts.byTag.get(t.id) ?? 0}
                selected={isSel({ kind: "tag", id: t.id })}
                onClick={() => onSelect({ kind: "tag", id: t.id })}
              />
            ))}
            {data.tags.length === 0 && <p className="px-3 pt-3 text-xs text-muted">No tags yet.</p>}
          </>
        )}
      </nav>

      {mode === "locations" && (
        <div className="border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button className="btn w-full" onClick={() => onAddLocation(null)}>
            <PlusIcon className="h-4 w-4" /> Add location
          </button>
        </div>
      )}
    </aside>
  );
}

function Row({
  label,
  hint,
  count,
  selected,
  onClick,
  dot,
  depth = 0,
  expander,
  actions,
}: {
  label: string;
  hint?: string;
  count: number;
  selected: boolean;
  onClick: () => void;
  dot?: string;
  depth?: number;
  expander?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={`group flex min-h-10 items-center rounded-lg pr-1 ${selected ? "bg-accent-soft" : "hover:bg-bg"}`}
      style={{ paddingLeft: 4 + depth * 16 }}
    >
      <span className="flex w-6 shrink-0 justify-center">{expander}</span>
      <button className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" onClick={onClick}>
        {dot && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm">{label}</span>
          {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
        </span>
        <span className="shrink-0 text-xs tabular-nums text-muted">{count}</span>
      </button>
      {actions}
    </div>
  );
}

function LocationTree({
  data,
  parentId,
  depth,
  counts,
  isSelected,
  onSelect,
  onAdd,
  onEdit,
  open,
  toggle,
}: {
  data: InventoryData;
  parentId: string | null;
  depth: number;
  counts: Map<string, number>;
  isSelected: (id: string) => boolean;
  onSelect: (id: string) => void;
  onAdd: (parentId: string) => void;
  onEdit: (loc: Location) => void;
  open: Set<string>;
  toggle: (id: string) => void;
}) {
  return (
    <>
      {(data.children.get(parentId) ?? []).map((loc) => {
        const hasChildren = (data.children.get(loc.id) ?? []).length > 0;
        const expanded = open.has(loc.id);
        return (
          <div key={loc.id}>
            <Row
              label={loc.name}
              count={counts.get(loc.id) ?? 0}
              depth={depth}
              selected={isSelected(loc.id)}
              onClick={() => onSelect(loc.id)}
              expander={
                hasChildren && (
                  <button
                    className="rounded p-1 text-muted hover:bg-line"
                    onClick={() => toggle(loc.id)}
                    aria-label={expanded ? "Collapse" : "Expand"}
                    aria-expanded={expanded}
                  >
                    <ChevronIcon className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-90" : ""}`} />
                  </button>
                )
              }
              actions={
                <span className="flex shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                  <button className="rounded p-1.5 text-muted hover:bg-line" onClick={() => onAdd(loc.id)} aria-label={`Add location inside ${loc.name}`}>
                    <PlusIcon className="h-3.5 w-3.5" />
                  </button>
                  <button className="rounded p-1.5 text-muted hover:bg-line" onClick={() => onEdit(loc)} aria-label={`Edit ${loc.name}`}>
                    <PencilIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              }
            />
            {hasChildren && expanded && (
              <LocationTree
                data={data}
                parentId={loc.id}
                depth={depth + 1}
                counts={counts}
                isSelected={isSelected}
                onSelect={onSelect}
                onAdd={onAdd}
                onEdit={onEdit}
                open={open}
                toggle={toggle}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
