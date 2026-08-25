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

export function getNrcsCmsApiEnv() {
  const baseUrl = process.env.NRCS_CMS_API_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
  const secret = process.env.NRCS_CMS_API_SECRET;

  if (!baseUrl || !secret) {
    return null;
  }

  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  if (!/^https?:\/\//i.test(normalizedBaseUrl)) {
    return null;
  }

  return {
    baseUrl: normalizedBaseUrl,
    secret,
  };
}
