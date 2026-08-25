"use client";

import { useState } from "react";
import { createNrcsBrowserClient } from "@/lib/browser";

export default function NrcsLogoutButton() {
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    setLoading(true);
    try {
      await createNrcsBrowserClient().auth.signOut();
    } finally {
      window.location.href = "/login";
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
