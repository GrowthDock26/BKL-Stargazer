/**
 * Rechtsprechung-Recherche — Anbindung an die offizielle Bund-Quelle
 * „Rechtsprechung im Internet" (Entscheidungen der obersten Bundesgerichte).
 *
 * Endpoints:
 *   GET  /rechtsprechung/suche    — ToC durchsuchen (Gericht, Az, Datum)
 *   POST /rechtsprechung/import   — Entscheidung laden, KI-zusammenfassen und
 *                                   in die Kanzlei-Wissensdatenbank übernehmen
 *
 * Der Import landet als dokumenttyp='urteil' in der Wissensdatenbank und steht
 * damit automatisch der Assistentin über buildWissensbasisKontext zur Verfügung.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { completeText, DEFAULT_MAIN_MODEL } from "../lib/llm";
import { sucheRechtsprechung, ladeEntscheidung } from "../lib/rechtsprechung/rechtsprechung-im-internet";
import { runSearchCaseLaw } from "../lib/legalSourcesTools/rechtsprechungTools";

export const rechtsprechungRouter = Router();

const RECHTSGEBIETE = [
    "erbrecht", "kapitalmarktrecht", "arbeitsrecht",
    "gesellschaftsrecht", "allgemein", "kapitalmarkt", "litigation",
];

async function getOrgId(userId: string, db: ReturnType<typeof createServerSupabase>) {
    const { data } = await db
        .from("org_members")
        .select("org_id")
        .eq("user_id", userId)
        .limit(1)
        .maybeSingle();
    return data?.org_id as string | null;
}

// ---------------------------------------------------------------------------
// GET /rechtsprechung/suche
// ---------------------------------------------------------------------------

rechtsprechungRouter.get("/suche", requireAuth, async (req, res) => {
    const { q, gericht, von, bis, limit } = req.query;
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : undefined);

    // Mit Suchbegriff läuft dieselbe Logik wie im Chat: Volltext über beide
    // Quellen (Bund + Instanzgerichte), damit HTTP-Aufruf und Assistentin nicht
    // unterschiedliche Ergebnisse liefern. Ohne Suchbegriff bleibt es beim
    // Metadaten-Browsing der Bund-Quelle — die Instanzquelle kennt keine Suche
    // ohne Suchbegriff.
    const suchbegriff = str(q);
    if (suchbegriff) {
        const { toolContent } = await runSearchCaseLaw({
            q: suchbegriff,
            gericht: str(gericht),
            von: str(von),
            bis: str(bis),
            limit: typeof limit === "string" ? parseInt(limit, 10) || undefined : undefined,
        });
        const ergebnis = JSON.parse(toolContent) as Record<string, unknown>;
        if (ergebnis.error) return void res.status(502).json({ detail: ergebnis.error });
        return void res.json(ergebnis);
    }

    try {
        const treffer = await sucheRechtsprechung({
            gericht: str(gericht),
            von: str(von),
            bis: str(bis),
            limit: typeof limit === "string" ? parseInt(limit, 10) || undefined : undefined,
        });
        res.json({ anzahl: treffer.length, treffer });
    } catch (err) {
        res.status(502).json({ detail: `Quelle nicht erreichbar: ${err instanceof Error ? err.message : err}` });
    }
});

// ---------------------------------------------------------------------------
// POST /rechtsprechung/import
// ---------------------------------------------------------------------------

rechtsprechungRouter.post("/import", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { link, rechtsgebiet } = req.body ?? {};

    if (!link || typeof link !== "string") {
        return void res.status(400).json({ detail: "link ist erforderlich" });
    }
    const gebiet = typeof rechtsgebiet === "string" ? rechtsgebiet : "allgemein";
    if (!RECHTSGEBIETE.includes(gebiet)) {
        return void res.status(400).json({ detail: `rechtsgebiet muss einer von: ${RECHTSGEBIETE.join(", ")} sein` });
    }

    const db = createServerSupabase();
    const orgId = await getOrgId(userId, db);
    if (!orgId) return void res.status(403).json({ detail: "Keine Organisation gefunden" });

    // Entscheidung von der Quelle laden (Host-Allowlist greift in der Lib)
    let ent;
    try {
        ent = await ladeEntscheidung(link);
    } catch (err) {
        return void res.status(502).json({ detail: `Entscheidung konnte nicht geladen werden: ${err instanceof Error ? err.message : err}` });
    }
    if (!ent.volltext.trim()) {
        return void res.status(422).json({ detail: "Entscheidung enthält keinen lesbaren Text" });
    }

    const titel = ent.titelzeile?.trim()
        || [ent.gericht, ent.aktenzeichen, ent.entscheidungsdatum ? `vom ${ent.entscheidungsdatum}` : ""]
            .filter(Boolean).join(" ").trim()
        || "Gerichtsentscheidung";

    // Duplikate vermeiden (gleiches Az + Datum in derselben Organisation)
    if (ent.aktenzeichen && ent.entscheidungsdatum) {
        const { data: vorhanden } = await db
            .from("wissensdatenbank")
            .select("id")
            .eq("org_id", orgId)
            .eq("aktenzeichen", ent.aktenzeichen)
            .eq("entscheidungsdatum", ent.entscheidungsdatum)
            .maybeSingle();
        if (vorhanden) {
            return void res.status(409).json({ detail: "Diese Entscheidung ist bereits in der Wissensdatenbank.", id: vorhanden.id });
        }
    }

    // KI-Zusammenfassung + Kernaussagen + Schlagwörter
    let kiZusammenfassung = "";
    let kiKernaussagen = "";
    let schlagwoerter: string[] = [];
    try {
        const kopf = [
            ent.gericht && `Gericht: ${ent.gericht}${ent.spruchkoerper ? `, ${ent.spruchkoerper}` : ""}`,
            ent.doktyp && `Art: ${ent.doktyp}`,
            ent.aktenzeichen && `Az: ${ent.aktenzeichen}`,
            ent.entscheidungsdatum && `Datum: ${ent.entscheidungsdatum}`,
            ent.normen && `Normen: ${ent.normen}`,
        ].filter(Boolean).join("\n");
        const analyse = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt:
                "Du bist ein juristischer Assistent. Antworte ausschließlich als JSON. " +
                "Keine Erklärungen, kein Markdown außer im JSON.",
            user:
                `Analysiere folgende Gerichtsentscheidung und antworte als JSON:\n` +
                `{\n` +
                `  "zusammenfassung": "3-4 Sätze: Sachverhalt, Rechtsfrage, Entscheidung",\n` +
                `  "kernaussagen": ["Leitsatz/Kernaussage 1", "Kernaussage 2", "Kernaussage 3"],\n` +
                `  "schlagwoerter": ["Begriff1", "Begriff2", "Begriff3"]\n` +
                `}\n\n${kopf}\n\nEntscheidung:\n${ent.volltext.slice(0, 12000)}`,
            // gemini-2.5-pro (DEFAULT_MAIN_MODEL) kann sein Reasoning-Budget
            // vor dem sichtbaren Text ausschöpfen, wenn max_tokens zu niedrig
            // ist (verifiziert: 400 lieferte nur "{\n" zurück). 3000 lässt
            // genug Spielraum für Reasoning + Text.
            maxTokens: 3000,
            jsonMode: true,
        });
        const match = analyse.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]) as {
                zusammenfassung?: string; kernaussagen?: string[]; schlagwoerter?: string[];
            };
            kiZusammenfassung = parsed.zusammenfassung ?? "";
            kiKernaussagen = JSON.stringify(parsed.kernaussagen ?? []);
            schlagwoerter = Array.isArray(parsed.schlagwoerter) ? parsed.schlagwoerter.slice(0, 12) : [];
        }
    } catch { /* KI-Fehler ignorieren — Entscheidung trotzdem speichern */ }

    const { data, error } = await db
        .from("wissensdatenbank")
        .insert({
            org_id: orgId,
            titel: titel.slice(0, 500),
            rechtsgebiet: gebiet,
            dokumenttyp: "urteil",
            gericht: ent.gericht,
            aktenzeichen: ent.aktenzeichen,
            entscheidungsdatum: ent.entscheidungsdatum,
            storage_path: ent.quelleUrl, // Provenienz statt Datei-Upload
            extracted_text: ent.volltext.slice(0, 50000),
            ki_zusammenfassung: kiZusammenfassung || null,
            ki_kernaussagen: kiKernaussagen || null,
            schlagwoerter: schlagwoerter.length ? schlagwoerter : null,
            mime_type: "application/xml",
            file_size_bytes: Buffer.byteLength(ent.volltext, "utf8"),
            uploaded_by: userId,
        })
        .select("id, titel, rechtsgebiet, dokumenttyp, gericht, aktenzeichen, entscheidungsdatum, ki_zusammenfassung")
        .single();

    if (error) return void res.status(500).json({ detail: error.message });
    res.status(201).json({ ...data, quelle: ent.quelleUrl });
});
