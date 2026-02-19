export type CurrentWeather = {
  location: string;
  temperatureText: string;
  condition: string;
  alerts: string[];
};

type NwsPointsResponse = {
  properties?: {
    forecastHourly?: string;
    relativeLocation?: {
      properties?: {
        city?: string;
        state?: string;
      };
    };
  };
};

type NwsHourlyResponse = {
  properties?: {
    periods?: Array<{
      temperature?: number;
      temperatureUnit?: string;
      shortForecast?: string;
    }>;
  };
};

type NwsAlertsResponse = {
  features?: Array<{
    properties?: {
      event?: string;
      severity?: string;
    };
  }>;
};

const WATERLOO_LAT = "42.4928";
const WATERLOO_LON = "-92.3426";

export async function getCurrentWeather(): Promise<CurrentWeather | null> {
  const userAgent =
    process.env.NWS_USER_AGENT || "KRTR Local Weather (hello@krtrlocal.tv)";

  const pointsRes = await fetch(`https://api.weather.gov/points/${WATERLOO_LAT},${WATERLOO_LON}`, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/geo+json",
    },
    next: { revalidate: 300 },
  });
  if (!pointsRes.ok) return null;

  const pointsData = (await pointsRes.json()) as NwsPointsResponse;
  const hourlyUrl = pointsData?.properties?.forecastHourly;
  if (!hourlyUrl) return null;

  const hourlyRes = await fetch(hourlyUrl, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/geo+json",
    },
    next: { revalidate: 300 },
  });
  if (!hourlyRes.ok) return null;

  const hourlyData = (await hourlyRes.json()) as NwsHourlyResponse;
  const period = hourlyData?.properties?.periods?.[0];
  if (!period) return null;

  const alertsRes = await fetch(
    `https://api.weather.gov/alerts/active?point=${WATERLOO_LAT},${WATERLOO_LON}`,
    {
      headers: {
        "User-Agent": userAgent,
        Accept: "application/geo+json",
      },
      next: { revalidate: 300 },
    }
  );
  const alertsData = alertsRes.ok
    ? ((await alertsRes.json()) as NwsAlertsResponse)
    : null;
  const alerts = Array.from(
    new Set(
      (alertsData?.features || [])
        .map((feature) => {
          const event = feature?.properties?.event?.trim();
          const severity = feature?.properties?.severity?.trim();
          if (!event) return null;
          return severity ? `${event} (${severity})` : event;
        })
        .filter((value): value is string => !!value)
    )
  );

  const city = pointsData?.properties?.relativeLocation?.properties?.city || "Local";
  const state = pointsData?.properties?.relativeLocation?.properties?.state || "";
  const location = state ? `${city}, ${state}` : city;
  const temperatureText =
    period.temperature !== undefined
      ? `${period.temperature}°${period.temperatureUnit || "F"}`
      : "N/A";
  const condition = period.shortForecast || "Current conditions unavailable";

  return { location, temperatureText, condition, alerts };
}
