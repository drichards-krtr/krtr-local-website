import "server-only";
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getCloudinaryCredentials } from "./cloudinary";
import type { SchoolIdentity } from "./graphics";

export async function loadSchoolLogo(school: Pick<SchoolIdentity, "logo_url" | "legacy_logo_path">) {
  if (!school.logo_url && school.legacy_logo_path) {
    if (!/^\/graphics\/legacy\/[a-z0-9_-]+\.(png|jpg)$/.test(school.legacy_logo_path)) throw new Error("Invalid legacy logo path.");
    return readFile(path.join(process.cwd(), "public", school.legacy_logo_path));
  }
  if (!school.logo_url) throw new Error("School logo is required.");
  const url = new URL(school.logo_url);
  const { cloudName } = getCloudinaryCredentials();
  if (url.protocol !== "https:" || url.hostname !== "res.cloudinary.com" || url.username || url.password || url.pathname.split("/")[1] !== cloudName) throw new Error("Choose a logo from the shared Cloudinary library.");
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Could not load school logo.");
  if (Number(response.headers.get("content-length")) > 3_500_000) throw new Error("School logo is too large.");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Logo response was empty.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > 3_500_000) throw new Error("School logo must be under 3.5 MB.");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks);
}
export async function validateSchoolPng(url: string) {
  const buffer = await loadSchoolLogo({logo_url:url,legacy_logo_path:null});
  const image = sharp(buffer, {limitInputPixels:16_000_000});
  const metadata = await image.metadata();
  if (metadata.format !== "png" || metadata.pages && metadata.pages > 1) throw new Error("New school logos must be static transparent PNGs.");
  if ((await image.stats()).isOpaque) throw new Error("School logo must have a transparent background.");
}
export async function composeCoopLogo(primary: SchoolIdentity, partner: SchoolIdentity) {
  const [primaryBytes, partnerBytes] = await Promise.all([loadSchoolLogo(primary), loadSchoolLogo(partner)]);
  const background = {r:0,g:0,b:0,alpha:0};
  const [base, overlay] = await Promise.all([
    sharp(primaryBytes,{limitInputPixels:16_000_000}).resize(1024,1024,{fit:"contain",background}).png().toBuffer(),
    sharp(partnerBytes,{limitInputPixels:16_000_000}).resize(512,512,{fit:"contain",background}).png().toBuffer(),
  ]);
  return sharp(base).composite([{input:overlay,left:0,top:512}]).png().toBuffer();
}
export async function legacyLogoPng(school: SchoolIdentity) {
  return sharp(await loadSchoolLogo({logo_url:null,legacy_logo_path:school.legacy_logo_path}),{limitInputPixels:16_000_000}).png().toBuffer();
}
