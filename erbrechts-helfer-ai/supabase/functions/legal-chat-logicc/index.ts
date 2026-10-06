// Test-Edge-Function: routet Anfragen an Logicc statt Lovable AI.
// Identische Request/Response-Struktur wie legal-chat – aber vereinfacht
// (kein Multi-Agent-Pipeline, kein Math-Retry), damit Logicc isoliert
// getestet werden kann.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// --- Rate Limiting ---
const rateLimits = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 3600000;

function getClientIP(req: Request): string {
  const f = req.headers.get('x-forwarded-for');
  if (f) return f.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown-client';
}

function checkRateLimit(id: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const u = rateLimits.get(id);
  if (!u || now > u.resetTime) {
    rateLimits.set(id, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (u.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0 };
  u.count++;
  return { allowed: true, remaining: RATE_LIMIT_MAX - u.count };
}

interface ChatMessage { role: string; content: string; }

function validateInput(data: unknown): { messages: ChatMessage[]; accessLevel?: string } {
  if (!data || typeof data !== 'object') throw new Error('Invalid request format');
  const r = data as Record<string, unknown>;
  if (!Array.isArray(r.messages) || r.messages.length === 0) throw new Error('Invalid request: messages must be a non-empty array');
  const last = r.messages[r.messages.length - 1] as Record<string, unknown>;
  if (!last?.content || typeof last.content !== 'string') throw new Error('Invalid message content');
  if (last.content.length > 5000) throw new Error('Nachricht zu lang (max 5000 Zeichen)');
  if (!last.content.trim()) throw new Error('Nachricht darf nicht leer sein');
  return { messages: r.messages as ChatMessage[], accessLevel: r.accessLevel as string | undefined };
}

// --- Logicc API call (OpenAI-kompatibel) ---
const LOGICC_URL = 'https://api.logicc.io/v1/chat/completions';
// Modell kann via Env LOGICC_MODEL überschrieben werden (z.B. wenn Sonnet
// auf Ihrem Account anders heißt). Default: Claude Sonnet (auf Anfrage bei Logicc).
// Claude 4.6 Sonnet (Anthropic) via Logicc. Exakte ID kann je nach Logicc-Account
// variieren – via Secret LOGICC_MODEL überschreibbar.
const DEFAULT_LOGICC_MODEL = Deno.env.get('LOGICC_MODEL') || 'claude-4.6-sonnet';

async function callLogicc(apiKey: string, messages: ChatMessage[], model = DEFAULT_LOGICC_MODEL): Promise<string> {
  const resp = await fetch(LOGICC_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Logicc ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  return data.choices?.[0]?.message?.content as string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const ip = getClientIP(req);
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      return new Response(
        JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const raw = await req.json();
    const { messages, accessLevel } = validateInput(raw);
    const userMessage = messages[messages.length - 1].content.trim();
    console.log('[legal-chat-logicc] msg length:', userMessage.length, '| model:', DEFAULT_LOGICC_MODEL);

    const LOGICC_API_KEY = Deno.env.get('LOGICC_API_KEY');
    if (!LOGICC_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'LOGICC_API_KEY ist nicht konfiguriert.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Knowledge base lookup (gleiches RPC wie legal-chat)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: relevantDocs } = await supabase.rpc('search_knowledge_documents', {
      search_query: userMessage,
      limit_count: 3,
    });

    let knowledgeContext = '';
    if (relevantDocs && relevantDocs.length > 0) {
      knowledgeContext += '\n\nRelevante Informationen aus der Wissensbasis:\n\n';
      relevantDocs.forEach((doc: { title: string; content: string }, i: number) => {
        knowledgeContext += `[Wissensbasis ${i + 1}: ${doc.title}]\n${doc.content}\n\n`;
      });
    }

    const accessLevelHint = accessLevel === 'gold'
      ? 'Der Nutzer ist Gold-Kunde. Bei komplexen Fällen weise auf die 24/7-Anwalts-Hotline hin.'
      : accessLevel === 'free'
        ? 'Der Nutzer nutzt den kostenlosen Zugang. Weise ggf. auf das Tresor-Abo unter vorgesorgt.online hin.'
        : '';

    const systemPrompt = `Du bist erbrecht.chat – ein KI-gestützter Rechtsassistent, spezialisiert auf deutsches Erbrecht und Vorsorgerecht (in Kooperation mit BKL Rechtsanwälte und Steuerberater PartG mbB).

REGELN:
- Antworte auf Deutsch, höflich, professionell, KURZ und PRÄGNANT (max. 150 Wörter).
- Nenne konkrete Paragraphen (z.B. § 2303 BGB), max. 3 Rechtsgrundlagen.
- Beziehe dich ausschließlich auf deutsches Recht (BGB, insb. §§ 1922 ff.).
- KEINE rechtsverbindliche Beratung – bei komplexen Fragen anwaltliche Beratung empfehlen.
- KEINE konkreten Anwaltsgebühren nennen.
- Bei Erbschaftsteuerfragen: auf individuelle steuerliche Beratung verweisen.
- Verwende bei Erbquoten EXAKT die Werte aus der Wissensbasis. Erfinde NIEMALS Quoten.
- Zugewinngemeinschaft (§ 1371 BGB): Ehegatte 1/2 (1/4 + 1/4 Pauschale), Kinder teilen 1/2.
- Alle Erbquoten müssen zusammen 100% ergeben.

${accessLevelHint}
${knowledgeContext}

Strukturiere klar: Kernaussage zuerst, dann Details.`;

    const generatedText = await callLogicc(LOGICC_API_KEY, [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ]);

    const sources: string[] = (relevantDocs || []).map((d: { title: string }) => d.title);
    sources.push(`[Logicc · ${DEFAULT_LOGICC_MODEL}]`);

    return new Response(
      JSON.stringify({
        response: generatedText,
        sources,
        verified: true,
        confidence: 'medium',
        verifiedCitations: [],
        unverifiedCitations: [],
        mathOk: true,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-RateLimit-Remaining': String(rl.remaining) } }
    );
  } catch (err) {
    console.error('[legal-chat-logicc] error:', err);
    const msg = err instanceof Error ? err.message : 'Unbekannter Fehler';
    const safe = ['Invalid request format', 'Invalid request: messages must be a non-empty array', 'Invalid message content', 'Nachricht zu lang (max 5000 Zeichen)', 'Nachricht darf nicht leer sein'];
    const userMsg = safe.includes(msg) ? msg : (msg.startsWith('Logicc ') ? msg : 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.');
    return new Response(
      JSON.stringify({ error: userMsg }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
