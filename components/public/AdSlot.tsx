import Link from "next/link";
import type { Ad } from "@/lib/ads";

type Props = {
  ad: Ad | null;
  className?: string;
};

export default function AdSlot({ ad, className }: Props) {
  if (!ad) return null;
  if (ad.html) {
    return (
      <div
        className={className}
        dangerouslySetInnerHTML={{ __html: ad.html }}
      />
    );
  }
  if (!ad.image_url) return null;

  const body = (
    <img
      src={ad.image_url}
      alt="Sponsored"
      className="h-auto w-full rounded"
    />
  );

  return ad.link_url ? (
    <Link href={ad.link_url} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
