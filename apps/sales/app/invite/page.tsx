import Link from "next/link";
import { getSalesSupabaseEnv } from "@/lib/env";
import { createSalesServerClient } from "@/lib/server";
import { invitationHash } from "@/lib/invitations";
import { acceptInvitation } from "@/lib/customer-actions";
import { redirect } from "next/navigation";
export const dynamic="force-dynamic";
export default async function Invite({ searchParams }: { searchParams:Promise<{token?:string;error?:string}> }) {
 if(!getSalesSupabaseEnv())redirect("/setup");const {token="",error}=await searchParams;
 let hash="";try{hash=invitationHash(token);}catch{return <main className="auth"><section className="card"><h1>Invitation unavailable</h1><p>Ask your salesperson or organization owner for a fresh invitation.</p></section></main>;}
 const supabase=await createSalesServerClient();const {data:invites,error:lookupError}=await supabase.rpc("sales_inspect_invitation",{p_hash:hash});const invite=invites?.[0];
 if(lookupError||!invite)return <main className="auth"><section className="card"><h1>Invitation unavailable</h1><p>This invitation may have expired, been revoked, or already been accepted.</p><Link href="/login">Sign in</Link></section></main>;
 const {data:{user}}=await supabase.auth.getUser();const matching=user?.email?.toLowerCase()===invite.email;
 return <main className="auth"><section className="card"><p className="eyebrow">KRTR Local Sales</p><h1>Join {invite.company_name}</h1><p>Invited email: <strong>{invite.email}</strong></p><p>Permissions: {invite.can_view?"View":"No view"} · {invite.can_approve_assets?"Approve assets":"No asset approval"} · {invite.can_sign_agreements?"Sign agreements":"No agreement signing"}{invite.is_account_owner?" · Organization account owner":""}</p>{error&&<p role="alert" className="error">{error}</p>}
 <form action={acceptInvitation}><input type="hidden" name="token" value={token}/>{matching?<><input type="hidden" name="mode" value="accept"/><button>Accept invitation</button></>:<><label>Use this invited email to<select name="mode"><option value="create">Create a new account</option><option value="signin">Sign in to an existing account</option></select></label><label>Your name (optional)<input name="display_name" maxLength={100} autoComplete="name" /></label><label>Password (12+ characters for a new account)<input name="password" type="password" autoComplete="new-password" required/></label><button>Continue &amp; accept invitation</button></>}</form><p><Link href="/reset-password">Reset an existing account password</Link></p><p className="muted">Accepting grants access only to this organization. It does not grant KRTR staff permissions.</p></section></main>;
}
