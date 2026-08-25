export const EVENT_CLASSIFICATION_KINDS = ["sport", "extra_curricular", "event_type"] as const;

export type EventClassificationKind = (typeof EVENT_CLASSIFICATION_KINDS)[number];

export type EventClassificationTerm = {
  id: string;
  district_key: string;
  kind: EventClassificationKind;
  name: string;
  enabled: boolean;
};

export function getClassificationKindLabel(kind: EventClassificationKind) {
  if (kind === "sport") return "Sport";
  if (kind === "extra_curricular") return "Extra-Curricular";
  return "Other Event Type";
}

function splitGenderPrefix(name: string) {
  const match = /^(Boys|Girls)\s+(.+)$/i.exec(name.trim());
  if (!match) return { base: name.trim(), genderRank: 0 };
  return {
    base: match[2],
    genderRank: match[1].toLowerCase() === "boys" ? 1 : 2,
  };
}

export function compareClassificationNames(a: string, b: string) {
  const left = splitGenderPrefix(a);
  const right = splitGenderPrefix(b);
  const baseCompare = left.base.localeCompare(right.base);
  if (baseCompare !== 0) return baseCompare;
  if (left.genderRank !== right.genderRank) return left.genderRank - right.genderRank;
  return a.localeCompare(b);
}

export function sortClassificationTerms<T extends Pick<EventClassificationTerm, "name" | "kind">>(terms: T[]) {
  return [...terms].sort((a, b) => {
    const kindCompare = a.kind.localeCompare(b.kind);
    if (kindCompare !== 0) return kindCompare;
    return compareClassificationNames(a.name, b.name);
  });
}
