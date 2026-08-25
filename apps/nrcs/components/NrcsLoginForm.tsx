"use client";

import { useState } from "react";
import { createNrcsBrowserClient } from "@/lib/browser";

export default function NrcsLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"google" | "password" | null>(null);

  const signInWithGoogle = async () => {
    setError(null);
    setLoading("google");
    const supabase = createNrcsBrowserClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/api/auth/callback?next=/dashboard`,
      },
    });
    if (error) {
      setError(error.message);
      setLoading(null);
    }
  };

  const signInWithPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading("password");

    const supabase = createNrcsBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setLoading(null);
      return;
    }

    window.location.href = "/dashboard";
  };

  return (
    <div className="grid gap-5">
      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={!!loading}
        className="rounded bg-yellow-300 px-4 py-2 text-sm font-semibold text-neutral-950 disabled:opacity-60"
      >
        {loading === "google" ? "Opening Google..." : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.16em] text-neutral-500">
        <div className="h-px flex-1 bg-neutral-800" />
        <span>Email fallback</span>
        <div className="h-px flex-1 bg-neutral-800" />
      </div>

      <form onSubmit={signInWithPassword} className="grid gap-3">
        <label className="grid gap-1 text-sm">
          <span>Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="rounded border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
          />
        </label>
        <button
          type="submit"
          disabled={!!loading}
          className="rounded border border-neutral-700 px-4 py-2 text-sm font-semibold text-neutral-100 disabled:opacity-60"
        >
          {loading === "password" ? "Signing in..." : "Sign in with email"}
        </button>
      </form>

      {error && <p className="text-sm text-red-300">{error}</p>}
      <p className="text-xs leading-5 text-neutral-500">
        Access is limited to invited KRTR staff. Public registration is disabled by policy.
      </p>
    </div>
  );
}
