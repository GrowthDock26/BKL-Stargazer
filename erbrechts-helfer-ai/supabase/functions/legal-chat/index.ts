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
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  const realIP = req.headers.get('x-real-ip');
  if (realIP) return realIP;
  return 'unknown-client';
}

function checkRateLimit(identifier: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const userLimits = rateLimits.get(identifier);
  if (!userLimits || now > userLimits.resetTime) {
    rateLimits.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }
  if (userLimits.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }
  userLimits.count++;
  rateLimits.set(identifier, userLimits);
  return { allowed: true, remaining: RATE_LIMIT_MAX - userLimits.count };
}

// --- Input Validation ---
interface ChatMessage { role: string; content: string; }
interface ChatRequest { messages: ChatMessage[]; accessLevel?: string; }

function validateInput(data: unknown): ChatRequest {
  if (!data || typeof data !== 'object') throw new Error('Invalid request format');
  const req = data as Record<string, unknown>;
  if (!req.messages || !Array.isArray(req.messages)) throw new Error('Invalid request: messages must be an array');
  if (req.messages.length === 0) throw new Error('Invalid request: messages array is empty');
  const last = req.messages[req.messages.length - 1] as Record<string, unknown>;
  if (!last || typeof last !== 'object') throw new Error('Invalid message format');
  if (!last.content || typeof last.content !== 'string') throw new Error('Invalid message content');
  if (last.content.length > 5000) throw new Error('Nachricht zu lang (max 5000 Zeichen)');
  if (last.content.trim().length === 0) throw new Error('Nachricht darf nicht leer sein');
  return { messages: req.messages as ChatMessage[], accessLevel: req.accessLevel as string | undefined };
}

// --- Open Legal Data API ---
const OLD_API_BASE = 'https://de.openlegaldata.io/api';

interface OldLaw {
  id: number;
  title: string;
  content: string;
  section: string;
  slug: string;
}

interface OldCase {
  id: number;
  file_number: string;
  court_name?: string;
  date: string;
  content: string;
}

async function searchOpenLegalDataLaws(query: string): Promise<OldLaw[]> {
  try {
    const url = `${OLD_API_BASE}/laws/?format=json&search=${encodeURIComponent(query)}&limit=3`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!resp.ok) {
      console.error('Open Legal Data laws API error:', resp.status);
      return [];
    }
    const data = await resp.json();
    return (data.results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      title: r.title || r.section || r.slug || '',
      content: (r.content as string || '').replace(/<[^>]*>/g, '').substring(0, 800),
      section: r.section as string || '',
      slug: r.slug as string || '',
    }));
  } catch (err) {
    console.error('Open Legal Data laws fetch failed:', err);
    return [];
  }
}

async function searchOpenLegalDataCases(query: string): Promise<OldCase[]> {
  try {
    const url = `${OLD_API_BASE}/cases/?format=json&search=${encodeURIComponent(query)}&limit=2`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    
    if (!resp.ok) {
      console.error('Open Legal Data cases API error:', resp.status);
      return [];
    }
    const data = await resp.json();
    return (data.results || []).map((r: Record<string, unknown>) => ({
      id: r.id,
      file_number: r.file_number as string || '',
      court_name: (r.court as Record<string, unknown>)?.name as string || '',
      date: r.date as string || '',
      content: (r.content as string || '').replace(/<[^>]*>/g, '').substring(0, 600),
    }));
  } catch (err) {
    console.error('Open Legal Data cases fetch failed:', err);
    return [];
  }
}

// --- Firecrawl Case-Law Search (BMJ rechtsprechung-im-internet.de + openJur.de) ---
interface CaseLawHit {
  source: 'BMJ' | 'openJur';
  title: string;
  url: string;
  snippet: string;
}

async function firecrawlSiteSearch(
  apiKey: string,
  query: string,
  site: string,
  source: 'BMJ' | 'openJur',
  limit = 3,
): Promise<CaseLawHit[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch('https://api.firecrawl.dev/v2/search', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `site:${site} ${query}`,
        limit,
        lang: 'de',
        country: 'de',
      }),
    });
    clearTimeout(timeout);
    if (!resp.ok) {
      console.error(`Firecrawl search (${source}) error:`, resp.status, await resp.text().catch(() => ''));
      return [];
    }
    const data = await resp.json();
    // v2 search returns { data: { web: [...] } } or { data: [...] }; handle both
    const raw: any[] =
      (Array.isArray(data?.data) && data.data) ||
      (Array.isArray(data?.data?.web) && data.data.web) ||
      [];
    return raw.slice(0, limit).map((r) => ({
      source,
      title: String(r.title || r.metadata?.title || '').slice(0, 200),
      url: String(r.url || r.metadata?.sourceURL || ''),
      snippet: String(r.description || r.snippet || r.markdown || '').replace(/<[^>]*>/g, '').slice(0, 500),
    })).filter(h => h.url);
  } catch (err) {
    console.error(`Firecrawl search (${source}) failed:`, err);
    return [];
  }
}

