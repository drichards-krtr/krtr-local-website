import { NextResponse } from "next/server";
import { createNrcsServerClient, createNrcsServiceClient } from "@/lib/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createNrcsServerClient();
  const { data: document, error } = await supabase
    .from("nrcs_source_documents")
    .select("storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!document) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const service = createNrcsServiceClient();
  const { data, error: signedUrlError } = await service.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60);

  if (signedUrlError || !data?.signedUrl) {
    return NextResponse.json(
      { error: signedUrlError?.message || "Unable to create signed URL" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(data.signedUrl);
}
