/**
 * Nachlassverzeichnis — KI-gestütztes Vermögensverzeichnis für Erbrechtsmandate.
 *
 * Endpoints:
 *   GET    /nachlassverzeichnis/:matterId                       — Übersicht (alle Positionen)
 *   POST   /nachlassverzeichnis/:matterId/positionen            — Position anlegen
 *   PATCH  /nachlassverzeichnis/:matterId/positionen/:id        — Position bearbeiten
 *   DELETE /nachlassverzeichnis/:matterId/positionen/:id        — Position löschen
 *
 *   POST   /nachlassverzeichnis/:matterId/kontoauszug/analysieren — PDF-Upload + KI-Analyse
 *   GET    /nachlassverzeichnis/:matterId/kontoanalysen           — Alle Analysen
 *
 *   POST   /nachlassverzeichnis/:matterId/schreiben/ermittlung    — Ermittlungsschreiben
 *   POST   /nachlassverzeichnis/:matterId/schreiben/kuendigung    — Kündigungsschreiben
 *   GET    /nachlassverzeichnis/:matterId/schreiben               — Alle Schreiben
 *   PATCH  /nachlassverzeichnis/:matterId/schreiben/:id          — Status (freigeben/versandt)
 *
 *   GET    /nachlassverzeichnis/:matterId/entwurf                — Gesamtübersicht (DOCX)
 */

import { Router } from "express";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { completeText, completeVision, DEFAULT_MAIN_MODEL } from "../lib/llm";
import { buildAgentSystemPrompt } from "../lib/agents/prompt-builder";
import { buildWissensbasisKontext } from "../lib/wissensbasis/kontext";
import { extractPdfText, renderPdfPagesToBase64 } from "../lib/chatTools";

export const nachlassverzeichnisRouter = Router({ mergeParams: true });

type Db = ReturnType<typeof createServerSupabase>;

const NLV_SYSTEM_PROMPT = buildAgentSystemPrompt("nachlassverzeichnis");

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 30 * 1024 * 1024, files: 5 },
    fileFilter: (_req, file, cb) => {
        const ok = [
            "application/pdf",
            "text/csv",
            "application/vnd.ms-excel",   // Browser senden CSV teilweise mit diesem MIME-Typ
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ];
        cb(null, ok.includes(file.mimetype));
    },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getMatterWithAccess(matterId: string, userId: string, db: Db) {
    const { data: matter, error: mErr } = await db
        .from("matters")
        .select("id, org_id, bezeichnung, aktenzeichen, state")
        .eq("id", matterId)
        .maybeSingle();
    if (mErr || !matter) return null;

    const { data: member } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", matter.org_id)
        .maybeSingle();
    if (!member) return null;

    return { matter, role: member.role as string };
}

async function getErblasserName(matterId: string, db: Db): Promise<string> {
    const { data } = await db
        .from("mandanten")
        .select("vorname, nachname, geburtsdatum")
        .eq("matter_id", matterId)
        .maybeSingle();
    if (!data) return "[ERBLASSER]";
    const geb = data.geburtsdatum ? `, geb. ${new Date(data.geburtsdatum).toLocaleDateString("de-DE")}` : "";
    return `${data.vorname ?? ""} ${data.nachname ?? ""}${geb}`.trim();
}

// Zentral am Mandanten gepflegtes Sterbedatum (ISO yyyy-mm-dd) — dient als
// Default für Todestag/Sterbetag in allen Schreiben und der Kontoauszug-Analyse.
async function getSterbedatum(matterId: string, db: Db): Promise<string | null> {
    const { data } = await db
        .from("mandanten")
        .select("sterbedatum")
        .eq("matter_id", matterId)
        .maybeSingle();
    return (data?.sterbedatum as string | null) ?? null;
}

// ---------------------------------------------------------------------------
// GET /:matterId — Übersicht aller Positionen
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const { data: positionen } = await db
        .from("nachlassverzeichnis_positionen")
        .select("*")
        .eq("matter_id", matterId)
        .order("kategorie")
        .order("erstellt_am");

    const { data: schreiben } = await db
        .from("nachlassverzeichnis_schreiben")
        .select("id, schreiben_typ, empfaenger_name, status, erstellt_am")
        .eq("matter_id", matterId)
        .order("erstellt_am", { ascending: false });

    const sterbedatum = await getSterbedatum(matterId, db);
    const erblasser = await getErblasserName(matterId, db);

    // Gesamtwert berechnen
    const gesamtwert = (positionen ?? []).reduce(
        (sum, p) => sum + (Number(p.geschaetzter_wert) || 0),
        0,
    );

    const kategorienSummary = (positionen ?? []).reduce<Record<string, number>>((acc, p) => {
        acc[p.kategorie] = (acc[p.kategorie] ?? 0) + 1;
        return acc;
    }, {});

    res.json({
        matter: access.matter,
        erblasser,
        sterbedatum,
        positionen: positionen ?? [],
        schreiben: schreiben ?? [],
        zusammenfassung: {
            gesamtanzahl_positionen: (positionen ?? []).length,
            geschaetzter_gesamtwert: gesamtwert,
            kategorien: kategorienSummary,
        },
    });
});

// ---------------------------------------------------------------------------
// PATCH /:matterId/sterbedatum — Todestag des Erblassers zentral pflegen
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.patch("/sterbedatum", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const sterbedatum = (req.body?.sterbedatum as string | undefined) || null;

    const { error } = await db
        .from("mandanten")
        .update({ sterbedatum })
        .eq("matter_id", matterId);

    if (error) return void res.status(500).json({ detail: error.message });
    res.json({ sterbedatum });
});

