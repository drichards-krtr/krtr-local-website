import { getNrcsCmsApiEnv } from "./env";
import { eligibleChambers, type ChamberAssignment, type ChamberCatalog } from "./chamberHighlights";

export type ChamberAdminCatalog = Omit<ChamberCatalog, "accounts"> & {
  accounts: (ChamberCatalog["accounts"][number] & {
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    notes: string | null;
  })[];
  districts: { district_key: string; display_name: string }[];
};

export async function requestChambers<T>(path: string, body?: unknown): Promise<T> {
  const env = getNrcsCmsApiEnv();
  if (!env) throw new Error("CMS Chamber connection is unavailable.");
  const response = await fetch(`${env.baseUrl}/api/nrcs/chambers${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${env.secret}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    throw new Error(failure?.error || "CMS Chamber request failed.");
  }
  return response.json();
}

export async function loadChamberCatalog(): Promise<ChamberCatalog | null> {
  try {
    return await requestChambers<ChamberCatalog>("?view=catalog");
  } catch (error) {
    console.error("[chambers] catalog unavailable", error);
    return null;
  }
}

export async function validateChamberAssignment(
  form: FormData,
  district: string,
  existing?: ChamberAssignment & { district_key: string },
): Promise<{ assignment: ChamberAssignment; error?: string }> {
  const assignment: ChamberAssignment = { chamber_id: null, chamber_highlight_type: null };
  if (!form.has("chamber_highlight_type") && existing) {
    assignment.chamber_id = existing.chamber_id;
    assignment.chamber_highlight_type = existing.chamber_highlight_type;
  } else {
    const type = form.get("chamber_highlight_type");
    if (!type) return { assignment };
    const id = form.get("chamber_id");
    if ((type !== "chamber_hosted" && type !== "chamber_member") || typeof id !== "string" || !id) {
      return { assignment, error: "Select a Chamber and highlight type." };
    }
    assignment.chamber_id = id;
    assignment.chamber_highlight_type = type;
  }
  if (!assignment.chamber_id) return { assignment };
  if (existing?.district_key === district && existing.chamber_id === assignment.chamber_id &&
      existing.chamber_highlight_type === assignment.chamber_highlight_type) return { assignment };

  const catalog = await loadChamberCatalog();
  if (!catalog || !eligibleChambers(catalog, district).some((account) => account.id === assignment.chamber_id)) {
    return { assignment, error: "Select an active Chamber sponsor for this district or remove the highlight." };
  }
  return { assignment };
}
