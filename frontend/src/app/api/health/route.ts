export async function GET() {
  try {
    const resp = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/health`, { cache: "no-store" });
    const json = await resp.json();
    return new Response(JSON.stringify(json), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch {
    return new Response(JSON.stringify({ status: "error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
