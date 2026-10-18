"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import Centered from "./Centered";

type Mode = "signin" | "signup" | "reset";

export default function AuthScreen() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const redirectTo = window.location.origin;
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        if (!data.session) setMessage({ text: "Check your email for a link to confirm your account." });
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setMessage({ text: "If that email has an account, a reset link is on its way." });
      }
    } catch (err) {
      setMessage({ text: errorMessage(err), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Centered>
      <div className="mb-5 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" className="h-10 w-10" />
        <div>
          <h1 className="text-lg font-semibold">Home Inventory</h1>
          <p className="text-sm text-muted">
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create an account" : "Reset your password"}
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode !== "reset" && (
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              minLength={mode === "signup" ? 8 : undefined}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
        )}
        {message && <p className={`text-sm ${message.error ? "text-danger" : "text-muted"}`}>{message.text}</p>}
        <button className="btn-primary w-full" disabled={busy}>
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
        </button>
      </form>
      <div className="mt-4 flex justify-between text-sm">
        {mode === "signin" ? (
          <>
            <button className="text-accent" onClick={() => setMode("signup")}>Create an account</button>
            <button className="text-accent" onClick={() => setMode("reset")}>Forgot password?</button>
          </>
        ) : (
          <button className="text-accent" onClick={() => setMode("signin")}>Back to sign in</button>
        )}
      </div>
    </Centered>
  );
}

export function NewPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) setError(error.message);
    else onDone();
  }

  return (
    <Centered>
      <h1 className="mb-4 text-lg font-semibold">Choose a new password</h1>
      <form onSubmit={submit} className="space-y-3">
        <input className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <p className="text-sm text-danger">{error}</p>}
        <button className="btn-primary w-full" disabled={busy}>Save password</button>
      </form>
    </Centered>
  );
}
