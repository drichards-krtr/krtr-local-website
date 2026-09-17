"use client";
import { useState } from "react";
import type { ImageReference } from "@/apps/nrcs/lib/editorialContract";

export default function NrcsArticleMedia({ images }: { images: ImageReference[] }) {
  const [index, setIndex] = useState(0);
  if (!images.length) return null;
  const current = images[index % images.length];
  return <div className="grid gap-2"><img alt={current.title} src={current.url} className="aspect-video w-full object-contain" />{images.length > 1 && <div className="flex items-center justify-center gap-4"><button type="button" title="Previous image" aria-label="Previous image" className="h-9 w-9 border" onClick={() => setIndex((index + images.length - 1) % images.length)}>&larr;</button><span className="text-sm">{index + 1} / {images.length}</span><button type="button" title="Next image" aria-label="Next image" className="h-9 w-9 border" onClick={() => setIndex((index + 1) % images.length)}>&rarr;</button></div>}</div>;
}