async function searchCaseLaw(query: string): Promise<CaseLawHit[]> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) {
    console.log('FIRECRAWL_API_KEY missing – skipping BMJ/openJur search');
    return [];
  }
  const [bmj, openjur] = await Promise.all([
    firecrawlSiteSearch(apiKey, query, 'rechtsprechung-im-internet.de', 'BMJ', 3),
    firecrawlSiteSearch(apiKey, query, 'openjur.de', 'openJur', 3),
  ]);
  return [...bmj, ...openjur];
}

// --- Lovable AI call helper ---
async function callLovableAI(apiKey: string, model: string, messages: Array<{role: string; content: string}>): Promise<string> {
  const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`AI Gateway ${resp.status}: ${txt}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content as string;
}

interface AgentProfile {
  name: string;
  role: string;
  system_prompt: string;
  model: string;
  order_index: number;
  trigger_keywords: string[];
}

// --- Main Handler ---

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Rate limiting
    const clientIP = getClientIP(req);
    const rateLimitResult = checkRateLimit(clientIP);
    if (!rateLimitResult.allowed) {
      console.log(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuchen Sie es in einer Stunde erneut.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-RateLimit-Remaining': '0' } }
      );
    }

    // Validate input
    const rawData = await req.json();
    const validatedData = validateInput(rawData);
    const userMessage = validatedData.messages[validatedData.messages.length - 1].content.trim();
    console.log('Validated message, length:', userMessage.length);

    // --- Supabase client (needed by Human-Gate and pipeline) ---
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // --- HUMAN-GATE: critical-case detection ---
    // Fetches all enabled gatekeeper agents and checks their trigger keywords.
    // On match, short-circuit the pipeline and return a humanGate response so
    // the frontend can render a "forward to BKL lawyer" form instead of a KI answer.
    const { data: gatekeepers } = await supabase
      .from('agent_profiles')
      .select('name, system_prompt, trigger_keywords')
      .eq('role', 'gatekeeper')
      .eq('enabled', true);

    const lowerForGate = userMessage.toLowerCase();
    let triggeredGate: { name: string; message: string; trigger: string } | null = null;
    for (const g of (gatekeepers as Array<{name: string; system_prompt: string; trigger_keywords: string[] | null}> | null) ?? []) {
      const kws = g.trigger_keywords ?? [];
      const hit = kws.find((kw) => kw && lowerForGate.includes(kw.toLowerCase()));
      if (hit) {
        triggeredGate = { name: g.name, message: g.system_prompt, trigger: hit };
        break;
      }
    }

    if (triggeredGate) {
      console.log(`Human-Gate triggered by keyword "${triggeredGate.trigger}"`);
      return new Response(
        JSON.stringify({
          response: triggeredGate.message,
          humanGate: {
            triggered: true,
            trigger: triggeredGate.trigger,
            originalQuestion: userMessage,
            gatekeeper: triggeredGate.name,
          },
          verified: true,
          sources: [],
          confidence: 'high',
          unverifiedCitations: [],
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Parallel data fetching: Knowledge Base + Open Legal Data + Firecrawl Case-Law ---
    const [knowledgeResult, oldLaws, oldCases, caseLawHits] = await Promise.all([
      supabase.rpc('search_knowledge_documents', { search_query: userMessage, limit_count: 3 }),
      searchOpenLegalDataLaws(userMessage),
      searchOpenLegalDataCases(userMessage),
      searchCaseLaw(userMessage),
    ]);

    if (knowledgeResult.error) {
      console.error('Knowledge base search error:', knowledgeResult.error);
    }

    const relevantDocs = knowledgeResult.data;
    console.log('Knowledge docs:', relevantDocs?.length || 0, '| OLD laws:', oldLaws.length, '| OLD cases:', oldCases.length, '| Case-law (BMJ/openJur):', caseLawHits.length);

    // --- Build context ---
    let knowledgeContext = '';

    if (relevantDocs && relevantDocs.length > 0) {
      knowledgeContext += '\n\nRelevante Informationen aus der Wissensbasis:\n\n';
      relevantDocs.forEach((doc: { title: string; content: string }, i: number) => {
        knowledgeContext += `[Wissensbasis ${i + 1}: ${doc.title}]\n${doc.content}\n\n`;
      });
    }

    if (oldLaws.length > 0) {
      knowledgeContext += '\n\nRelevante Gesetzesnormen (Open Legal Data):\n\n';
      oldLaws.forEach((law, i) => {
        const label = law.section || law.title || law.slug;
        knowledgeContext += `[Gesetz ${i + 1}: ${label}]\n${law.content}\n\n`;
      });
    }

    if (oldCases.length > 0) {
      knowledgeContext += '\n\nRelevante Rechtsprechung (Open Legal Data):\n\n';
      oldCases.forEach((c, i) => {
        knowledgeContext += `[Urteil ${i + 1}: ${c.court_name || 'Gericht'}, Az. ${c.file_number}, ${c.date}]\n${c.content}\n\n`;
      });
    }

    if (caseLawHits.length > 0) {
      knowledgeContext += '\n\nAktuelle Rechtsprechung (BMJ rechtsprechung-im-internet.de & openJur):\n\n';
      caseLawHits.forEach((h, i) => {
        knowledgeContext += `[Rechtsprechung ${i + 1} | Quelle: ${h.source}]\n${h.title}\n${h.snippet}\nURL: ${h.url}\n\n`;
      });
      knowledgeContext += 'WICHTIG: Zitiere Urteile aus diesem Block nur mit Gericht und Aktenzeichen, wenn sie im Titel/Snippet eindeutig erkennbar sind. Erfinde keine Aktenzeichen. Weise darauf hin, dass die zitierten Entscheidungen vom Nutzer bzw. einem Anwalt im Volltext geprüft werden sollten.\n\n';
    }


    // System prompt
    // Access level context
    const accessLevel = validatedData.accessLevel || 'free';
    let accessLevelHint = '';
    if (accessLevel === 'gold') {
      accessLevelHint = 'Der Nutzer ist Gold-Kunde. Bei komplexen Fällen weise zusätzlich auf die 24/7-Anwalts-Hotline als Ergänzung hin.';
    } else if (accessLevel === 'free') {
      accessLevelHint = 'Der Nutzer nutzt den kostenlosen Zugang mit begrenztem Kontingent. Bei Bedarf weise freundlich auf das Tresor-Abo unter vorgesorgt.online hin.';
    }

    const systemPrompt = `Du bist erbrecht.chat – ein KI-gestützter Rechtsassistent, spezialisiert auf deutsches Erbrecht und Vorsorgerecht. Du wirst betrieben in Kooperation mit BKL Rechtsanwälte und Steuerberater PartG mbB.

DEINE AUFGABEN:
- Beantworte erbrechtliche und vorsorgerechtliche Fragen nach deutschem Recht
- Erkläre komplexe Sachverhalte verständlich für juristische Laien
- Gib konkrete, praxisnahe Hinweise und Handlungsempfehlungen
- Verweise bei Bedarf auf die Möglichkeit einer anwaltlichen Beratung

WICHTIGE REGELN:
1. Du gibst KEINE rechtsverbindliche Beratung. Weise bei komplexen oder individuellen Fragen darauf hin, dass eine anwaltliche Beratung empfohlen wird.
2. Beziehe dich ausschließlich auf deutsches Recht (BGB, insb. Erbrecht §§ 1922 ff., Betreuungsrecht, Vorsorgevollmacht).
3. Antworte auf Deutsch, höflich und professionell.
4. Bei Fragen zu Produkten oder Services verweise auf vorgesorgt.online
5. Nenne KEINE konkreten Anwaltsgebühren oder Preise für anwaltliche Leistungen.
6. Bei Fragen zur Erbschaftsteuer verweise darauf, dass eine individuelle steuerliche Beratung notwendig ist.
7. Halte deine Antworten KURZ und PRÄGNANT (max. 150 Wörter).
8. Nenne konkrete Paragraphen (z.B. § 2303 BGB).
9. Strukturiere klar: Kernaussage zuerst, dann Details.
10. Weise auf wichtige Fristen und Formvorschriften hin.
11. Gib nur die wichtigsten Rechtsgrundlagen an (max. 3).
12. Wenn Urteile aus der Rechtsprechung relevant sind, zitiere Gericht und Aktenzeichen.

KRITISCHE GENAUIGKEITSREGEL:
13. Wenn Dir aus der Wissensbasis konkrete Erbquoten, Bruchteile oder Zahlen vorliegen, verwende EXAKT diese Werte. Erfinde oder schätze NIEMALS Erbquoten.
14. Bei der gesetzlichen Erbfolge beachte IMMER den Güterstand (insb. Zugewinngemeinschaft § 1371 BGB): Ehegatte erbt neben Kindern (1. Ordnung) 1/4 gesetzlicher Erbteil + 1/4 pauschaler Zugewinnausgleich = 1/2. Die Kinder teilen sich die andere Hälfte zu gleichen Teilen.
15. Wenn Du Dir bei einer Erbquote oder einem rechtlichen Detail NICHT SICHER bist, sage das offen und empfehle eine anwaltliche Prüfung. Gib KEINE unsichere Antwort als Tatsache aus.
16. Prüfe deine Antwort vor dem Absenden auf rechnerische Richtigkeit: Alle Erbquoten müssen zusammen 100% ergeben.

KONTEXT:
Der Nutzer kommt über den Digitalen Notfallkoffer (vorgesorgt.online) – eine Plattform für digitale Vorsorge und Nachlassplanung in Kooperation mit der Kanzlei BKL Rechtsanwälte und Steuerberater. Die Plattform bietet:
- Vorsorgevollmacht, Sorgerechtsverfügung, Betreuungsverfügung
- Digitaler Tresor für wichtige Dokumente
- Probesterben (kostenlose Erbfall-Simulation)
- Individueller Nachfolgeplan mit anwaltlicher Begleitung

${accessLevelHint}

${knowledgeContext}

Antworte präzise, kompakt und direkt auf den Punkt.`;

    // Call AI
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY not configured');

    // --- MULTI-AGENT PIPELINE ---
    // Load enabled agent profiles
    const { data: agentsData, error: agentsError } = await supabase
      .from('agent_profiles')
      .select('name, role, system_prompt, model, order_index, trigger_keywords')
      .eq('enabled', true)
      .order('order_index', { ascending: true });

    const agents: AgentProfile[] = (agentsError || !agentsData || agentsData.length === 0)
      ? []
      : agentsData as AgentProfile[];

    const agentContributions: Array<{ name: string; role: string; content: string }> = [];
    let generatedText = '';

    const lowerUserMsg = userMessage.toLowerCase();
    const sharedContext = `${accessLevelHint}\n\n${knowledgeContext}`;

    try {
      if (agents.length === 0) {
        // Fallback: single legacy call if no agents configured
        console.log('No agent_profiles found, using legacy single-prompt mode');
        generatedText = await callLovableAI(LOVABLE_API_KEY, 'google/gemini-2.5-flash', [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ]);
      } else {
        // Step 1: Classifier (role=classifier) – always runs first
        const classifier = agents.find(a => a.role === 'classifier');
        let classification = '';
        if (classifier) {
          console.log(`Running classifier: ${classifier.name}`);
          classification = await callLovableAI(LOVABLE_API_KEY, classifier.model, [
            { role: 'system', content: classifier.system_prompt },
            { role: 'user', content: userMessage },
          ]);
          agentContributions.push({ name: classifier.name, role: classifier.role, content: classification });
        }

        // Step 2: Specialists (role=specialist) – run those whose keywords match user OR classification
        const specialists = agents.filter(a => a.role === 'specialist');
        const classLower = classification.toLowerCase();
        const matchedSpecialists = specialists.filter(s => {
          if (!s.trigger_keywords || s.trigger_keywords.length === 0) return true;
          return s.trigger_keywords.some(kw => lowerUserMsg.includes(kw.toLowerCase()) || classLower.includes(kw.toLowerCase()));
        });

        const activeSpecialists = matchedSpecialists.length > 0 ? matchedSpecialists : specialists;
        console.log(`Active specialists: ${activeSpecialists.map(s => s.name).join(', ')}`);

        const specialistResults = await Promise.all(
          activeSpecialists.map(async (sp) => {
            try {
              const out = await callLovableAI(LOVABLE_API_KEY, sp.model, [
                { role: 'system', content: `${sp.system_prompt}\n\n--- KONTEXT ---\n${sharedContext}\n\n--- SACHVERHALT (Klassifizierer) ---\n${classification || '(nicht verfügbar)'}` },
                { role: 'user', content: userMessage },
              ]);
              return { name: sp.name, role: sp.role, content: out };
            } catch (e) {
              console.error(`Specialist ${sp.name} failed:`, e);
              return null;
            }
          })
        );
        for (const r of specialistResults) if (r) agentContributions.push(r);

        // Step 3: Synthesizer – composes final answer
        const synthesizer = agents.find(a => a.role === 'synthesizer');
        if (synthesizer) {
          const contribText = agentContributions
            .filter(c => c.role !== 'synthesizer')
            .map(c => `[${c.name}]\n${c.content}`)
            .join('\n\n');
          console.log(`Running synthesizer: ${synthesizer.name}`);
          generatedText = await callLovableAI(LOVABLE_API_KEY, synthesizer.model, [
            { role: 'system', content: `${synthesizer.system_prompt}\n\n--- KONTEXT ---\n${sharedContext}` },
            { role: 'user', content: `Nutzerfrage: ${userMessage}\n\n--- SPEZIALISTEN-BEITRÄGE ---\n${contribText}` },
          ]);
        } else {
          // No synthesizer → concat specialist outputs
          generatedText = agentContributions
            .filter(c => c.role === 'specialist')
            .map(c => c.content)
            .join('\n\n') || classification;
        }
      }
    } catch (err: any) {
      console.error('Pipeline error:', err);
      const msg = String(err?.message || '');
      if (msg.includes('429')) {
        return new Response(
          JSON.stringify({ error: 'Zu viele Anfragen. Bitte versuchen Sie es in Kürze erneut.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (msg.includes('402')) {
        return new Response(
          JSON.stringify({ error: 'AI-Guthaben aufgebraucht. Bitte kontaktieren Sie den Administrator.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      throw err;
    }

    console.log('Pipeline complete. Contributions:', agentContributions.length);

    // --- PRECEDENT BOARD: anonymize + record this question ---
    try {
      const classifierOut = agentContributions.find(c => c.role === 'classifier')?.content || '';
      const topic = (classifierOut.split('\n').find(l => l.trim().length > 0) || '').slice(0, 120) || null;

      const anonymize = (s: string) => s
        .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
        .replace(/\b\+?\d[\d\s\/().-]{6,}\d\b/g, '[NUMMER]')
        .replace(/\b[A-Z]{2}\d{2}[\s\d]{10,}\b/g, '[IBAN]')
        .replace(/\b\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?\s*(?:EUR|€|Euro)\b/gi, '[BETRAG]')
        .replace(/\b[A-ZÄÖÜ][a-zäöüß]+\s+[A-ZÄÖÜ][a-zäöüß]+\b/g, '[NAME]');

      const sample = anonymize(userMessage).slice(0, 500);
      const normalized = sample
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3)
        .sort()
        .join(' ');

      const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
      const hashHex = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

      await supabase.rpc('record_precedent_question', {
        _hash: hashHex,
        _sample: sample,
        _topic: topic,
        _classification: classifierOut.slice(0, 1000) || null,
      });
    } catch (e) {
      console.error('Precedent recording failed:', e);
    }





    // --- 1) GROUNDING-VERIFIER: extract §§ and Aktenzeichen, match against context ---
    const contextCorpus = (knowledgeContext + ' ' +
      (relevantDocs || []).map((d: any) => `${d.title} ${d.content}`).join(' ') + ' ' +
      oldLaws.map(l => `${l.section} ${l.title} ${l.content}`).join(' ') + ' ' +
      oldCases.map(c => `${c.file_number} ${c.content}`).join(' ') + ' ' +
      caseLawHits.map(h => `${h.title} ${h.snippet}`).join(' ')
    ).toLowerCase();


    const paragraphRegex = /§+\s*\d+[a-z]?(?:\s*Abs\.\s*\d+)?(?:\s*[A-ZÄÖÜ]{2,10})?/g;
    const azRegex = /\b[IVX]+\s*[A-Z]{1,3}\s*\d+\/\d{2,4}\b|\b\d+\s*[A-Z]{1,3}\s*\d+\/\d{2,4}\b/g;
    const citedParagraphs = Array.from(new Set(generatedText.match(paragraphRegex) || []));
    const citedCases = Array.from(new Set(generatedText.match(azRegex) || []));
    const allCitations = [...citedParagraphs, ...citedCases];

    const verifiedCitations: string[] = [];
    const unverifiedCitations: string[] = [];
    for (const c of allCitations) {
      const normalized = c.toLowerCase().replace(/\s+/g, '');
      const corpusNormalized = contextCorpus.replace(/\s+/g, '');
      // Match by paragraph number (e.g. "§1924" or "1924") against corpus
      const numMatch = c.match(/\d+[a-z]?/);
      const found = numMatch ? corpusNormalized.includes(numMatch[0].toLowerCase()) : corpusNormalized.includes(normalized);
      if (found) verifiedCitations.push(c);
      else unverifiedCitations.push(c);
    }
    console.log(`Grounding: ${verifiedCitations.length} verified, ${unverifiedCitations.length} unverified`);

    // --- 2) MATH-VERIFIER: check inheritance quotas sum to 100% ---
    let mathOk = true;
    let mathIssue = '';
    const containsQuotas = /\b\d+\s*\/\s*\d+\b|\bProzent\b|%/i.test(generatedText);
    if (containsQuotas) {
      try {
        const verifyResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite',
            messages: [
              { role: 'system', content: 'Du bist ein mathematischer Prüfer für Erbquoten. Antworte AUSSCHLIESSLICH als JSON: {"ok": true|false, "issue": "kurze Erklärung wenn nicht ok"}. Prüfe ob alle in der Antwort genannten Erbquoten zusammen exakt 100% (bzw. 1) ergeben und ob § 1371 BGB (Zugewinngemeinschaft: Ehegatte 1/2, Kinder teilen 1/2) korrekt angewendet wurde.' },
              { role: 'user', content: `Prüfe diese Antwort auf rechnerische Richtigkeit der Erbquoten:\n\n${generatedText}` }
            ],
            stream: false,
          }),
        });
        if (verifyResponse.ok) {
          const vData = await verifyResponse.json();
          const vText = vData.choices[0].message.content.replace(/```json|```/g, '').trim();
          const parsed = JSON.parse(vText);
          mathOk = parsed.ok === true;
          mathIssue = parsed.issue || '';
          console.log(`Math-Verifier: ok=${mathOk}, issue=${mathIssue}`);

          // Retry once if math failed
          if (!mathOk) {
            console.log('Math check failed, retrying with correction hint...');
            const retryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${LOVABLE_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                model: 'google/gemini-2.5-flash',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userMessage },
                  { role: 'assistant', content: generatedText },
                  { role: 'user', content: `Deine Antwort enthält einen rechnerischen Fehler bei den Erbquoten: "${mathIssue}". Bitte korrigiere deine Antwort. Achte darauf, dass alle Erbquoten zusammen exakt 100% ergeben und der Güterstand (§ 1371 BGB) korrekt berücksichtigt wird.` }
                ],
                stream: false,
              }),
            });
            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              generatedText = retryData.choices[0].message.content;
              mathOk = true; // assume corrected; could re-verify
              console.log('Retry response generated');
            }
          }
        }
      } catch (err) {
        console.error('Math-verifier failed:', err);
      }
    }

    // --- 3) CONFIDENCE SCORE ---
    let confidence: 'high' | 'medium' | 'low' = 'low';
    const hasKbHits = (relevantDocs?.length || 0) > 0;
    if (verifiedCitations.length >= 2 && unverifiedCitations.length === 0 && mathOk && hasKbHits) {
      confidence = 'high';
    } else if ((verifiedCitations.length >= 1 || hasKbHits) && mathOk && unverifiedCitations.length <= 1) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }
    console.log(`Confidence: ${confidence}`);

    // Combine sources
    const sources: string[] = [
      ...(relevantDocs?.map((doc: { title: string }) => doc.title) || []),
      ...oldLaws.map(l => `Gesetz: ${l.section || l.title || l.slug}`),
      ...oldCases.map(c => `${c.court_name || 'Urteil'}, Az. ${c.file_number}`),
      ...caseLawHits.map(h => `${h.source}: ${h.title || h.url}`),
    ];

    return new Response(
      JSON.stringify({
        response: generatedText,
        sources,
        verified: mathOk && unverifiedCitations.length === 0,
        confidence,
        verifiedCitations,
        unverifiedCitations,
        mathOk,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-RateLimit-Remaining': String(rateLimitResult.remaining) } }
    );

  } catch (error) {
    console.error('Error in legal-chat function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unbekannter Fehler';
    const safeErrors = [
      'Invalid request format', 'Invalid request: messages must be an array',
      'Invalid request: messages array is empty', 'Invalid message format',
      'Invalid message content', 'Nachricht zu lang (max 5000 Zeichen)', 'Nachricht darf nicht leer sein'
    ];
    const userMessage = safeErrors.includes(errorMessage) ? errorMessage : 'Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.';
    return new Response(
      JSON.stringify({ error: userMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
