# Sales foundation boundaries

Sales has a dedicated Supabase project and its own Auth identities. All current
Sales tables use the `sales_` prefix in `public`; helpers live in non-exposed
`sales_private`. Do not expose that schema through the Supabase Data API. There
are no cross-database foreign keys or shared service credentials.

| Identity | Foundation access |
| --- | --- |
| Owner Dan | All setup records; only owner can create/edit regions or assign districts |
| District manager | Read setup within directly assigned district; manager predicate is scoped |
| Regional manager | Read setup/manage predicate for districts currently assigned to their region |
| Salesperson | Read assigned district setup and owned organization identity |
| Production agent | Read assigned district/show/studio setup; no customer or financial access |
| Customer | Own membership and organization identity with view permission; no staff scope |
| Inactive/unassigned | No district or organization authority; no automatic signup privileges |
| Anonymous | No private Sales table reads or mutations |

Chunk 2 adds checked customer, membership, transfer, district expansion and pipeline
RPCs; later chunks add financial/production mutation paths.
foundation read access does not itself authorize future financial or production
operations. Organization approval/sign permissions are separate stored flags,
not a single customer-role ladder. Organization account ownership and salesperson
ownership are distinct. Invitations, accepted transfers, scoped recovery and
customer-specific expansion are implemented in Chunk 2; see `chunk-2-setup.md`.

Sales Manager or higher tax authority maps to district manager, regional manager
and owner with the appropriate district scope. This mapping will be enforced
when tax settings arrive in Chunk 3. A salesperson is not a manager.

Server pages/actions verify the authenticated user with Supabase Auth and read
current profile/owner records. Owner actions also use an authenticated database
client so RLS independently checks authority. Roles never come from user-editable
metadata or a cached JWT role claim. Region assignment therefore changes scope
immediately. Sessions use Sales-specific, host-scoped cookies; no cross-app login
sharing is enabled. The proxy refreshes sessions, and protected pages repeat
identity checks. Authentication responses are not publicly cached.

Owner binding has exactly one slot and is not writable through authenticated API.
Trusted bootstrap assigns Dan explicitly. Owner activation cannot be disabled.
Administrative mutations record actor/time and old/new records. Authenticated
users cannot edit/delete the audit ledger. Initial audit reads are owner-only;
future domain-specific scoped audit views must avoid unrelated/private data.

Chunk 1 had no privileged client. Chunk 2 adds a server-only client limited in
application usage to token-gated Auth creation and trusted invitation send outcomes,
and reuses the existing Resend service. No payment processor or public ad API exists. The future public interface must return only eligible
public display fields. A server-only service key does not replace per-request
authorization. Approval/payment/ledger/booking histories require dedicated
immutable/versioned domain records in later chunks, not just this setup audit.

Database tests use real PostgreSQL enforcement via PGlite with stub Auth schema.
They validate the migration syntax, constraints and policies but do not prove
live Supabase Auth SMTP/configuration, API grants or deployed session behavior.
