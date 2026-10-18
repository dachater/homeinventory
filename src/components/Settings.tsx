"use client";

import { useCallback, useEffect, useState } from "react";
import { createCategory, createTag } from "@/lib/data";
import { exportCsv } from "@/lib/csv";
import { COMMON_CURRENCIES, errorMessage, formatDate } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import type { Household, Member } from "@/lib/types";
import { CreateOrJoin } from "./HouseholdSetup";
import ImportCsv from "./ImportCsv";
import type { InventoryData } from "./Inventory";
import Modal from "./Modal";

type Section = "household" | "members" | "lists" | "data" | "account";

const SECTIONS: { id: Section; label: string }[] = [
  { id: "household", label: "Inventory" },
  { id: "members", label: "Members" },
  { id: "lists", label: "Categories & tags" },
  { id: "data", label: "Import / export" },
  { id: "account", label: "Account" },
];

type Reload = (what?: { locations?: boolean; categories?: boolean; tags?: boolean; items?: boolean }) => Promise<void>;

export default function Settings({
  data,
  households,
  userId,
  email,
  onClose,
  onReload,
  onSwitchHousehold,
  onHouseholdsChanged,
}: {
  data: InventoryData;
  households: Household[];
  userId: string;
  email: string;
  onClose: () => void;
  onReload: Reload;
  onSwitchHousehold: (id: string) => void;
  onHouseholdsChanged: () => void;
}) {
  const [section, setSection] = useState<Section>("household");

  return (
    <Modal title="Settings" onClose={onClose} wide>
      <div className="-mt-1 mb-4 flex gap-1 overflow-x-auto border-b border-line pb-2 text-sm">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 font-medium ${section === s.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-bg"}`}
            onClick={() => setSection(s.id)}
          >
            {s.label}
          </button>
        ))}
      </div>
      {section === "household" && (
        <HouseholdSection data={data} households={households} onSwitch={onSwitchHousehold} onChanged={onHouseholdsChanged} />
      )}
      {section === "members" && <MembersSection data={data} userId={userId} onLeft={onHouseholdsChanged} />}
      {section === "lists" && <ListsSection data={data} onReload={onReload} />}
      {section === "data" && <DataSection data={data} onReload={onReload} />}
      {section === "account" && <AccountSection email={email} />}
    </Modal>
  );
}

function useAsync() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, run };
}

function HouseholdSection({
  data,
  households,
  onSwitch,
  onChanged,
}: {
  data: InventoryData;
  households: Household[];
  onSwitch: (id: string) => void;
  onChanged: () => void;
}) {
  const h = data.household;
  const [name, setName] = useState(h.name);
  const [currency, setCurrency] = useState(h.default_currency);
  const [adding, setAdding] = useState(false);
  const { busy, error, run } = useAsync();

  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const { data: updated, error } = await supabase
              .from("households")
              .update({ name: name.trim(), default_currency: currency })
              .eq("id", h.id)
              .select("id");
            if (error) throw error;
            if (!updated.length) throw new Error("Only the owner can change these settings.");
            onChanged();
          });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
          <div>
            <label className="label" htmlFor="s-name">Name</label>
            <input id="s-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="s-cur">Default currency</label>
            <select id="s-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted">Only the owner can rename the inventory or change its currency.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary" disabled={busy}>Save</button>
      </form>

      <div>
        <h3 className="mb-2 font-semibold">Your inventories</h3>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {households.map((x) => (
            <li key={x.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="flex-1">{x.name}</span>
              {x.id === h.id ? (
                <span className="text-xs text-muted">Current</span>
              ) : (
                <button className="text-accent" onClick={() => onSwitch(x.id)}>Switch</button>
              )}
            </li>
          ))}
        </ul>
        {adding ? (
          <div className="mt-4 rounded-lg border border-line p-4">
            <CreateOrJoin onReady={onSwitch} />
          </div>
        ) : (
          <button className="btn mt-3" onClick={() => setAdding(true)}>Create or join another</button>
        )}
      </div>
    </div>
  );
}

