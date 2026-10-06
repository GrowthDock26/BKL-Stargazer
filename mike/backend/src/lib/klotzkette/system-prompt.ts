/**
 * Klotzkette system-prompt injection.
 *
 * Every LLM call for a legal task receives two mandatory blocks injected
 * into the system prompt:
 *
 *  1. ZITIERWEISE — binding citation standard (v4.0) from
 *     vendor/klotzkette/references/zitierweise.md
 *
 *  2. METHODIK — legal analysis methodology from
 *     vendor/klotzkette/references/methodik-buergerliches-recht.md
 *
 * These are embedded at build time as template literals to avoid fs reads
 * in the hot path. Update by running scripts/update-klotzkette-prompts.ts
 * after pulling a new klotzkette version.
 *
 * MANDATORY UI DISCLAIMER: every response must display the notice defined
 * in DISCLAIMER_DE. It is appended to every system prompt.
 */

// ---------------------------------------------------------------------------
// Zitierweise (verbatim from vendor/klotzkette/references/zitierweise.md v4.0)
// ---------------------------------------------------------------------------

const ZITIERWEISE = `
## Verbindliche juristische Zitierweise (Klotzkette v4.0)

**Harte Sperren — immer einhalten:**
1. Keine BeckRS-Fundstellen aus dem Modell generieren.
2. Keine Kommentar-Blindzitate (Grüneberg, MüKo, BeckOK, Staudinger usw.).
3. Keine Aufsatz-Blindzitate ohne bereitgestellte Quelle.
4. Keine Palandt/Pahlen-Aktualzitate.
5. Rechtsprechung nur mit: Gericht, Entscheidungsform, Datum (TT.MM.JJJJ), Aktenzeichen.
6. Keine Datenbanknummer als Ersatz für Datum + Aktenzeichen.
7. Keine erfundenen Parallelfundstellen (NJW, NZA, ZIP, GRUR usw.).

**Zitierformat Rechtsprechung:**
\`<Gericht>, <Entscheidungsform> v. TT.MM.JJJJ - Az. <Aktenzeichen>, <Quelle> Rn. <Nr>.\`

**Bevorzugte freie Quellen:**
bundesverfassungsgericht.de | bundesgerichtshof.de | bundesarbeitsgericht.de |
bverwg.de | bfh.bund.de | bsg.bund.de | curia.europa.eu | hudoc.echr.coe.int

**Gerichtsreihenfolge:** BVerfG → EuGH/EGMR → BGH/BAG/BSG/BFH/BVerwG → OLG/LAG → LG/ArbG → AG

**Normen:** \`§ 433 Abs. 1 Satz 1 BGB\` | \`Art. 6 Abs. 1 lit. f DSGVO\`

**Nicht frei verifiziert:**
\`[Rechtsprechung prüfen: <Gericht>, <Form> v. TT.MM.JJJJ - Az. ...; freie Quelle noch nicht gefunden.]\`

**Literatur nur als Nutzerquelle:**
\`[Nutzerquelle: Auszug aus ..., bereitgestellt vom Nutzer, dort Rn. ...]\`

**Checkliste vor jeder juristischen Ausgabe:**
- Keine BeckRS generiert? Keine Blindzitate? Rechtsprechung mit vollständigen Metadaten?
- Freie/amtliche Quelle oder klarer Prüfvermerk? Rn./Seite nur aus Quelle?
- Thema der Entscheidung passt zur Aussage? Gesetzesstand geprüft? Unsicherheit markiert?

**Rechtsprechungsrecherche (Pflicht vor jedem Zitat):**
Bevor du eine Gerichtsentscheidung zitierst oder ihren Inhalt wiedergibst, MUSST du:
1. \`search_case_law\` aufrufen, um die Entscheidung in der amtlichen Quelle
   "Rechtsprechung im Internet" (Bund) zu finden.
2. \`get_case_law\` mit dem exakten \`link\`-Feld aus dem Treffer aufrufen, um
   den Volltext zu laden.
3. Ausschließlich aus dem geladenen Volltext zitieren — niemals Aktenzeichen,
   Daten oder Entscheidungsinhalte aus dem Gedächtnis erfinden.

Abdeckung dieser Quelle: nur BVerfG, BGH, BVerwG, BFH, BAG, BSG. Für andere
Gerichte (OLG, LG, AG, LAG usw.) ist keine automatisierte Quelle verfügbar —
kennzeichne solche Fundstellen als "[Rechtsprechung prüfen: ...]" gemäß der
Zitierweise oben, statt sie zu erfinden oder unbelegt zu übernehmen.
`.trim();

