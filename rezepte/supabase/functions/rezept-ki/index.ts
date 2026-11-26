// Supabase Edge Function "rezept-ki" – Claude für die Rezepte-App
//
// Aufgaben (POST, JSON):
//   { "action": "erkennen",    "images": ["<base64 JPEG>", …] (max. 4), "text": "…" (optional) }
//       → { "recipe": {…} | null, "problem": "…" | null }
//   { "action": "vorschlagen", "wish": "…" (optional), "count": 3 }
//       → { "suggestions": [{…, "why": "…"}] }
//
// Einrichtung im Supabase-Dashboard:
//   1. Edge Functions → Secrets: ANTHROPIC_API_KEY = dein Claude-API-Key
//   2. Edge Functions → "Deploy a new function" → "Via Editor", diesen Code einfügen, Deploy.
//      "Verify JWT" EINGESCHALTET lassen: nur angemeldete Nutzer dürfen die Funktion aufrufen.
//   3. Den Slug aus der Adresszeile (…/functions/<slug>/…) in rezepte/index.html bei KI_FUNCTION eintragen.
//
// Der API-Key verlässt den Server nie. Zusätzlich prüft die Funktion, dass der Aufrufer Mitglied einer
// Familie ist – ein bloß angelegtes Konto reicht nicht.

import Anthropic from "npm:@anthropic-ai/sdk@^1.14.0";
import { betaZodOutputFormat } from "npm:@anthropic-ai/sdk@^1.14.0/helpers/beta/zod";
import { z } from "npm:zod@^4.1.0";

const SUPABASE_URL = "https://lbncpooefucucqxvifib.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_d2eEo3czxTozSiVCPOb90Q_nZRe4nN8";   // öffentlich, wie in der Web-App
const MODEL = "claude-opus-5-5";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

// Gleiche Kategorien und Einheiten wie in der App (Auswahllisten im Editor)
const CATS = ["Obst & Gemüse", "Fleisch & Fisch", "Milch & Eier", "Brot & Backwaren", "Nudeln, Reis & Getreide", "Konserven & Gläser", "Gewürze & Öle", "Tiefkühl", "Getränke", "Sonstiges"] as const;
const UNITS = ["", "g", "kg", "ml", "l", "EL", "TL", "Prise", "Stück", "Bund", "Dose", "Becher", "Packung", "Zehe", "Scheibe", "Glas", "Tasse"] as const;

const Ingredient = z.object({
  qty: z.number().nullable().describe("Menge als Zahl (0.5 statt ½), null wenn keine Menge (z. B. 'etwas Salz')"),
  unit: z.enum(UNITS).describe("Einheit aus der Liste; leer für Stückzahlen wie '2 Zwiebeln'"),
  name: z.string().describe("Zutat ohne Menge und Einheit, auf Deutsch, z. B. 'Rinderhackfleisch'"),
  cat: z.enum(CATS).describe("Supermarkt-Kategorie"),
});
const Recipe = z.object({
  title: z.string(),
  servings: z.number().describe("Portionen laut Rezept als ganze Zahl; wenn nicht angegeben, sinnvoll schätzen"),
  prep_minutes: z.number().nullable().describe("Gesamtzeit in ganzen Minuten, null wenn weder angegeben noch sinnvoll schätzbar"),
  vegetarian: z.boolean().describe("true, wenn weder Fleisch noch Fisch enthalten ist"),
  ingredients: z.array(Ingredient),
  steps: z.array(z.string()).describe("Zubereitungsschritte, je Schritt ein kurzer Absatz"),
  tags: z.array(z.string()).describe("2–4 kurze Stichworte, z. B. 'Pasta', 'Ofengericht'"),
  notes: z.string().nullable().describe("Hinweise, z. B. unsichere Stellen beim Lesen; sonst null"),
});
const Recognized = z.object({
  recipe: Recipe.nullable(),
  problem: z.string().nullable().describe("Nur wenn kein Rezept erkennbar ist: kurze Erklärung auf Deutsch; sonst null"),
});
const Suggestions = z.object({
  suggestions: z.array(Recipe.extend({ why: z.string().describe("Ein Satz, warum das zu der Familie passt") })),
});

