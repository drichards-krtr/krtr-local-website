import { createHash, randomBytes } from "node:crypto";
export function newInvitationToken() { return randomBytes(32).toString("hex"); }
export function invitationHash(token) {
 if (!/^[0-9a-f]{64}$/.test(token)) throw new Error("Invitation invalid or expired.");
 return createHash("sha256").update(token).digest("hex");
}
export async function deliverInvitation({ id, email, company, url, apiKey, from, fetcher = fetch }) {
 if (!apiKey || !from) throw new Error("Invitation email needs the existing Resend key and a verified Sales sender.");
 let lastError = "Invitation email unavailable. Reissue when email service is working.";
 for (let attempt = 0; attempt < 3; attempt++) {
  try {
   const response = await fetcher("https://api.resend.com/emails", {
    method: "POST", signal: AbortSignal.timeout(8000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "Idempotency-Key": `sales-invite/${id}` },
    body: JSON.stringify({ from, to: [email], subject: `Your KRTR Local account for ${company}`, text: `You have been invited to manage ${company}'s advertising account.\n\nOpen this link and sign in or create your account:\n${url}\n\nThis invitation expires in seven days. Access is limited to the permissions shown when you accept. If you did not expect this invitation, contact your salesperson.` }),
   });
   const result = await response.json();
   if (response.ok && typeof result.id === "string") return result.id;
   lastError = "Email service rejected this invitation. Check sender configuration and retry.";
   if (response.status < 500 && response.status !== 429) break;
  } catch { lastError = "Email delivery could not be confirmed. Reissue to retry safely."; }
 }
 throw new Error(lastError);
}
