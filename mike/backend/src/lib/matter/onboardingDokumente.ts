/**
 * Gemeinsame Erzeugung der Onboarding-Dokumente aus den Kanzleivorlagen.
 *
 * Geteilt zwischen der Aktenanlage (routes/matters.ts über onboardingPaket.ts)
 * und der vollständigen Erzeugung nach dem Aufnahmebogen (routes/onboarding.ts).
 * Vorher lagen beide Wege getrennt vor und liefen auseinander: die Aktenanlage
 * erzeugte nur die Honorarvereinbarung, das Onboarding alle vier Dokumente.
 *
 * ZWEI ZUSAGEN DIESES MODULS:
 *
 * 1. Die bearbeitbare Word-Fassung wird IMMER abgelegt. Der Anwalt passt jedes
 *    dieser Dokumente vor dem Versand an; ein reines PDF wäre für ihn wertlos.
 *
 * 2. Eine fehlgeschlagene PDF-Konvertierung kostet nicht das ganze Dokument.
 *    Die Umwandlung läuft über LibreOffice und ist damit von einem externen
 *    Programm abhängig — fehlt es oder bricht es ab, wird die DOCX zum
 *    Hauptdokument der Akte und die Erzeugung meldet eine Warnung. Vorher
 *    scheiterte in diesem Fall der gesamte Vorgang mit HTTP 500, und in der
 *    Akte lag am Ende gar nichts.
 *
 * Das Füllen der Vorlage selbst ist rein deterministisch (siehe docxTemplate.ts);
 * ein Fehler dabei ist ein Vorlagen-/Konfigurationsfehler und wird geworfen.
 */

import crypto from "crypto";
import { createServerSupabase } from "../supabase";
import { uploadFile } from "../storage";
import { docxToPdf } from "../convert";
import { fillDocxTemplate } from "./docxTemplate";

type Db = ReturnType<typeof createServerSupabase>;

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Vollständiges Onboarding-Paket in der Reihenfolge, in der die Dokumente
 * versandt werden.
 */
export const ONBOARDING_DOKUMENTTYPEN = [
    "ONBOARDING_ANSCHREIBEN",
    "ONBOARDING_HONORARVEREINBARUNG",
    "ONBOARDING_VOLLMACHT",
    "ONBOARDING_WIDERRUFSBELEHRUNG",
] as const;

/**
 * Eigenständig erzeugbare Dokumente außerhalb des Pakets — nicht Teil von
 * ONBOARDING_DOKUMENTTYPEN, damit dokumenteFuerMandat() sie nicht automatisch
 * in jedes Paket aufnimmt.
 *
 * ONBOARDING_VOLLMACHT ist inhaltlich eine außergerichtliche Vollmacht.
 * ONBOARDING_PROZESSVOLLMACHT ist die davon zu unterscheidende gerichtliche
 * Vollmacht (§ 80 ZPO) — wird einzeln über /onboarding/:matterId/prozessvollmacht-vorab
 * erzeugt, unabhängig vom Stand des Aufnahmebogens (siehe onboarding.ts).
 */
export const STANDALONE_DOKUMENTTYPEN = ["ONBOARDING_PROZESSVOLLMACHT"] as const;

export type OnboardingDokumenttyp =
    | (typeof ONBOARDING_DOKUMENTTYPEN)[number]
    | (typeof STANDALONE_DOKUMENTTYPEN)[number];

/**
 * Welche Dokumente für dieses Mandat erzeugt werden.
 *
 * Das Widerrufsrecht der §§ 312 ff., 355 BGB steht nur Verbrauchern (§ 13 BGB)
 * zu. Handelt der Mandant als Unternehmer (§ 14 BGB), entfällt die
 * Widerrufsbelehrung — sie wäre nicht bloß überflüssig, sondern könnte als
 * vertraglich eingeräumtes Widerrufsrecht gelesen werden.
 */
export function dokumenteFuerMandat(unternehmensmandat: boolean): OnboardingDokumenttyp[] {
    return ONBOARDING_DOKUMENTTYPEN.filter(
        (t) => !(unternehmensmandat && t === "ONBOARDING_WIDERRUFSBELEHRUNG"),
    );
}

export type ErzeugtesDokument = {
    type: OnboardingDokumenttyp;
    docId: string;
    hash: string;
    /** false = PDF-Konvertierung fehlgeschlagen, in der Akte liegt nur die DOCX. */
    hatPdf: boolean;
};

export type VorlagenErgebnis = {
    /** Dokumenttyp → storage_path der aktiven Vorlage. */
    vorlagen: Record<string, string>;
    /** Angeforderte Typen ohne aktive Vorlage. */
    fehlend: OnboardingDokumenttyp[];
};

