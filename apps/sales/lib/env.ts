export function getSalesSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SALES_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SALES_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  try {
    const parsed = new URL(url);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) return null;
    if (parsed.username || parsed.password) return null;
  } catch { return null; }
  return { url, anon };
}
export function getSalesSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SALES_SITE_URL || "http://localhost:3002";
  return new URL(value).origin;
}
