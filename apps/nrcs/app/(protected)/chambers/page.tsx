import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { requestChambers, type ChamberAdminCatalog } from "@/lib/chambersServer";

async function requireChamberAdmin() {
  if (process.env.NRCS_CHAMBER_ADMIN_ENABLED === "false") notFound();
  await requireNrcsStaff("admin");
}

async function saveAccount(id: string, form: FormData) {
  "use server";
  await requireChamberAdmin();

  const account = {
    id,
    name: String(form.get("name") || ""),
    city: String(form.get("city") || ""),
    contact_name: String(form.get("contact_name") || ""),
    contact_email: String(form.get("contact_email") || ""),
    contact_phone: String(form.get("contact_phone") || ""),
    notes: String(form.get("notes") || ""),
    active: form.get("active") === "on",
  };
  const coverage = Object.fromEntries(
    Array.from(form.entries())
      .filter(([field, value]) => field.startsWith("coverage:") && (value === "active" || value === "inactive"))
      .map(([field, value]) => [field.slice("coverage:".length), value === "active"])
  );
  try {
    await requestChambers("", { account, coverage });
  } catch (error) {
    redirect(`/chambers?error=${encodeURIComponent(error instanceof Error ? error.message : "Unable to save Chamber.")}`);
  }
  redirect("/chambers?saved=1");
}

const fields = [
  { key: "name", label: "Chamber name", required: true, type: "text", maxLength: 200 },
  { key: "city", label: "City", required: true, type: "text", maxLength: 200 },
  { key: "contact_name", label: "Contact name", type: "text", maxLength: 320 },
  { key: "contact_email", label: "Contact email", type: "email", maxLength: 320 },
  { key: "contact_phone", label: "Contact phone", type: "tel", maxLength: 320 },
] as const;
const inputClass = "rounded border border-neutral-300 px-3 py-2";

function AccountForm({ account, catalog }: {
  account?: ChamberAdminCatalog["accounts"][number];
  catalog: ChamberAdminCatalog;
}) {
  const action = saveAccount.bind(null, account?.id ?? randomUUID());
  return (
    <form action={action} className="grid gap-4 rounded border border-neutral-200 bg-white p-5">
      <h2 className="text-lg font-semibold">{account?.name || "New Chamber"}</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => (
          <label key={field.key} className="grid gap-1 text-sm">
            <span>{field.label}</span>
            <input name={field.key} type={field.type} className={inputClass} maxLength={field.maxLength}
              required={"required" in field} defaultValue={account?.[field.key] ?? ""} />
          </label>
        ))}
        <label className="grid gap-1 text-sm">
          <span>Administrative notes</span>
          <textarea name="notes" className={inputClass} maxLength={4000} defaultValue={account?.notes ?? ""} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="active" defaultChecked={account?.active ?? false} /> Active Chamber account
      </label>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold">Event Highlight district coverage</legend>
        {catalog.districts.map((district) => {
          const coverage = catalog.coverage.find((row) => row.chamber_id === account?.id && row.district_key === district.district_key);
          return (
            <label key={district.district_key} className="flex items-center gap-2 text-sm">
              <span>{district.display_name} ({district.district_key})</span>
              <select name={`coverage:${district.district_key}`} className={inputClass}
                defaultValue={coverage ? (coverage.active ? "active" : "inactive") : ""}>
                <option value="">Unassigned</option>
                <option value="inactive">Assigned, inactive</option>
                <option value="active">Assigned, active</option>
              </select>
            </label>
          );
        })}
      </fieldset>
      <button type="submit" className="w-fit rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white">
        {account ? "Save Chamber" : "Create Chamber"}
      </button>
    </form>
  );
}

export default async function ChambersPage({ searchParams }: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireChamberAdmin();
  const params = await searchParams;
  const catalog = await requestChambers<ChamberAdminCatalog>("").catch((error: unknown) => {
    console.error("[chambers] admin catalog unavailable", error);
    return null;
  });

  return (
    <section className="grid gap-5">
      <h1 className="text-2xl font-semibold">Chamber Sponsorships</h1>
      {params.error && <p role="alert" className="text-sm text-red-700">{params.error}</p>}
      {params.saved && <p role="status" className="text-sm text-green-800">Chamber saved.</p>}
      {!catalog && <p role="alert">Chamber administration is temporarily unavailable.</p>}
      {catalog?.accounts.map((account) => <AccountForm key={account.id} account={account} catalog={catalog} />)}
      {catalog && <AccountForm catalog={catalog} />}
    </section>
  );
}
