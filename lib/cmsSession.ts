export const CMS_SESSION_COOKIE = "krtr_cms_session_started";
export const CMS_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
export const CMS_SESSION_MAX_AGE_MS = CMS_SESSION_MAX_AGE_SECONDS * 1000;

export function parseCmsSessionStarted(value: string | undefined) {
  if (!value) return null;

  const startedAt = Number(value);
  if (!Number.isFinite(startedAt) || startedAt <= 0) {
    return null;
  }

  return startedAt;
}

export function isCmsSessionExpired(value: string | undefined, now = Date.now()) {
  const startedAt = parseCmsSessionStarted(value);
  if (!startedAt) {
    return true;
  }

  return now - startedAt >= CMS_SESSION_MAX_AGE_MS;
}

