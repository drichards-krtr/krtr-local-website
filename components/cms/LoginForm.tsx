"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createBrowserSupabase();
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setError(error.message);
    } else {
      window.location.href = "/cms";
    }
    setLoading(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto grid w-full max-w-md gap-4 rounded-lg border border-neutral-200 bg-white p-6"
    >
      <div>
        <label className="text-sm font-medium">Email</label>
        <input
          type="email"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </div>
      <div>
        <label className="text-sm font-medium">Password</label>
        <input
          type="password"
          className="mt-1 w-full rounded border border-neutral-300 px-3 py-2 text-sm"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        disabled={loading}
      >
        {loading ? "Signing in..." : "Sign in"}
      </button>
    </form>
  );
}
