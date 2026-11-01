"use client";

import { useMemo } from "react";
import { isSizeTag, summariseBoxes } from "@/lib/boxes";
import type { Selection } from "@/lib/types";
import type { InventoryData } from "./Inventory";

type BoxesSelection = Extract<Selection, { kind: "boxes" }>;

export default function BoxesPanel({
  data,
  filterTagId,
  onFilterTag,
  selection,
  onSelect,
}: {
  data: InventoryData;
  filterTagId: string | null;
  onFilterTag: (id: string | null) => void;
  selection: Selection | null;
  onSelect: (s: BoxesSelection) => void;
}) {
  const summary = useMemo(
    () => summariseBoxes(data.activeItems, data.tags, data.locationById, filterTagId),
    [data, filterTagId],
  );
  const otherTags = data.tags.filter((t) => !isSizeTag(t));
  const sel = selection?.kind === "boxes" ? selection : null;
  const isSel = (view: BoxesSelection["view"], location?: string | null) =>
    !!sel && sel.view === view && sel.location === location;

  if (summary.sizes.length === 0) {
    return (
      <div className="space-y-2 px-3 pt-2 text-sm text-muted">
        <p>No box sizes yet.</p>
        <p>
          Tag your boxes with a size whose name ends in &ldquo;box&rdquo;, such as <strong>Small box</strong>,{" "}
          <strong>Medium box</strong> or <strong>Large box</strong>, and the totals will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4 px-1 pb-2">
      <label className="block px-2">
        <span className="label">Only boxes tagged</span>
        <select
          className="input py-1.5"
          value={filterTagId ?? ""}
          onChange={(e) => onFilterTag(e.target.value || null)}
        >
          <option value="">Any tag</option>
          {otherTags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </label>

      <button
        className={`w-full rounded-xl border p-3 text-left ${isSel("all") ? "border-accent bg-accent-soft" : "border-line bg-panel hover:bg-bg"}`}
        onClick={() => onSelect({ kind: "boxes", view: "all" })}
      >
        <span className="block text-xs font-medium text-muted">Total boxes</span>
        <span className="block text-3xl font-semibold tabular-nums">{summary.total}</span>
      </button>

      <section>
        <h3 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">By size</h3>
        {summary.bySize.map(({ tag, count }) => (
          <SummaryRow
            key={tag.id}
            label={tag.name}
            dot={tag.color}
            count={count}
            selected={isSel(tag.id)}
            onClick={() => onSelect({ kind: "boxes", view: tag.id })}
          />
        ))}
        {summary.missing.length > 0 && (
          <SummaryRow
            label="Missing a size"
            hint="Named like a box, e.g. “01 Carton”, but no size tag"
            count={summary.missing.length}
            warn
            selected={isSel("missing")}
            onClick={() => onSelect({ kind: "boxes", view: "missing" })}
          />
        )}
      </section>

      {summary.byLocation.length > 0 && (
        <section>
          <h3 className="px-2 pb-1 text-xs font-semibold tracking-wide text-muted uppercase">By location</h3>
          {summary.byLocation.map((loc) => (
            <SummaryRow
              key={loc.locationId ?? "none"}
              label={loc.path}
              hint={loc.bySize.map((l) => `${l.tag.name.replace(/\s*box(es)?$/i, "")} ${l.count}`).join(" · ")}
              count={loc.total}
              selected={isSel("all", loc.locationId)}
              onClick={() => onSelect({ kind: "boxes", view: "all", location: loc.locationId })}
            />
          ))}
        </section>
      )}
    </div>
  );
}

function SummaryRow({
  label,
  hint,
  count,
  dot,
  warn,
  selected,
  onClick,
}: {
  label: string;
  hint?: string;
  count: number;
  dot?: string;
  warn?: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`flex min-h-10 w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left ${selected ? "bg-accent-soft" : "hover:bg-bg"}`}
      onClick={onClick}
    >
      {dot && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dot }} />}
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm ${warn ? "text-danger" : ""}`}>{label}</span>
        {hint && <span className="block truncate text-xs text-muted">{hint}</span>}
      </span>
      <span className="shrink-0 text-sm font-medium tabular-nums">{count}</span>
    </button>
  );
}
