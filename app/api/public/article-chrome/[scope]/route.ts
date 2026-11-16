import { NextResponse } from "next/server";
import { getArticleChrome } from "@/lib/articleChrome";
import { unstable_cache } from "next/cache";
import { getArticleScope } from "@/lib/articleCache";
import { chromeScopeTag } from "@/lib/publicCache";

export const dynamic = "force-static";
export const revalidate = 60;
export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  const { scope } = getArticleScope((await params).scope);
  return NextResponse.json(await unstable_cache(() => getArticleChrome(scope), ["public-chrome-v2", scope], {
    tags: [chromeScopeTag(scope)], revalidate: 60,
  })());
}
