import type { ReactNode } from "react";
export const metadata = { title: "KRTR Calendar Ingestion Pipeline", robots: { index: false, follow: false } };
export default function Layout({ children }: { children: ReactNode }) {
  return <html lang="en"><body style={{ fontFamily: "system-ui", margin: "3rem", maxWidth: "48rem" }}>{children}</body></html>;
}
