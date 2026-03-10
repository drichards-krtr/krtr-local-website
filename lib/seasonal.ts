export const SEASONAL_PAGE_SLUGS = ["vote", "festival-of-trails"] as const;

export type SeasonalPageSlug = (typeof SEASONAL_PAGE_SLUGS)[number];

export const VOTE_JURISDICTIONS = [
  {
    slug: "union-community-school-district-school-board",
    label: "Union Community School District School Board",
  },
  { slug: "dysart", label: "Dysart" },
  { slug: "la-porte-city", label: "La Porte City" },
  { slug: "black-hawk-county", label: "Black Hawk County" },
  { slug: "tama-county", label: "Tama County" },
  { slug: "benton-county", label: "Benton County" },
] as const;

export type VoteJurisdictionSlug = (typeof VOTE_JURISDICTIONS)[number]["slug"];
