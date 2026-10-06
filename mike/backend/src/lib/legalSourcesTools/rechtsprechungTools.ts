/**
 * Chat-Tools für die deutsche Rechtsprechungsrecherche.
 *
 * Bindet zwei Quellen als vom Modell aufrufbare Tools ein, damit die
 * Assistentin Gerichtsentscheidungen während eines Chats selbst recherchieren
 * und wörtlich zitieren kann — statt Aktenzeichen oder Entscheidungsinhalte
 * aus dem Gedächtnis zu erfinden:
 *
 *   1. „Rechtsprechung im Internet" (Bund, amtlich) — BVerfG, BGH, BVerwG,
 *      BFH, BAG, BSG.
 *   2. Open Legal Data (ODbL) — Instanzgerichte: OLG, LG, AG, VG, LAG, LSG.
 *
 * Beide werden bei jeder Volltextsuche parallel abgefragt und die Treffer
 * zusammengeführt; jeder Treffer trägt seine Quelle. Fällt eine Quelle aus,
 * liefert die andere trotzdem — mit sichtbarem Hinweis, dass die Recherche
 * unvollständig ist. Ein stiller Teilausfall wäre hier das gefährlichste
 * Ergebnis: Er sieht aus wie „dazu gibt es nichts".
 *
 * Diese Datei enthält sowohl die Tool-Schemas (für den Streaming-Chat in
 * chatTools.ts) als auch eine wiederverwendbare Dispatch-Logik + einen
 * Non-Streaming-Tool-Loop (`completeWithCaseLaw`) für die Single-Shot-
 * Spezialisten-Routen (erbrecht.ts, litigation.ts), die keinen SSE-Stream
 * an den Client haben.
 */

import { streamChatWithTools } from "../llm";
import type {
    NormalizedToolCall,
    NormalizedToolResult,
    OpenAIToolSchema,
} from "../llm";
import {
    sucheRechtsprechung,
    volltextsucheRechtsprechung,
    ladeEntscheidung,
    type RspVolltextTreffer,
} from "../rechtsprechung/rechtsprechung-im-internet";
import {
    sucheInstanzRechtsprechung,
    ladeInstanzEntscheidung,
    istInstanzLink,
    OLD_ATTRIBUTION,
} from "../rechtsprechung/open-legal-data";

export const RECHTSPRECHUNG_TOOLS = [
    {
        type: "function",
        function: {
            name: "search_case_law",
            description:
                "Durchsucht die deutsche Rechtsprechung in zwei Quellen gleichzeitig: die amtliche Bund-Quelle 'Rechtsprechung im Internet' (BVerfG, BGH, BVerwG, BFH, BAG, BSG) und Open Legal Data (Instanzgerichte: OLG, LG, AG, VG, LAG, LSG). Mit 'q' wird der VOLLTEXT der Entscheidungen durchsucht (echte Stichwortsuche, z.B. Rechtsbegriffe, Normen, Sachverhalte) — nutze dies für inhaltliche Rechercheanfragen; nur dieser Weg erreicht die Instanzgerichte. Ohne 'q' wird ausschließlich die Bund-Quelle nach Gericht/Zeitraum durchsucht (Metadaten-Browsing, z.B. 'aktuelle BGH-Entscheidungen im Juni'). Gib IMMER zuerst dieses Tool ein, bevor du eine Gerichtsentscheidung zitierst oder ihren Inhalt beschreibst. Jeder Treffer trägt ein Feld 'quelle' ('bund' oder 'instanz'); Instanz-Treffer sind nicht-amtliche Fassungen und ihr Aktenzeichen in der Trefferliste ist rekonstruiert — verbindlich wird es erst durch get_case_law.",
            parameters: {
                type: "object",
                properties: {
                    q: {
                        type: "string",
                        description:
                            "Volltext-Suchbegriffe (echte Stichwortsuche über den Entscheidungstext, z.B. 'Mogelpackung Fertigpackung' oder 'Kündigungsfrist Kenntnis'). Empfohlen für inhaltliche Fragen — ohne 'q' findet man nur über Gericht/Zeitraum, nicht über Rechtsthemen.",
                    },
                    gericht: {
                        type: "string",
                        description:
                            "Gericht als Teilstring, z.B. 'BGH', 'BAG', 'BFH', 'BVerfG', 'BVerwG', 'BSG' oder bei Instanzgerichten 'Oberlandesgericht', 'OLG Köln', 'Landgericht'. Filtert die Treffer zusätzlich zu 'q', oder dient allein zum Browsen ohne 'q'.",
                    },
                    von: {
                        type: "string",
                        description:
                            "Frühestes Entscheidungsdatum (ISO yyyy-mm-dd), inklusiv.",
                    },
                    bis: {
                        type: "string",
                        description:
                            "Spätestes Entscheidungsdatum (ISO yyyy-mm-dd), inklusiv.",
                    },
                    limit: {
                        type: "integer",
                        description:
                            "Maximale Trefferzahl (Default 20 bei Volltextsuche / 50 bei Metadaten-Browsing).",
                    },
                },
            },
        },
    },
    {
        type: "function",
        function: {
            name: "get_case_law",
            description:
                "Lädt den Volltext einer Gerichtsentscheidung anhand des exakten 'link'-Felds aus einem search_case_law-Treffer. Liefert Leitsatz, Tenor, Tatbestand, Entscheidungsgründe und angewandte Normen. Zitiere ausschließlich aus diesem geladenen Text — niemals aus dem Gedächtnis.",
            parameters: {
                type: "object",
                properties: {
                    link: {
                        type: "string",
                        description:
                            "Der exakte 'link'-Wert (ZIP-URL) aus einem vorherigen search_case_law-Treffer.",
                    },
                },
                required: ["link"],
            },
        },
    },
];