const SYSTEM_ERKENNEN = `Du bist die Rezept-Erkennung einer Familien-Rezepte-App. Du bekommst Fotos oder Scans einer Rezeptseite, Screenshots (z. B. von Instagram) und/oder eingefügten Text und machst daraus genau ein strukturiertes Rezept.

- Schreib alles auf Deutsch; übersetze fremdsprachige Rezepte.
- Übernimm Mengen und Schritte so, wie sie im Rezept stehen. Erfinde keine Zutaten. Ergänze nur, was eindeutig fehlt (z. B. eine fehlende Portionenzahl schätzen), und vermerke Unsicheres in "notes".
- Rechne amerikanische Einheiten in metrische um (cups → ml oder g, oz → g, °F → °C) und nutze die vorgegebenen Einheiten.
- Ordne jede Zutat einer Supermarkt-Kategorie zu (gehackte Tomaten aus der Dose → Konserven & Gläser).
- Fasse die Zubereitung in klaren, kurzen Schritten zusammen.
- Ist auf den Bildern bzw. im Text kein Rezept zu erkennen, setze "recipe" auf null und erkläre in "problem" kurz, warum.`;

const SYSTEM_VORSCHLAGEN = `Du schlägst einer Familie neue Gerichte für ihre Rezepte-App vor. Die Vorschläge werden direkt als Rezepte gespeichert und kommen in den Wochenplan und auf die Einkaufsliste.

- Alltagstaugliche Familienküche mit Zutaten aus einem normalen deutschen Supermarkt; nicht nur Klassiker, gerne auch Abwechslung.
- Berücksichtige die Lieblingslebensmittel und meide die Abneigungen konsequent.
- Schlag keine Gerichte vor, die die Familie schon hat (auch keine fast gleichen).
- Vollständige Rezepte für die angegebene Personenzahl: realistische Mengen, Einheiten aus der Liste, kurze klare Schritte, realistische Zeitangabe.
- Schreib alles auf Deutsch. "why" ist ein kurzer, persönlicher Satz, warum das Gericht passt.`;

async function familyContext(auth: string) {
  // Mit dem Token des Nutzers abfragen: die Regeln der Datenbank liefern nur seine eigene Familie
  const H = { apikey: PUBLISHABLE_KEY, Authorization: auth };
  const mem = await fetch(`${SUPABASE_URL}/rest/v1/members?select=family_id,families(settings)&limit=1`, { headers: H });
  if (!mem.ok) return null;
  const rows = await mem.json();
  if (!Array.isArray(rows) || !rows.length) return null;
  const rec = await fetch(`${SUPABASE_URL}/rest/v1/recipes?select=title&limit=400`, { headers: H });
  const titles: string[] = rec.ok ? (await rec.json()).map((r: { title: string }) => r.title) : [];
  return { settings: rows[0].families?.settings || {}, titles };
}

