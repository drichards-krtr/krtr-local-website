"use client";

import { useState } from "react";

export default function AssignmentDecision({ action, decision, note, owners }: {
  action: (formData: FormData) => void;
  decision: string;
  note: string;
  owners: { id: string; name: string }[];
}) {
  const [selection, setSelection] = useState(
    ["skip", "hold", "need_more_info"].includes(decision) ? decision : "pending"
  );
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className="grid gap-1">Decision
        <select name="decision" className="rounded border p-2" value={selection} onChange={event => setSelection(event.target.value)} required>
          <option value="pending" disabled>Select a decision</option>
          <option value="skip">Skip</option>
          <option value="hold">Hold</option>
          <option value="need_more_info">Need More Info</option>
          <option value="assigned">Assign</option>
        </select>
      </label>
      {selection === "assigned" && (
        <label className="grid gap-1">Draft owner
          <select name="owner" className="rounded border p-2" required defaultValue="">
            <option value="" disabled>{owners.length ? "Select a district user" : "No eligible users"}</option>
            {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}</option>)}
          </select>
        </label>
      )}
      <label className="grid gap-1">Decision note
        <input name="note" className="rounded border p-2" defaultValue={note} maxLength={4000} />
      </label>
      <button className="rounded bg-neutral-900 px-3 py-2 text-white disabled:opacity-50" disabled={selection === "pending" || (selection === "assigned" && !owners.length)}>
        {selection === "assigned" ? "Assign and create draft" : "Save decision"}
      </button>
    </form>
  );
}
