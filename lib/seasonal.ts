import { type DistrictKey } from "@/lib/districts";

export const SEASONAL_PAGE_SLUGS = ["vote", "festival-of-trails"] as const;

export type SeasonalPageSlug = (typeof SEASONAL_PAGE_SLUGS)[number];

const DISTRICT_VOTE_JURISDICTIONS = {
  dlpc: [
    {
      slug: "union-community-school-district-school-board",
      label: "Union Community School District School Board",
    },
    { slug: "dysart", label: "Dysart" },
    { slug: "la-porte-city", label: "La Porte City" },
    { slug: "black-hawk-county", label: "Black Hawk County" },
    { slug: "tama-county", label: "Tama County" },
    { slug: "benton-county", label: "Benton County" },
  ],
  vs: [
    { slug: "vinton-shellsburg-school-board", label: "Vinton-Shellsburg School Board" },
    { slug: "vinton", label: "Vinton" },
    { slug: "shellsburg", label: "Shellsburg" },
    { slug: "benton-county", label: "Benton County" },
    { slug: "linn-county", label: "Linn County" },
  ],
  bc: [
    { slug: "benton-community-school-board", label: "Benton Community School Board" },
    { slug: "benton-community", label: "Benton Community" },
    { slug: "benton-county", label: "Benton County" },
    { slug: "linn-county", label: "Linn County" },
    { slug: "iowa-county", label: "Iowa County" },
  ],
} as const;

export function getVoteJurisdictions(districtKey: DistrictKey) {
  return DISTRICT_VOTE_JURISDICTIONS[districtKey];
}

export type VoteJurisdictionSlug = (typeof DISTRICT_VOTE_JURISDICTIONS)[DistrictKey][number]["slug"];
