/**
 * PRE9/PRE10, WF-001 — Versandpaket für einen Interessenten.
 *
 * Stellt die Unterlagen zusammen, die die Kanzlei tatsächlich verschickt, und
 * packt sie als ZIP, das die Mitarbeiterin herunterlädt und ihrer E-Mail
 * anhängt. Dazu kommt der passende Begleittext zum Kopieren.
 *
 * KAMPAGNENABHÄNGIG: Fragebogen und Vollmacht gibt es je Emittentin getrennt —
 * die Vollmacht nennt sie im Betreff („wegen: Schadensersatz ProReal Europa
 * 9/10"). Wer an beidem beteiligt ist, bekommt beide Sätze und einen
 * Begleittext, der von „zwei außergerichtlichen Vollmachten" spricht. Genau
 * darin unterscheiden sich die beiden Emailtexte der Kanzlei.
 *
 * BEWUSST OHNE ABLAGE: Die Dateien werden bei jedem Abruf neu erzeugt und
 * nirgends gespeichert. Ein Interessent ist noch kein Mandant — von jemandem,
 * der sich nie wieder meldet, sollen keine vorbereiteten Schriftstücke in der
 * Ablage liegen bleiben (Art. 5 Abs. 1 lit. c DSGVO). Festgehalten wird nur der
 * Vorgang selbst, im Protokoll des Interessenten.
 */

import JSZip from "jszip";
import { createServerSupabase } from "../supabase";
import { downloadFile } from "../storage";
import { docxToPdf } from "../convert";
import { fillDocxTemplate } from "../matter/docxTemplate";

type Db = ReturnType<typeof createServerSupabase>;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type PreKampagne = "PRE9" | "PRE10" | "PRE9_PRE10" | "UNBEKANNT";

export const KAMPAGNE_LABEL: Record<PreKampagne, string> = {
    PRE9: "ProReal Europa 9",
    PRE10: "ProReal Europa 10",
    PRE9_PRE10: "ProReal Europa 9 und 10",
    UNBEKANNT: "ProReal Europa 9/10 (Beteiligung noch zu klären)",
};

/**
 * Gegenseite und Gegenstand, wie sie in der außergerichtlichen Vollmacht der
 * Kanzlei stehen („in Sachen: … ./. Steurer, P. u.a. — wegen: Schadensersatz
 * ProReal Europa 9/10"). Sie stehen hier, damit Vollmacht und
 * Widerrufsbelehrung dieselbe Bezeichnung tragen; eine abweichende Angabe in
 * zwei Schriftstücken desselben Pakets fällt sonst erst dem Mandanten auf.
 */
const GEGENSEITE = "Steurer, P. u.a.";

function gegenstandFuer(kampagne: PreKampagne): string {
    return `Schadensersatz ProReal Europa ${
        kampagne === "PRE9" ? "9" : kampagne === "PRE10" ? "10" : "9 und 10"
    }`;
}

/**
 * Emittentin(nen), gegen die sich das Mandat richtet — für die
 * Beschränkungsvereinbarung ("…gegen {{EMITTENTIN}} und Prospektverantwortliche").
 * Anders als gegenstandFuer() ist das ein Substantiv mit Artikel, keine
 * "wegen:"-Bezeichnung — deshalb ein eigener Platzhalter statt Wiederverwendung.
 */
function emittentinFuer(kampagne: PreKampagne): string {
    if (kampagne === "PRE9") return "die ProReal Europa 9 GmbH";
    if (kampagne === "PRE10") return "die ProReal Europa 10 GmbH";
    return "die ProReal Europa 9 GmbH und die ProReal Europa 10 GmbH";
}

const GUELTIGE_KAMPAGNEN = ["PRE9", "PRE10", "PRE9_PRE10", "UNBEKANNT"] as const;

type Unterlage = { typ: string; bezeichnung: string };

/**
 * Reihenfolge des Pakets — sie folgt dem Informationsschreiben, das dem
 * Empfänger genau diese Reihenfolge ankündigt: erst die Erklärung, dann was er
 * ausfüllt, dann was er unterschreibt, zuletzt die Information.
 */
