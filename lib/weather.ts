export type CurrentWeather = {
  location: string;
  temperatureText: string;
  condition: string;
  alerts: string[];
};

export type WeatherAlertDetail = {
  headline: string;
  severity: string | null;
  area: string | null;
  effective: string | null;
  expires: string | null;
  impacts: string | null;
};

export type CurrentWeatherDetail = {
  iconUrl: string | null;
  condition: string;
  temperatureText: string;
  feelsLikeText: string | null;
  humidityText: string | null;
  precipitationChanceText: string | null;
};

export type ForecastPeriod = {
  name: string;
  iconUrl: string | null;
  shortForecast: string;
  detailedForecast: string;
  temperatureText: string;
  startTime: string | null;
  endTime: string | null;
};

export type WeatherPageData = {
  alerts: WeatherAlertDetail[];
  current: CurrentWeatherDetail | null;
  forecast: ForecastPeriod[];
};

type NwsPointsResponse = {
  properties?: {
    forecast?: string;
    forecastHourly?: string;
    observationStations?: string;
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
      icon?: string;
      temperature?: number;
      temperatureUnit?: string;
      shortForecast?: string;
      probabilityOfPrecipitation?: {
        value?: number | null;
      };
    }>;
  };
};

type NwsForecastResponse = {
  properties?: {
    periods?: Array<{
      name?: string;
      startTime?: string;
      endTime?: string;
      icon?: string;
      shortForecast?: string;
      detailedForecast?: string;
      temperature?: number;
      temperatureUnit?: string;
    }>;
  };
};

type NwsStationsResponse = {
  features?: Array<{
    id?: string;
  }>;
};

type NwsObservationResponse = {
  properties?: {
    heatIndex?: { value?: number | null };
    windChill?: { value?: number | null };
    relativeHumidity?: { value?: number | null };
  };
};

type NwsAlertsResponse = {
  features?: Array<{
    properties?: {
      event?: string;
      severity?: string;
      areaDesc?: string;
      effective?: string;
      expires?: string;
      description?: string;
    };
  }>;
};

const WATERLOO_LAT = "42.4928";
const WATERLOO_LON = "-92.3426";

function cToF(valueC: number) {
  return Math.round((valueC * 9) / 5 + 32);
}

function firstParagraph(text: string | null | undefined) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return trimmed.split(/\n\s*\n/)[0] || trimmed;
}

async function getNwsJson<T>(url: string, userAgent: string, revalidate = 300) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": userAgent,
      Accept: "application/geo+json",
    },
    next: { revalidate },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function fetchBaseNwsData(userAgent: string) {
  const points = await getNwsJson<NwsPointsResponse>(
    `https://api.weather.gov/points/${WATERLOO_LAT},${WATERLOO_LON}`,
    userAgent
  );
  if (!points?.properties) return null;

  const [hourly, forecast, alerts, stations] = await Promise.all([
    points.properties.forecastHourly
      ? getNwsJson<NwsHourlyResponse>(points.properties.forecastHourly, userAgent)
      : null,
    points.properties.forecast
      ? getNwsJson<NwsForecastResponse>(points.properties.forecast, userAgent)
      : null,
    getNwsJson<NwsAlertsResponse>(
      `https://api.weather.gov/alerts/active?point=${WATERLOO_LAT},${WATERLOO_LON}`,
      userAgent
    ),
    points.properties.observationStations
      ? getNwsJson<NwsStationsResponse>(points.properties.observationStations, userAgent)
      : null,
  ]);

  let observation: NwsObservationResponse | null = null;
  const stationUrl = stations?.features?.[0]?.id;
  if (stationUrl) {
    observation = await getNwsJson<NwsObservationResponse>(
      `${stationUrl}/observations/latest`,
      userAgent
    );
  }

  return { points, hourly, forecast, alerts, observation };
}

