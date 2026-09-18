export function legacyEditorialEnabled() {
  return process.env.CMS_LEGACY_EDITORIAL_ENABLED !== "false";
}
export function nrcsPublishingEnabled() {
  return process.env.CMS_NRCS_PUBLICATION_ENABLED === "true";
}
export function isLegacyEditorialPath(path: string) {
  return ["/cms/stories", "/cms/calendar", "/cms/dailys", "/cms/alerts"].some(prefix => path === prefix || path.startsWith(prefix + "/"));
}
