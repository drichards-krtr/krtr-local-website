"use client";

import { useEffect, useState } from "react";
import { createNrcsBrowserClient } from "@/lib/browser";

export default function NrcsSetPasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [hasSession, setHasSession] = useState(false);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createNrcsBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session);
      setChecking(false);
    });
  }, []);

  const updatePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setMessage(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    const supabase = createNrcsBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }

    setMessage("Password saved. Redirecting...");
    window.location.href = "/dashboard";
  };

  if (checking) {
    return <p className="text-sm text-neutral-400">Checking invitation session...</p>;
  }

  if (!hasSession) {
    return (
      <div className="grid gap-3 text-sm text-neutral-300">
        <p>
          This password page needs a fresh Supabase invitation or password-reset link.
        </p>
        <a href="/login" className="font-semibold text-yellow-300 underline">
          Return to sign in
        </a>
      </div>
    );
  }

  return (
    <form onSubmit={updatePassword} className="grid gap-4">
      <label className="grid gap-1 text-sm">
        <span>New password</span>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          minLength={8}
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span>Confirm password</span>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          minLength={8}
          className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
        />
      </label>
      <button
        type="submit"
        disabled={saving}
        className="rounded bg-yellow-300 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-60"
      >
        {saving ? "Saving..." : "Save password"}
      </button>
      {error && <p className="text-sm text-red-300">{error}</p>}
      {message && <p className="text-sm text-green-300">{message}</p>}
    </form>
  );
}
