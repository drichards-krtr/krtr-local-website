# Chunk 3: catalogue, quotes and inventory

Local implementation uses the dedicated `krtr-sales-production` project. No new
Cloudinary, Stripe or Vercel setup is needed for this chunk. Database/authenticated
screen verification awaits the Sales Supabase project.

## Connect when ready

Apply only the three `apps/sales/supabase/migrations` files in filename order to
Sales, following the existing Chunk 1/2 Auth and owner setup. The third migration
is transactional. Configure scoped staff and customer organizations first.

Use Commercial settings to explicitly record each district's tax label, percentage
and whether advertising/asset work is taxable. A deliberate zero rate is supported;
no default tax is guessed. Unconfigured-tax drafts cannot be shared. Configure the
actual studio and link its shows before quoting P13; no studio name was seeded.

## Workflows

- Catalogue contains P01–P11 and P13. Rates/deliverables and policies are versioned.
  Only the owner publishes new commercial versions. Policy text changes do not
  change scheduling code; deadline/duration rule changes require implementation.
- Create a quote from an organization or Quotes. Select district/product/dates and
  exact Specials publication dates; request each unique KRTR graphic separately.
  Normal revisions use current standard terms. Historical versions remain intact.
- Quote pages show advertising, asset work and taxes separately, deliverables,
  deadlines, current availability and unresolved warnings. Share only after all
  required settings/reviews are resolved. Customers see shared versions only,
  including previous shared versions after staff starts a new private revision.
- Exact exceptions use JSON amounts in integer cents and explicit deadline dates/
  timestamps. For example, line-level `{"price_cents":4000}` requests $40 advertising.
  `{"approval_due_at":"2030-05-29T17:00:00-05:00"}` changes approval only, not payment.
  Manager review is scoped, prohibits salesperson self-approval, and checks the
  exact baseline. Apply approval as a new version; edits invalidate old approval.
- Industry terms require a narrow industry, placement/network scope, explicit
  districts/products/dates, contract review and network displaced-revenue review.
  Placement starts at twice standard advertising; network starts at three times.
  Placement scope retains the specific resource (including show/studio). New live
  conflicts after review require new approval; no competitor names are exposed
  through quote availability.
- Asset intent IDs persist across revisions; duplicate IDs in a quote bill once.
  Completed work, reuse, revisions and actual asset approvals arrive in Chunk 5.
- Federal holidays and additional owner-recorded closures affect business days.
  Weekday show publication still includes holidays. Specials holiday deadline
  conflicts require explicit review and retain their original payment dates.

## Chunk 4 contract

Unsigned/shared quotes never reserve. Chunk 3 supplies a service-only reservation
RPC plus immutable-quote references and signing-evidence registry. There is no
customer signing UI, fake paid state, or public booking endpoint in this chunk.
Chunk 4 must insert verified signing evidence and call reservation in the SAME
SQL transaction; separate client API calls are insufficient. Digital signers must
be active customer members with signing permission; recorded paper signatures
require signer name/file reference. Last-minute readiness must be verified by the
future financial/assets workflow, never trusted from a customer flag.

Reservations lock a common transaction advisory mutex before checking capacity,
industry contracts and expiry. Partial unique indexes backstop slot allocation.
Exclusive inventory and four-advertiser inventory are separate; root and DLPC
homepage share one resource. Signed holds end at 5pm Central after five business
days, capped by payment due. Expired/released agreements cannot silently reactivate.
The Inventory screen shows scoped history. Cleared payment, hold extension,
cancellation and late-payment handling are implemented in later chunks.

All new code/migrations are Sales-local. Existing Vercel path filters and deployment
fixture tests preserve main/CMS, NRCS and Sales isolation. Nothing was pushed or
deployed as part of this local work.
