"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { deleteItemFile, deleteItems, fetchItemFiles, signedUrls, uploadItemFile } from "@/lib/data";
import { errorMessage, formatBytes, formatDate, formatMoney } from "@/lib/format";
import { prepareImage } from "@/lib/images";
import { locationPath } from "@/lib/tree";
import type { FileKind, Item, ItemFile } from "@/lib/types";
import { BackIcon, PlusIcon } from "./icons";
import type { InventoryData } from "./Inventory";

type Tab = "detail" | "photos" | "files";

export default function ItemDetail({
  data,
  item,
  onBack,
  onEdit,
  onDuplicate,
  onDeleted,
  onShowLocation,
}: {
  data: InventoryData;
  item: Item;
  onBack: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDeleted: () => void;
  onShowLocation: (id: string | null) => void;
}) {
  const [tab, setTab] = useState<Tab>("detail");
  const [files, setFiles] = useState<ItemFile[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const [version, setVersion] = useState(0);
  const loadFiles = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    let live = true;
    (async () => {
      const list = await fetchItemFiles(item.id);
      const map = await signedUrls(list.map((f) => f.storage_path));
      if (live) {
        setFiles(list);
        setUrls(map);
      }
    })().catch((e) => live && setError(errorMessage(e)));
    return () => {
      live = false;
    };
  }, [item.id, version]);

  const photos = files.filter((f) => f.kind === "photo");
  const docs = files.filter((f) => f.kind !== "photo");
  const category = item.category_id ? data.categoryById.get(item.category_id) : undefined;
  const path = locationPath(item.location_id, data.locationById);

  async function remove() {
    if (!confirm(`Delete “${item.name}” and its photos and files? This can't be undone.`)) return;
    try {
      await deleteItems([item.id]);
      onDeleted();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "detail", label: "Detail" },
    { id: "photos", label: `Photos${photos.length ? ` (${photos.length})` : ""}` },
    { id: "files", label: `Receipts & files${docs.length ? ` (${docs.length})` : ""}` },
  ];

  return (
    <section className="flex h-full w-full flex-col bg-bg">
      <header className="flex items-center gap-2 border-b border-line bg-panel px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <button className="rounded-lg p-2 text-accent md:hidden" onClick={onBack} aria-label="Back">
          <BackIcon />
        </button>
        <div className="flex flex-1 justify-center overflow-x-auto">
          <div className="flex rounded-lg bg-bg p-0.5 text-sm">
            {tabs.map((t) => (
              <button
                key={t.id}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${tab === t.id ? "bg-panel shadow-sm" : "text-muted"}`}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:p-4">
        {error && <p className="card p-3 text-sm text-danger">{error}</p>}

        {tab === "detail" && (
          <>
            <div className="card p-4">
              <div className="flex items-start gap-3">
                {photos[0] && urls.get(photos[0].storage_path) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={urls.get(photos[0].storage_path)}
                    alt=""
                    className="h-16 w-16 shrink-0 cursor-pointer rounded-lg object-cover"
                    onClick={() => setTab("photos")}
                  />
                )}
                <h2 className="min-w-0 flex-1 text-xl font-semibold break-words">{item.name}</h2>
              </div>
              <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                <Field label="Description" value={item.description} />
                <div className="flex gap-2">
                  <dt className="shrink-0 text-muted">Location:</dt>
                  <dd>
                    <button className="text-left text-accent hover:underline" onClick={() => onShowLocation(item.location_id)}>
                      {path || "(unspecified)"}
                    </button>
                  </dd>
                </div>
                <Field label="Category" value={category?.name} />
                <Field label="Quantity" value={item.quantity !== 1 ? String(item.quantity) : null} />
                {item.item_tags.length > 0 && (
                  <div className="flex gap-2 sm:col-span-2">
                    <dt className="shrink-0 text-muted">Tags:</dt>
                    <dd className="flex flex-wrap gap-1">
                      {item.item_tags.map((t) => {
                        const tag = data.tagById.get(t.tag_id);
                        return tag ? (
                          <span key={t.tag_id} className="rounded-full px-2 py-0.5 text-xs font-medium text-black" style={{ background: tag.color }}>
                            {tag.name}
                          </span>
                        ) : null;
                      })}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {(item.value != null || item.purchase_date || item.purchased_from) && (
              <Card title="Purchase">
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Field
                    label="Value"
                    value={
                      item.value != null
                        ? formatMoney(item.value, item.currency) + (item.quantity > 1 ? ` each (${formatMoney(item.value * item.quantity, item.currency)} total)` : "")
                        : null
                    }
                  />
                  <Field label="Purchased" value={formatDate(item.purchase_date)} />
                  <Field label="From" value={item.purchased_from} />
                </dl>
              </Card>
            )}

            {(item.brand || item.model || item.serial_number || item.barcode) && (
              <Card title="Product">
                <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
                  <Field label="Brand" value={item.brand} />
                  <Field label="Model" value={item.model} />
                  <Field label="Serial number" value={item.serial_number} />
                  <Field label="Barcode" value={item.barcode} />
                </dl>
              </Card>
            )}

            <Card title="Notes">
              {item.notes ? (
                <p className="text-sm whitespace-pre-wrap">{item.notes}</p>
              ) : (
                <p className="text-center text-sm text-muted">No notes</p>
              )}
            </Card>

            <div className="flex flex-wrap gap-2 pt-1">
              <button className="btn-primary" onClick={onEdit}>Edit</button>
              <button className="btn" onClick={onDuplicate}>Duplicate</button>
              <span className="flex-1" />
              <button className="btn-danger" onClick={remove}>Delete</button>
            </div>
            <p className="text-xs text-muted">
              Added {formatDate(item.created_at)} · Last changed {formatDate(item.updated_at)}
            </p>
          </>
        )}

        {tab === "photos" && (
          <Card
            title="Photos"
            action={<UploadButton label="Add photos" accept="image/*" item={item} kind="photo" onDone={loadFiles} onError={setError} />}
          >
            {photos.length === 0 ? (
              <p className="text-center text-sm text-muted">No photos</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                {photos.map((p) => (
                  <figure key={p.id} className="group relative">
                    <a href={urls.get(p.storage_path)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={urls.get(p.storage_path)} alt={p.file_name} className="aspect-square w-full rounded-lg bg-bg object-cover" />
                    </a>
                    <DeleteFileButton file={p} onDone={loadFiles} onError={setError} className="absolute top-1 right-1" />
                  </figure>
                ))}
              </div>
            )}
          </Card>
        )}

        {tab === "files" && (
          <Card
            title="Receipts & files"
            action={
              <div className="flex gap-2">
                <UploadButton label="Receipt" accept="image/*,application/pdf" item={item} kind="receipt" onDone={loadFiles} onError={setError} />
                <UploadButton label="File" item={item} kind="attachment" onDone={loadFiles} onError={setError} />
              </div>
            }
          >
            {docs.length === 0 ? (
              <p className="text-center text-sm text-muted">No receipts or files</p>
            ) : (
              <ul className="divide-y divide-line">
                {docs.map((f) => (
                  <li key={f.id} className="flex items-center gap-3 py-2">
                    <span className="rounded bg-bg px-1.5 py-0.5 text-xs text-muted">{f.kind === "receipt" ? "Receipt" : "File"}</span>
                    <a className="min-w-0 flex-1 truncate text-sm text-accent hover:underline" href={urls.get(f.storage_path)} target="_blank" rel="noreferrer">
                      {f.file_name}
                    </a>
                    <span className="shrink-0 text-xs text-muted">{formatBytes(f.size_bytes)}</span>
                    <DeleteFileButton file={f} onDone={loadFiles} onError={setError} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-muted">{label}:</dt>
      <dd className="min-w-0 break-words">{value}</dd>
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function UploadButton({
  label,
  accept,
  item,
  kind,
  onDone,
  onError,
}: {
  label: string;
  accept?: string;
  item: Item;
  kind: FileKind;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    const files = [...list];
    try {
      for (let i = 0; i < files.length; i++) {
        setProgress(files.length > 1 ? `${i + 1}/${files.length}` : "…");
        const file = kind === "attachment" ? files[i] : await prepareImage(files[i]);
        await uploadItemFile(item.household_id, item.id, kind, file);
      }
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setProgress(null);
      if (input.current) input.current.value = "";
      onDone();
    }
  }

  return (
    <>
      <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => upload(e.target.files)} />
      <button className="btn" disabled={progress !== null} onClick={() => input.current?.click()}>
        <PlusIcon className="h-4 w-4" />
        {progress ? `Uploading ${progress}` : label}
      </button>
    </>
  );
}

function DeleteFileButton({
  file,
  onDone,
  onError,
  className = "",
}: {
  file: ItemFile;
  onDone: () => void;
  onError: (msg: string) => void;
  className?: string;
}) {
  return (
    <button
      className={`rounded-full bg-black/60 px-2 py-0.5 text-xs text-white hover:bg-danger ${className}`}
      onClick={async () => {
        if (!confirm(`Delete ${file.file_name}?`)) return;
        try {
          await deleteItemFile(file);
        } catch (e) {
          onError(errorMessage(e));
        }
        onDone();
      }}
      aria-label={`Delete ${file.file_name}`}
    >
      Delete
    </button>
  );
}
