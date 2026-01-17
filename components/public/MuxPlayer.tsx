"use client";

import Script from "next/script";

type Props = {
  playbackId: string;
  poster?: string | null;
};

export default function MuxPlayer({ playbackId, poster }: Props) {
  return (
    <div className="videoWrap">
      <Script
        src="https://cdn.jsdelivr.net/npm/@mux/mux-player@2/dist/mux-player.js"
        strategy="afterInteractive"
      />
      <mux-player
        stream-type="on-demand"
        playback-id={playbackId}
        poster={poster || undefined}
        thumbnail-time="0"
        prefer-playback="mse"
        accent-color="#d71e1f"
        style={{ width: "100%", borderRadius: "8px", overflow: "hidden" }}
      />
    </div>
  );
}
