import { headers } from "next/headers";
import {
  getDistrictConfig,
  parseDistrictKey,
  resolveDistrictFromHost,
  type DistrictKey,
} from "@/lib/districts";

export function getRequestHost() {
  const headerStore = headers();
  return (
    headerStore.get("x-forwarded-host") ||
    headerStore.get("host") ||
    headerStore.get("x-vercel-deployment-url") ||
    null
  );
}

export function getCurrentDistrictKey(): DistrictKey {
  const headerStore = headers();
  const explicitDistrict =
    parseDistrictKey(headerStore.get("x-krtr-district")) ||
    parseDistrictKey(headerStore.get("x-district-key"));

  if (explicitDistrict) {
    return explicitDistrict;
  }

  return resolveDistrictFromHost(getRequestHost());
}

export function getCurrentDistrict() {
  return getDistrictConfig(getCurrentDistrictKey());
}

export function getRequestOrigin() {
  const headerStore = headers();
  const host = getRequestHost();
  const proto =
    headerStore.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");

  if (!host) {
    return null;
  }

  return `${proto}://${host}`;
}
