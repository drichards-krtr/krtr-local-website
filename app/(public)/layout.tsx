import type { ReactNode } from "react";
import Header from "@/components/public/Header";
import Footer from "@/components/public/Footer";
import AlertBanner from "@/components/public/AlertBanner";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <AlertBanner />
      {children}
      <Footer />
    </>
  );
}