// ---------------------------------------------------------------------------
// Geteilte Dispatch-Logik (genutzt von chatTools.ts und completeWithCaseLaw)
// ---------------------------------------------------------------------------

export type CaseLawSearchArgs = {
    q?: string;
    gericht?: string;
    von?: string;
    bis?: string;
    limit?: number;
};

export type CaseLawSearchOutcome = {
    query: string;
    gericht?: string;
    total: number;
    /** true = echte Volltextsuche, false = reines Metadaten-Browsing (kein 'q') */
    volltext?: boolean;
};

export type CaseLawReadOutcome = {
    link: string;
    titel: string;
    gericht: string | null;
    aktenzeichen: string | null;
    entscheidungsdatum: string | null;
    ecli: string | null;
    quelleUrl: string;
    error?: boolean;
};

export async function runSearchCaseLaw(
    args: CaseLawSearchArgs,
): Promise<{ toolContent: string; outcome: CaseLawSearchOutcome }> {
    const { q, gericht } = args;

    // Mit Suchbegriff: echte Volltextsuche über den Entscheidungstext.
    // Ohne Suchbegriff: reines Metadaten-Browsing nach Gericht/Zeitraum
    // (das ToC enthält keinen Volltext, ein leerer Suchbegriff würde bei
    // der Suchmaske ohnehin 0 Treffer liefern).
    if (q && q.trim()) {
        // Beide Quellen parallel. allSettled statt all: Der Ausfall einer
        // Quelle darf die Recherche nicht auf null setzen — er muss aber
        // sichtbar bleiben, sonst liest sich ein Teilausfall wie „dazu gibt es
        // keine Rechtsprechung".
        const [bund, instanz] = await Promise.allSettled([
            volltextsucheRechtsprechung({
                query: q,
                gericht: args.gericht,
                von: args.von,
                bis: args.bis,
                limit: args.limit,
            }),
            sucheInstanzRechtsprechung({
                query: q,
                gericht: args.gericht,
                von: args.von,
                bis: args.bis,
                limit: args.limit,
            }),
        ]);

        const bundTreffer: RspVolltextTreffer[] =
            bund.status === "fulfilled" ? bund.value.treffer : [];
        const instanzTreffer = instanz.status === "fulfilled" ? instanz.value.treffer : [];

        const fehler: string[] = [];
        if (bund.status === "rejected") {
            fehler.push(
                `Bund-Quelle (BVerfG/BGH/BVerwG/BFH/BAG/BSG) nicht erreichbar: ${fehlertext(bund.reason)}`,
            );
        }
        if (instanz.status === "rejected") {
            fehler.push(`Instanzgerichte (Open Legal Data) nicht erreichbar: ${fehlertext(instanz.reason)}`);
        }

        if (fehler.length === 2) {
            return {
                toolContent: JSON.stringify({ error: fehler.join(" | ") }),
                outcome: { query: q, gericht, total: 0, volltext: true },
            };
        }

        const gesamttreffer =
            (bund.status === "fulfilled" ? bund.value.gesamttreffer : 0) +
            (instanz.status === "fulfilled" ? instanz.value.gesamttreffer : 0);

        // Nach Datum absteigend mischen: Bei einer Rechtsfrage ist die jüngere
        // Entscheidung in aller Regel die interessantere, unabhängig davon, aus
        // welcher Quelle sie stammt.
        const treffer = [
            ...bundTreffer.map((t) => ({ ...t, quelle: "bund" as const })),
            ...instanzTreffer,
        ].sort((a, b) => (b.entscheidungsdatum ?? "").localeCompare(a.entscheidungsdatum ?? ""));

        return {
            toolContent: JSON.stringify({
                gesamttreffer,
                zurueckgegeben: treffer.length,
                treffer,
                ...(fehler.length ? { teilausfall: fehler } : {}),
                hinweis:
                    "Volltextsuche über beide Quellen — 'vorschau' zeigt den Fundstellenkontext, 'quelle' die Herkunft. " +
                    "Rufe get_case_law mit dem exakten 'link'-Feld auf, bevor du zitierst. " +
                    `Bei Treffern mit quelle='instanz' ist die Fassung nicht amtlich (${OLD_ATTRIBUTION}) und das ` +
                    "Aktenzeichen der Trefferliste rekonstruiert — nenne es erst nach dem Laden der Entscheidung." +
                    (fehler.length
                        ? " ACHTUNG: Eine Quelle war nicht erreichbar, die Recherche ist unvollständig — weise darauf hin."
                        : ""),
            }),
            outcome: {
                query: q,
                gericht,
                total: gesamttreffer,
                volltext: true,
            },
        };
    }

    try {
        const treffer = await sucheRechtsprechung(args);
        return {
            toolContent: JSON.stringify({
                anzahl: treffer.length,
                treffer,
                hinweis:
                    "Dies ist reines Metadaten-Browsing ohne Suchbegriff (kein Volltext-Abgleich). Für inhaltliche Fragen 'q' setzen. Rufe get_case_law mit dem exakten 'link'-Feld eines Treffers auf, um den Volltext zu laden, bevor du zitierst.",
            }),
            outcome: { query: "", gericht, total: treffer.length, volltext: false },
        };
    } catch (err) {
        return {
            toolContent: JSON.stringify({
                error: `Quelle nicht erreichbar: ${err instanceof Error ? err.message : String(err)}`,
            }),
            outcome: { query: "", gericht, total: 0, volltext: false },
        };
    }
}

