import Link from "next/link";
import Header from "@/components/public/Header";
import Footer from "@/components/public/Footer";
import AlertBanner from "@/components/public/AlertBanner";
import WeatherBar from "@/components/public/WeatherBar";
import AllSiteAdBanner from "@/components/public/AllSiteAdBanner";

export default function NotFound() {
  return (
    <>
      <Header />
      <AlertBanner />
      <WeatherBar />
      <AllSiteAdBanner />
      <main className="mx-auto grid max-w-site gap-4 px-4 py-12">
        <section className="rounded-lg bg-white p-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-neutral-500">404</p>
          <h1 className="mt-2 text-2xl font-semibold text-neutral-950">Well, that&apos;s unfortunate...</h1>
          <p className="mt-3 text-neutral-700">This page could not be found.</p>
          <Link
            href="/"
            className="mt-6 inline-flex rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Return Home
          </Link>
        </section>
      </main>
      <Footer />
    </>
  );
}
