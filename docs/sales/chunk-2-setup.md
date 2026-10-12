# Chunk 2: customer organizations and pipeline

## Implemented

Customer/prospect creation, contact details, internal notes, one company across
multiple districts, and an initial follow-up opportunity. Dan can explicitly add
the three named launch prospects once; no contact facts, business goals or unnamed
Dysart restaurant are fabricated.

The action dashboard shows all unfinished opportunities in the user's scope,
including overdue/today/upcoming work, missing next actions, Not now follow-ups
and unanswered proposals. Lists page through database results rather than
silently stopping at the hosted API row limit. The full pipeline also includes
closed records. Opportunities record customer-stated goal, proposed product,
next action/date and immutable contact history, using Central dates. Lost requires
a reason; Not now requires a follow-up date; Needs identified requires a goal.
Signed/awaiting payment and Won are reserved for the future verified financial
workflow, not manually selectable states. Saves reject stale versions.

Owning salespeople can add an owned customer to another active district without
waiting for approval. Customer-specific access never grants broader district
prospecting or competitor access. Receiving managers get deduplicated dashboard
notifications; when none is assigned, the owner receives the notice. A separate
request/decision screen implements scoped approval for broader district access.
Only Dan can mark an authorized salesperson district scope as primary. Additional
assigned salesperson districts are secondary; customer-only access stays separate.

District managers may transfer companies confined to their district. Regional
managers may transfer companies wholly within one assigned region. Cross-region
or otherwise beyond-scope transfers require the owner. Transfers update current
opportunity ownership while retaining original opportunity attribution and
ownership history. Customer-specific access moves to the new seller. Future
signed-sale commission attribution will be snapshotted separately in Chunk 4;
there are no commission records or live sales created in this chunk.

Customer owners and owning salespeople can invite organization users, independently
set view/asset-approval/agreement-sign permissions, and remove members. Whole-company
scoped managers and Dan can recover access with recorded reasons. Staff invitations
for organizations with existing owners require an onboarding/recovery reason.
Account ownership is distinct from salesperson ownership. A transfer requires the
new owner's acceptance; the old owner remains until then. Removed users and stale
invitation-authorizer permissions cannot be used to regain access. Historical
identities stay in audit and transfer records. Customer membership never creates
staff roles or reactivates a disabled staff identity. Internal notes/contact
history/opportunities are not exposed through customer membership, including
accounts that happen to hold a staff role elsewhere.

## Supabase prerequisites (when Dan is ready)

Vercel/domain setup was reported complete by Dan. No external setup was changed
by this implementation. Create the dedicated `krtr-sales-production` project when
ready; follow Chunk 1's setup instructions, then apply both migrations in order:

1. `20261012000100_sales_foundation.sql`
2. `20261012000200_customers_pipeline.sql`

If migration 1 is already applied, apply only migration 2. These migrations belong
only to Sales. Public signup stays disabled. Create/verify Dan's Auth account and
run the explicit owner bootstrap. All connected Chunk 2 pages require migration 2.

Configure these **Sales-only** environment variables:

- `NEXT_PUBLIC_SALES_SUPABASE_URL`
- `NEXT_PUBLIC_SALES_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_SALES_SITE_URL=https://sales.krtrlocal.tv`
- `SALES_SUPABASE_SERVICE_ROLE_KEY` (server only; required for controlled invitation
  account creation and trusted email-send status)
- `RESEND_API_KEY` from the existing KRTR sending service
- `SALES_EMAIL_FROM` using an existing verified sending identity

Do not create new Cloudinary/Mux/email accounts. Cloudinary and Stripe setup is
not needed for Chunk 2. Never put service keys in public environment variables or
commits. Configure Supabase Auth SMTP/reset delivery as described in Chunk 1.
The invitation's custom email uses the existing Resend API directly. Missing
configuration is an explicit error, not a fake invitation-delivered state.

## Invitation security and operation

Invite creates a random 256-bit token. Only its SHA-256 hash is stored; the raw
link is sent solely to the intended email. Tokens expire after seven days.
Invitation landing pages do not grant access on GET, including email scanner
previews. Existing users sign in with the intended verified email; new users may
create a password through the token-gated server action. The server derives the
email from the invitation and never accepts a browser-supplied substitute. The
admin API confirms the new email because possession of the emailed secret is
proof of control. Acceptance atomically binds only the intended organization
permissions and activates a customer profile without staff access.

The inviter's authorization is rechecked at acceptance, including changes to
region assignments. Concurrent owner invitations cannot replace an existing
organization owner. Reissue invalidates older pending tokens. Revocation,
expiry, membership removal and owner changes invalidate stale capability paths.
Auth routes use no-store/no-referrer protections. No token, password or server
credential is written to application logs.

Email dispatch retries transient failures up to three times using the same
Resend idempotency key. Permanent failure stays actionable on the organization
screen. Reissue with the same email creates a new invitation version and sends a
fresh link. Pending/sent/failed status, dispatch count, provider reference and
safe failure message are recorded; only the server credential may record outcomes.
This is bounded request-time retry and manual recovery, not the full background
notification scheduler planned for Chunk 8. Invitations have no durable raw-token
queue; automatic delayed resend would require a secure delivery-envelope design.
No real email or Auth user was created during local tests.

## Operating the screens

1. Sign in as Dan, assign verified staff and primary/secondary scopes under Staff access.
2. Add a customer/prospect under Customers; edit its contact details and record its
   real business goal through the first opportunity.
3. Choose the next action/date; log contact after calls/emails/meetings.
4. Add a customer district for customer-specific expansion. Use District access
   requests only when broader prospecting access is required.
5. Invite the initial customer account owner and select explicit approval/sign
   permissions. Customer opens the emailed link and accepts with the intended email.
6. Organization owner/seller may add and manage further members. Transfer customer
   account ownership via a request followed by the new owner's acceptance.
7. Owner/scoped manager may transfer salesperson ownership with a reason. Check
   ownership history and the new seller's customer-specific access afterward.

## Pending deployed verification

Real Auth creation/reset, invitation email delivery, session persistence, direct
Data API permissions, deployed role changes and Vercel skip outcomes require the
live project/environment. The local PostgreSQL tests use Auth stubs and do not
replace those checks. Do not declare first-sale readiness; quoting, inventory,
agreements, payments, assets and fulfillment remain later chunks.

Sales code/migrations remain under `apps/sales`. Main site's build filter also
excludes root `docs/`, so Sales documentation alone does not redeploy main/NRCS.