function fehlertext(reason: unknown): string {
    return reason instanceof Error ? reason.message : String(reason);
}

export async function runGetCaseLaw(
    link: string,
): Promise<{ toolContent: string; outcome: CaseLawReadOutcome }> {
    // Die Quelle steckt im Link selbst (Host), deshalb bleibt die
    // Werkzeugschnittstelle zum Modell bei einem einzigen Feld.
    if (istInstanzLink(link)) {
        try {
            const e = await ladeInstanzEntscheidung(link);
            const titel =
                [e.gericht, e.aktenzeichen, e.entscheidungsdatum ? `vom ${e.entscheidungsdatum}` : ""]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "Gerichtsentscheidung";
            return {
                toolContent: JSON.stringify({
                    quelle: "instanz",
                    gericht: e.gericht,
                    entscheidungsdatum: e.entscheidungsdatum,
                    aktenzeichen: e.aktenzeichen,
                    doktyp: e.doktyp,
                    ecli: e.ecli,
                    volltext: e.volltext.slice(0, 25000),
                    quelleUrl: e.quelleUrl,
                    attribution: e.attribution,
                    zitierhinweis: `${e.gericht ?? ""}, ${e.doktyp ?? "Entscheidung"} v. ${e.entscheidungsdatum ?? "?"} - Az. ${e.aktenzeichen ?? "?"}`,
                    warnung:
                        "Nicht-amtliche Fassung (Open Legal Data, ODbL). Maßgeblich ist die Ausfertigung des Gerichts — " +
                        "weise bei der Verwendung in einem Schriftsatz darauf hin.",
                }),
                outcome: {
                    link,
                    titel,
                    gericht: e.gericht,
                    aktenzeichen: e.aktenzeichen,
                    entscheidungsdatum: e.entscheidungsdatum,
                    ecli: e.ecli,
                    quelleUrl: e.quelleUrl,
                },
            };
        } catch (err) {
            return {
                toolContent: JSON.stringify({
                    error: `Entscheidung konnte nicht geladen werden: ${fehlertext(err)}`,
                }),
                outcome: {
                    link,
                    titel: "Fehler",
                    gericht: null,
                    aktenzeichen: null,
                    entscheidungsdatum: null,
                    ecli: null,
                    quelleUrl: link,
                    error: true,
                },
            };
        }
    }

    try {
        const ent = await ladeEntscheidung(link);
        const titel =
            ent.titelzeile?.trim() ||
            [
                ent.gericht,
                ent.aktenzeichen,
                ent.entscheidungsdatum ? `vom ${ent.entscheidungsdatum}` : "",
            ]
                .filter(Boolean)
                .join(" ")
                .trim() ||
            "Gerichtsentscheidung";
        const outcome: CaseLawReadOutcome = {
            link,
            titel,
            gericht: ent.gericht,
            aktenzeichen: ent.aktenzeichen,
            entscheidungsdatum: ent.entscheidungsdatum,
            ecli: ent.ecli,
            quelleUrl: ent.quelleUrl,
        };
        return {
            toolContent: JSON.stringify({
                gericht: ent.gericht,
                spruchkoerper: ent.spruchkoerper,
                entscheidungsdatum: ent.entscheidungsdatum,
                aktenzeichen: ent.aktenzeichen,
                doktyp: ent.doktyp,
                ecli: ent.ecli,
                normen: ent.normen,
                titelzeile: ent.titelzeile,
                leitsatz: ent.leitsatz,
                volltext: ent.volltext.slice(0, 25000),
                quelleUrl: ent.quelleUrl,
                zitierhinweis: `${ent.gericht ?? ""}, ${ent.doktyp ?? "Entscheidung"} v. ${ent.entscheidungsdatum ?? "?"} - Az. ${ent.aktenzeichen ?? "?"}`,
            }),
            outcome,
        };
    } catch (err) {
        return {
            toolContent: JSON.stringify({
                error: `Entscheidung konnte nicht geladen werden: ${err instanceof Error ? err.message : String(err)}`,
            }),
            outcome: {
                link,
                titel: link,
                gericht: null,
                aktenzeichen: null,
                entscheidungsdatum: null,
                ecli: null,
                quelleUrl: link,
                error: true,
            },
        };
    }
}

