import { NextResponse } from "next/server";
import { getArticleChrome } from "@/lib/articleChrome";

export const dynamic = "force-static";
export const revalidate = 60;
export async function GET(_request: Request, { params }: { params: Promise<{ scope: string }> }) {
  return NextResponse.json(await getArticleChrome((await params).scope));
}
