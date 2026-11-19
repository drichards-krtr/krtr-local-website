// Read-only hosted API check. Uses a publishable key, never a service key.
import assert from 'node:assert/strict';
import {loadEnvFile} from 'node:process';
loadEnvFile(new URL('../.env.local',import.meta.url));
const origin=process.env.NEXT_PUBLIC_SALES_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SALES_SUPABASE_ANON_KEY;
assert.ok(origin&&key,'Sales URL and publishable key required.');
const headers={apikey:key,'Content-Type':'application/json'};
for(const table of ['sales_profiles','sales_organizations','sales_quotes','sales_agreements','sales_invoices','sales_payment_events','sales_allocations']){
 const response=await fetch(`${origin}/rest/v1/${table}?select=*&limit=1`,{headers});
 assert.ok([401,403].includes(response.status),`${table} must deny anonymous reads (${response.status})`);
 console.log(`${table}: anonymous read denied (${response.status})`);
}
const invoice='00000000-0000-4000-8000-000000000001';
const response=await fetch(origin+'/rest/v1/rpc/sales_reserve_signed_quote',{method:'POST',headers,body:JSON.stringify({p_agreement:invoice})});
assert.ok([401,403].includes(response.status),'Public reservation RPC must be denied.');
console.log('Privileged reservation RPC: anonymous execution denied.');
const inspection=await fetch(origin+'/rest/v1/rpc/sales_inspect_invitation',{method:'POST',headers,body:JSON.stringify({p_hash:'0'.repeat(64)})});
assert.equal(inspection.status,200);assert.deepEqual(await inspection.json(),[]);
console.log('Invalid invitation: no customer information returned.');
const settings=await fetch(origin+'/auth/v1/settings',{headers});assert.equal(settings.status,200);
const auth=await settings.json();
console.log(JSON.stringify({public_signup_disabled:auth.disable_signup===true,email_auth_enabled:auth.external?.email===true}));
