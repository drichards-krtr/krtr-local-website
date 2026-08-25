import { headers } from "next/headers";
import {
  isExplicitDistrictHost,
  getDistrictConfig,
  parseDistrictKey,
  resolveDistrictFromHost,
  type SiteScopeKey,
  type DistrictKey,
} from "@/lib/districts";

function getHeaderStore() {
  return headers() as unknown as Awaited<ReturnType<typeof headers>>;
}

export function getRequestHost() {
  const headerStore = getHeaderStore();
  return (
    headerStore.get("x-forwarded-host") ||
    headerStore.get("host") ||
    headerStore.get("x-vercel-deployment-url") ||
    null
  );
}

export function getCurrentDistrictKey(): DistrictKey {
  const headerStore = getHeaderStore();
  const explicitDistrict =
    parseDistrictKey(headerStore.get("x-krtr-district")) ||
    parseDistrictKey(headerStore.get("x-district-key"));

  if (explicitDistrict) {
    return explicitDistrict;
  }

  return resolveDistrictFromHost(getRequestHost());
}

export function getCurrentSiteScopeKey(): SiteScopeKey {
  const headerStore = getHeaderStore();
  const explicitDistrict =
    parseDistrictKey(headerStore.get("x-krtr-district")) ||
    parseDistrictKey(headerStore.get("x-district-key"));

  if (explicitDistrict) {
    return explicitDistrict;
  }

  const host = getRequestHost();
  return isExplicitDistrictHost(host) ? resolveDistrictFromHost(host) : "global";
}

export function getCurrentDistrict() {
  return getDistrictConfig(getCurrentDistrictKey());
}

export function getRequestOrigin() {
  const headerStore = getHeaderStore();
  const host = getRequestHost();
  const proto =
    headerStore.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");

  if (!host) {
    return null;
  }

  return `${proto}://${host}`;
}
