// Public gateway: photo bytes stay private until a fresh SQL permission check succeeds.
const base = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const headers = { "Cache-Control": "no-store, max-age=0", "X-Content-Type-Options": "nosniff", "Access-Control-Allow-Origin": "*" };
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: { ...headers, "Access-Control-Allow-Methods": "GET, OPTIONS" } });
  if (request.method !== "GET") return new Response(null, { status: 405, headers });
  const path = new URL(request.url).searchParams.get("path") || "";
  if (!/^(properties\/[a-z0-9-]{1,80}|covers)\/[a-f0-9-]{36}\.(webp|jpe?g)$/.test(path)) return new Response(null, { status: 404, headers });
  try {
    const permission = await fetch(base + "/rest/v1/rpc/public_media_allowed", {
      method: "POST", headers: { apikey: anonKey, Authorization: "Bearer " + anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ media_path: path }), signal: AbortSignal.timeout(8000),
    });
    if (!permission.ok) return new Response(null, { status: 503, headers });
    if (await permission.json() !== true) return new Response(null, { status: 404, headers });
    const photo = await fetch(base + "/storage/v1/object/authenticated/catalog-private/" + path, {
      headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey }, signal: AbortSignal.timeout(10000),
    });
    if (!photo.ok) return new Response(null, { status: 404, headers });
    return new Response(photo.body, { headers: { ...headers, "Content-Type": path.endsWith(".webp") ? "image/webp" : "image/jpeg" } });
  } catch { return new Response(null, { status: 503, headers }); }
});
