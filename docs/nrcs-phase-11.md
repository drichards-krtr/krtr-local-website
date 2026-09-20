# NRCS Phase 11 Stabilization

## Asynchronous Publication Delivery

Status: Implemented; awaiting production deployment and acceptance.

Web Outputs, Homepage lineups, and Priority Alerts now queue an immutable CMS delivery snapshot as part of the save request. After the save response is ready, Next.js `after()` performs the outbound CMS request using the existing signed, idempotent publication contract. The editor no longer performs a separate routine Send action.

The existing delivery table remains the durable outbox. Its unique kind/source/revision identity, immutable package/hash, lease, attempt counter, CMS receipt, and confirmation fields are unchanged. A repeated or uncertain attempt reuses the same request ID. Saving a newer revision creates a new snapshot and cannot mutate an older delivery.

The delivery panel polls while a delivery is pending or sending. It reports received/public state as before. A failed delivery exposes **Retry CMS Delivery**. If content saves but snapshot creation fails, the save remains successful, the response says that queuing failed, and **Queue CMS Delivery** provides recovery. CMS status refresh remains explicit for delivered Web Outputs.

This implementation does not require a cron job, database migration, new environment variable, or CMS deployment. It uses the existing NRCS CMS API URL/secret and CMS publication feature flag. Persistent provider/configuration failures remain visible and require staff retry after correction; the system does not silently loop indefinitely.

## Production Acceptance

1. Deploy NRCS only. Keep current CMS authority/publication flags unchanged.
2. Save a draft Web Output. Confirm the save immediately reports queued, then changes to a CMS receipt without clicking a Send button. Confirm the CMS row remains draft.
3. Save a published Web Output revision. Confirm one delivery record, one CMS projection, preserved CMS identity/URL, and visible public changes.
4. Save the Homepage lineup and a disabled test Alert. Confirm each queues and reaches CMS automatically.
5. Temporarily use an invalid NRCS CMS API base URL only if a controlled failure test is acceptable. Confirm the save succeeds, delivery becomes failed, and retry succeeds after restoring configuration and redeploying. Do not run this test during active Alert or urgent publishing work.
6. Check `/publishing` for clear received/failed states and confirm no routine **Send to CMS** control remains.

## Rollback

Redeploy the prior NRCS version. Existing queued/received delivery snapshots and CMS projections remain valid. The prior manual Send/Retry UI can process any failed or pending snapshot using the same request ID. No database rollback or CMS content reversal is required.