// ---------------------------------------------------------------------------
// Non-Streaming Tool-Loop für Single-Shot-Routen (kein SSE an den Client)
// ---------------------------------------------------------------------------

/**
 * Wie completeText, aber mit search_case_law/get_case_law als aufrufbaren
 * Tools. Für Routen ohne SSE-Stream (erbrecht.ts, litigation.ts), die bisher
 * nur einen einzelnen completeText-Call absetzen konnten. Sammelt die
 * gefundenen/gelesenen Entscheidungen zusätzlich zum Antworttext ein, damit
 * die Route sie als Quellenangabe mit ausliefern kann.
 */
export async function completeWithCaseLaw(params: {
    model: string;
    systemPrompt: string;
    user: string;
    maxIterations?: number;
}): Promise<{
    text: string;
    caseLawSearched: CaseLawSearchOutcome[];
    caseLawRead: CaseLawReadOutcome[];
}> {
    let text = "";
    const caseLawSearched: CaseLawSearchOutcome[] = [];
    const caseLawRead: CaseLawReadOutcome[] = [];

    await streamChatWithTools({
        model: params.model,
        systemPrompt: params.systemPrompt,
        messages: [{ role: "user", content: params.user }],
        tools: RECHTSPRECHUNG_TOOLS as OpenAIToolSchema[],
        maxIterations: params.maxIterations ?? 6,
        callbacks: {
            onContentDelta: (delta) => {
                text += delta;
            },
        },
        runTools: async (calls: NormalizedToolCall[]) => {
            const results: NormalizedToolResult[] = [];
            for (const c of calls) {
                if (c.name === "search_case_law") {
                    const { toolContent, outcome } = await runSearchCaseLaw(
                        c.input as CaseLawSearchArgs,
                    );
                    caseLawSearched.push(outcome);
                    results.push({ tool_use_id: c.id, content: toolContent });
                } else if (c.name === "get_case_law") {
                    const link =
                        typeof c.input.link === "string" ? c.input.link : "";
                    const { toolContent, outcome } = await runGetCaseLaw(link);
                    caseLawRead.push(outcome);
                    results.push({ tool_use_id: c.id, content: toolContent });
                } else {
                    results.push({
                        tool_use_id: c.id,
                        content: JSON.stringify({
                            error: `Tool '${c.name}' ist hier nicht verfügbar.`,
                        }),
                    });
                }
            }
            return results;
        },
    });

    return { text, caseLawSearched, caseLawRead };
}
