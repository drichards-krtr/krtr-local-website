export type DistrictKey = "dlpc" | "vs" | "bc";

export type DistrictTagNode = {
  slug: string;
  label: string;
  children?: DistrictTagNode[];
};

type DistrictConfig = {
  key: DistrictKey;
  host: string;
  name: string;
  schoolDistrictName: string;
  socialNav: {
    facebookUrl: string;
    instagramUrl: string;
    youtubeUrl: string;
    watchLiveEnabled: boolean;
  };
  footer: {
    legalName: string;
    addressLine: string;
    phone: string;
  };
  metadata: {
    siteName: string;
    defaultDescription: string;
  };
  weather: {
    pageTitle: string;
    sharePrompt: string;
    lat: string;
    lon: string;
    alertCounties: string[];
  };
  features: {
    festivalOfTrails: boolean;
    vote: boolean;
    nominations: boolean;
  };
  teacherCampuses: string[];
  tags: DistrictTagNode[];
};

export const DISTRICT_KEYS: DistrictKey[] = ["dlpc", "vs", "bc"];

export const DISTRICT_OPTIONS: Array<{ value: DistrictKey; label: string }> = [
  { value: "dlpc", label: "DLPC" },
  { value: "vs", label: "VS" },
  { value: "bc", label: "BC" },
];

export const DISTRICT_CONFIGS: Record<DistrictKey, DistrictConfig> = {
  dlpc: {
    key: "dlpc",
    host: "dlpc.krtrlocal.tv",
    name: "Dysart-La Porte City",
    schoolDistrictName: "Union Community School District",
    socialNav: {
      facebookUrl: "https://www.facebook.com/KRTRLocal/",
      instagramUrl: "https://www.instagram.com/krtr_local/",
      youtubeUrl: "https://www.youtube.com/@KRTR-Local",
      watchLiveEnabled: true,
    },
    footer: {
      legalName: "KRTR Local, LLC",
      addressLine: "502 Main Street, La Porte City, IA 50651",
      phone: "319-486-1525",
    },
    metadata: {
      siteName: "KRTR Local | Dysart-La Porte City",
      defaultDescription:
        "Local news, sports, and community stories from Dysart, La Porte City, and Union CSD.",
    },
    weather: {
      pageTitle: "Dysart and La Porte City Weather",
      sharePrompt: "Help us cover local weather events in Dysart and La Porte City.",
      lat: "42.4928",
      lon: "-92.3426",
      alertCounties: ["black hawk", "benton", "buchanan", "tama"],
    },
    features: {
      festivalOfTrails: true,
      vote: true,
      nominations: true,
    },
    teacherCampuses: ["LPC Elementary", "DG Elementary", "UMS", "UHS"],
    tags: [
      { slug: "dysart", label: "Dysart" },
      { slug: "la-porte-city", label: "La Porte City" },
      {
        slug: "ucsd",
        label: "UCSD",
        children: [
          { slug: "lpc-elementary", label: "LPC Elementary" },
          { slug: "dg-elementary", label: "DG Elementary" },
          { slug: "ums", label: "UMS" },
          { slug: "uhs", label: "UHS" },
        ],
      },
      { slug: "sports", label: "Sports" },
    ],
  },
  vs: {
    key: "vs",
    host: "vs.krtrlocal.tv",
    name: "Vinton-Shellsburg",
    schoolDistrictName: "Vinton-Shellsburg Community School District",
    socialNav: {
      facebookUrl: "https://www.facebook.com/KRTRLocal/",
      instagramUrl: "https://www.instagram.com/krtr_local/",
      youtubeUrl: "https://www.youtube.com/@KRTR-Local",
      watchLiveEnabled: true,
    },
    footer: {
      legalName: "KRTR Local, LLC",
      addressLine: "KRTR Local serving the Vinton-Shellsburg area",
      phone: "319-486-1525",
    },
    metadata: {
      siteName: "KRTR Local | Vinton-Shellsburg",
      defaultDescription:
        "Local news, sports, weather, and community coverage for the Vinton-Shellsburg area.",
    },
    weather: {
      pageTitle: "Vinton-Shellsburg Weather",
      sharePrompt: "Help us cover local weather events in the Vinton-Shellsburg area.",
      lat: "42.1656",
      lon: "-92.0235",
      alertCounties: ["benton", "linn", "buchanan", "black hawk"],
    },
    features: {
      festivalOfTrails: false,
      vote: true,
      nominations: true,
    },
    teacherCampuses: [
      "Tilford Elementary",
      "Shellsburg Elementary",
      "Vinton-Shellsburg Middle School",
      "Vinton-Shellsburg High School",
    ],
    tags: [
      { slug: "vinton", label: "Vinton" },
      { slug: "shellsburg", label: "Shellsburg" },
      {
        slug: "vscsd",
        label: "Vinton-Shellsburg CSD",
        children: [
          { slug: "tilford-elementary", label: "Tilford Elementary" },
          { slug: "shellsburg-elementary", label: "Shellsburg Elementary" },
          { slug: "vs-middle-school", label: "Middle School" },
          { slug: "vs-high-school", label: "High School" },
        ],
      },
      { slug: "sports", label: "Sports" },
    ],
  },
  bc: {
    key: "bc",
    host: "bc.krtrlocal.tv",
    name: "Benton Community",
    schoolDistrictName: "Benton Community School District",
    socialNav: {
      facebookUrl: "https://www.facebook.com/KRTRLocal/",
      instagramUrl: "https://www.instagram.com/krtr_local/",
      youtubeUrl: "https://www.youtube.com/@KRTR-Local",
      watchLiveEnabled: true,
    },
    footer: {
      legalName: "KRTR Local, LLC",
      addressLine: "KRTR Local serving the Benton Community area",
      phone: "319-486-1525",
    },
    metadata: {
      siteName: "KRTR Local | Benton Community",
      defaultDescription:
        "Local news, sports, weather, and community coverage for the Benton Community area.",
    },
    weather: {
      pageTitle: "Benton Community Weather",
      sharePrompt: "Help us cover local weather events in the Benton Community area.",
      lat: "42.0928",
      lon: "-92.0571",
      alertCounties: ["benton", "linn", "iowa", "tama"],
    },
    features: {
      festivalOfTrails: false,
      vote: true,
      nominations: true,
    },
    teacherCampuses: [
      "Atkins Elementary",
      "Keystone Elementary",
      "Norway Intermediate",
      "Middle School",
      "High School",
    ],
    tags: [
      {
        slug: "bc-towns",
        label: "BC Towns",
        children: [
          { slug: "atkins", label: "Atkins" },
          { slug: "blairstown", label: "Blairstown" },
          { slug: "elberon", label: "Elberon" },
          { slug: "keystone", label: "Keystone" },
          { slug: "newhall", label: "Newhall" },
          { slug: "norway", label: "Norway" },
          { slug: "van-horne", label: "Van Horne" },
          { slug: "watkins", label: "Watkins" },
        ],
      },
      {
        slug: "bcsd",
        label: "Benton CSD",
        children: [
          { slug: "atkins-elementary", label: "Atkins Elementary" },
          { slug: "keystone-elementary", label: "Keystone Elementary" },
          { slug: "norway-intermediate", label: "Norway Intermediate" },
          { slug: "bc-middle-school", label: "Middle School" },
          { slug: "bc-high-school", label: "High School" },
        ],
      },
      { slug: "sports", label: "Sports" },
    ],
  },
};

