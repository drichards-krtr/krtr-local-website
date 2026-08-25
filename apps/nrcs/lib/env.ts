export function getNrcsSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_NRCS_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_NRCS_SUPABASE_ANON_KEY;

  if (!url || !anon) {
    throw new Error("Missing NRCS Supabase env vars.");
  }

  return { url, anon };
}

export function getNrcsServiceEnv() {
  const { url } = getNrcsSupabaseEnv();
  const service = process.env.NRCS_SUPABASE_SERVICE_ROLE_KEY;

  if (!service) {
    throw new Error("Missing NRCS Supabase service role env var.");
  }

  return { url, service };
}

export function getNrcsSiteUrl() {
  return process.env.NEXT_PUBLIC_NRCS_SITE_URL || "http://localhost:3001";
}
