export type Ad = {
  id: string;
  placement: "allsite" | "homepage" | "story";
  image_url: string | null;
  link_url: string | null;
  html: string | null;
  weight: number;
};

export function pickWeightedAd(ads: Ad[]) {
  if (!ads.length) return null;
  const total = ads.reduce((sum, ad) => sum + Math.max(1, ad.weight || 1), 0);
  let roll = Math.random() * total;
  for (const ad of ads) {
    roll -= Math.max(1, ad.weight || 1);
    if (roll <= 0) return ad;
  }
  return ads[0];
}

export function pickWeightedAds(ads: Ad[], count: number) {
  const pool = [...ads];
  const picked: Ad[] = [];
  while (pool.length && picked.length < count) {
    const choice = pickWeightedAd(pool);
    if (!choice) break;
    picked.push(choice);
    const idx = pool.findIndex((ad) => ad.id === choice.id);
    if (idx >= 0) pool.splice(idx, 1);
  }
  return picked;
}