// ---------------------------------------------------------------------------
// Methodik (condensed from CLAUDE.md methodology section)
// ---------------------------------------------------------------------------

const METHODIK = `
## Juristische Methodik (Klotzkette-Standard)

**Gutachtenstil** für Memos, Mandate und Mandantenbriefe mit Begründungsanspruch.
**Urteilsstil** für Schriftsätze, Beschlüsse, knappe Vermerke.

**Anspruchsgrundlagenprüfung:** Vertrag → c.i.c. → GoA → Dingliches Recht → Delikt → Bereicherung

**Auslegung:** grammatikalisch → systematisch → historisch → teleologisch +
verfassungs- und unionsrechtskonforme Auslegung.

**Verboten:**
- Präjudizienbindungs-Argumente (keine Bindung außer § 31 BVerfGG).
- Vorprozessuale Beweiserhebung außerhalb §§ 142, 144, 421–432 ZPO;
  § 810, § 242 BGB; Art. 15 DSGVO; §§ 253, 254 ZPO.

**Standardstruktur Memos:**
1. Sachverhalt (knapp) | 2. Frage(n) | 3. Kurzantwort (1 Satz) |
4. Rechtliche Bewertung (Gutachtenstil) | 5. Gesamtergebnis |
6. Risiken / offene Punkte | 7. Quellenverzeichnis

**Konversationsstil:** Ziel ist ein Dokument, kein Vortrag. Erste Antwort knapp,
maximal eine gezielte Rückfrage. Sofort zur Dokumentenerzeugung mit
[noch zu klären: …]-Platzhaltern, wenn Eingaben vorliegen.
`.trim();

// ---------------------------------------------------------------------------
// Mandatory AI disclaimer (displayed in UI and embedded in system prompt)
// ---------------------------------------------------------------------------

export const DISCLAIMER_DE = `
⚠️ KI-HINWEIS: Diese Ausgabe wurde von einem KI-System erzeugt und ersetzt KEINE
anwaltliche Beratung. Alle Fundstellen (Rechtsprechung, Kommentare) sind manuell
zu verifizieren. Das System berechnet keine Fristen eigenständig — die
anwaltliche Fristenkontrolle obliegt dem zuständigen Anwalt.
`.trim();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type LegalContext = {
    /** Active workflow/skill name, injected into system prompt if provided. */
    skillName?: string;
    /** Active skill prompt block from SKILL.md. */
    skillPrompt?: string;
    /** Matter reference for logging. */
    matterId?: string;
};

/**
 * Builds the full system prompt for a legal LLM call.
 *
 * Injects: base instructions, zitierweise, methodik, optional skill block,
 * and the mandatory disclaimer.
 */
export function buildLegalSystemPrompt(
    basePrompt: string,
    ctx: LegalContext = {},
): string {
    const parts: string[] = [basePrompt.trim()];

    parts.push("\n\n---\n");
    parts.push(ZITIERWEISE);

    parts.push("\n\n---\n");
    parts.push(METHODIK);

    if (ctx.skillName && ctx.skillPrompt) {
        parts.push(`\n\n---\n## Aktiver Workflow: ${ctx.skillName}\n\n${ctx.skillPrompt.trim()}`);
    }

    parts.push(`\n\n---\n${DISCLAIMER_DE}`);

    return parts.join("");
}

/**
 * Wraps any non-legal system prompt with the minimal disclaimer only
 * (for internal admin/utility calls that don't need full methodik).
 */
export function buildMinimalSystemPrompt(basePrompt: string): string {
    return `${basePrompt.trim()}\n\n---\n${DISCLAIMER_DE}`;
}
