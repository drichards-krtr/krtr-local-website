export const dynamic = "force-dynamic";

import Link from "next/link";
import { getWeatherPageData } from "@/lib/weather";
import { getCurrentDistrict } from "@/lib/districtServer";

function formatDateTime(value: string | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleString();
}

export default async function WeatherPage() {
  const district = getCurrentDistrict();
  const weather = await getWeatherPageData(district.key).catch(() => ({
    alerts: [],
    current: null,
    forecast: [],
  }));

  return (
    <main className="mx-auto max-w-site px-4 py-6">
      <section className="mb-6 rounded-lg bg-white p-6">
        <h1 className="text-2xl font-semibold">{district.weather.pageTitle}</h1>
      </section>

      <section className="mb-6 rounded-lg bg-white p-6">
        <h2 className="mb-3 text-xl font-semibold">Active Weather Alerts</h2>
        {weather.alerts.length > 0 ? (
          <div className="grid gap-3">
            {weather.alerts.map((alert, index) => (
              <article
                key={`${alert.headline}-${index}`}
                className="rounded border border-red-200 bg-red-50 p-4"
              >
                <h3 className="text-lg font-semibold text-red-800">
                  {alert.headline}
                  {alert.severity ? ` (${alert.severity})` : ""}
                </h3>
                <p className="mt-1 text-sm text-red-900">
                  <strong>Affected Area:</strong> {alert.area || "N/A"}
                </p>
                <p className="text-sm text-red-900">
                  <strong>Duration:</strong> {formatDateTime(alert.effective)} to{" "}
                  {formatDateTime(alert.expires)}
                </p>
                <p className="mt-2 text-sm text-red-900">
                  <strong>Impacts:</strong> {alert.impacts || "See NWS for details."}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No active alerts at this time.</p>
        )}
      </section>

      <section className="mb-6 rounded-lg bg-white p-6">
        <h2 className="mb-3 text-xl font-semibold">Current Conditions</h2>
        {weather.current ? (
          <div className="grid gap-4 md:grid-cols-[96px_1fr]">
            <div className="flex items-start justify-center">
              {weather.current.iconUrl ? (
                <img
                  src={weather.current.iconUrl}
                  alt={weather.current.condition}
                  className="h-20 w-20 rounded"
                />
              ) : (
                <div className="h-20 w-20 rounded bg-neutral-100" />
              )}
            </div>
            <div className="grid gap-1 text-sm text-neutral-800">
              <p>
                <strong>Condition:</strong> {weather.current.condition}
              </p>
              <p>
                <strong>Temperature:</strong> {weather.current.temperatureText}
              </p>
              {weather.current.feelsLikeText && (
                <p>
                  <strong>Feels Like:</strong> {weather.current.feelsLikeText}
                </p>
              )}
              {weather.current.humidityText && (
                <p>
                  <strong>Humidity:</strong> {weather.current.humidityText}
                </p>
              )}
              {weather.current.precipitationChanceText && (
                <p>
                  <strong>Chance of Precipitation:</strong>{" "}
                  {weather.current.precipitationChanceText}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Current conditions unavailable.</p>
        )}
      </section>

      <section className="mb-6 rounded-lg bg-white p-6">
        <h2 className="mb-3 text-xl font-semibold">5 Day Forecast</h2>
        {weather.forecast.length > 0 ? (
          <div className="grid gap-3">
            {weather.forecast.map((period) => (
              <article
                key={`${period.name}-${period.startTime || ""}`}
                className="grid gap-3 rounded border border-neutral-200 p-4 md:grid-cols-[96px_1fr]"
              >
                <div className="flex items-start justify-center">
                  {period.iconUrl ? (
                    <img
                      src={period.iconUrl}
                      alt={period.shortForecast}
                      className="h-20 w-20 rounded"
                    />
                  ) : (
                    <div className="h-20 w-20 rounded bg-neutral-100" />
                  )}
                </div>
                <div className="grid gap-1 text-sm text-neutral-800">
                  <h3 className="text-base font-semibold">{period.name}</h3>
                  <p>
                    <strong>Temperature:</strong> {period.temperatureText}
                  </p>
                  <p>
                    <strong>Summary:</strong> {period.shortForecast}
                  </p>
                  <p>{period.detailedForecast}</p>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">Forecast unavailable.</p>
        )}
      </section>

      <section className="rounded-lg bg-white p-6">
        <h2 className="mb-2 text-xl font-semibold">Share Your Weather Photos or Videos</h2>
        <p className="text-sm text-neutral-700">
          {district.weather.sharePrompt}
        </p>
        <Link href="/submit-story" className="mt-3 inline-block font-semibold underline">
          Submit weather-related photos or videos
        </Link>
      </section>
    </main>
  );
}
