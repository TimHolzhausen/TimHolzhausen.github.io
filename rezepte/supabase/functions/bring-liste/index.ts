// Supabase Edge Function "bring-liste"
// Liefert eine Einkaufsliste als Rezeptseite (schema.org/Recipe), die die Bring-App importieren kann:
//   https://lbncpooefucucqxvifib.supabase.co/functions/v1/bring-liste?id=<UUID der Liste>
//
// Einrichtung im Supabase-Dashboard: Edge Functions → "Deploy a new function" → "Via Editor",
// Name "bring-liste", diesen Code einfügen, "Deploy". Danach in den Einstellungen der Funktion
// "Verify JWT with legacy secret" / "Enforce JWT Verification" AUSSCHALTEN – Bring ruft ohne Anmeldung ab.
//
// Supabase liefert HTML auf der Standard-Adresse als text/plain aus; Bring liest die Seite trotzdem
// (getestet am 26.11.2026, Varianten E/F des Bring-Tests).

const SUPABASE_URL = "https://lbncpooefucucqxvifib.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_d2eEo3czxTozSiVCPOb90Q_nZRe4nN8";   // öffentlich, wie in der Web-App
const ICON = "https://timholzhausen.github.io/rezepte/icon.svg";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

Deno.serve(async (req) => {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return new Response("Liste nicht gefunden", { status: 404 });
  }
  // Liste über die Datenbankfunktion bring_list holen (gibt nur Titel und Einträge dieser einen Liste heraus)
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/bring_list`, {
    method: "POST",
    headers: { apikey: PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: id }),
  });
  const data = r.ok ? await r.json() : null;
  if (!data || !Array.isArray(data.items)) return new Response("Liste nicht gefunden", { status: 404 });

  const items: string[] = data.items.map((x: unknown) => String(x)).filter(Boolean).slice(0, 300);
  const title = String(data.title || "Einkaufsliste");
  const ld = {
    "@context": "https://schema.org", "@type": "Recipe", name: title, image: ICON, recipeYield: "4",
    recipeIngredient: items,
  };
  const html = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
</head>
<body>
<div itemscope itemtype="http://schema.org/Recipe">
<h1 itemprop="name">${esc(title)}</h1>
<span itemprop="recipeYield" hidden>4</span>
<ul>
${items.map((t) => `<li itemprop="recipeIngredient">${esc(t)}</li>`).join("\n")}
</ul>
</div>
</body>
</html>`;
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
  });
});