// ---------------------------------------------------------------------------
// POST /:matterId/positionen — Position anlegen
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.post("/positionen", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const body = req.body as Record<string, unknown>;
    if (!body.kategorie || !body.bezeichnung) {
        return void res.status(400).json({ detail: "kategorie und bezeichnung sind erforderlich" });
    }

    const valid = ["konto_depot", "immobilie", "beteiligung", "versicherung", "sonstiges"];
    if (!valid.includes(String(body.kategorie))) {
        return void res.status(400).json({ detail: `kategorie muss einer von: ${valid.join(", ")} sein` });
    }

    const { data, error } = await db
        .from("nachlassverzeichnis_positionen")
        .insert({
            matter_id: matterId,
            org_id: access.matter.org_id,
            erstellt_von: userId,
            ...Object.fromEntries(
                Object.entries(body).filter(([, v]) => v !== undefined && v !== null),
            ),
        })
        .select()
        .single();

    if (error) return void res.status(500).json({ detail: error.message });
    res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// PATCH /:matterId/positionen/:posId — Position bearbeiten
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.patch("/positionen/:posId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId, posId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const body = req.body as Record<string, unknown>;
    const { data, error } = await db
        .from("nachlassverzeichnis_positionen")
        .update({ ...body, aktualisiert_am: new Date().toISOString() })
        .eq("id", posId)
        .eq("matter_id", matterId)
        .select()
        .single();

    if (error || !data) return void res.status(404).json({ detail: error?.message ?? "Position nicht gefunden" });
    res.json(data);
});

// ---------------------------------------------------------------------------
// DELETE /:matterId/positionen/:posId — Position löschen
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.delete("/positionen/:posId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId, posId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const { error } = await db
        .from("nachlassverzeichnis_positionen")
        .delete()
        .eq("id", posId)
        .eq("matter_id", matterId);

    if (error) return void res.status(500).json({ detail: error.message });
    res.status(204).send();
});

// ---------------------------------------------------------------------------
// JSON salvage: extract top-level keys that parsed cleanly from a truncated
// JSON response. Tries each top-level key individually so a cut-off array
// or string doesn't discard the already-complete fields.
// ---------------------------------------------------------------------------

function salvageTruncatedJson(raw: string): Record<string, unknown> | null {
    const result: Record<string, unknown> = {};
    // Match top-level key:"value" or key:{...} or key:[...]
    const keyRegex = /"(\w+)"\s*:\s*/g;
    let m: RegExpExecArray | null;
    const positions: { key: string; start: number }[] = [];
    while ((m = keyRegex.exec(raw)) !== null) {
        // Only top-level keys: count unescaped braces/brackets before this position
        let depth = 0;
        for (let i = 0; i < m.index; i++) {
            if (raw[i] === "{" || raw[i] === "[") depth++;
            else if (raw[i] === "}" || raw[i] === "]") depth--;
        }
        if (depth === 1) positions.push({ key: m[1], start: m.index + m[0].length });
    }

    for (let i = 0; i < positions.length; i++) {
        const { key, start } = positions[i];
        const end = i + 1 < positions.length
            ? raw.lastIndexOf(",", positions[i + 1].start - 2)
            : raw.length;
        const fragment = `{${raw.slice(positions[i].start - positions[i].key.length - 4, end).trim().replace(/,$/, "")}}`;
        try {
            const parsed = JSON.parse(`{"${key}": ${raw.slice(start, end).replace(/,\s*$/, "")}}`);
            result[key] = parsed[key];
        } catch { /* skip unparseable key */ }
    }
    return Object.keys(result).length > 0 ? result : null;
}

