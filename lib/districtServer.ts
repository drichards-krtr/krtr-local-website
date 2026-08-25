import { headers } from "next/headers";
import {
  isExplicitDistrictHost,
  getDistrictConfig,
  parseDistrictKey,
  resolveDistrictFromHost,
  type SiteScopeKey,
  type DistrictKey,
} from "@/lib/districts";

async function getHeaderStore() {
  return headers();
}

export async function getRequestHost() {
  const headerStore = await getHeaderStore();
  return (
    headerStore.get("x-forwarded-host") ||
    headerStore.get("host") ||
    headerStore.get("x-vercel-deployment-url") ||
    null
  );
}

export async function getCurrentDistrictKey(): Promise<DistrictKey> {
  const headerStore = await getHeaderStore();
  const explicitDistrict =
    parseDistrictKey(headerStore.get("x-krtr-district")) ||
    parseDistrictKey(headerStore.get("x-district-key"));

  if (explicitDistrict) {
    return explicitDistrict;
  }

  return resolveDistrictFromHost(await getRequestHost());
}

export async function getCurrentSiteScopeKey(): Promise<SiteScopeKey> {
  const headerStore = await getHeaderStore();
  const explicitDistrict =
    parseDistrictKey(headerStore.get("x-krtr-district")) ||
    parseDistrictKey(headerStore.get("x-district-key"));

  if (explicitDistrict) {
    return explicitDistrict;
  }

  const host = await getRequestHost();
  return isExplicitDistrictHost(host) ? resolveDistrictFromHost(host) : "global";
}

export async function getCurrentDistrict() {
  return getDistrictConfig(await getCurrentDistrictKey());
}

export async function getRequestOrigin() {
  const headerStore = await getHeaderStore();
  const host = await getRequestHost();
  const proto =
    headerStore.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");

  if (!host) {
    return null;
  }

  return `${proto}://${host}`;
}
