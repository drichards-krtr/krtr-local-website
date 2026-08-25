import type { Metadata } from "next";
import NrcsSetPasswordForm from "@/components/NrcsSetPasswordForm";

export const metadata: Metadata = {
  title: "Set NRCS Password",
};

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-neutral-100">
      <section className="w-full max-w-md rounded border border-neutral-800 bg-neutral-900 p-6">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-yellow-300">
            KRTR Local
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Set NRCS Password</h1>
        </div>
        <NrcsSetPasswordForm />
      </section>
    </main>
  );
}
