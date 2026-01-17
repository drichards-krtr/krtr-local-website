import { createServerSupabase } from "@/lib/supabase/server";

export default async function UsersPage() {
  const supabase = createServerSupabase();
  const { data: users } = await supabase
    .from("profiles")
    .select("id, email, display_name, is_admin, created_at")
    .order("created_at", { ascending: false });

  async function toggleAdmin(formData: FormData) {
    "use server";
    const supabase = createServerSupabase();
    const id = String(formData.get("id"));
    const next = formData.get("next") === "true";
    await supabase.from("profiles").update({ is_admin: next }).eq("id", id);
  }

  return (
    <div className="grid gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Users</h1>
        <p className="text-sm text-neutral-500">
          Admin access is controlled by the is_admin flag.
        </p>
      </header>

      <section className="rounded border border-neutral-200 bg-white">
        <div className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-2 border-b border-neutral-200 px-4 py-3 text-xs font-semibold uppercase text-neutral-500">
          <div>Email</div>
          <div>Name</div>
          <div>Admin</div>
          <div>Actions</div>
        </div>
        {(users || []).map((user) => (
          <div
            key={user.id}
            className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-2 border-b border-neutral-100 px-4 py-3 text-sm"
          >
            <div>{user.email || "-"}</div>
            <div>{user.display_name || "-"}</div>
            <div>{user.is_admin ? "Yes" : "No"}</div>
            <form action={toggleAdmin}>
              <input type="hidden" name="id" value={user.id} />
              <input
                type="hidden"
                name="next"
                value={(!user.is_admin).toString()}
              />
              <button type="submit" className="text-sm underline">
                {user.is_admin ? "Remove admin" : "Make admin"}
              </button>
            </form>
          </div>
        ))}
      </section>
    </div>
  );
}
