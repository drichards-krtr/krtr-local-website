export async function GET() {
  return Response.json({ service: "krtr-calendar-ingestion", phase: "foundation", scanning_enabled: false });
}