export function isDistrictKey(value: string): value is DistrictKey {
  return DISTRICT_KEYS.includes(value as DistrictKey);
}

export function parseDistrictKey(value: string | null | undefined): DistrictKey | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return isDistrictKey(normalized) ? normalized : null;
}

export function getDistrictConfig(districtKey: DistrictKey) {
  return DISTRICT_CONFIGS[districtKey];
}

export function isExplicitDistrictHost(host: string | null | undefined) {
  const normalizedHost = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");

  return (
    normalizedHost === "dlpc.krtrlocal.tv" ||
    normalizedHost === "dlpc-test.krtrlocal.tv" ||
    normalizedHost.startsWith("dlpc.") ||
    normalizedHost.startsWith("dlpc-test.") ||
    normalizedHost === "dlpc.localhost" ||
    normalizedHost === "vs.krtrlocal.tv" ||
    normalizedHost === "vs-test.krtrlocal.tv" ||
    normalizedHost.startsWith("vs.") ||
    normalizedHost.startsWith("vs-test.") ||
    normalizedHost === "vs.localhost" ||
    normalizedHost === "bc.krtrlocal.tv" ||
    normalizedHost === "bc-test.krtrlocal.tv" ||
    normalizedHost.startsWith("bc.") ||
    normalizedHost.startsWith("bc-test.") ||
    normalizedHost === "bc.localhost"
  );
}

export function resolveDistrictFromHost(host: string | null | undefined): DistrictKey {
  const normalizedHost = String(host || "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, "");

  if (
    normalizedHost === "dlpc.krtrlocal.tv" ||
    normalizedHost === "dlpc-test.krtrlocal.tv" ||
    normalizedHost.startsWith("dlpc.") ||
    normalizedHost.startsWith("dlpc-test.") ||
    normalizedHost === "dlpc.localhost"
  ) {
    return "dlpc";
  }

  if (
    normalizedHost === "vs.krtrlocal.tv" ||
    normalizedHost === "vs-test.krtrlocal.tv" ||
    normalizedHost.startsWith("vs.") ||
    normalizedHost.startsWith("vs-test.") ||
    normalizedHost === "vs.localhost"
  ) {
    return "vs";
  }

  if (
    normalizedHost === "bc.krtrlocal.tv" ||
    normalizedHost === "bc-test.krtrlocal.tv" ||
    normalizedHost.startsWith("bc.") ||
    normalizedHost.startsWith("bc-test.") ||
    normalizedHost === "bc.localhost"
  ) {
    return "bc";
  }

  return "dlpc";
}
