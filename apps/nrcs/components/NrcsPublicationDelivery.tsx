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
    fetch(`/api/publications?${new URLSearchParams(JSON.parse(identity))}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Status could not load.");
      if (generation.current === current) setDelivery(data.delivery);
    }).catch(failure => { if (!controller.signal.aborted && generation.current === current) setError(failure.message); });
    return () => controller.abort();
  }, [identity]);
  async function send() {
    if (lock.current || disabled) return;
    lock.current = true; setBusy(true); setError("");
    const current = ++generation.current;
    try {
      const response = await fetch("/api/publications", { method: "POST", headers: { "Content-Type": "application/json" }, body: identity, signal: AbortSignal.timeout(30000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "CMS delivery failed.");
      if (generation.current === current) setDelivery(data.delivery);
    } catch (failure) {
      if (generation.current === current) setError(failure instanceof Error && failure.name === "TimeoutError" ? "Confirmation timed out. Retry safely reuses the same request." : failure instanceof Error ? failure.message : "CMS delivery failed.");
    } finally { lock.current = false; setBusy(false); }
  }
  const received = delivery?.status === "received";
  const receiptState = delivery?.receipt?.state;
  const receivedLabel = receiptState && receiptState !== "received_non_public" ? `CMS confirmed: ${receiptState}` : "CMS received (non-public)";
  return <div className="grid gap-2 border-t border-neutral-200 pt-3" aria-live="polite">
    <p className="text-xs text-neutral-600">Saved revision {revision}{disabled ? " · Unsaved changes or save in progress" : ""}</p>
    <p className={`text-sm font-semibold ${received ? "text-green-800" : delivery?.status === "failed" ? "text-red-800" : "text-neutral-700"}`}>{busy ? "Sending to CMS..." : received ? receivedLabel : delivery?.status === "failed" ? "CMS delivery failed" : delivery?.status === "sending" ? "CMS confirmation pending" : "Not sent to CMS"}</p>
    {received && <p className="break-all text-xs text-neutral-600">Projection ID: {delivery.receipt?.cms_projection_id}</p>}
    {received && delivery.receipt?.cms_article_id && <p className="break-all text-xs text-neutral-600">CMS Article ID: {delivery.receipt.cms_article_id}</p>}
    {(error || delivery?.last_error) && <p role="alert" className="break-words text-sm text-red-800">{error || delivery?.last_error}</p>}
    {!received && <button type="button" disabled={busy || disabled} onClick={send} className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{delivery || error ? "Retry / Check CMS Receipt" : "Send to CMS"}</button>}
  </div>;
}
