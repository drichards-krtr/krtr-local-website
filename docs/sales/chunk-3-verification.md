# Chunk 3 verification — October 12, 2026

## Local evidence

- Production Next.js build including TypeScript passes.
- Complete suite: 60 checks, zero failures; three actual Sales migrations execute
  in disposable PostgreSQL/PGlite with minimal Supabase Auth role stubs.
- Catalogue, prices, minimum/block dates, actual studio requirements, four-Tuesday
  $100 case, exact five-publication-date 10% discount and non-stacking sponsor 15%.
- Immutable tax/rate/quote histories, explicit tax requirement, scoped managers,
  exact-baseline exceptions, no salesperson self-approval, malformed/null rejection,
  retained approved tax snapshots and earlier approval without payment movement.
- Unique quoted asset billing, integer currency parsing, observed federal holidays,
  Central DST and gap-free Sunday Calendar renewal boundaries.
- Unsigned proposals reserve nothing, signed exclusive conflicts, four-advertiser
  capacity, atomic failure, expiration/release, no silent reactivation, hold cap,
  industry price floor and narrow resource scope, safe conflict output.
- Customer/production-agent/private-draft separation, service-only signing registry
  and reservation permissions, preserved invitation transport grant.
- Deployment fixture checks preserve main/CMS, NRCS and Sales isolation.
- Production smoke: 23 routes redirect to setup without credentials; setup returns
  HTTP 200 and accurately states that no customer/payment data is connected.

## Connected checks pending

No Supabase project exists yet. Hosted RLS/Auth behavior, authenticated screen
walkthroughs and independent-connection simultaneous booking tests remain pending.
PGlite executes real SQL constraints and rollback, but its single connection does
not prove multi-connection advisory-lock contention. Reservation code uses a
transaction advisory mutex and unique slot indexes; verify two concurrent exclusive
attempts and five concurrent cap-four attempts against hosted PostgreSQL before
launch. Do not treat this local evidence as connected end-to-end testing.

No Cloudinary, Stripe, signed customer campaign, live payment, NRCS fulfillment or
public website-ad migration was performed. Signing and financial state transitions
are Chunk 4; artwork lifecycle is Chunk 5; public serving/rotation is Chunk 6.
