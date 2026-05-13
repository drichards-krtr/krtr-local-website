"use client";

import React from "react";
import Script from "next/script";

type Props = {
  playbackId: string;
  poster?: string | null;
};

export default function MuxPlayer({ playbackId, poster }: Props) {
  const muxProps = {
    "stream-type": "on-demand",
    "playback-id": playbackId,
    poster: poster || undefined,
    "thumbnail-time": "0",
    "prefer-playback": "mse",
    "accent-color": "#d71e1f",
    style: { borderRadius: "8px", overflow: "hidden" },
  };

  return (
    <div className="mb-4 flex justify-center">
      <Script
        src="https://cdn.jsdelivr.net/npm/@mux/mux-player@2/dist/mux-player.js"
        strategy="afterInteractive"
      />
      <div className="w-full lg:w-[min(100%,calc(72vh*9/16))]">
        {React.createElement("mux-player", {
          ...muxProps,
          style: {
            ...muxProps.style,
            width: "100%",
            maxHeight: "72vh",
          },
        })}
      </div>
    </div>
  );
}
