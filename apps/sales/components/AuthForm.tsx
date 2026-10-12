"use client";
import { useState, type FormEvent } from "react";
import { createSalesBrowserClient } from "@/lib/browser";
import { getSalesSiteUrl } from "@/lib/env";
export default function AuthForm({ mode }: { mode: "login" | "reset" | "password" }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    const data = new FormData(event.currentTarget);
    try {
      const supabase = createSalesBrowserClient();
      const email = String(data.get("email") || "").trim();
      const password = String(data.get("password") || "");
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${getSalesSiteUrl()}/auth/callback?next=/update-password` });
        if (error) throw error;
        setMessage("If this email has an account, password reset instructions have been sent.");
      } else if (mode === "password") {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Open the password reset link from your email first.");
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        // Clear the recovery session after changing the password.
        await supabase.auth.signOut(); window.location.assign("/login?notice=password");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.assign("/dashboard");
      }
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "Unable to complete this request."); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}>
    {mode !== "password" && <label>Email<input name="email" type="email" autoComplete="email" required /></label>}
    {mode !== "reset" && <label>{mode === "password" ? "New password" : "Password"}<input name="password" type="password" autoComplete={mode === "password" ? "new-password" : "current-password"} minLength={mode === "password" ? 12 : undefined} required /></label>}
    <button disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "reset" ? "Send reset link" : "Save password"}</button>
    {message && <p role="status" className={failed ? "error" : "success"}>{message}</p>}
  </form>;
}