function MembersSection({ data, userId, onLeft }: { data: InventoryData; userId: string; onLeft: () => void }) {
  const hid = data.household.id;
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<{ code: string; expires_at: string }[]>([]);
  const { busy, error, run } = useAsync();

  const load = useCallback(async () => {
    const [m, i] = await Promise.all([
      supabase.rpc("household_member_list", { p_household: hid }),
      supabase.from("household_invites").select("code, expires_at").eq("household_id", hid).gt("expires_at", new Date().toISOString()),
    ]);
    if (m.error) throw m.error;
    if (i.error) throw i.error;
    setMembers(m.data as Member[]);
    setInvites(i.data);
  }, [hid]);

  useEffect(() => {
    run(load);
  }, [run, load]);

  const me = members.find((m) => m.user_id === userId);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-2 font-semibold">People with access</h3>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate">
                {m.email}
                {m.user_id === userId && <span className="text-muted"> (you)</span>}
              </span>
              <span className="text-xs text-muted">{m.role === "owner" ? "Owner" : "Member"}</span>
              {((me?.role === "owner" && m.user_id !== userId) || (m.user_id === userId && m.role !== "owner")) && (
                <button
                  className="text-xs text-danger"
                  disabled={busy}
                  onClick={() => {
                    const self = m.user_id === userId;
                    if (!confirm(self ? "Leave this inventory?" : `Remove ${m.email}?`)) return;
                    run(async () => {
                      const { error } = await supabase.from("household_members").delete().eq("household_id", hid).eq("user_id", m.user_id);
                      if (error) throw error;
                      if (self) onLeft();
                      else await load();
                    });
                  }}
                >
                  {m.user_id === userId ? "Leave" : "Remove"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="mb-1 font-semibold">Invite someone</h3>
        <p className="mb-3 text-sm text-muted">
          Create a code and send it to them. After they create an account they choose “Join someone else&apos;s” and enter the code. Codes last 7 days.
        </p>
        {invites.length > 0 && (
          <ul className="mb-3 space-y-2">
            {invites.map((i) => (
              <li key={i.code} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                <code className="text-lg font-semibold tracking-widest">{i.code}</code>
                <span className="flex-1 text-xs text-muted">until {formatDate(i.expires_at)}</span>
                <button className="text-sm text-accent" onClick={() => navigator.clipboard?.writeText(i.code)}>Copy</button>
                <button
                  className="text-sm text-danger"
                  onClick={() =>
                    run(async () => {
                      const { error } = await supabase.from("household_invites").delete().eq("code", i.code);
                      if (error) throw error;
                      await load();
                    })
                  }
                >
                  Revoke
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          className="btn-primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              const { error } = await supabase.from("household_invites").insert({ household_id: hid });
              if (error) throw error;
              await load();
            })
          }
        >
          Create invite code
        </button>
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

function ListsSection({ data, onReload }: { data: InventoryData; onReload: Reload }) {
  const hid = data.household.id;
  const [newCategory, setNewCategory] = useState("");
  const [newTag, setNewTag] = useState("");
  const { busy, error, run } = useAsync();
  const usage = (pred: (i: InventoryData["items"][number]) => boolean) => data.items.filter(pred).length;

  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 font-semibold">Categories</h3>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {data.categories.map((c) => (
            <EditableRow
              key={c.id}
              name={c.name}
              count={usage((i) => i.category_id === c.id)}
              busy={busy}
              onRename={(name) =>
                run(async () => {
                  const { error } = await supabase.from("categories").update({ name }).eq("id", c.id);
                  if (error) throw error;
                  await onReload({ categories: true });
                })
              }
              onDelete={() =>
                run(async () => {
                  const { error } = await supabase.from("categories").delete().eq("id", c.id);
                  if (error) throw error;
                  await onReload({ categories: true, items: true });
                })
              }
            />
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await createCategory(hid, newCategory.trim());
              setNewCategory("");
              await onReload({ categories: true });
            });
          }}
        >
          <input className="input" placeholder="New category" required value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
          <button className="btn" disabled={busy}>Add</button>
        </form>
      </div>

      <div>
        <h3 className="mb-2 font-semibold">Tags</h3>
        <ul className="divide-y divide-line rounded-lg border border-line">
          {data.tags.map((t) => (
            <EditableRow
              key={t.id}
              name={t.name}
              color={t.color}
              count={usage((i) => i.item_tags.some((x) => x.tag_id === t.id))}
              busy={busy}
              onColor={(color) =>
                run(async () => {
                  const { error } = await supabase.from("tags").update({ color }).eq("id", t.id);
                  if (error) throw error;
                  await onReload({ tags: true });
                })
              }
              onRename={(name) =>
                run(async () => {
                  const { error } = await supabase.from("tags").update({ name }).eq("id", t.id);
                  if (error) throw error;
                  await onReload({ tags: true });
                })
              }
              onDelete={() =>
                run(async () => {
                  const { error } = await supabase.from("tags").delete().eq("id", t.id);
                  if (error) throw error;
                  await onReload({ tags: true, items: true });
                })
              }
            />
          ))}
        </ul>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await createTag(hid, newTag.trim());
              setNewTag("");
              await onReload({ tags: true });
            });
          }}
        >
          <input className="input" placeholder="New tag" required value={newTag} onChange={(e) => setNewTag(e.target.value)} />
          <button className="btn" disabled={busy}>Add</button>
        </form>
      </div>
      {error && <p className="text-sm text-danger sm:col-span-2">{error}</p>}
    </div>
  );
}

