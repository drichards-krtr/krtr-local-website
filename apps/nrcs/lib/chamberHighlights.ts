export type ChamberHighlightType = "chamber_hosted" | "chamber_member";

export type ChamberAssignment = {
  chamber_id: string | null;
  chamber_highlight_type: ChamberHighlightType | null;
};

export type ChamberCatalog = {
  accounts: { id: string; name: string; city: string; active: boolean }[];
  coverage: { chamber_id: string; district_key: string; active: boolean }[];
};

export function eligibleChambers(catalog: ChamberCatalog, district: string) {
  const covered = new Set(catalog.coverage
    .filter((row) => row.district_key === district && row.active)
    .map((row) => row.chamber_id));
  return catalog.accounts.filter((account) => account.active && covered.has(account.id));
}

export function chamberLabel(name: string, type: ChamberHighlightType) {
  return type === "chamber_hosted" ? `Event Hosted by the ${name}` : `Member of the ${name}`;
}