export function unterlagenFuerKampagne(kampagne: PreKampagne): Unterlage[] {
    // UNBEKANNT wie PRE9_PRE10 behandeln: solange die Beteiligung nicht
    // geklärt ist, gehen beide Fragebögen/Vollmachten raus — der PRE9-
    // Fragebogen fragt eine etwaige PRE10-Beteiligung ohnehin ausdrücklich ab,
    // schlimmer wäre, das falsche/unvollständige Paket zu raten.
    const beide = kampagne === "PRE9_PRE10" || kampagne === "UNBEKANNT";
    const neun = kampagne === "PRE9" || beide;
    const zehn = kampagne === "PRE10" || beide;

    const liste: Unterlage[] = [
        { typ: "PRE_INFORMATIONSSCHREIBEN", bezeichnung: "Informationsschreiben" },
    ];
    if (neun) liste.push({ typ: "PRE_FRAGEBOGEN_9", bezeichnung: "Fragebogen ProReal Europa 9" });
    if (zehn) liste.push({ typ: "PRE_FRAGEBOGEN_10", bezeichnung: "Fragebogen ProReal Europa 10" });
    if (neun) liste.push({ typ: "PRE_VOLLMACHT_9", bezeichnung: "Vollmacht ProReal Europa 9" });
    if (zehn) liste.push({ typ: "PRE_VOLLMACHT_10", bezeichnung: "Vollmacht ProReal Europa 10" });
    liste.push(
        { typ: "PRE_BESCHRAENKUNGSVEREINBARUNG", bezeichnung: "Beschraenkungsvereinbarung" },
        { typ: "PRE_WIDERRUFSBELEHRUNG", bezeichnung: "Widerrufsbelehrung" },
        { typ: "PRE_DATENSCHUTZ", bezeichnung: "Hinweise zur Datenverarbeitung" },
    );
    return liste;
}

/** Welcher Begleittext gilt — er unterscheidet sich in der Zahl der Vollmachten. */
export function emailtextTypFuerKampagne(kampagne: PreKampagne): string {
    return kampagne === "PRE9_PRE10" || kampagne === "UNBEKANNT"
        ? "PRE_EMAILTEXT_BEIDE"
        : "PRE_EMAILTEXT_EINZELN";
}

export type UnterlagenErgebnis = {
    zip: Buffer;
    dateiname: string;
    /** Was tatsächlich im Paket liegt. */
    enthalten: string[];
    /** Angeforderte Unterlagen ohne hinterlegte Vorlage. */
    fehlendeVorlagen: string[];
    /** Nicht-fatale Probleme, v.a. fehlgeschlagene PDF-Umwandlung. */
    warnungen: string[];
    /** Begleittext der E-Mail zum Kopieren — null, wenn keine Vorlage hinterlegt ist. */
    emailtext: string | null;
};

type Interessent = {
    id: string;
    org_id: string;
    anrede: string | null;
    vorname: string | null;
    nachname: string;
    email: string | null;
    strasse: string | null;
    hausnummer: string | null;
    plz: string | null;
    ort: string | null;
    telefon: string | null;
    rsv_name: string | null;
    rsv_nummer: string | null;
    kampagne: string;
};