function EditableRow({
  name,
  count,
  color,
  busy,
  onRename,
  onDelete,
  onColor,
}: {
  name: string;
  count: number;
  color?: string;
  busy: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onColor?: (color: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  return (
    <li className="flex items-center gap-2 px-3 py-1.5 text-sm">
      {color && onColor && (
        <input type="color" className="h-6 w-6 shrink-0 cursor-pointer rounded border-0 bg-transparent p-0" value={color} onChange={(e) => onColor(e.target.value)} aria-label={`Colour for ${name}`} />
      )}
      {editing ? (
        <form
          className="flex flex-1 gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            onRename(value.trim());
            setEditing(false);
          }}
        >
          <input className="input py-1" autoFocus required value={value} onChange={(e) => setValue(e.target.value)} />
          <button className="text-accent">Save</button>
        </form>
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{name}</span>
          <span className="text-xs text-muted">{count}</span>
          <button className="text-xs text-accent" onClick={() => setEditing(true)}>Rename</button>
          <button
            className="text-xs text-danger"
            disabled={busy}
            onClick={() => confirm(count ? `Delete “${name}”? It will be removed from ${count} item(s).` : `Delete “${name}”?`) && onDelete()}
          >
            Delete
          </button>
        </>
      )}
    </li>
  );
}

function DataSection({ data, onReload }: { data: InventoryData; onReload: Reload }) {
  function download() {
    const csv = exportCsv(data.items, data.locations, data.categories, data.tags);
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${data.household.name.replace(/[^\w]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 font-semibold">Export</h3>
        <p className="mb-3 text-sm text-muted">
          Download all {data.items.length} items as a CSV file. Photos and files are not included.
        </p>
        <button className="btn" onClick={download}>Download CSV</button>
      </div>
      <div className="border-t border-line" />
      <ImportCsv data={data} onImported={() => onReload()} />
    </div>
  );
}

function AccountSection({ email }: { email: string }) {
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const { busy, error, run } = useAsync();
  return (
    <div className="space-y-6">
      <p className="text-sm">Signed in as <strong>{email}</strong></p>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setPassword("");
            setMsg("Password changed.");
          });
        }}
      >
        <label className="label" htmlFor="new-pw">New password</label>
        <div className="flex gap-2">
          <input id="new-pw" className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
          <button className="btn" disabled={busy}>Change</button>
        </div>
        {msg && <p className="text-sm text-muted">{msg}</p>}
        {error && <p className="text-sm text-danger">{error}</p>}
      </form>
      <button className="btn-danger" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </div>
  );
}
