import Link from "next/link";
import { getCurrentWeather } from "@/lib/weather";
import { getCurrentDistrict } from "@/lib/districtServer";

export default async function WeatherBar() {
  const district = getCurrentDistrict();
  const weather = await getCurrentWeather(district.key).catch(() => null);

  return (
    <div className="border-t border-white/10 bg-krtrNavy text-white">
      <div className="mx-auto flex max-w-site flex-wrap items-center justify-center gap-2 px-4 py-2 text-sm">
        {weather ? (
          <span>
            <strong>Current Conditions</strong>: {weather.temperatureText} - {weather.condition}
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
