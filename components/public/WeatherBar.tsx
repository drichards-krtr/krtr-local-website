import Link from "next/link";
import { getCurrentWeather } from "@/lib/weather";

export default async function WeatherBar() {
  const weather = await getCurrentWeather().catch(() => null);

  return (
    <div className="border-b border-black/10 bg-white">
      <div className="mx-auto flex max-w-site flex-wrap items-center justify-center gap-2 px-4 py-2 text-sm">
        {weather ? (
          <span>
            <strong>{weather.location}</strong>: {weather.temperatureText} - {weather.condition}
          </span>
        ) : (
          <span>Current weather unavailable.</span>
        )}
        <Link href="/weather" className="font-semibold underline">
          get full forecast
        </Link>
      </div>
    </div>
  );
}
