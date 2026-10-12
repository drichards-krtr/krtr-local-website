import "server-only";
import { deliverInvitation } from "./invitation-core.mjs";
export { newInvitationToken, invitationHash } from "./invitation-core.mjs";
export function invitationEmailConfigured() { return !!(process.env.RESEND_API_KEY && process.env.SALES_EMAIL_FROM); }
export function sendInvitationEmail(input: { id: string; email: string; company: string; url: string }) {
 return deliverInvitation({ ...input, apiKey: process.env.RESEND_API_KEY, from: process.env.SALES_EMAIL_FROM });
}
