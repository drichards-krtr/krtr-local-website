"use client";

import { useFormStatus } from "react-dom";

export default function ResetSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={disabled || pending} className="rounded bg-red-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
    {pending ? "Deleting editorial content..." : "Delete All Editorial Content"}
  </button>;
}
