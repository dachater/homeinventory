"use client";

import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import type { Household } from "@/lib/types";
import AuthScreen, { NewPasswordScreen } from "./AuthScreen";
import Centered from "./Centered";
import HouseholdSetup from "./HouseholdSetup";
import Inventory from "./Inventory";

const HOUSEHOLD_KEY = "homeinventory.household";

function readStored(): string | null {
  try {
    return localStorage.getItem(HOUSEHOLD_KEY);
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(false);
  const [households, setHouseholds] = useState<Household[] | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setHouseholds(null);
      setSession(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const loadHouseholds = useCallback(async (preferId?: string) => {
    const { data, error } = await supabase.from("households").select("id, name, default_currency").order("created_at");
    if (error) {
      setError(error.message);
      return;
    }
    setHouseholds(data);
    const wanted = preferId ?? readStored();
    const pick = data.find((h) => h.id === wanted) ?? data[0];
    setCurrentId(pick?.id ?? null);
  }, []);

  useEffect(() => {
    // Loads asynchronously; state is only set once the request returns.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (userId) loadHouseholds();
  }, [userId, loadHouseholds]);

  const switchHousehold = useCallback(
    (id: string) => {
      try {
        localStorage.setItem(HOUSEHOLD_KEY, id);
      } catch {}
      loadHouseholds(id);
    },
    [loadHouseholds],
  );

  if (!supabaseConfigured) {
    return (
      <Centered>
        <h1 className="text-lg font-semibold">Supabase is not configured</h1>
        <p className="mt-2 text-sm text-muted">
          Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (or{" "}
          <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>) in your environment, then rebuild. See the README.
        </p>
      </Centered>
    );
  }
  if (session === undefined) return <Centered><p className="text-muted">Loading…</p></Centered>;
  if (recovering && session) return <NewPasswordScreen onDone={() => setRecovering(false)} />;
  if (!session) return <AuthScreen />;
  if (error) return <Centered><p className="text-danger">{error}</p></Centered>;
  if (households === null) return <Centered><p className="text-muted">Loading…</p></Centered>;

  const current = households.find((h) => h.id === currentId);
  if (!current) {
    return <HouseholdSetup email={session.user.email ?? ""} onReady={switchHousehold} />;
  }
  return (
    <Inventory
      key={current.id}
      household={current}
      households={households}
      userId={session.user.id}
      email={session.user.email ?? ""}
      onSwitchHousehold={switchHousehold}
      onHouseholdsChanged={() => loadHouseholds(current.id)}
    />
  );
}
