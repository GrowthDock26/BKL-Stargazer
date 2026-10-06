import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

// ----- Rate Limit -----
const rl = new Map<string, { count: number; reset: number }>();
function rateLimit(ip: string) {
  const now = Date.now();
  const cur = rl.get(ip);
  if (!cur || now > cur.reset) {
    rl.set(ip, { count: 1, reset: now + 3600_000 });
    return true;
  }
  if (cur.count >= 5) return false;
  cur.count++;
  return true;
}

interface DocInput {
  name: string;
  mimeType: string;
  dataBase64: string; // raw base64 (no data: prefix)
}

interface AgentProfile {
  id: string;
  name: string;
  role: string;
  description: string | null;
  system_prompt: string;
  model: string;
  order_index: number;
  trigger_keywords: string[] | null;
}

// Build multimodal user message including all docs
function buildUserContent(docs: DocInput[], extraText: string) {
  const parts: any[] = [{ type: "text", text: extraText }];
  for (const d of docs) {
    if (d.mimeType === "application/pdf" || d.mimeType.startsWith("image/")) {
      parts.push({
        type: "image_url",
        image_url: { url: `data:${d.mimeType};base64,${d.dataBase64}` },
      });
    } else if (d.mimeType === "text/plain") {
      const text = atob(d.dataBase64);
      parts.push({
        type: "text",
        text: `\n\n=== Dokument: ${d.name} ===\n${text.slice(0, 50000)}`,
      });
    }
  }
  return parts;
}

async function callAI(
  model: string,
  systemPrompt: string,
  userContent: any,
  jsonMode = true,
): Promise<string> {
  const body: any = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
  };
  if (jsonMode) {
    body.response_format = { type: "json_object" };
  }

  const resp = await fetch(AI_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`AI ${resp.status}: ${errText.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? "";
}

function safeJSON(raw: string): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // try to extract first {...} block
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { /* ignore */ }
    }
    return { raw };
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
  if (!rateLimit(ip)) {
    return new Response(
      JSON.stringify({ error: "Rate limit erreicht (max 5 Analysen/Stunde)." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const docs: DocInput[] = body.documents || [];
    const familyContext: string = body.familyContext || "";

    if (!Array.isArray(docs) || docs.length === 0) {
      return new Response(JSON.stringify({ error: "Keine Dokumente übergeben." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (docs.length > 10) {
      return new Response(JSON.stringify({ error: "Max 10 Dokumente pro Analyse." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const totalSize = docs.reduce((s, d) => s + d.dataBase64.length, 0);
    if (totalSize > 20_000_000) {
      return new Response(JSON.stringify({ error: "Dokumente zu groß (max ~15MB gesamt)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
    const { data: agents } = await supabase
      .from("agent_profiles")
      .select("*")
      .eq("role", "analyst")
      .eq("enabled", true)
      .order("order_index", { ascending: true });

    const allAnalysts = (agents as AgentProfile[]) || [];
    if (allAnalysts.length === 0) {
      return new Response(JSON.stringify({ error: "Keine Analyse-Agenten konfiguriert." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const classifier = allAnalysts.find((a) => a.name.includes("Klassifizierer"));
    const optimizer = allAnalysts.find((a) => a.name.includes("Optimierer"));
    const specialists = allAnalysts.filter(
      (a) => a !== classifier && a !== optimizer,
    );

    const docInfo = docs.map((d) => `${d.name} (${d.mimeType})`).join(", ");
    const baseIntro = `Hochgeladene Dokumente: ${docInfo}.\n` +
      (familyContext ? `Familienkonstellation: ${familyContext}\n` : "");

    // --- Step 1: Classify documents ---
    let classification: any = null;
    if (classifier) {
      const userParts = buildUserContent(
        docs,
        baseIntro + "\nKlassifiziere jedes Dokument und liefere Eckdaten als JSON-Array unter Schlüssel 'dokumente'.",
      );
      const raw = await callAI(classifier.model, classifier.system_prompt, userParts);
      classification = safeJSON(raw);
    }

    // Build keyword set from classification + filenames + family context
    const haystack = (
      JSON.stringify(classification || "") +
      " " + docInfo +
      " " + familyContext
    ).toLowerCase();

    // --- Step 2: Run matching specialists in parallel ---
    const activeSpecialists = specialists.filter((s) => {
      const kws = s.trigger_keywords || [];
      if (kws.length === 0) return true; // always-on
      return kws.some((kw) => haystack.includes(kw.toLowerCase()));
    });

    const specialistResults = await Promise.all(
      activeSpecialists.map(async (s) => {
        try {
          const userParts = buildUserContent(
            docs,
            baseIntro +
              `\nVorherige Klassifizierung: ${JSON.stringify(classification).slice(0, 2000)}\n\n` +
              "Führe deine Spezialanalyse aus und liefere JSON gemäß deiner System-Anweisung.",
          );
          const raw = await callAI(s.model, s.system_prompt, userParts);
          return { agent: s.name, result: safeJSON(raw) };
        } catch (e) {
          return { agent: s.name, error: (e as Error).message };
        }
      }),
    );

    // --- Step 3: Optimizer synthesizes recommendations ---
    let optimizerResult: any = null;
    if (optimizer) {
      const synthPrompt =
        baseIntro +
        "\n\n=== Klassifizierung ===\n" + JSON.stringify(classification, null, 2) +
        "\n\n=== Spezialisten-Analysen ===\n" + JSON.stringify(specialistResults, null, 2) +
        "\n\nErarbeite priorisierte Verbesserungsvorschläge als JSON.";
      const raw = await callAI(optimizer.model, optimizer.system_prompt, [
        { type: "text", text: synthPrompt },
      ]);
      optimizerResult = safeJSON(raw);
    }

    return new Response(
      JSON.stringify({
        classification,
        specialists: specialistResults,
        optimizer: optimizerResult,
        meta: {
          documents: docs.map((d) => ({ name: d.name, mimeType: d.mimeType })),
          agents_used: [
            classifier?.name,
            ...activeSpecialists.map((s) => s.name),
            optimizer?.name,
          ].filter(Boolean),
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("document-analysis error:", e);
    return new Response(
      JSON.stringify({ error: (e as Error).message || "Unbekannter Fehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
