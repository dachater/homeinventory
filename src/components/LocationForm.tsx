"use client";

import { useState } from "react";
import { deleteLocation, saveLocation } from "@/lib/data";
import { errorMessage } from "@/lib/format";
import { descendantIds, flattenTree } from "@/lib/tree";
import type { Location } from "@/lib/types";
import type { InventoryData } from "./Inventory";
import Modal from "./Modal";

export default function LocationForm({
  data,
  location,
  parentId,
  onClose,
  onSaved,
  onDeleted,
}: {
  data: InventoryData;
  location: Location | null;
  parentId: string | null;
  onClose: () => void;
  onSaved: (id: string) => void;
  onDeleted: (parentId: string | null) => void;
}) {
  const [name, setName] = useState(location?.name ?? "");
  const [description, setDescription] = useState(location?.description ?? "");
  const [parent, setParent] = useState(parentId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A location can't be moved inside itself or one of its own sub-locations.
  const blocked = location ? descendantIds(location.id, data.children) : new Set<string>();
  const children = location ? (data.children.get(location.id) ?? []) : [];
  const itemCount = location ? data.items.filter((i) => i.location_id === location.id).length : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const id = await saveLocation(data.household.id, location?.id ?? null, {
        name: name.trim(),
        description: description.trim() || null,
        parent_id: parent || null,
      });
      onSaved(id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  async function remove() {
    if (!location) return;
    const target = location.parent_id ? data.locationById.get(location.parent_id)?.name : "(unspecified)";
    const msg = itemCount
      ? `Delete “${location.name}”? Its ${itemCount} item(s) will move to ${target}.`
      : `Delete “${location.name}”?`;
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      await deleteLocation(location);
      onDeleted(location.parent_id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal
      title={location ? "Edit location" : "New location"}
      onClose={onClose}
      footer={
        <>
          {location && (
            <button
              type="button"
              className="btn-danger mr-auto"
              disabled={busy || children.length > 0}
              title={children.length ? "Move or delete the sub-locations first" : undefined}
              onClick={remove}
            >
              Delete
            </button>
          )}
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="location-form" disabled={busy}>Save</button>
        </>
      }
    >
      <form id="location-form" onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="l-name">Name</label>
          <input id="l-name" className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen, 11 Box, Garage shelf" />
        </div>
        <div>
          <label className="label" htmlFor="l-desc">Description</label>
          <input id="l-desc" className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="l-parent">Inside</label>
          <select id="l-parent" className="input" value={parent} onChange={(e) => setParent(e.target.value)}>
            <option value="">(top level)</option>
            {flattenTree(data.children).map(({ loc, depth }) => (
              <option key={loc.id} value={loc.id} disabled={blocked.has(loc.id)}>
                {"   ".repeat(depth)}
                {loc.name}
              </option>
            ))}
          </select>
        </div>
        {location && children.length > 0 && (
          <p className="text-xs text-muted">This location has sub-locations, so it can&apos;t be deleted until they are moved or deleted.</p>
        )}
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
