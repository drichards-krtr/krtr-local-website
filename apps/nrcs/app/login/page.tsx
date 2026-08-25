import type { Metadata } from "next";
import NrcsLoginForm from "@/components/NrcsLoginForm";

export const metadata: Metadata = {
  title: "KRTR NRCS Sign In",
};

export default function NrcsLoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <section className="w-full max-w-md rounded border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-yellow-300">
            KRTR Local
          </p>
          <h1 className="mt-2 text-2xl font-semibold">NRCS Sign In</h1>
        </div>
        <NrcsLoginForm />
      </section>
    </main>
  );
}