/** Dateinamen dürfen keine Umlaute oder Trennzeichen aus dem Namen erben. */
function dateinamenTauglich(text: string): string {
    return (
        text
            .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
            .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue")
            .replace(/ß/g, "ss")
            .replace(/[^A-Za-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 40) || "Interessent"
    );
}

/** Sichtbarer Text eines DOCX — für den Begleittext, der in die E-Mail kommt. */
async function docxAlsText(daten: ArrayBuffer): Promise<string> {
    const zip = await JSZip.loadAsync(daten);
    const datei = zip.file("word/document.xml");
    if (!datei) return "";
    const xml = await datei.async("string");
    return [...xml.matchAll(/<w:p(?:[ >])[\s\S]*?<\/w:p>/g)]
        .map((a) =>
            [...a[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
                .map((m) => m[1])
                .join("")
                .replace(/&amp;/g, "&")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .trim(),
        )
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Nur den Begleittext holen — für die Anzeige neben dem Download, ohne dafür
 * das ganze Paket samt PDF-Umwandlung zu erzeugen.
 */
export async function ladeBegleittext(
    orgId: string,
    kampagne: string,
    db: Db,
): Promise<{ typ: string; text: string | null }> {
    const typ = emailtextTypFuerKampagne(
        (GUELTIGE_KAMPAGNEN.includes(kampagne as PreKampagne) ? kampagne : "UNBEKANNT") as PreKampagne,
    );
    const { data } = await db
        .from("matter_templates")
        .select("storage_path")
        .eq("org_id", orgId)
        .eq("template_type", typ)
        .eq("is_active", true)
        .maybeSingle();
    if (!data) return { typ, text: null };
    const roh = await downloadFile(data.storage_path as string);
    return { typ, text: roh ? await docxAlsText(roh) : null };
}

export async function erzeugeInteressentenUnterlagen(
    interessent: Interessent,
    db: Db,
): Promise<UnterlagenErgebnis> {
    const kampagne = (GUELTIGE_KAMPAGNEN.includes(interessent.kampagne as PreKampagne)
        ? interessent.kampagne
        : "UNBEKANNT") as PreKampagne;

    const gewuenscht = unterlagenFuerKampagne(kampagne);
    const emailtextTyp = emailtextTypFuerKampagne(kampagne);

    const { data: vorlagenZeilen } = await db
        .from("matter_templates")
        .select("template_type, storage_path, mime_type")
        .eq("org_id", interessent.org_id)
        .eq("is_active", true)
        .in("template_type", [...gewuenscht.map((u) => u.typ), emailtextTyp]);

    const vorlagen: Record<string, { pfad: string; mime: string }> = {};
    for (const z of vorlagenZeilen ?? []) {
        vorlagen[z.template_type as string] = {
            pfad: z.storage_path as string,
            mime: (z.mime_type as string) ?? DOCX_MIME,
        };
    }

    const name = [interessent.vorname, interessent.nachname].filter(Boolean).join(" ").trim();
    const adresse = [
        [interessent.strasse, interessent.hausnummer].filter(Boolean).join(" "),
        [interessent.plz, interessent.ort].filter(Boolean).join(" "),
    ]
        .filter(Boolean)
        .join(", ");

    // Was hier noch nicht bekannt ist, bleibt leer — nur so steht am Ende kein
    // unaufgelöstes {{PLATZHALTER}} im Schreiben an den Interessenten.
    const platzhalter: Record<string, string> = {
        DATUM: new Date().toLocaleDateString("de-DE"),
        AKTENZEICHEN: "",
        BEZEICHNUNG: KAMPAGNE_LABEL[kampagne],
        MANDANT_NAME: name || "[Name]",
        MANDANT_ANREDE: interessent.anrede || "Sehr geehrte/r",
        MANDANT_ADRESSE: adresse,
        MANDANT_EMAIL: interessent.email ?? "",
        // Einzelfelder für Formulare, die getrennte Linien haben
        MANDANT_VORNAME: interessent.vorname ?? "",
        MANDANT_NACHNAME: interessent.nachname ?? "",
        MANDANT_STRASSE: [interessent.strasse, interessent.hausnummer].filter(Boolean).join(" "),
        MANDANT_PLZ: interessent.plz ?? "",
        MANDANT_ORT: interessent.ort ?? "",
        MANDANT_TELEFON: interessent.telefon ?? "",
        RSV_NAME: interessent.rsv_name ?? "",
        RSV_NUMMER: interessent.rsv_nummer ?? "",
        // Rubrum — identisch in Vollmacht und Widerrufsbelehrung
        GEGNER: GEGENSEITE,
        GEGENSTAND: gegenstandFuer(kampagne),
        EMITTENTIN: emittentinFuer(kampagne),
        BERATUNGSART_ADJ: "",
        BERATUNGSART_ADJ_DEKLINIERT: "",
        GEBUEHRENORDNUNG: "",
        SACHVERHALT: "",
        SACHBEARBEITER: "",
        STUNDENSATZ_PARTNER: "",
        STUNDENSATZ_ANWALT: "",
        STUNDENSATZ_FACHMITARBEITER: "",
        PAUSCHALE_ZWECK: "",
        PAUSCHALE_BETRAG: "",
        PAUSCHALE_UMFANG: "",
        PAUSCHALE_TURNUS: "",
        PAUSCHALE_FAELLIGKEIT: "",
    };

    const zip = new JSZip();
    const word = zip.folder("Word-Fassungen");
    const enthalten: string[] = [];
    const fehlendeVorlagen: string[] = [];
    const warnungen: string[] = [];

    let nummer = 0;
    for (const unterlage of gewuenscht) {
        const vorlage = vorlagen[unterlage.typ];
        if (!vorlage) {
            fehlendeVorlagen.push(unterlage.bezeichnung);
            continue;
        }
        nummer += 1;
        const basis = `${String(nummer).padStart(2, "0")}_${dateinamenTauglich(unterlage.bezeichnung)}`;

        // PDF-Vorlagen enthalten keine Platzhalter und werden unverändert
        // beigelegt — der Fragebogen PRE10 liegt nur in dieser Form vor.
        if (vorlage.mime === "application/pdf") {
            const roh = await downloadFile(vorlage.pfad);
            if (!roh) {
                warnungen.push(`${unterlage.bezeichnung}: Datei nicht im Speicher gefunden.`);
                nummer -= 1;
                continue;
            }
            zip.file(`${basis}.pdf`, Buffer.from(roh));
            enthalten.push(unterlage.bezeichnung);
            continue;
        }

        let docx: Buffer;
        try {
            // Die Pauschale-Bedingung ist hier immer aus: In diesen Unterlagen
            // kommt der Block nicht vor. Die Angabe hält das Verhalten gleich,
            // falls eine Vorlage später einen bedingten Absatz bekommt.
            docx = await fillDocxTemplate(vorlage.pfad, platzhalter, { PAUSCHALE: false });
        } catch (err) {
            warnungen.push(`${unterlage.bezeichnung}: Vorlage konnte nicht gefüllt werden (${err})`);
            nummer -= 1;
            continue;
        }

        word?.file(`${basis}.docx`, docx);

        try {
            zip.file(`${basis}.pdf`, await docxToPdf(docx));
        } catch (err) {
            // Kein Abbruch: Die Word-Fassung liegt bereits im Paket, und ein
            // fehlendes PDF ist kein Grund, die anderen Unterlagen
            // zurückzuhalten.
            console.error(`[interessent/unterlagen] PDF fehlgeschlagen (${unterlage.typ})`, err);
            warnungen.push(
                `${unterlage.bezeichnung}: PDF-Umwandlung fehlgeschlagen — nur als Word-Datei enthalten.`,
            );
        }

        enthalten.push(unterlage.bezeichnung);
    }

    // Begleittext: bleibt Wortlaut der Kanzlei, deshalb aus der Vorlage gelesen
    // und nicht im Programm festgeschrieben.
    let emailtext: string | null = null;
    const textVorlage = vorlagen[emailtextTyp];
    if (textVorlage) {
        const roh = await downloadFile(textVorlage.pfad);
        if (roh) emailtext = await docxAlsText(roh);
    } else {
        fehlendeVorlagen.push(
            emailtextTyp === "PRE_EMAILTEXT_BEIDE"
                ? "Begleittext (beide Beteiligungen)"
                : "Begleittext (eine Beteiligung)",
        );
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });

    return {
        zip: zipBuffer,
        dateiname: `${kampagne}_${dateinamenTauglich(name || interessent.nachname)}_Unterlagen.zip`,
        enthalten,
        fehlendeVorlagen,
        warnungen,
        emailtext,
    };
}
