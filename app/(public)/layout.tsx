import type { ReactNode } from "react";
import Header from "@/components/public/Header";
import Footer from "@/components/public/Footer";
import AlertBanner from "@/components/public/AlertBanner";
import WeatherBar from "@/components/public/WeatherBar";
import AllSiteAdBanner from "@/components/public/AllSiteAdBanner";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <AlertBanner />
      <WeatherBar />
      <AllSiteAdBanner />
      {children}
      <Footer />
    </>
  );
}