/**
 * Lädt die aktiven Vorlagen der Kanzlei für die angeforderten Dokumenttypen.
 */
export async function ladeAktiveVorlagen(
    orgId: string,
    typen: readonly OnboardingDokumenttyp[],
    db: Db,
): Promise<VorlagenErgebnis> {
    const { data } = await db
        .from("matter_templates")
        .select("template_type, storage_path")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .in("template_type", typen as unknown as string[]);

    const vorlagen: Record<string, string> = {};
    for (const t of data ?? []) {
        vorlagen[t.template_type as string] = t.storage_path as string;
    }
    return { vorlagen, fehlend: typen.filter((t) => !vorlagen[t]) };
}

/**
 * Füllt die Vorlagen, legt die Dateien ab und schreibt je Dokument eine Zeile
 * in matter_documents.
 *
 * Wirft bei Vorlagen- oder Speicherfehlern; PDF-Fehler landen in `warnungen`.
 */
export async function erzeugeOnboardingDokumente(params: {
    matterId: string;
    orgId: string;
    userId: string;
    typen: readonly OnboardingDokumenttyp[];
    /** Dokumenttyp → storage_path, aus ladeAktiveVorlagen(). */
    vorlagen: Record<string, string>;
    platzhalter: Record<string, string>;
    /** Bedingte Vorlagenblöcke, z.B. { PAUSCHALE: false }. */
    bedingungen?: Record<string, boolean>;
    db: Db;
}): Promise<{ dokumente: ErzeugtesDokument[]; warnungen: string[] }> {
    const { matterId, orgId, userId, typen, vorlagen, platzhalter, bedingungen, db } = params;

    const dokumente: ErzeugtesDokument[] = [];
    const warnungen: string[] = [];

    for (const typ of typen) {
        const vorlagenPfad = vorlagen[typ];
        if (!vorlagenPfad) throw new Error(`Keine aktive Vorlage für ${typ}`);

        let docxBuf: Buffer;
        try {
            docxBuf = await fillDocxTemplate(vorlagenPfad, platzhalter, bedingungen ?? {});
        } catch (err) {
            throw new Error(`Vorlage konnte nicht gefüllt werden (${typ}): ${err}`);
        }

        // PDF ist die Versandfassung, aber kein Muss für die Ablage.
        let pdfBuf: Buffer | null = null;
        try {
            pdfBuf = await docxToPdf(docxBuf);
        } catch (err) {
            console.error(`[onboardingDokumente] PDF-Konvertierung fehlgeschlagen (${typ})`, err);
            warnungen.push(
                `${typ}: PDF-Konvertierung fehlgeschlagen — das Dokument liegt als Word-Datei in der Akte. ` +
                    `(${err instanceof Error ? err.message : err})`,
            );
        }

        const zeitstempel = Date.now();
        const basis = `orgs/${orgId}/matters/${matterId}/onboarding/${typ}_${zeitstempel}`;
        const docxPfad = `${basis}.docx`;
        await uploadFile(docxPfad, docxBuf, DOCX_MIME);

        let pdfPfad: string | null = null;
        if (pdfBuf) {
            pdfPfad = `${basis}.pdf`;
            await uploadFile(pdfPfad, pdfBuf, "application/pdf");
        }

        // Ohne PDF wird die DOCX zum Hauptdokument: storage_path ist NOT NULL,
        // und ein Verweis auf eine nie geschriebene PDF-Datei würde beim
        // Herunterladen als "File not found in storage" enden.
        const haupt = pdfBuf ?? docxBuf;
        const hash = crypto.createHash("sha256").update(haupt).digest("hex");

        const { data: doc, error } = await db
            .from("matter_documents")
            .insert({
                matter_id: matterId,
                org_id: orgId,
                filename: `${typ}_${zeitstempel}${pdfBuf ? ".pdf" : ".docx"}`,
                storage_path: pdfPfad ?? docxPfad,
                docx_storage_path: docxPfad,
                file_hash_sha256: hash,
                file_size_bytes: haupt.length,
                mime_type: pdfBuf ? "application/pdf" : DOCX_MIME,
                doc_type: typ,
                uploaded_by: userId,
            })
            .select("id")
            .single();

        if (error || !doc) {
            throw new Error(`Dokument konnte nicht gespeichert werden (${typ}): ${error?.message}`);
        }

        dokumente.push({ type: typ, docId: doc.id as string, hash, hatPdf: pdfBuf !== null });
    }

    return { dokumente, warnungen };
}
