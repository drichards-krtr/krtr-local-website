import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireNrcsStaff } from "@/lib/auth";
import { getNrcsSiteUrl } from "@/lib/env";
import { createNrcsServiceClient } from "@/lib/server";
import { isNrcsRole, NRCS_ROLES, type NrcsRole } from "@/lib/roles";

type StaffRow = {
  id: string;
  email: string;
  display_name: string | null;
  role: NrcsRole;
  active: boolean;
  created_at: string;
  last_seen_at: string | null;
};

type InvitationRow = {
  id: string;
  email: string;
  role: NrcsRole;
  active: boolean;
  created_at: string;
  accepted_at: string | null;
};

function normalizeEmail(value: FormDataEntryValue | null) {
  return String(value || "").trim().toLowerCase();
}

function getRole(value: FormDataEntryValue | null): NrcsRole {
  const role = String(value || "contributor");
  return isNrcsRole(role) ? role : "contributor";
}

function authRedirectUrl() {
  return `${getNrcsSiteUrl().replace(/\/$/, "")}/set-password`;
}

async function inviteUser(formData: FormData) {
  "use server";
  await requireNrcsStaff("admin");

  const email = normalizeEmail(formData.get("email"));
  const role = getRole(formData.get("role"));
  const shouldSendInvite = formData.get("send_invite") === "on";

  if (!email) {
    redirect("/users?error=Email is required");
  }

  const service = createNrcsServiceClient();
  const { error: invitationError } = await service.from("nrcs_staff_invitations").upsert(
    {
      email,
      role,
      active: true,
    },
    { onConflict: "email" }
  );

  if (invitationError) {
    redirect(`/users?error=${encodeURIComponent(invitationError.message)}`);
  }

  if (shouldSendInvite) {
    const { error } = await service.auth.admin.inviteUserByEmail(email, {
      data: { nrcs_role: role },
      redirectTo: authRedirectUrl(),
    });

    if (error) {
      redirect(`/users?error=${encodeURIComponent(error.message)}`);
    }
  }

  revalidatePath("/users");
  redirect("/users?success=invited");
}

async function updateStaff(formData: FormData) {
  "use server";
  await requireNrcsStaff("admin");

  const id = String(formData.get("id") || "");
  const role = getRole(formData.get("role"));
  const active = formData.get("active") === "on";

  const service = createNrcsServiceClient();
  const { error } = await service
    .from("nrcs_staff_profiles")
    .update({ role, active })
    .eq("id", id);

  if (error) {
    redirect(`/users?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/users");
  redirect("/users?success=updated");
}

async function sendPasswordReset(formData: FormData) {
  "use server";
  await requireNrcsStaff("admin");

  const email = normalizeEmail(formData.get("email"));
  const service = createNrcsServiceClient();
  const { error } = await service.auth.resetPasswordForEmail(email, {
    redirectTo: authRedirectUrl(),
  });

  if (error) {
    redirect(`/users?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/users?success=password-reset");
}

async function deactivateInvitation(formData: FormData) {
  "use server";
  await requireNrcsStaff("admin");

  const id = String(formData.get("id") || "");
  const service = createNrcsServiceClient();
  const { error } = await service
    .from("nrcs_staff_invitations")
    .update({ active: false })
    .eq("id", id);

  if (error) {
    redirect(`/users?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/users");
  redirect("/users?success=invitation-disabled");
}

export default async function NrcsUsersPage({
  searchParams,
}: {
  searchParams?: { error?: string; success?: string };
}) {
  await requireNrcsStaff("admin");
  const service = createNrcsServiceClient();
  const [{ data: staff }, { data: invitations }] = await Promise.all([
    service
      .from("nrcs_staff_profiles")
      .select("id, email, display_name, role, active, created_at, last_seen_at")
      .order("created_at", { ascending: false }),
    service
      .from("nrcs_staff_invitations")
      .select("id, email, role, active, created_at, accepted_at")
      .order("created_at", { ascending: false }),
  ]);

  const activeStaffEmails = new Set(((staff || []) as StaffRow[]).map((row) => row.email));
  const pendingInvitations = ((invitations || []) as InvitationRow[]).filter(
    (row) => !activeStaffEmails.has(row.email)
  );

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">NRCS Users</h1>
        <p className="text-sm text-neutral-500">
          Invite staff, set roles, and deactivate access without deleting Supabase identities.
        </p>
      </header>

      {searchParams?.error && (
        <p className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {searchParams.error}
        </p>
      )}
      {searchParams?.success && (
        <p className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Saved.
        </p>
      )}

      <section className="rounded border border-neutral-200 bg-white p-5">
        <h2 className="text-lg font-semibold">Invite User</h2>
        <form action={inviteUser} className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <input
            name="email"
            type="email"
            placeholder="name@krtrlocal.tv"
            required
            className="rounded border border-neutral-300 px-3 py-2 text-sm"
          />
          <select name="role" defaultValue="contributor" className="rounded border border-neutral-300 px-3 py-2 text-sm">
            {NRCS_ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
          <label className="inline-flex items-center gap-2 rounded border border-neutral-200 px-3 py-2 text-sm">
            <input name="send_invite" type="checkbox" defaultChecked />
            Send invite
          </label>
          <button className="rounded bg-neutral-900 px-4 py-2 text-sm font-semibold text-white md:col-span-3">
            Invite
          </button>
        </form>
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Email</div>
          <div>Name</div>
          <div>Role</div>
          <div>Active</div>
          <div>Actions</div>
        </div>
        {((staff || []) as StaffRow[]).map((row) => (
          <form
            key={row.id}
            action={updateStaff}
            className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <input type="hidden" name="id" value={row.id} />
            <div>
              <div>{row.email}</div>
              <div className="text-xs text-neutral-500">Last seen: {row.last_seen_at || "-"}</div>
            </div>
            <div>{row.display_name || "-"}</div>
            <select name="role" defaultValue={row.role} className="rounded border border-neutral-300 px-2 py-1 text-sm">
              {NRCS_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2">
              <input name="active" type="checkbox" defaultChecked={row.active} />
              Active
            </label>
            <div className="flex flex-wrap gap-3">
              <button className="underline">Save</button>
              <button formAction={sendPasswordReset} name="email" value={row.email} className="underline">
                Reset
              </button>
            </div>
          </form>
        ))}
      </section>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Pending Email</div>
          <div>Role</div>
          <div>Status</div>
          <div>Actions</div>
        </div>
        {pendingInvitations.map((row) => (
          <div
            key={row.id}
            className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div>{row.email}</div>
            <div className="capitalize">{row.role}</div>
            <div>{row.active ? "Invited" : "Disabled"}</div>
            <form action={deactivateInvitation}>
              <input type="hidden" name="id" value={row.id} />
              <button className="underline" disabled={!row.active}>
                Disable
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