export async function getCurrentWeather(): Promise<CurrentWeather | null> {
  const userAgent =
    process.env.NWS_USER_AGENT || "KRTR Local Weather (hello@krtrlocal.tv)";
  const bundle = await fetchBaseNwsData(userAgent);
  if (!bundle) return null;

  const period = bundle.hourly?.properties?.periods?.[0];
  if (!period) return null;

  const alerts = Array.from(
    new Set(
      (bundle.alerts?.features || [])
        .map((feature) => {
          const event = feature?.properties?.event?.trim();
          const severity = feature?.properties?.severity?.trim();
          if (!event) return null;
          return severity ? `${event} (${severity})` : event;
        })
        .filter((value): value is string => !!value)
    )
  );

  const city = bundle.points.properties?.relativeLocation?.properties?.city || "Local";
  const state = bundle.points.properties?.relativeLocation?.properties?.state || "";
  const location = state ? `${city}, ${state}` : city;
  const temperatureText =
    period.temperature !== undefined
      ? `${period.temperature} ${period.temperatureUnit || "F"}`
      : "N/A";
  const condition = period.shortForecast || "Current conditions unavailable";

  return { location, temperatureText, condition, alerts };
}

export async function getWeatherPageData(): Promise<WeatherPageData> {
  const userAgent =
    process.env.NWS_USER_AGENT || "KRTR Local Weather (hello@krtrlocal.tv)";
  const bundle = await fetchBaseNwsData(userAgent);
  if (!bundle) {
    return { alerts: [], current: null, forecast: [] };
  }

  const period = bundle.hourly?.properties?.periods?.[0];
  const temperatureText =
    period?.temperature !== undefined
      ? `${period.temperature} ${period.temperatureUnit || "F"}`
      : "N/A";

  const heatIndexC = bundle.observation?.properties?.heatIndex?.value;
  const windChillC = bundle.observation?.properties?.windChill?.value;
  const feelsLikeF =
    typeof heatIndexC === "number" && Number.isFinite(heatIndexC)
      ? cToF(heatIndexC)
      : typeof windChillC === "number" && Number.isFinite(windChillC)
        ? cToF(windChillC)
        : null;

  const humidity = bundle.observation?.properties?.relativeHumidity?.value;
  const pop = period?.probabilityOfPrecipitation?.value;

  const current: CurrentWeatherDetail | null = period
    ? {
        iconUrl: period.icon || null,
        condition: period.shortForecast || "Current conditions unavailable",
        temperatureText,
        feelsLikeText: feelsLikeF !== null ? `${feelsLikeF} F` : null,
        humidityText:
          typeof humidity === "number" && Number.isFinite(humidity)
            ? `${Math.round(humidity)}%`
            : null,
        precipitationChanceText:
          typeof pop === "number" && pop > 0 ? `${Math.round(pop)}%` : null,
      }
    : null;

  const alerts: WeatherAlertDetail[] = (bundle.alerts?.features || [])
    .map((feature) => {
      const p = feature.properties;
      const event = p?.event?.trim() || "Weather Alert";
      return {
        headline: event,
        severity: p?.severity?.trim() || null,
        area: p?.areaDesc?.trim() || null,
        effective: p?.effective || null,
        expires: p?.expires || null,
        impacts: firstParagraph(p?.description),
      };
    })
    .filter((alert) => !!alert.headline);

  const forecast: ForecastPeriod[] = (bundle.forecast?.properties?.periods || [])
    .slice(0, 10)
    .map((p) => ({
      name: p.name || "Forecast",
      iconUrl: p.icon || null,
      shortForecast: p.shortForecast || "",
      detailedForecast: p.detailedForecast || "",
      temperatureText:
        p.temperature !== undefined ? `${p.temperature} ${p.temperatureUnit || "F"}` : "N/A",
      startTime: p.startTime || null,
      endTime: p.endTime || null,
    }));

  return { alerts, current, forecast };
}
