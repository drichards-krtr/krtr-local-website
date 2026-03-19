"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  streamUrl: string;
  streamId: string | null;
};

type StartPayload = {
  sessionId: string;
  deviceId: string;
  streamId: string | null;
  startedAt: string;
};

type EndPayload = {
  sessionId: string;
  deviceId: string;
  endedAt: string;
};

const DEVICE_ID_KEY = "krtr_device_id";

async function postJson(path: string, payload: StartPayload | EndPayload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${path}`);
  }
}

function getOrCreateDeviceId() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const created = crypto.randomUUID();
  window.localStorage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export default function LiveVideoPlayer({ streamUrl, streamId }: Props) {
  const [deviceId, setDeviceId] = useState("");
  const sessionIdRef = useRef<string | null>(null);
  const endingRef = useRef(false);

  useEffect(() => {
    setDeviceId(getOrCreateDeviceId());
  }, []);

  useEffect(() => {
    return () => {
      if (sessionIdRef.current && deviceId) {
        void postJson("/api/analytics/end", {
          sessionId: sessionIdRef.current,
          deviceId,
          endedAt: new Date().toISOString(),
        }).catch(() => {});
      }
    };
  }, [deviceId]);

  useEffect(() => {
    function handlePageHide() {
      if (!sessionIdRef.current || !deviceId || endingRef.current) return;

      endingRef.current = true;
      const payload: EndPayload = {
        sessionId: sessionIdRef.current,
        deviceId,
        endedAt: new Date().toISOString(),
      };
      const body = JSON.stringify(payload);
      const sent = navigator.sendBeacon?.("/api/analytics/end", new Blob([body], { type: "application/json" }));

      if (!sent) {
        void postJson("/api/analytics/end", payload).catch(() => {});
      }
      sessionIdRef.current = null;
      endingRef.current = false;
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [deviceId]);

  async function startSession() {
    if (!deviceId || sessionIdRef.current) return;

    const sessionId = crypto.randomUUID();
    await postJson("/api/analytics/start", {
      sessionId,
      deviceId,
      streamId,
      startedAt: new Date().toISOString(),
    });
    sessionIdRef.current = sessionId;
  }

  async function endSession() {
    if (!deviceId || !sessionIdRef.current || endingRef.current) return;

    endingRef.current = true;
    const currentSessionId = sessionIdRef.current;
    sessionIdRef.current = null;

    try {
      await postJson("/api/analytics/end", {
        sessionId: currentSessionId,
        deviceId,
        endedAt: new Date().toISOString(),
      });
    } finally {
      endingRef.current = false;
    }
  }

  return (
    <video
      controls
      autoPlay
      playsInline
      src={streamUrl}
      className="aspect-video w-full rounded bg-black"
      onPlaying={() => {
        void startSession().catch(() => {});
      }}
      onPause={() => {
        void endSession().catch(() => {});
      }}
      onEnded={() => {
        void endSession().catch(() => {});
      }}
    >
      Your browser does not support the live stream player.
    </video>
  );
}
