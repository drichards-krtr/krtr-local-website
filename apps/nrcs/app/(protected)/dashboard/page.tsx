import { requireNrcsStaff } from "@/lib/auth";

export default async function NrcsDashboardPage() {
  const { profile } = await requireNrcsStaff();

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">NRCS Dashboard</h1>
        <p className="text-sm text-neutral-500">
          Phase 1 shell and staff access foundation.
        </p>
      </header>

      <section className="rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Access Status</h2>
        <dl className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div>
            <dt className="text-neutral-500">User</dt>
            <dd className="font-medium">{profile.email}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Role</dt>
            <dd className="font-medium capitalize">{profile.role}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Active</dt>
            <dd className="font-medium">{profile.active ? "Yes" : "No"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
