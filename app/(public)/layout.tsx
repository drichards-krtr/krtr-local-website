import type { ReactNode } from "react";
import Header from "@/components/public/Header";
import Footer from "@/components/public/Footer";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <Footer />
    </>
  );
}
