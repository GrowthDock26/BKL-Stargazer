/**
 * Wissensdatenbank-Kontext-Injektion für Agenten.
 *
 * Holt rechtsgebiet-gefilterte Einträge aus der Wissensdatenbank und
 * formatiert sie als Kontext-Block für LLM-System-Prompts.
 *
 * Injektions-Strategie nach dokumenttyp:
 *   muster   → Volltext (bis 5.000 Zeichen) — Erbse braucht die echten Klauseln
 *   hinweis  → Zusammenfassung + Kernaussagen
 *   urteil   → Zusammenfassung + Kernaussagen + Aktenzeichen
 *   aufsatz  → Zusammenfassung + Kernaussagen
 *   kommentar → Zusammenfassung + Kernaussagen
 */

import { createServerSupabase } from "../supabase";

type WissensEintrag = {
    id: string;
    titel: string;
    dokumenttyp: string;
    gericht: string | null;
    aktenzeichen: string | null;
    entscheidungsdatum: string | null;
    ki_zusammenfassung: string | null;
    ki_kernaussagen: string | null;
    extracted_text: string | null;
    /** 'eigenes' | 'beck-online' | 'sonstige-lizenzquelle' */
    quelle: string;
    fundstelle: string | null;
};

const LIZENZIERTE_QUELLEN = new Set(["beck-online", "sonstige-lizenzquelle"]);

const VOLLTEXT_TYPEN = new Set(["muster"]);
const MAX_VOLLTEXT_ZEICHEN = 5000;
const MAX_DOCS = 12;

function formatEintrag(e: WissensEintrag): string {
    const lines: string[] = [];

    // Header
    const meta: string[] = [`[${e.dokumenttyp.toUpperCase()}]`];
    if (e.gericht) meta.push(e.gericht);
    if (e.aktenzeichen) meta.push(`Az. ${e.aktenzeichen}`);
    if (e.entscheidungsdatum) meta.push(e.entscheidungsdatum);
    lines.push(`### ${e.titel}  ${meta.join(" · ")}`);

    // Herkunft — muss vor der Zusammenfassung stehen, damit ein lizenzierter
    // Fremdtext nicht mit kanzleieigenem Material verwechselt wird, sobald der
    // Block irgendwo zitiert oder weiterverarbeitet wird.
    if (LIZENZIERTE_QUELLEN.has(e.quelle)) {
        lines.push(
            `Quelle: ${e.quelle}${e.fundstelle ? ` — ${e.fundstelle}` : ""} ` +
            "(lizenziertes Fremdmaterial — bei Zitaten die Fundstelle nennen, nicht großflächig übernehmen)",
        );
    }

    // Zusammenfassung
    if (e.ki_zusammenfassung) {
        lines.push(e.ki_zusammenfassung);
    }

    // Kernaussagen
    if (e.ki_kernaussagen) {
        try {
            const kk = JSON.parse(e.ki_kernaussagen) as string[];
            if (kk.length) {
                lines.push(...kk.map((k) => `• ${k}`));
            }
        } catch { /* ignore parse error */ }
    }

    // Volltext für Muster
    if (VOLLTEXT_TYPEN.has(e.dokumenttyp) && e.extracted_text?.trim()) {
        const volltext = e.extracted_text.slice(0, MAX_VOLLTEXT_ZEICHEN);
        const gekuerzt = e.extracted_text.length > MAX_VOLLTEXT_ZEICHEN
            ? `\n[… Dokument auf ${MAX_VOLLTEXT_ZEICHEN} Zeichen gekürzt]`
            : "";
        lines.push("\n**Volltext:**\n```\n" + volltext + gekuerzt + "\n```");
    }

    return lines.join("\n");
}

/**
 * Gibt einen fertig formatierten Kontext-Block zurück, der direkt in
 * den LLM-System-Prompt oder die User-Nachricht eingefügt werden kann.
 *
 * @param rechtsgebiet  Ein einzelnes Rechtsgebiet ("erbrecht") ODER ein Array
 *                      mehrerer Rechtsgebiete (für cross-domain Agenten wie Litigation).
 *                      null/undefined = keine Filterung (alle Einträge der Organisation).
 *
 * Gibt null zurück, wenn keine passenden Einträge existieren.
 */
export async function buildWissensbasisKontext(
    rechtsgebiet: string | string[] | null,
    orgId: string,
    db: ReturnType<typeof createServerSupabase>,
): Promise<string | null> {
    let query = db
        .from("wissensdatenbank")
        .select(
            "id, titel, rechtsgebiet, dokumenttyp, gericht, aktenzeichen, entscheidungsdatum, " +
            "ki_zusammenfassung, ki_kernaussagen, extracted_text, quelle, fundstelle",
        )
        .eq("org_id", orgId)
        .order("dokumenttyp", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(MAX_DOCS);

    if (rechtsgebiet !== null && rechtsgebiet !== undefined) {
        const gebiete = Array.isArray(rechtsgebiet) ? rechtsgebiet : [rechtsgebiet];
        query = query.in("rechtsgebiet", gebiete);
    }

    const { data, error } = await query;

    if (error || !data?.length) return null;

    const eintraege = (data as unknown as WissensEintrag[]).filter(
        (e) => e.ki_zusammenfassung?.trim() || e.extracted_text?.trim(),
    );
    if (!eintraege.length) return null;

    const muster = eintraege.filter((e) => e.dokumenttyp === "muster");
    const rest = eintraege.filter((e) => e.dokumenttyp !== "muster");

    const gebieteLabel = rechtsgebiet === null
        ? "alle Rechtsgebiete"
        : Array.isArray(rechtsgebiet) ? rechtsgebiet.join(", ") : rechtsgebiet;

    const teile: string[] = [
        `## Wissensdatenbank — ${gebieteLabel} (${eintraege.length} Einträge)`,
        "",
        "Die folgenden Dokumente sind in der Kanzlei-Wissensdatenbank hinterlegt und " +
        "stehen dir als Arbeitsgrundlage zur Verfügung. Muster-Dokumente sind als " +
        "Volltext verfügbar und sollen VORRANGIG als Formulierungsgrundlage genutzt werden.",
    ];

    if (muster.length) {
        teile.push("", "### Mustertestamente und Vorlagen", "");
        teile.push(...muster.map(formatEintrag));
    }

    if (rest.length) {
        teile.push("", "### Urteile, Aufsätze, Hinweise", "");
        teile.push(...rest.map(formatEintrag));
    }

    return teile.join("\n");
}
