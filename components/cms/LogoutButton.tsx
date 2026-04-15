"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function LogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);

    try {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
      await fetch("/api/cms/session", {
        method: "DELETE",
        credentials: "same-origin",
      });
    } finally {
      window.location.href = "/cms/login";
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="rounded border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 disabled:opacity-60"
    >
      {loading ? "Signing out..." : "Sign out"}
    </button>
  );
}

