"use client";

import { useState } from "react";
import { COMMON_CURRENCIES, errorMessage } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import Centered from "./Centered";

// Shown when the signed-in user doesn't belong to a household yet, and from
// Settings to create or join another one.
export function CreateOrJoin({ onReady }: { onReady: (householdId: string) => void }) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("MYR");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(fn: () => Promise<{ data: unknown; error: unknown }>) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await fn();
      if (error) throw error;
      onReady(data as string);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => supabase.rpc("create_household", { p_name: name.trim(), p_currency: currency }));
        }}
      >
        <h2 className="font-semibold">Start a new inventory</h2>
        <div>
          <label className="label" htmlFor="hh-name">Name</label>
          <input id="hh-name" className="input" placeholder="e.g. Chater's Items & Storage" required value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="hh-cur">Default currency</label>
          <select id="hh-cur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {COMMON_CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <button className="btn-primary w-full" disabled={busy}>Create</button>
      </form>
      <div className="border-t border-line" />
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          run(async () => supabase.rpc("join_household", { p_code: code }));
        }}
      >
        <h2 className="font-semibold">Join someone else&apos;s</h2>
        <p className="text-sm text-muted">Ask a member for an invite code from Settings → Members.</p>
        <input className="input font-mono uppercase" placeholder="Invite code" required value={code} onChange={(e) => setCode(e.target.value)} />
        <button className="btn w-full" disabled={busy}>Join</button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

export default function HouseholdSetup({ email, onReady }: { email: string; onReady: (id: string) => void }) {
  return (
    <Centered>
      <h1 className="text-lg font-semibold">Welcome</h1>
      <p className="mb-5 text-sm text-muted">Signed in as {email}.</p>
      <CreateOrJoin onReady={onReady} />
      <button className="mt-6 text-sm text-accent" onClick={() => supabase.auth.signOut()}>Sign out</button>
    </Centered>
  );
}
