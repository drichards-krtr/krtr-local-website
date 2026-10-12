"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireSalesIdentity } from "./auth";
import { getSalesSiteUrl, getSalesSupabaseEnv } from "./env";
import { createSalesServerClient } from "./server";
import { createSalesAdminClient } from "./admin";
import { invitationHash, newInvitationToken, sendInvitationEmail } from "./invitations";
const text = (form: FormData, key: string) => String(form.get(key) || "").trim();
const checked = (form: FormData, key: string) => form.get(key) === "on";
const uuid = (value: string) => /^[0-9a-f-]{36}$/i.test(value) ? value : "";
function orgPath(form: FormData) { const id = uuid(text(form, "organization_id")); return id ? `/customers/${id}` : "/customers"; }
function finish(path: string, error?: { message: string } | null): never {
  revalidatePath("/dashboard"); revalidatePath("/customers"); revalidatePath(path);
  redirect(`${path}?${error ? "error=" + encodeURIComponent(error.message) : "notice=saved"}`);
}
export async function createCustomer(form: FormData) {
 const { supabase } = await requireSalesIdentity();
 const { data, error } = await supabase.rpc("sales_create_customer", { p_name: text(form,"company_name"), p_district: text(form,"district_key"), p_contact_name: text(form,"contact_name"), p_contact_email: text(form,"contact_email"), p_contact_phone: text(form,"contact_phone"), p_location: text(form,"business_location") });
 finish(error ? "/customers" : `/customers/${data}`, error);
}
export async function updateCustomer(form: FormData) {
 const { supabase } = await requireSalesIdentity();
 const { error } = await supabase.rpc("sales_update_customer", { p_org: text(form,"organization_id"), p_name: text(form,"company_name"), p_contact_name: text(form,"contact_name"), p_contact_email: text(form,"contact_email"), p_contact_phone: text(form,"contact_phone"), p_location: text(form,"business_location"), p_notes: text(form,"internal_notes") });
 finish(orgPath(form), error);
}
export async function addCustomerDistrict(form: FormData) {
 const { supabase } = await requireSalesIdentity();
 const { error } = await supabase.rpc("sales_add_customer_district", { p_org: text(form,"organization_id"), p_district: text(form,"district_key") }); finish(orgPath(form), error);
}
export async function transferSalesperson(form: FormData) {
 const { supabase } = await requireSalesIdentity();
 const { error } = await supabase.rpc("sales_transfer_salesperson", { p_org: text(form,"organization_id"), p_new_seller: text(form,"new_salesperson_id"), p_reason: text(form,"reason") }); finish("/customers", error);
}
export async function createOpportunity(form: FormData) {
 const { supabase } = await requireSalesIdentity();
 const { data, error } = await supabase.rpc("sales_create_opportunity", { p_org: text(form,"organization_id"), p_district: text(form,"district_key"), p_goal: text(form,"business_goal"), p_product: text(form,"proposed_product"), p_action: text(form,"next_action"), p_on: text(form,"next_action_on") || null }); finish(error ? orgPath(form) : `/opportunities/${data}`, error);
}
export async function updateOpportunity(form: FormData) {
 const { supabase } = await requireSalesIdentity();
 const { error } = await supabase.rpc("sales_update_opportunity", { p_id: text(form,"opportunity_id"), p_version: Number(form.get("version")), p_stage: text(form,"stage"), p_goal: text(form,"business_goal"), p_product: text(form,"proposed_product"), p_action: text(form,"next_action"), p_on: text(form,"next_action_on") || null, p_lost_reason: text(form,"lost_reason") });
 finish(`/opportunities/${uuid(text(form,"opportunity_id"))}`, error);
}
export async function logContact(form: FormData) {
 const { supabase } = await requireSalesIdentity();
 const { error } = await supabase.rpc("sales_log_contact", { p_id: text(form,"opportunity_id"), p_method: text(form,"method"), p_summary: text(form,"summary") }); finish(`/opportunities/${uuid(text(form,"opportunity_id"))}`, error);
}
export async function inviteCustomer(form: FormData) {
 const { supabase } = await requireSalesIdentity();
 let admin: ReturnType<typeof createSalesAdminClient>;
 try { admin = createSalesAdminClient(); }
 catch (e) { finish(orgPath(form), { message: e instanceof Error ? e.message : "Sales invitation setup incomplete." }); }
 const token = newInvitationToken();
 const email = text(form,"email").toLowerCase();
 const org = text(form,"organization_id");
 const { data: id, error } = await supabase.rpc("sales_invite_customer", { p_org: org, p_email: email, p_token_hash: invitationHash(token), p_view: checked(form,"can_view"), p_approve: checked(form,"can_approve_assets"), p_sign: checked(form,"can_sign_agreements"), p_owner: checked(form,"is_account_owner"), p_reason: text(form,"reason") });
 if (error) finish(orgPath(form), error);
 const { data: company } = await supabase.from("sales_organizations").select("company_name").eq("id", org).single();
 let sendError: string | null = null;
 try {
  const providerId = await sendInvitationEmail({ id, email, company: company?.company_name || "your organization", url: `${getSalesSiteUrl()}/invite?token=${token}` });
  const outcome = await admin.rpc("sales_record_invitation_email", { p_id: id, p_status: "sent", p_provider_id: providerId });
  if (outcome.error) sendError = "Email sent, but its status could not be saved. Check the invitation before reissuing.";
 } catch (e) {
  sendError = e instanceof Error ? e.message : "Invitation email failed.";
  try { await admin.rpc("sales_record_invitation_email", { p_id: id, p_status: "failed", p_error: sendError }); } catch { /* Pending status remains visible when the privileged key is missing. */ }
 }
 finish(orgPath(form), sendError ? { message: sendError } : null);
}
export async function acceptInvitation(form: FormData) {
 if (!getSalesSupabaseEnv()) redirect("/setup");
 const token = text(form,"token");
 let errorMessage = "";
 let org = "";
 try {
  const hash = invitationHash(token);
  const supabase = await createSalesServerClient();
  const { data: invited, error: lookupError } = await supabase.rpc("sales_inspect_invitation", { p_hash: hash });
  if (lookupError || !invited?.[0]) throw new Error("Invitation invalid or expired. Ask your salesperson for a new invitation.");
  const mode = text(form,"mode");
  if (mode === "create" || mode === "signin") {
   const password = String(form.get("password") || "");
   if (mode === "create") {
    if (password.length < 12) throw new Error("Use at least 12 characters for your password.");
    const admin = createSalesAdminClient();
    // Possession of the secret delivered to this email verifies invitation ownership.
    // Never accept an email supplied by the browser; use the verified invitation.
    const { error } = await admin.auth.admin.createUser({ email: invited[0].email, password, email_confirm: true });
    if (error) throw new Error("Unable to create this account. If you already have an account, use Sign in; otherwise contact your salesperson.");
   }
   const { error } = await supabase.auth.signInWithPassword({ email: invited[0].email, password });
   if (error) throw new Error("Unable to sign in with the invited account. Check your password or reset it from the sign-in page.");
  }
  const { data, error } = await supabase.rpc("sales_accept_invitation", { p_hash: hash });
  if (error) throw new Error(error.message);
  org = data;
  const displayName = text(form,"display_name");
  if (displayName) {
   const { error: nameError } = await supabase.rpc("sales_update_display_name", { p_name: displayName });
   if (nameError) throw new Error(nameError.message);
  }
 } catch (e) { errorMessage = e instanceof Error ? e.message : "Unable to accept this invitation."; }
 if (errorMessage) redirect(`/invite?token=${encodeURIComponent(token)}&error=${encodeURIComponent(errorMessage)}`);
 revalidatePath("/dashboard"); redirect(`/customers/${org}?notice=accepted`);
}
export async function revokeInvitation(form: FormData) {
 const { supabase } = await requireSalesIdentity(); const { error } = await supabase.rpc("sales_revoke_invitation", { p_id: text(form,"invitation_id") }); finish(orgPath(form), error);
}
export async function setMemberPermissions(form: FormData) {
 const { supabase } = await requireSalesIdentity(); const { error } = await supabase.rpc("sales_set_member_permissions", { p_org: text(form,"organization_id"), p_user: text(form,"user_id"), p_view: checked(form,"can_view"), p_approve: checked(form,"can_approve_assets"), p_sign: checked(form,"can_sign_agreements"), p_remove: text(form,"intent")==="remove" }); finish(orgPath(form), error);
}
export async function requestAccountTransfer(form: FormData) {
 const { supabase } = await requireSalesIdentity(); const { error } = await supabase.rpc("sales_request_account_transfer", { p_org: text(form,"organization_id"), p_new_owner: text(form,"new_owner_id"), p_reason: text(form,"reason") }); finish(orgPath(form), error);
}
export async function decideAccountTransfer(form: FormData) {
 const { supabase } = await requireSalesIdentity(); const { error } = await supabase.rpc("sales_decide_account_transfer", { p_id: text(form,"transfer_id"), p_accept: text(form,"intent")==="accept" }); finish(orgPath(form), error);
}
export async function requestDistrictAccess(form: FormData) {
 const { supabase } = await requireSalesIdentity(); const { error } = await supabase.rpc("sales_request_district_access", { p_district: text(form,"district_key"), p_reason: text(form,"reason") }); finish("/access-requests", error);
}
export async function decideDistrictAccess(form: FormData) {
 const { supabase } = await requireSalesIdentity(); const { error } = await supabase.rpc("sales_decide_district_access", { p_id: text(form,"request_id"), p_approve: text(form,"intent")==="approve", p_reason: text(form,"reason") }); finish("/access-requests", error);
}
export async function readNotification(form: FormData) {
 const { supabase } = await requireSalesIdentity(); const { error } = await supabase.rpc("sales_read_notification", { p_id: text(form,"notification_id") }); finish("/dashboard", error);
}
export async function seedLaunchProspects() {
 const { supabase } = await requireSalesIdentity(); const { error } = await supabase.rpc("sales_seed_launch_prospects"); finish("/customers", error);
}
