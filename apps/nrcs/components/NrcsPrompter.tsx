"use client";

import { useState, type ReactNode } from "react";

export default function NrcsPrompter({ title, children }: { title: string; children: ReactNode }) {
  const [fontSize, setFontSize] = useState(48);
  const [flipHorizontal, setFlipHorizontal] = useState(false);
  const [flipVertical, setFlipVertical] = useState(false);

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-black text-white">
      <main
        aria-label={title}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        style={{ transform: `scale(${flipHorizontal ? -1 : 1}, ${flipVertical ? -1 : 1})` }}
      >
        <div className="mx-auto max-w-6xl space-y-[1em] px-[6vw] py-8 leading-[1.45]" style={{ fontSize }}>
          <h1 className="sr-only">{title}</h1>
          {children}
        </div>
      </main>
      <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-neutral-700 px-4 py-3 text-sm">
        <label className="flex items-center gap-2">
          <span>Text size</span>
          <input
            type="range"
            min={20}
            max={120}
            step={2}
            value={fontSize}
            aria-valuetext={`${fontSize} pixels`}
            className="w-28 accent-white"
            onChange={(event) => setFontSize(event.currentTarget.valueAsNumber)}
          />
          <span className="w-12 tabular-nums">{fontSize} px</span>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={flipHorizontal} onChange={(event) => setFlipHorizontal(event.currentTarget.checked)} />
          Flip horizontally
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={flipVertical} onChange={(event) => setFlipVertical(event.currentTarget.checked)} />
          Flip vertically
        </label>
      </div>
    </div>
  );
}
