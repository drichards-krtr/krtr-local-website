"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main><section className="card"><h1>Sales is temporarily unavailable</h1><p>The database may still need its setup migration, or the connection may be unavailable. No records were changed by loading this page.</p><button onClick={reset}>Try again</button></section></main>;
}
