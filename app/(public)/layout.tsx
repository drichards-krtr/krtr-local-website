import { buildPageMetadata } from "@/lib/metadata";
import SiteIdentity from "@/components/public/SiteIdentity";
import type { ReactNode } from "react";
import Header from "@/components/public/Header";
import Footer from "@/components/public/Footer";
import AlertBanner from "@/components/public/AlertBanner";
import WeatherBar from "@/components/public/WeatherBar";
import AllSiteAdBanner from "@/components/public/AllSiteAdBanner";

export async function generateMetadata() { return buildPageMetadata(); }

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteIdentity />
      <Header />
      <AlertBanner />
      <WeatherBar />
      <AllSiteAdBanner />
      {children}
      <Footer />
    </>
  );
}
