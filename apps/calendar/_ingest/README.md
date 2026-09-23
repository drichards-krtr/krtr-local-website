# NRCS Calendar Ingestion Pipeline

Independent Vercel project root: `apps/calendar/_ingest`.

Phase A provides a bounded authenticated relay at `POST /api/runs`, forwarding normalized source runs to NRCS. NRCS validates and stores the results; this service has no Supabase service role or CMS publication credential. `GET /api/health` reports that automated scanning is not enabled yet.

Source adapters and Make schedules are subsequent phases. Do not configure a scheduled scan against this relay expecting it to fetch a source URL. See `docs/calendar-ingestion-phase-a.md` at the repository root for the integration contract and deployment order.
