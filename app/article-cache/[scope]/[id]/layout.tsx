import type { ReactNode } from "react";
import SiteIdentity from "@/components/public/SiteIdentity";
import { getArticleScope } from "@/lib/articleCache";

export default async function ArticleLayout({ children, params }: {
  children: ReactNode; params: Promise<{ scope: string }>;
}) {
  const { districtKey, origin } = getArticleScope((await params).scope);
  return <><SiteIdentity districtKey={districtKey} origin={origin} />{children}</>;
}
