export const GRAPHIC_BUILDERS = ["generic", "sports", "weather"] as const;
export type GraphicBuilder = (typeof GRAPHIC_BUILDERS)[number];
export type SchoolIdentity = {
  id: string; name: string; mascot: string | null; display_name: string; kind: "school" | "coop";
  logo_url: string | null; legacy_logo_path: string | null;
  primary_school_id: string | null; partner_school_id: string | null;
  composition_recipe: Record<string, unknown> | null;
};
export type GraphicContext = {
  districtKey: string; storyId?: string; editionId?: string; itemId?: string; label?: string;
};
export const COOP_RECIPE = { version: 1, partner_x: 0, partner_y: 0.5, partner_width: 0.5, partner_height: 0.5 };
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
