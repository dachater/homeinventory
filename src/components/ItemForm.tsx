"use client";

import { useState } from "react";
import { createCategory, createTag, saveItem, uploadItemFile } from "@/lib/data";
import { COMMON_CURRENCIES, errorMessage } from "@/lib/format";
import { prepareImage } from "@/lib/images";
import { flattenTree } from "@/lib/tree";
import type { Item, ItemFields } from "@/lib/types";
import type { InventoryData } from "./Inventory";
import Modal from "./Modal";

const NEW = "__new__";

export default function ItemForm({
  data,
  itemId,
  initial,
  onClose,
  onSaved,
}: {
  data: InventoryData;
  itemId: string | null;
  initial?: Partial<Item>;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const hid = data.household.id;
  const [f, setF] = useState({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    location_id: initial?.location_id ?? "",
    category_id: initial?.category_id ?? "",
    quantity: String(initial?.quantity ?? 1),
    value: initial?.value != null ? String(initial.value) : "",
    currency: initial?.currency ?? data.household.default_currency,
    purchase_date: initial?.purchase_date ?? "",
    purchased_from: initial?.purchased_from ?? "",
    brand: initial?.brand ?? "",
    model: initial?.model ?? "",
    serial_number: initial?.serial_number ?? "",
    barcode: initial?.barcode ?? "",
    notes: initial?.notes ?? "",
  });
  const [tagIds, setTagIds] = useState<string[]>(initial?.item_tags?.map((t) => t.tag_id) ?? []);
  const [newCategory, setNewCategory] = useState("");
  const [newTag, setNewTag] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(
    Boolean(initial?.brand || initial?.model || initial?.serial_number || initial?.barcode || initial?.purchased_from),
  );

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF((prev) => ({ ...prev, [k]: e.target.value }));

  const nullable = (s: string) => (s.trim() ? s.trim() : null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const currency = f.currency.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      setError("Currency must be a 3-letter code such as MYR or NZD.");
      return;
    }
    const value = f.value.trim() ? Number(f.value) : null;
    if (value != null && (!Number.isFinite(value) || value < 0)) {
      setError("Value must be a positive number.");
      return;
    }
    setBusy("Saving…");
    try {
      let categoryId = f.category_id || null;
      if (categoryId === NEW) {
        const name = newCategory.trim();
        const existing = data.categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
        categoryId = name ? (existing ?? (await createCategory(hid, name))).id : null;
      }
      const tags = [...tagIds];
      const tagName = newTag.trim();
      if (tagName) {
        const existing = data.tags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
        const id = (existing ?? (await createTag(hid, tagName))).id;
        if (!tags.includes(id)) tags.push(id);
      }
      const fields: ItemFields = {
        name: f.name.trim(),
        description: nullable(f.description),
        location_id: f.location_id || null,
        category_id: categoryId,
        quantity: Math.max(0, parseInt(f.quantity, 10) || 0),
        value,
        currency,
        purchase_date: f.purchase_date || null,
        purchased_from: nullable(f.purchased_from),
        brand: nullable(f.brand),
        model: nullable(f.model),
        serial_number: nullable(f.serial_number),
        barcode: nullable(f.barcode),
        notes: nullable(f.notes),
      };
      const id = await saveItem(hid, itemId, fields, tags);
      for (let i = 0; i < photos.length; i++) {
        setBusy(`Uploading photo ${i + 1} of ${photos.length}…`);
        await uploadItemFile(hid, id, "photo", await prepareImage(photos[i]));
      }
      onSaved(id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <Modal
      title={itemId ? "Edit item" : "New item"}
      onClose={onClose}
      footer={
        <>
          {busy && <span className="mr-auto self-center text-sm text-muted">{busy}</span>}
          <button className="btn" type="button" onClick={onClose}>Cancel</button>
          <button className="btn-primary" form="item-form" disabled={busy !== null}>Save</button>
        </>
      }
    >
      <form id="item-form" onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="i-name">Name</label>
          <input id="i-name" className="input" required autoFocus value={f.name} onChange={set("name")} />
        </div>
        <div>
          <label className="label" htmlFor="i-desc">Description</label>
          <input id="i-desc" className="input" value={f.description} onChange={set("description")} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="i-loc">Location</label>
            <select id="i-loc" className="input" value={f.location_id} onChange={set("location_id")}>
              <option value="">(unspecified)</option>
              {flattenTree(data.children)
                .filter(({ loc }) => !data.archived.has(loc.id) || loc.id === initial?.location_id)
                .map(({ loc, depth }) => (
                <option key={loc.id} value={loc.id}>
                  {"   ".repeat(depth)}
                  {loc.name}
                  {data.archived.has(loc.id) && " (archived)"}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="i-cat">Category</label>
            <select id="i-cat" className="input" value={f.category_id} onChange={set("category_id")}>
              <option value="">(none)</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
              <option value={NEW}>+ New category…</option>
            </select>
            {f.category_id === NEW && (
              <input className="input mt-2" placeholder="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            )}
          </div>
        </div>

        <div>
          <span className="label">Tags</span>
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((t) => {
              const on = tagIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-transparent text-black" : "border-line text-muted"}`}
                  style={on ? { background: t.color } : undefined}
                  onClick={() => setTagIds(on ? tagIds.filter((x) => x !== t.id) : [...tagIds, t.id])}
                  aria-pressed={on}
                >
                  {t.name}
                </button>
              );
            })}
            <input
              className="min-w-32 flex-1 rounded-full border border-dashed border-line bg-transparent px-2.5 py-1 text-xs outline-none focus:border-accent"
              placeholder="+ New tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <label className="label" htmlFor="i-qty">Quantity</label>
            <input id="i-qty" className="input" type="number" min={0} inputMode="numeric" value={f.quantity} onChange={set("quantity")} />
          </div>
          <div>
            <label className="label" htmlFor="i-val">Value (each)</label>
            <input id="i-val" className="input" type="number" min={0} step="0.01" inputMode="decimal" value={f.value} onChange={set("value")} />
          </div>
          <div>
            <label className="label" htmlFor="i-cur">Currency</label>
            <input id="i-cur" className="input uppercase" list="currencies" maxLength={3} value={f.currency} onChange={set("currency")} />
            <datalist id="currencies">
              {COMMON_CURRENCIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="i-date">Purchased</label>
            <input id="i-date" className="input" type="date" value={f.purchase_date} onChange={set("purchase_date")} />
          </div>
        </div>

        {more ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="i-from">Purchased from</label>
              <input id="i-from" className="input" value={f.purchased_from} onChange={set("purchased_from")} />
            </div>
            <div>
              <label className="label" htmlFor="i-brand">Brand</label>
              <input id="i-brand" className="input" value={f.brand} onChange={set("brand")} />
            </div>
            <div>
              <label className="label" htmlFor="i-model">Model</label>
              <input id="i-model" className="input" value={f.model} onChange={set("model")} />
            </div>
            <div>
              <label className="label" htmlFor="i-serial">Serial number</label>
              <input id="i-serial" className="input" value={f.serial_number} onChange={set("serial_number")} />
            </div>
            <div>
              <label className="label" htmlFor="i-barcode">Barcode</label>
              <input id="i-barcode" className="input" value={f.barcode} onChange={set("barcode")} />
            </div>
          </div>
        ) : (
          <button type="button" className="text-sm text-accent" onClick={() => setMore(true)}>
            + Brand, model, serial number, store…
          </button>
        )}

        <div>
          <label className="label" htmlFor="i-notes">Notes</label>
          <textarea id="i-notes" className="input min-h-20" value={f.notes} onChange={set("notes")} />
        </div>

        <div>
          <label className="label" htmlFor="i-photos">{itemId ? "Add photos" : "Photos"}</label>
          <input
            id="i-photos"
            type="file"
            accept="image/*"
            multiple
            className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border file:border-line file:bg-panel file:px-3 file:py-2 file:text-sm file:font-medium file:text-text"
            onChange={(e) => setPhotos([...(e.target.files ?? [])])}
          />
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
    </Modal>
  );
}
