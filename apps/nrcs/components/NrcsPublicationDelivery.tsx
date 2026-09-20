"use client";
import { useEffect, useRef, useState } from "react";
import type { DeliverySummary } from "@/lib/publicationDelivery";

export default function NrcsPublicationDelivery({ kind, sourceId, districtKey, revision, disabled = false }: { kind: "web" | "homepage" | "alert"; sourceId: string; districtKey: string; revision: number; disabled?: boolean }) {
  const [delivery, setDelivery] = useState<DeliverySummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const lock = useRef(false);
  const identity = JSON.stringify({ kind, source_id: sourceId, district_key: districtKey, revision });
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setDelivery(null); setError("");
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      try {
        const response = await fetch(`/api/publications?${new URLSearchParams(JSON.parse(identity))}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]), cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Status could not load.");
        if (generation.current !== current) return;
        setDelivery(data.delivery);
        if (data.delivery?.status === "pending" || data.delivery?.status === "sending") timer = setTimeout(load, 2000);
      } catch (failure) { if (!controller.signal.aborted && generation.current === current) setError(failure instanceof Error ? failure.message : "Status could not load."); }
    }
    load();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [identity]);
  async function send(refresh = false) {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError("");
    const current = ++generation.current;
    try {
      const response = await fetch("/api/publications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(identity), action: refresh ? "refresh" : "send" }), signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "CMS delivery failed.");
      if (generation.current === current) setDelivery(data.delivery);
    } catch (failure) {
      if (generation.current === current) setError(failure instanceof Error && failure.name === "TimeoutError" ? refresh ? "CMS status check timed out. Retry the check." : "Confirmation timed out. Retry safely reuses the same request." : failure instanceof Error ? failure.message : "CMS delivery failed.");
    } finally { lock.current = false; setBusy(false); }
  }
  const received = delivery?.status === "received";
  const receipt = delivery?.confirmation?.receipt || delivery?.receipt;
  const receiptState = receipt?.state;
  const receivedLabel = delivery?.confirmation && !delivery.confirmation.current
    ? receipt?.current_projection_revision !== revision ? "CMS delivery superseded" : "CMS received; no current public projection"
    : receiptState && receiptState !== "received_non_public" ? `CMS confirmed: ${receiptState}` : "CMS received (non-public)";
  return <div className="grid gap-2 border-t border-neutral-200 pt-3" aria-live="polite">
    <p className="text-xs text-neutral-600">Saved revision {revision}{disabled ? " · Unsaved changes or save in progress" : ""}</p>
    <p className={`text-sm font-semibold ${received ? "text-green-800" : delivery?.status === "failed" ? "text-red-800" : "text-neutral-700"}`}>{busy ? "Awaiting CMS confirmation..." : received ? receivedLabel : delivery?.status === "failed" ? "CMS delivery failed" : delivery?.status === "sending" ? "CMS delivery in progress" : delivery?.status === "pending" ? "Queued for CMS delivery" : "Not queued for CMS delivery"}</p>
    {received && <p className="break-all text-xs text-neutral-600">Projection ID: {delivery.receipt?.cms_projection_id}</p>}
    {received && receipt?.cms_article_id && <p className="break-all text-xs text-neutral-600">CMS Article ID: {receipt.cms_article_id}</p>}
    {delivery?.confirmation && <p className="text-xs text-neutral-600">Last checked: {new Date(delivery.confirmation.checked_at).toLocaleString()}</p>}
    {(error || delivery?.last_error) && <p role="alert" className="break-words text-sm text-red-800">{error || delivery?.last_error}</p>}
    {(!delivery || delivery.status === "failed") && <button type="button" disabled={busy || disabled} onClick={() => send()} className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{delivery ? "Retry CMS Delivery" : "Queue CMS Delivery"}</button>}
    {received && kind === "web" && <button type="button" disabled={busy || disabled} onClick={() => send(true)} className="w-fit rounded border border-neutral-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">Check CMS Status</button>}
  </div>;
}