// ---------------------------------------------------------------------------
// POST /:matterId/kontoauszug/analysieren — KI-Kontoauszug-Analyse
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.post(
    "/kontoauszug/analysieren",
    requireAuth,
    upload.array("datei", 5),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { matterId } = req.params;
        const db = createServerSupabase();

        const access = await getMatterWithAccess(matterId, userId, db);
        if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

        const files = (req.files ?? []) as Express.Multer.File[];
        if (!files.length) return void res.status(400).json({ detail: "Mindestens eine Datei erforderlich" });

        const positionId = (req.body?.position_id as string | undefined) || null;
        const todestag = (req.body?.todestag as string | undefined) || await getSterbedatum(matterId, db);
        const erblasser = await getErblasserName(matterId, db);

        const texte: string[] = [];
        for (const file of files) {
            try {
                let text = "";
                const istCsv = file.mimetype === "text/csv"
                    || file.mimetype === "application/vnd.ms-excel"
                    || file.originalname.toLowerCase().endsWith(".csv");
                if (file.mimetype === "application/pdf") {
                    text = await extractPdfText(file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer);
                } else if (istCsv) {
                    text = file.buffer.toString("utf-8");
                } else {
                    const mammoth = await import("mammoth");
                    const r = await mammoth.extractRawText({ buffer: file.buffer });
                    text = r.value;
                }
                if (text.trim()) texte.push(`=== ${file.originalname} ===\n${text.slice(0, 15000)}`);
            } catch { /* ignorieren */ }
        }

        if (!texte.length) return void res.status(422).json({ detail: "Kein lesbarer Text in den Dateien" });

        const sterbedatumFormatiert = todestag
            ? new Date(todestag).toLocaleDateString("de-DE")
            : null;

        const todestag_abschnitt = sterbedatumFormatiert
            ? `STICHTAG (TODESTAG): ${sterbedatumFormatiert}
Ermittle den Kontostand so nah wie möglich an diesem Datum:
- Suche nach dem Endstand des letzten Abrechnungszeitraums vor oder am Todestag
- Falls vorhanden: Saldo direkt am ${sterbedatumFormatiert}
- Falls nicht direkt erkennbar: letzter Saldo vor dem Todestag mit Datum angeben`
            : `STICHTAG: nicht angegeben — verwende den letzten erkennbaren Kontostand aus dem Auszug`;

        const prompt = `Du analysierst Kontoauszüge des Erblassers ${erblasser} für ein Nachlassverzeichnis.

${todestag_abschnitt}

AUFGABEN:
1. Konto-Identifikation: Bank, IBAN (nur letzte 4 Ziffern), Kontoinhaber, Kontotyp
2. Kontostand zum Stichtag (Todestag) ermitteln
3. Regelmäßige Eingänge identifizieren (Rente, Miete, Dividenden, Zinsen, Gehalt)
4. Regelmäßige Ausgänge identifizieren (Daueraufträge, Abos, Versicherungsprämien)
5. Auffällige Transaktionen markieren (große Beträge, Überweisungen an Privatpersonen)
6. Hinweise auf weitere Vermögenswerte erkennen (Versicherungsprämien → Versicherung, Depotumsätze → Depot)

WICHTIG für IBAN/Kontonummern: Gib NUR die letzten 4 Ziffern aus, z.B. "****1234".

Antworte ausschließlich als JSON in diesem Format:
{
  "konto_identifikation": {
    "bank": "Bankname falls erkennbar",
    "iban_gekuerzt": "****XXXX",
    "kontoinhaber": "Name falls erkennbar",
    "konto_typ": "Girokonto|Sparkonto|Festgeld|Tagesgeld|Depot|Sonstiges"
  },
  "kontostand_todestag": {
    "betrag_eur": 12345.67,
    "datum": "JJJJ-MM-TT",
    "hinweis": "z.B. Endstand lt. Auszug vom 15.03.2024 — nächster verfügbarer Wert nach Todestag"
  },
  "zeitraum": {"von": "JJJJ-MM", "bis": "JJJJ-MM"},
  "bank": "Bankname falls erkennbar",
  "iban_gekuerzt": "****XXXX",
  "regelmaessige_eingaenge": [
    {"bezeichnung": "z.B. Rente DRV", "betrag_monatlich": 1800.00, "absender": "DRV Mitteldeutschland", "haeufigkeit": "monatlich"}
  ],
  "regelmaessige_ausgaenge": [
    {"bezeichnung": "z.B. Miete", "betrag": 650.00, "empfaenger": "Hausverwaltung XY GmbH", "haeufigkeit": "monatlich", "typ": "miete|versicherung|abo|dauerauftrag|sonstiges"}
  ],
  "auffaellige_transaktionen": [
    {"datum": "JJJJ-MM-TT", "betrag": 5000.00, "beschreibung": "Überweisung", "empfaenger": "Max Mustermann", "auffaelligkeitsgrund": "Ungewöhnlich hoher Einzelbetrag an Privatperson"}
  ],
  "erkannte_vermoegenswerte": [
    {"typ": "versicherung|depot|sparkonto|sonstiges", "anbieter": "Allianz", "hinweis": "Monatliche Prämie 89€ erkannt → Versicherungsvertrag zu ermitteln"}
  ],
  "zusammenfassung": "2-3 Sätze Gesamtbild der finanziellen Situation"
}

KONTOAUSZÜGE:
${texte.join("\n\n")}`;

        let kiErgebnis: Record<string, unknown> | null = null;
        let kiRohtext = "";

        try {
            kiRohtext = await completeText({
                model: DEFAULT_MAIN_MODEL,
                systemPrompt: NLV_SYSTEM_PROMPT,
                user: prompt,
                maxTokens: 8000,
                jsonMode: true,
            });
            // Strip optional ```json ... ``` wrapper
            const stripped = kiRohtext
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```\s*$/, "")
                .trim();
            const match = stripped.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    kiErgebnis = JSON.parse(match[0]) as Record<string, unknown>;
                } catch {
                    // Truncated JSON — salvage the top-level keys that did parse cleanly
                    kiErgebnis = salvageTruncatedJson(match[0]);
                    if (!kiErgebnis) {
                        console.error("[nlv] JSON salvage failed, raw:", kiRohtext.slice(0, 200));
                    }
                }
            } else {
                console.error("[nlv] No JSON object found in KI response:", kiRohtext.slice(0, 200));
            }
        } catch (err) {
            console.error("[nlv] KI call failed:", err);
        }

        const { data: analyse, error } = await db
            .from("nachlassverzeichnis_kontoanalysen")
            .insert({
                matter_id: matterId,
                org_id: access.matter.org_id,
                position_id: positionId,
                dateiname: files.map((f) => f.originalname).join(", "),
                zeitraum_von: todestag ?? null,
                ki_ergebnis: kiErgebnis,
                ki_rohtext: kiRohtext.slice(0, 10000),
                erstellt_von: userId,
            })
            .select()
            .single();

        if (error) return void res.status(500).json({ detail: error.message });

        // Erkannte Vermögenswerte als Positions-Vorschläge
        const vorschlaege = (kiErgebnis?.erkannte_vermoegenswerte as unknown[] ?? []).map((v) => {
            const vv = v as Record<string, unknown>;
            return {
                kategorie: vv.typ === "depot" ? "konto_depot" : vv.typ === "versicherung" ? "versicherung" : "sonstiges",
                bezeichnung: `[Vorschlag] ${vv.anbieter || "Unbekannt"}`,
                notizen: vv.hinweis,
                _ist_vorschlag: true,
            };
        });

        // Vorschlag für das analysierte Konto selbst (mit Kontostand zum Todestag)
        const kontoIdent = kiErgebnis?.konto_identifikation as Record<string, unknown> | undefined;
        const kontostandTodestag = kiErgebnis?.kontostand_todestag as Record<string, unknown> | undefined;
        const kontoVorschlag = kontoIdent ? {
            kategorie: "konto_depot",
            bezeichnung: [
                kontoIdent.konto_typ ?? "Konto",
                kontoIdent.bank ? `· ${kontoIdent.bank}` : "",
                kontoIdent.iban_gekuerzt ? `(${kontoIdent.iban_gekuerzt})` : "",
            ].filter(Boolean).join(" "),
            bank_name: kontoIdent.bank ?? null,
            iban: kontoIdent.iban_gekuerzt ?? null,
            inhaber: kontoIdent.kontoinhaber ?? null,
            geschaetzter_wert: kontostandTodestag?.betrag_eur ?? null,
            notizen: kontostandTodestag
                ? `Kontostand zum Todestag: ${kontostandTodestag.betrag_eur != null ? Number(kontostandTodestag.betrag_eur).toLocaleString("de-DE", { style: "currency", currency: "EUR" }) : "unbekannt"} (${kontostandTodestag.hinweis ?? ""})`
                : null,
            _ist_konto_vorschlag: true,
        } : null;

        res.status(201).json({ analyse, vorschlaege_positionen: vorschlaege, konto_vorschlag: kontoVorschlag });
    },
);

// ---------------------------------------------------------------------------
// GET /:matterId/kontoanalysen — Alle Analysen
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.get("/kontoanalysen", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const { data } = await db
        .from("nachlassverzeichnis_kontoanalysen")
        .select("id, dateiname, zeitraum_von, zeitraum_bis, analysiert_am, ki_ergebnis")
        .eq("matter_id", matterId)
        .order("analysiert_am", { ascending: false });

    res.json(data ?? []);
});

// ---------------------------------------------------------------------------
// Extracts text from uploaded files. For PDFs with no readable text (scans),
// falls back to rendering pages as PNG images for vision-based analysis.
// Returns { texte, imageBase64s } — exactly one will be non-empty.
// ---------------------------------------------------------------------------

// Keywords that indicate genuine Grundbuch/HR text vs. metadata noise
const LEGAL_DOC_KEYWORDS = [
    "grundbuch", "eigentümer", "flurstück", "gemarkung", "abteilung",
    "gesellschaft", "handelsregister", "stammkapital", "geschäftsführer",
    "girokonto", "sparkasse", "kontoinhaber", "iban", "saldo",
    "amtsgericht", "hypothek", "grundschuld",
];

function isSubstantiveText(text: string): boolean {
    const lower = text.toLowerCase();
    const nonWsChars = text.replace(/\s/g, "").length;
    if (nonWsChars < 300) return false;
    // Require at least one legal keyword to distinguish real content from metadata
    return LEGAL_DOC_KEYWORDS.some((kw) => lower.includes(kw));
}

async function extractDocumentContent(files: Express.Multer.File[]): Promise<{
    texte: string[];
    imageBase64s: string[];
}> {
    const texte: string[] = [];
    const allImages: string[] = [];

    for (const file of files) {
        try {
            let text = "";
            if (file.mimetype === "application/pdf") {
                text = await extractPdfText(file.buffer.buffer.slice(file.buffer.byteOffset, file.buffer.byteOffset + file.buffer.byteLength) as ArrayBuffer);
            } else {
                const mammoth = await import("mammoth");
                const r = await mammoth.extractRawText({ buffer: file.buffer });
                text = r.value;
            }

            const substantive = isSubstantiveText(text);

            if (substantive) {
                texte.push(`=== ${file.originalname} ===\n${text.slice(0, 20000)}`);
            } else if (file.mimetype === "application/pdf") {
                const ownedBuf = file.buffer.buffer.slice(
                    file.buffer.byteOffset,
                    file.buffer.byteOffset + file.buffer.byteLength,
                ) as ArrayBuffer;
                const pages = await renderPdfPagesToBase64(ownedBuf, 3);
                allImages.push(...pages);
            }
        } catch (err) {
            console.error(`[nlv/extract] error processing ${file.originalname}:`, err);
        }
    }

    return { texte, imageBase64s: allImages };
}

// ---------------------------------------------------------------------------
// POST /:matterId/grundbuch/analysieren — KI-Grundbuchauszug-Analyse
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.post(
    "/grundbuch/analysieren",
    requireAuth,
    upload.array("datei", 3),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { matterId } = req.params;
        const db = createServerSupabase();

        const access = await getMatterWithAccess(matterId, userId, db);
        if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

        const files = (req.files ?? []) as Express.Multer.File[];
        if (!files.length) return void res.status(400).json({ detail: "Mindestens eine Datei erforderlich" });

        const erblasser = await getErblasserName(matterId, db);

        const { texte, imageBase64s } = await extractDocumentContent(files);

        if (!texte.length && !imageBase64s.length) {
            return void res.status(422).json({ detail: "Kein lesbarer Text und kein darstellbares Bild in den Dateien. Bitte prüfen Sie, ob die PDF-Datei korrekt ist." });
        }

        const jsonSchema = `{
  "grundbuchamt": "z.B. Amtsgericht Bonn",
  "grundbuch_blatt": "z.B. Blatt 1234",
  "gemarkung": "z.B. Gemarkung Beuel",
  "flur_flurstueck": "z.B. Flur 5, Flurstück 123/4",
  "grundstuecksgroesse_qm": 450.0,
  "nutzungsart": "z.B. Wohngebäude, Gartenland, Ackerland",
  "lage_adresse": "z.B. Musterstraße 12, 53111 Bonn",
  "eigentuemer": [{"name": "Name des Eigentümers", "anteil": "z.B. 1/2 Miteigentumsanteil"}],
  "abteilung_ii": {
    "lasten": [{"bezeichnung": "z.B. Wegerecht", "berechtigter": "z.B. Eigentümer Flst. 124", "laufende_nr": "1"}],
    "hinweis": "Zusammenfassung der Belastungen in Abt. II"
  },
  "abteilung_iii": {
    "grundschulden": [{"betrag_eur": 150000.0, "glaeubiger": "z.B. Sparkasse Bonn", "zinssatz_pct": 4.5, "laufende_nr": "1", "status": "eingetragen|gelöscht"}],
    "gesamtbelastung_eur": 150000.0,
    "hinweis": "Alle Grundpfandrechte in Abt. III"
  },
  "besonderheiten": "Erbbaurecht, Vorkaufsrecht, Auflassungsvormerkung, Testamentsvollstreckervermerk etc. — null wenn keine",
  "zusammenfassung": "2-3 Sätze: Art und Lage des Grundstücks, Belastungssituation, erbschaftsrechtliche Relevanz"
}`;

        const promptBase = `Du analysierst einen Grundbuchauszug für das Nachlassverzeichnis des Erblassers ${erblasser}.
AUFGABE: Extrahiere alle rechtlich relevanten Informationen. Antworte ausschließlich als JSON:\n${jsonSchema}`;

        let kiErgebnis: Record<string, unknown> | null = null;
        let kiRohtext = "";

        try {
            if (imageBase64s.length > 0) {
                // Scanned PDF — use vision API
                kiRohtext = await completeVision({
                    systemPrompt: NLV_SYSTEM_PROMPT,
                    user: promptBase + "\n\nDas Dokument liegt als Scan vor. Analysiere die beigefügten Seiten.",
                    imageBase64s,
                    maxTokens: 4000,
                    jsonMode: true,
                });
            } else {
                kiRohtext = await completeText({
                    model: DEFAULT_MAIN_MODEL,
                    systemPrompt: NLV_SYSTEM_PROMPT,
                    user: promptBase + `\n\nGRUNDBUCHAUSZUG:\n${texte.join("\n\n")}`,
                    maxTokens: 4000,
                    jsonMode: true,
                });
            }
            const stripped = kiRohtext.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
            const match = stripped.match(/\{[\s\S]*\}/);
            if (match) {
                try { kiErgebnis = JSON.parse(match[0]) as Record<string, unknown>; }
                catch { kiErgebnis = salvageTruncatedJson(match[0]); }
            }
        } catch (err) {
            return void res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
        }

        // Positions-Vorschlag aus den extrahierten Daten bauen
        const gb = kiErgebnis;
        const abt3 = gb?.abteilung_iii as Record<string, unknown> | undefined;
        const gesamtbelastung = Number(abt3?.gesamtbelastung_eur ?? 0);

        const immobilienVorschlag = gb ? {
            kategorie: "immobilie",
            bezeichnung: [
                gb.nutzungsart ?? "Grundstück/Immobilie",
                gb.lage_adresse ? `· ${gb.lage_adresse}` : "",
            ].filter(Boolean).join(" "),
            adresse: gb.lage_adresse ?? null,
            grundbuch_amt: gb.grundbuchamt ?? null,
            grundbuch_band_blatt: [gb.gemarkung, gb.grundbuch_blatt].filter(Boolean).join(", ") || null,
            grundstuecksflaeche: gb.grundstuecksgroesse_qm ?? null,
            nutzungsart: gb.nutzungsart ?? null,
            notizen: [
                gb.besonderheiten ? `Besonderheiten: ${gb.besonderheiten}` : null,
                gesamtbelastung > 0 ? `Grundschulden/Hypotheken: ${gesamtbelastung.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}` : null,
                gb.zusammenfassung ?? null,
            ].filter(Boolean).join(" | ") || null,
        } : null;

        res.status(201).json({ ki_ergebnis: kiErgebnis, immobilien_vorschlag: immobilienVorschlag, dateiname: files.map((f) => f.originalname).join(", ") });
    },
);

// ---------------------------------------------------------------------------
// POST /:matterId/handelsregister/analysieren — KI-HR-Auszug-Analyse
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.post(
    "/handelsregister/analysieren",
    requireAuth,
    upload.array("datei", 3),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { matterId } = req.params;
        const db = createServerSupabase();

        const access = await getMatterWithAccess(matterId, userId, db);
        if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

        const files = (req.files ?? []) as Express.Multer.File[];
        if (!files.length) return void res.status(400).json({ detail: "Mindestens eine Datei erforderlich" });

        const erblasser = await getErblasserName(matterId, db);

        const { texte, imageBase64s } = await extractDocumentContent(files);

        if (!texte.length && !imageBase64s.length) {
            return void res.status(422).json({ detail: "Kein lesbarer Text und kein darstellbares Bild in den Dateien." });
        }

        const prompt = `Du analysierst einen Handelsregisterauszug für das Nachlassverzeichnis des Erblassers ${erblasser}.

AUFGABE: Extrahiere alle nachlassrelevanten Informationen, insbesondere die Beteiligung des Erblassers.

Antworte ausschließlich als JSON in diesem Format:
{
  "firma": "z.B. Muster GmbH",
  "rechtsform": "GmbH|AG|KG|OHG|GbR|UG|e.K.|sonstiges",
  "registergericht": "z.B. Amtsgericht München",
  "registernummer": "z.B. HRB 12345 oder HRA 678",
  "geschaeftsanschrift": "Straße, PLZ Ort",
  "geschaeftszweck": "Kurzbeschreibung des Unternehmensgegenstands",
  "stammkapital_eur": 25000.00,
  "beteiligung_erblasser": {
    "anteil_pct": 50.0,
    "anteil_beschreibung": "z.B. 12.500 EUR Stammeinlage von 25.000 EUR",
    "nennwert_eur": 12500.00,
    "art": "Geschäftsanteil|Aktien|Kommanditanteil|sonstiges"
  },
  "alle_gesellschafter": [
    {"name": "Name", "anteil_pct": 50.0, "funktion": "Gesellschafter|Kommanditist|Komplementär"}
  ],
  "geschaeftsfuehrer_vorstand": [
    {"name": "Name", "funktion": "Geschäftsführer|Vorstand|Prokurist"}
  ],
  "eintragungsdatum": "JJJJ-MM-TT",
  "letzte_aenderung": "JJJJ-MM-TT",
  "status": "aktiv|aufgelöst|insolvent|gelöscht",
  "besonderheiten": "Vinkulierung, Vorkaufsrecht, Abtretungsbeschränkungen, Testamentsvollstreckervermerk etc. — null wenn keine",
  "zusammenfassung": "2-3 Sätze: Art der Beteiligung, Bewertungshinweise (GmbH-Anteil nicht börsennotiert → Ertragswertmethode), erbschaftsteuerliche Besonderheiten (§ 13b ErbStG Begünstigung prüfen)"
}

WICHTIG: Falls der Erblasser ${erblasser} nicht als Gesellschafter erkennbar ist, setze beteiligung_erblasser auf null und weise in zusammenfassung darauf hin.`;

        let kiErgebnis: Record<string, unknown> | null = null;
        let kiRohtext = "";

        try {
            if (imageBase64s.length > 0) {
                kiRohtext = await completeVision({
                    systemPrompt: NLV_SYSTEM_PROMPT,
                    user: prompt + "\n\nDas Dokument liegt als Scan vor. Analysiere die beigefügten Seiten.",
                    imageBase64s,
                    maxTokens: 3000,
                    jsonMode: true,
                });
            } else {
                kiRohtext = await completeText({
                    model: DEFAULT_MAIN_MODEL,
                    systemPrompt: NLV_SYSTEM_PROMPT,
                    user: prompt + `\n\nHANDELSREGISTERAUSZUG:\n${texte.join("\n\n")}`,
                    maxTokens: 3000,
                    jsonMode: true,
                });
            }
            const stripped = kiRohtext
                .replace(/^```(?:json)?\s*/i, "")
                .replace(/\s*```\s*$/, "")
                .trim();
            const match = stripped.match(/\{[\s\S]*\}/);
            if (match) {
                try {
                    kiErgebnis = JSON.parse(match[0]) as Record<string, unknown>;
                } catch {
                    kiErgebnis = salvageTruncatedJson(match[0]);
                }
            }
        } catch (err) {
            return void res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
        }

        const hr = kiErgebnis;
        const beteiligung = hr?.beteiligung_erblasser as Record<string, unknown> | null | undefined;

        const beteiligungVorschlag = hr ? {
            kategorie: "beteiligung",
            bezeichnung: [hr.firma ?? "Unbekannte Gesellschaft", hr.rechtsform ? `(${hr.rechtsform})` : ""].filter(Boolean).join(" "),
            gesellschaft_name: hr.firma ?? null,
            rechtsform: hr.rechtsform ?? null,
            handelsregister_nr: hr.registernummer ?? null,
            handelsregister_gericht: hr.registergericht ?? null,
            anteil_prozent: beteiligung?.anteil_pct ?? null,
            nennwert: beteiligung?.nennwert_eur ?? null,
            notizen: [
                beteiligung?.anteil_beschreibung ? `Beteiligung: ${beteiligung.anteil_beschreibung}` : null,
                hr.status && hr.status !== "aktiv" ? `Status: ${hr.status}` : null,
                hr.besonderheiten ? `Besonderheiten: ${hr.besonderheiten}` : null,
                hr.zusammenfassung ?? null,
            ].filter(Boolean).join(" | ") || null,
        } : null;

        res.status(201).json({ ki_ergebnis: kiErgebnis, beteiligung_vorschlag: beteiligungVorschlag, dateiname: files.map((f) => f.originalname).join(", ") });
    },
);

// ---------------------------------------------------------------------------
// POST /:matterId/schreiben/ermittlung — Ermittlungsschreiben generieren
// ---------------------------------------------------------------------------

const ERMITTLUNGS_TYPEN: Record<string, { label: string; inhalt: string }> = {
    ermittlung_bank: {
        label: "Auskunftsersuchen Bankkonto",
        inhalt: "alle auf den Erblasser lautenden Konten (Giro-, Spar-, Tages- und Festgeldkonten), Schließfächer sowie etwaige Kreditverbindlichkeiten zum Sterbetag und bitten um Übersendung der Kontoauszüge der letzten 12 Monate",
    },
    ermittlung_depot: {
        label: "Auskunftsersuchen Wertpapierdepot",
        inhalt: "alle auf den Erblasser lautenden Wertpapierdepots, den Depotbestand zum Sterbetag sowie die Umsatzliste der letzten 12 Monate",
    },
    ermittlung_versicherung: {
        label: "Auskunftsersuchen Versicherung",
        inhalt: "alle auf den Erblasser lautenden Versicherungsverträge, die aktuellen Versicherungssummen bzw. Rückkaufswerte zum Sterbetag, die Begünstigungsklauseln sowie etwaige Beleihungsverträge",
    },
    ermittlung_grundbuch: {
        label: "Auskunftsersuchen Grundbuch",
        inhalt: "alle auf den Erblasser eingetragenen Grundbuchpositionen sowie Grundstücke, an denen der Erblasser dinglich berechtigt war",
    },
};

nachlassverzeichnisRouter.post("/schreiben/ermittlung", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const { typ, empfaenger_name, empfaenger_adresse, position_id, sterbetag, zusatzinfo } = req.body ?? {};

    if (!typ || !empfaenger_name) {
        return void res.status(400).json({ detail: "typ und empfaenger_name sind erforderlich" });
    }
    if (!ERMITTLUNGS_TYPEN[typ as string]) {
        return void res.status(400).json({ detail: `Ungültiger typ. Erlaubt: ${Object.keys(ERMITTLUNGS_TYPEN).join(", ")}` });
    }

    const erblasser = await getErblasserName(matterId, db);
    const wbKontext = await buildWissensbasisKontext("erbrecht", access.matter.org_id, db).catch(() => null);
    const sterbetagEffektiv = (sterbetag as string | undefined) || await getSterbedatum(matterId, db);
    const sterbedatum = sterbetagEffektiv ? new Date(sterbetagEffektiv).toLocaleDateString("de-DE") : "[STERBEDATUM EINSETZEN]";
    const typInfo = ERMITTLUNGS_TYPEN[typ as string];

    const prompt = `Erstelle ein professionelles anwaltliches Ermittlungsschreiben für ein Nachlassverzeichnis.

${wbKontext ? wbKontext + "\n\n---\n\n" : ""}

DATEN:
- Erblasser: ${erblasser}
- Sterbedatum: ${sterbedatum}
- Empfänger: ${empfaenger_name}
- Adresse: ${empfaenger_adresse ?? "[ADRESSE EINSETZEN]"}
- Schreibentyp: ${typInfo.label}
- Auskunftsgegenstand: ${typInfo.inhalt}
- Aktenzeichen: ${access.matter.aktenzeichen ?? "[AZ EINSETZEN]"}
${zusatzinfo ? `- Zusätzliche Informationen: ${zusatzinfo}` : ""}

ANFORDERUNGEN:
1. Formeller anwaltlicher Briefkopf-Stil (Datum, Betreff, Anrede, Text, Grußformel)
2. Bitte um Auskunft innerhalb von 14 Tagen ab Zugang
3. Hinweis: Vollmacht/Erbschein liegt bei (als [ANLAGE: Vollmacht/Erbschein] kennzeichnen)
4. Hinweis auf anwaltliche Schweigepflicht / Legitimation
5. Endet mit Kanzlei-Signatur-Platzhalter [UNTERSCHRIFT]

WICHTIG: Kennzeichne das Schreiben am Ende mit "[ENTWURF — Freigabe durch Anwalt erforderlich]"`;

    let entwurf = "";
    try {
        entwurf = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: NLV_SYSTEM_PROMPT,
            user: prompt,
            maxTokens: 1500,
        });
    } catch (err) {
        return void res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
    }

    const betreff = `Nachlass ${erblasser} — ${typInfo.label}`;

    const { data, error } = await db
        .from("nachlassverzeichnis_schreiben")
        .insert({
            matter_id: matterId,
            org_id: access.matter.org_id,
            position_id: position_id ?? null,
            schreiben_typ: typ,
            empfaenger_name: String(empfaenger_name),
            empfaenger_adresse: empfaenger_adresse ?? null,
            betreff,
            entwurf_text: entwurf,
            erstellt_von: userId,
        })
        .select()
        .single();

    if (error) return void res.status(500).json({ detail: error.message });
    res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// POST /:matterId/schreiben/kuendigung — Kündigungsschreiben generieren
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.post("/schreiben/kuendigung", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const { position_id, empfaenger_name, empfaenger_adresse, vertragsnummer, vertragsart, sterbetag, zusatzinfo } = req.body ?? {};

    if (!empfaenger_name || !vertragsart) {
        return void res.status(400).json({ detail: "empfaenger_name und vertragsart sind erforderlich" });
    }

    const erblasser = await getErblasserName(matterId, db);
    const sterbetagEffektiv = (sterbetag as string | undefined) || await getSterbedatum(matterId, db);
    const sterbedatum = sterbetagEffektiv ? new Date(sterbetagEffektiv).toLocaleDateString("de-DE") : "[STERBEDATUM EINSETZEN]";

    // Schreiben-Typ aus Vertragsart ableiten
    const schreibenTyp = String(vertragsart).toLowerCase().includes("versicherung")
        ? "kuendigung_versicherung"
        : String(vertragsart).toLowerCase().includes("kfz")
            ? "kuendigung_kfz"
            : "kuendigung_sonstiges";

    const prompt = `Erstelle ein professionelles anwaltliches Kündigungsschreiben im Rahmen der Nachlassabwicklung.

DATEN:
- Erblasser: ${erblasser}
- Sterbedatum: ${sterbedatum}
- Empfänger/Vertragspartner: ${empfaenger_name}
- Adresse: ${empfaenger_adresse ?? "[ADRESSE EINSETZEN]"}
- Vertragsart: ${vertragsart}
- Vertragsnummer: ${vertragsnummer ?? "[VERTRAGSNUMMER EINSETZEN]"}
- Aktenzeichen: ${access.matter.aktenzeichen ?? "[AZ EINSETZEN]"}
${zusatzinfo ? `- Hinweis: ${zusatzinfo}` : ""}

ANFORDERUNGEN:
1. Formeller anwaltlicher Stil
2. Kündigung zum nächstmöglichen Zeitpunkt (alternativ: zum nächsten ordentlichen Kündigungstermin)
3. Bitte um schriftliche Bestätigung der Kündigung und etwaiger Auszahlungsansprüche
4. Hinweis: Vollmacht/Erbschein liegt bei [ANLAGE: Vollmacht/Erbschein]
5. Bei Versicherungen: Bitte um Angabe des Rückkaufswerts bzw. der Ablaufleistung
6. Endet mit [UNTERSCHRIFT]-Platzhalter

WICHTIG: Kennzeichne mit "[ENTWURF — Freigabe durch Anwalt erforderlich]"`;

    let entwurf = "";
    try {
        entwurf = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: NLV_SYSTEM_PROMPT,
            user: prompt,
            maxTokens: 1200,
        });
    } catch (err) {
        return void res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
    }

    const betreff = `Kündigung ${vertragsart}${vertragsnummer ? ` Nr. ${vertragsnummer}` : ""} — Nachlass ${erblasser}`;

    const { data, error } = await db
        .from("nachlassverzeichnis_schreiben")
        .insert({
            matter_id: matterId,
            org_id: access.matter.org_id,
            position_id: position_id ?? null,
            schreiben_typ: schreibenTyp,
            empfaenger_name: String(empfaenger_name),
            empfaenger_adresse: empfaenger_adresse ?? null,
            betreff,
            entwurf_text: entwurf,
            erstellt_von: userId,
        })
        .select()
        .single();

    if (error) return void res.status(500).json({ detail: error.message });
    res.status(201).json(data);
});

// ---------------------------------------------------------------------------
// GET /:matterId/schreiben — Alle Schreiben
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.get("/schreiben", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const { data } = await db
        .from("nachlassverzeichnis_schreiben")
        .select("*")
        .eq("matter_id", matterId)
        .order("erstellt_am", { ascending: false });

    res.json(data ?? []);
});

// ---------------------------------------------------------------------------
// GET /:matterId/schreiben/:schreibenId — Einzelnes Schreiben
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.get("/schreiben/:schreibenId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId, schreibenId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const { data } = await db
        .from("nachlassverzeichnis_schreiben")
        .select("*")
        .eq("id", schreibenId)
        .eq("matter_id", matterId)
        .maybeSingle();

    if (!data) return void res.status(404).json({ detail: "Schreiben nicht gefunden" });
    res.json(data);
});

// ---------------------------------------------------------------------------
// PATCH /:matterId/schreiben/:schreibenId — Status aktualisieren
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.patch("/schreiben/:schreibenId", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId, schreibenId } = req.params;
    const { status, entwurf_text } = req.body ?? {};
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    // Freigabe nur durch Anwalt
    if (status === "FREIGEGEBEN" && !["Anwalt", "Admin"].includes(access.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt oder Admin kann freigeben" });
    }

    const updates: Record<string, unknown> = {};
    if (status) updates.status = status;
    if (entwurf_text) updates.entwurf_text = entwurf_text;
    if (status === "FREIGEGEBEN") {
        updates.freigegeben_von = userId;
        updates.freigegeben_am = new Date().toISOString();
    }
    if (status === "VERSANDT") {
        updates.versandt_am = new Date().toISOString();
    }

    const { data, error } = await db
        .from("nachlassverzeichnis_schreiben")
        .update(updates)
        .eq("id", schreibenId)
        .eq("matter_id", matterId)
        .select()
        .single();

    if (error || !data) return void res.status(404).json({ detail: error?.message ?? "Schreiben nicht gefunden" });
    res.json(data);
});

// ---------------------------------------------------------------------------
// GET /:matterId/entwurf — Gesamtübersicht / Nachlassverzeichnis-Entwurf
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.get("/entwurf", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const { data: positionen } = await db
        .from("nachlassverzeichnis_positionen")
        .select("*")
        .eq("matter_id", matterId)
        .order("kategorie");

    const erblasser = await getErblasserName(matterId, db);
    const gesamtwert = (positionen ?? []).reduce((sum, p) => sum + (Number(p.geschaetzter_wert) || 0), 0);

    const KATEGORIEN: Record<string, string> = {
        konto_depot: "A. Konten und Depots",
        immobilie: "B. Immobilien",
        beteiligung: "C. Unternehmens­beteiligungen",
        versicherung: "D. Versicherungen",
        sonstiges: "E. Sonstige Vermögens­gegenstände",
    };

    const gruppenweisePositionen = Object.entries(KATEGORIEN).map(([kat, titel]) => ({
        titel,
        positionen: (positionen ?? []).filter((p) => p.kategorie === kat),
    }));

    // KI-Zusammenfassung für Gesamtübersicht
    const wbKontext = await buildWissensbasisKontext("erbrecht", access.matter.org_id, db).catch(() => null);

    const positionenText = gruppenweisePositionen
        .map(({ titel, positionen: pos }) =>
            pos.length
                ? `${titel}:\n${pos.map((p) => `  - ${p.bezeichnung}: ${p.geschaetzter_wert ? `ca. ${Number(p.geschaetzter_wert).toLocaleString("de-DE")} €` : "[Wert nicht erfasst]"}${p.notizen ? ` (${p.notizen})` : ""}`).join("\n")}`
                : `${titel}: (keine Positionen erfasst)`,
        )
        .join("\n\n");

    const prompt = `Erstelle einen strukturierten Nachlassverzeichnis-Entwurf für:

Erblasser: ${erblasser}
Aktenzeichen: ${access.matter.aktenzeichen ?? "[AZ]"}
Geschätzter Gesamtnachlasswert: ca. ${gesamtwert.toLocaleString("de-DE")} €

${wbKontext ? wbKontext + "\n\n---\n\n" : ""}

ERFASSTE VERMÖGENSPOSITIONEN:
${positionenText}

AUFGABE: Erstelle ein vollständiges Nachlassverzeichnis mit:
1. Einleitung (Erblasser, Sterbetag [EINSETZEN], Auftraggeber/Erben [EINSETZEN])
2. Alle 5 Kategorien tabellarisch (auch leere Kategorien als "Keine Positionen ermittelt")
3. Gesamtwert-Übersicht (geschätzte Werte — Hinweis auf Stichtags-Bewertung)
4. Pflichtteilsrelevanz-Hinweis (§ 2311 BGB)
5. Erbschaftsteuerliche Einordnung (§§ 10-12 ErbStG, Freibeträge)
6. Offene Ermittlungspunkte (was noch zu klären ist)
7. Mandantenkommentar zu jeder Kategorie (Erbse-Stil: verständlich, mit Rechtsfolgen)

WICHTIG: "[ENTWURF — Anwaltliche Prüfung und Ergänzung erforderlich]" am Ende.`;

    try {
        const entwurf = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: NLV_SYSTEM_PROMPT,
            user: prompt,
            maxTokens: 4000,
        });
        res.json({
            entwurf,
            erblasser,
            gesamtwert,
            positionen_anzahl: (positionen ?? []).length,
            kategorien: gruppenweisePositionen.map(({ titel, positionen: pos }) => ({
                titel,
                anzahl: pos.length,
                wert: pos.reduce((s, p) => s + (Number(p.geschaetzter_wert) || 0), 0),
            })),
        });
    } catch (err) {
        res.status(500).json({ detail: `KI-Fehler: ${err instanceof Error ? err.message : err}` });
    }
});

// ---------------------------------------------------------------------------
// POST /:matterId/export/docx — Text (Entwurf oder Schreiben) als Word-Datei
// Erzeugt eine .docx aus reinem Text (ein Absatz pro Zeile) und streamt sie
// direkt als Download zurück.
// ---------------------------------------------------------------------------

nachlassverzeichnisRouter.post("/export/docx", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const access = await getMatterWithAccess(matterId, userId, db);
    if (!access) return void res.status(404).json({ detail: "Kein Zugriff" });

    const titel = String(req.body?.titel ?? "Nachlassverzeichnis").trim() || "Nachlassverzeichnis";
    const text = String(req.body?.text ?? "");
    if (!text.trim()) return void res.status(400).json({ detail: "text ist erforderlich" });

    try {
        const { Document, Paragraph, TextRun, HeadingLevel, Packer } = await import("docx");
        const FONT = "Times New Roman";
        const SIZE = 22; // 11pt in half-points

        const absaetze = text.split("\n").map((zeile) =>
            new Paragraph({
                spacing: { after: 120 },
                children: [new TextRun({ text: zeile, font: FONT, size: SIZE })],
            }),
        );

        const doc = new Document({
            sections: [{
                children: [
                    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: titel, font: FONT, bold: true })] }),
                    ...absaetze,
                ],
            }],
        });

        const buf = await Packer.toBuffer(doc);
        const safeName = (titel.replace(/[^a-zA-Z0-9 äöüÄÖÜß_-]/g, "").trim().slice(0, 80) || "Nachlassverzeichnis") + ".docx";
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
        res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(safeName)}"`);
        res.send(buf);
    } catch (err) {
        res.status(500).json({ detail: `DOCX-Fehler: ${err instanceof Error ? err.message : err}` });
    }
});
