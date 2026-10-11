// Adapts a Web Request to `route` (used by Vercel functions and the dev server).
import { route } from "./core.js";

export async function handle(name: string, req: Request): Promise<Response> {
  const url = new URL(req.url, "http://localhost");
  let body: unknown = null;
  if (req.method === "POST") {
    const type = req.headers.get("content-type") || "";
    try {
      body = type.includes("multipart/form-data") ? await req.formData() : await req.json();
    } catch {
      return Response.json({ error: "Couldn't read the request body." }, { status: 400 });
    }
  }
  const r = await route(name, req.method, url.searchParams, body);
  if (r.raw) return new Response(r.raw, { status: r.status, headers: { "content-type": "application/octet-stream" } });
  return Response.json(r.body, {
    status: r.status,
    headers: req.method === "GET" ? { "cache-control": "public, max-age=0, s-maxage=5", "access-control-allow-origin": "*" } : {},
  });
}
