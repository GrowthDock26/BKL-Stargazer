/**
 * Deterministisches DOCX-Platzhalter-Füllen für anwaltliche Vorlagen.
 *
 * Reine String-Ersetzung ({{PLATZHALTER}} → Wert) in document.xml/footer/header
 * — kein LLM beteiligt. Geteilt zwischen onboarding.ts (Anschreiben,
 * Honorarvereinbarung, Vollmacht) und der Honorarvereinbarung, die bereits
 * bei Aktenanlage erzeugt wird (routes/matters.ts).
 */

import { downloadFile } from "../storage";

/**
 * Platzhalterwerte landen als Rohtext in einem XML-Textknoten (<w:t>...</w:t>).
 * Ein unescaptes "&" (z.B. in "Schmidt & Töllner GmbH" oder "GmbH & Co. KG" —
 * in deutschen Firmenbezeichnungen allgegenwärtig) macht die XML ungültig;
 * LibreOffice bricht die PDF-Konvertierung dann mit "source file could not
 * be loaded" ab, ohne dass die Ursache im Fehler ersichtlich wird.
 */
function escapeXmlText(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;");
}

/**
 * Sichtbarer Text eines Absatzes — alle <w:t>-Knoten aneinandergehängt.
 *
 * Word zerlegt Text beim Bearbeiten in beliebig viele Läufe (<w:r>): Aus
 * "{{#PAUSCHALE}}" können drei Läufe werden, sobald jemand mittendrin die
 * Rechtschreibprüfung anstößt. Eine Suche im rohen XML fände die Marke dann
 * nicht mehr. Über den zusammengesetzten Text ist sie zuverlässig zu erkennen.
 */
function absatzText(absatzXml: string): string {
    // Das Leerzeichen bzw. das direkte ">" hinter <w:t ist zwingend: Sonst
    // greift das Muster auch auf <w:tab .../> zu — Word setzt Tabulatoren als
    // eigenes Element, und die Vorlage ist voll davon. Der „Text" eines
    // Absatzes bestünde dann zur Hälfte aus XML.
    return [...absatzXml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map((m) => m[1])
        .join("")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">");
}

/**
 * Verarbeitet bedingte Blöcke:
 *
 *     {{#PAUSCHALE}}      ← eigener Absatz
 *     …beliebig viele Absätze…
 *     {{/PAUSCHALE}}      ← eigener Absatz
 *
 * Ist die Bedingung erfüllt, verschwinden nur die beiden Markenabsätze und der
 * Inhalt bleibt stehen. Ist sie es nicht, verschwindet der ganze Block.
 *
 * WICHTIG FÜR DIE VORLAGE: Die Marken müssen allein in ihrem Absatz stehen.
 * Das ist nicht Bequemlichkeit, sondern der Grund, warum es zuverlässig
 * funktioniert: Der Markenabsatz wird immer im Ganzen entfernt, also spielt es
 * keine Rolle, in wie viele Läufe Word die Marke zerlegt hat.
 *
 * Eine Bedingung ohne Gegenstück bleibt unangetastet — lieber eine sichtbare
 * Marke im Dokument als ein stillschweigend halbierter Vertragstext.
 */
export function verarbeiteBedingungen(xml: string, bedingungen: Record<string, boolean>): string {
    if (Object.keys(bedingungen).length === 0) return xml;

    const absaetze = [...xml.matchAll(/<w:p(?:[ >])[\s\S]*?<\/w:p>/g)];
    if (absaetze.length === 0) return xml;

    // Von hinten nach vorn ersetzen, damit die Fundstellen der noch nicht
    // bearbeiteten Absätze gültig bleiben.
    type Schnitt = { von: number; bis: number };
    const zuEntfernen: Schnitt[] = [];

    for (const [name, erfuellt] of Object.entries(bedingungen)) {
        const start = `{{#${name}}}`;
        const ende = `{{/${name}}}`;

        const startIndex = absaetze.findIndex((a) => absatzText(a[0]).includes(start));
        if (startIndex < 0) continue;
        const endeIndex = absaetze.findIndex(
            (a, i) => i > startIndex && absatzText(a[0]).includes(ende),
        );
        if (endeIndex < 0) continue;

        const startAbsatz = absaetze[startIndex];
        const endeAbsatz = absaetze[endeIndex];

        if (erfuellt) {
            // Nur die Markenabsätze entfernen.
            zuEntfernen.push({ von: startAbsatz.index!, bis: startAbsatz.index! + startAbsatz[0].length });
            zuEntfernen.push({ von: endeAbsatz.index!, bis: endeAbsatz.index! + endeAbsatz[0].length });
        } else {
            zuEntfernen.push({ von: startAbsatz.index!, bis: endeAbsatz.index! + endeAbsatz[0].length });
        }
    }

    return zuEntfernen
        .sort((a, b) => b.von - a.von)
        .reduce((text, s) => text.slice(0, s.von) + text.slice(s.bis), xml);
}

export async function fillDocxTemplate(
    templatePath: string,
    placeholders: Record<string, string>,
    /**
     * Bedingte Blöcke: Name → soll der Block im Dokument stehen?
     * Fehlt ein Name hier, bleibt sein Block unverändert im Text.
     */
    bedingungen: Record<string, boolean> = {},
): Promise<Buffer> {
    const { default: JSZip } = await import("jszip");
    const raw = await downloadFile(templatePath);
    if (!raw) throw new Error(`Template nicht gefunden: ${templatePath}`);
    const zip = await JSZip.loadAsync(raw);

    const targets = ["word/document.xml", "word/footer1.xml", "word/header1.xml"];
    for (const target of targets) {
        const file = zip.file(target);
        if (!file) continue;
        let xml = await file.async("string");
        // Erst die Blöcke, dann die Platzhalter: Was ohnehin herausfällt, muss
        // gar nicht befüllt werden — und ein Platzhalter aus einem entfernten
        // Absatz kann so auch nicht als vermeintlich unaufgelöst auffallen.
        xml = verarbeiteBedingungen(xml, bedingungen);
        for (const [key, value] of Object.entries(placeholders)) {
            xml = xml.replaceAll(`{{${key}}}`, escapeXmlText(value));
        }
        zip.file(target, xml);
    }

    return zip.generateAsync({ type: "nodebuffer" });
}
