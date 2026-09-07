type NrcsIntakePayload = {
  intake_type: "story_tip" | "calendar_submission";
  district_key: string;
  title: string;
  summary?: string | null;
  body?: string | null;
  submitter_name?: string | null;
  submitter_email?: string | null;
  submitter_phone?: string | null;
  payload?: Record<string, unknown>;
  external_source_id?: string | null;
};

export type NrcsIntakeResult =
  | {
      ok: true;
      intakeId: string | null;
      apiUrl: string;
    }
  | {
      ok: false;
      error: string;
      apiUrl?: string | null;
    };

function getCmsToNrcsIntakeEnv() {
  const baseUrl = process.env.CMS_NRCS_API_BASE_URL || "";
  const secret = process.env.CMS_NRCS_API_SECRET;
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");

  if (!normalizedBaseUrl || !secret || !/^https?:\/\//i.test(normalizedBaseUrl)) {
    return null;
  }

  return { baseUrl: normalizedBaseUrl, secret };
}

export async function sendIntakeToNrcs(payload: NrcsIntakePayload): Promise<NrcsIntakeResult> {
  const env = getCmsToNrcsIntakeEnv();
  if (!env) {
    return {
      ok: false,
      error: "CMS_NRCS_API_BASE_URL or CMS_NRCS_API_SECRET is missing or invalid.",
    };
  }

  const apiUrl = `${env.baseUrl}/api/intake`;
  let response: Response;
  try {
    response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.secret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...payload,
        source_system: "cms_public",
      }),
      cache: "no-store",
      redirect: "manual",
    });
  } catch (error) {
    return {
      ok: false,
      apiUrl,
      error: error instanceof Error ? error.message : "NRCS intake request failed.",
    };
  }

  if (response.status >= 300 && response.status < 400) {
    return {
      ok: false,
      apiUrl,
      error: `NRCS intake endpoint redirected to ${response.headers.get("location") || "another URL"}. Set CMS_NRCS_API_BASE_URL to the canonical NRCS host.`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      apiUrl,
      error: await response.text(),
    };
  }

  const data = (await response.json().catch(() => ({}))) as { ok?: unknown; intake_id?: unknown };
  if (data.ok !== true) {
    return {
      ok: false,
      apiUrl,
      error: "NRCS intake endpoint did not confirm ok:true.",
    };
  }

  return {
    ok: true,
    apiUrl,
    intakeId: typeof data.intake_id === "string" ? data.intake_id : null,
  };
}