async function askClaude<T>(client: Anthropic, system: string, content: Anthropic.Beta.BetaContentBlockParam[], format: ReturnType<typeof betaZodOutputFormat<z.ZodType<T>>>) {
  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",                                  // lehnt das Modell ab, springt ein empfohlenes Ersatzmodell ein
    system,
    output_config: { effort: "medium", format },
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason === "refusal") throw Object.assign(new Error("Claude hat die Anfrage abgelehnt."), { status: 422 });
  if (response.stop_reason === "max_tokens") throw Object.assign(new Error("Die Antwort war zu lang. Bitte weniger auf einmal schicken."), { status: 422 });
  if (!response.parsed_output) throw Object.assign(new Error("Die Antwort ließ sich nicht auswerten."), { status: 502 });
  return response.parsed_output as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Nur POST" }, 405);

  const auth = req.headers.get("Authorization") || "";
  const ctx = auth ? await familyContext(auth) : null;
  if (!ctx) return json({ error: "Nur für angemeldete Familienmitglieder." }, 403);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "ANTHROPIC_API_KEY fehlt in den Secrets der Edge Functions." }, 500);
  const client = new Anthropic({ apiKey });

  let body: { action?: string; images?: string[]; text?: string; wish?: string; count?: number };
  try { body = await req.json(); } catch { return json({ error: "Ungültige Anfrage." }, 400); }

  try {
    if (body.action === "erkennen") {
      const images = (Array.isArray(body.images) ? body.images : []).filter((s) => typeof s === "string" && s.length > 100);
      const text = String(body.text || "").trim().slice(0, 20000);
      if (!images.length && !text) return json({ error: "Bitte ein Foto oder Text schicken." }, 400);
      if (images.length > 4) return json({ error: "Höchstens 4 Fotos auf einmal." }, 400);
      if (images.some((s) => s.length > 4_000_000)) return json({ error: "Ein Foto ist zu groß." }, 400);
      const content: Anthropic.Beta.BetaContentBlockParam[] = [
        ...images.map((data) => ({ type: "image" as const, source: { type: "base64" as const, media_type: "image/jpeg" as const, data } })),
        { type: "text", text: (images.length ? `${images.length === 1 ? "Das Foto zeigt" : "Die Fotos zeigen"} ein Rezept (bei mehreren: Seiten desselben Rezepts).` : "") +
          (text ? `\n\nText zum Rezept:\n<text>\n${text}\n</text>` : "") + "\n\nErstelle daraus das Rezept." },
      ];
      return json(await askClaude(client, SYSTEM_ERKENNEN, content, betaZodOutputFormat(Recognized)));
    }

    if (body.action === "vorschlagen") {
      const s = ctx.settings as Record<string, unknown>;
      const persons = Number(s.persons) || 4, vegs = Math.min(persons, Number(s.vegetarians) || 0);
      const list = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean).join(", ") : "") || "keine Angabe";
      const count = Math.max(1, Math.min(6, Math.round(Number(body.count) || 3)));
      const wish = String(body.wish || "").trim().slice(0, 500);
      const prompt = `Schlag ${count} neue Gerichte vor.

Familie: ${persons} ${persons === 1 ? "Person" : "Personen"}${vegs ? `, davon ${vegs} vegetarisch – mindestens ${Math.max(1, Math.round(count * vegs / persons))} der Vorschläge sollen vegetarisch sein` : ""}.
Lieblingslebensmittel: ${list(s.favorites)}
Mögen wir nicht: ${list(s.dislikes)}
${wish ? `Wunsch für diese Vorschläge: ${wish}\n` : ""}
Rezepte, die die Familie schon hat (nicht noch einmal vorschlagen):
${ctx.titles.length ? ctx.titles.map((t) => "- " + t).join("\n") : "- noch keine"}

Portionen je Rezept: ${persons}.`;
      return json(await askClaude(client, SYSTEM_VORSCHLAGEN, [{ type: "text", text: prompt }], betaZodOutputFormat(Suggestions)));
    }

    return json({ error: "Unbekannte Aufgabe." }, 400);
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return json({ error: "Claude ist gerade ausgelastet. Bitte gleich noch einmal versuchen." }, 429);
    if (err instanceof Anthropic.AuthenticationError) return json({ error: "Der Claude-API-Key ist ungültig." }, 500);
    if (err instanceof Anthropic.BadRequestError) return json({ error: "Claude hat die Anfrage nicht angenommen: " + err.message }, 400);
    if (err instanceof Anthropic.APIError) return json({ error: `Fehler bei Claude (${err.status}): ${err.message}` }, 502);
    const e = err as Error & { status?: number };
    return json({ error: e.message || "Unbekannter Fehler" }, e.status || 500);
  }
});
