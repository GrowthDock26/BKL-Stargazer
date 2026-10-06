/**
 * E-Mail-Versand über EU-SMTP (nodemailer).
 *
 * Konfiguration via Umgebungsvariablen — kein Hardcoding.
 * SMTP-Server muss in der EU gehostet sein (Datenresidenz-Anforderung).
 *
 * Offener Punkt: Resend (bisherige Mike-Integration) prüfen, ob Daten in
 * der EU verarbeitet werden. Alternativ: Postfix (self-hosted EU),
 * mailcow, Hetzner Mail.
 */

import nodemailer from "nodemailer";

export const smtpEnabled = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS,
);

function createTransporter() {
    return nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? "587"),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });
}

export type OnboardingMailParams = {
    to: string;
    mandantName: string;
    attachments: { filename: string; content: Buffer }[];
    /**
     * Unternehmensmandat (§ 14 BGB): dem Paket liegt keine Widerrufsbelehrung
     * bei. Der Mailtext darf sie dann weder aufzählen noch auf eine
     * Widerrufsfrist verweisen, die es nicht gibt.
     */
    unternehmensmandat?: boolean;
};

/**
 * Sends the onboarding PDFs to the mandant.
 * Returns the SMTP message-id for audit logging.
 */
export async function sendOnboardingMail(params: OnboardingMailParams): Promise<string> {
    const transporter = createTransporter();
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "kanzlei@example.com";

    const zeilen = [
        `Sehr geehrte/r ${params.mandantName},`,
        "",
        "im Anhang erhalten Sie Ihre Mandatsunterlagen:",
        "• Anschreiben",
        "• Vergütungsvereinbarung (bitte unterzeichnen)",
        "• Prozessvollmacht (bitte unterzeichnen)",
    ];
    if (!params.unternehmensmandat) {
        zeilen.push("• Widerrufsbelehrung (zur Information)");
    }
    zeilen.push(
        "",
        "Bitte senden Sie die unterzeichneten Dokumente sowie eine Kopie Ihres",
        "gültigen Personalausweises oder Reisepasses zurück (§§ 10 ff. GwG).",
    );
    if (!params.unternehmensmandat) {
        zeilen.push(
            "",
            "Sollen wir bereits vor Ablauf der Widerrufsfrist für Sie tätig werden,",
            "bitten wir zusätzlich um die unterschriebene Erklärung zum vorzeitigen",
            "Beginn der Leistung aus der Widerrufsbelehrung.",
        );
    }
    zeilen.push(
        "",
        "⚠️ HINWEIS: Dieses Schreiben wurde mit Unterstützung eines KI-Systems erstellt " +
            "und vom zuständigen Anwalt freigegeben.",
        "",
        "Mit freundlichen Grüßen",
    );

    const info = await transporter.sendMail({
        from,
        to: params.to,
        subject: "Ihre Mandatsunterlagen — Bitte unterzeichnen und zurücksenden",
        text: zeilen.join("\n"),
        attachments: params.attachments.map((a) => ({
            filename: a.filename,
            content: a.content,
        })),
    });

    return (info.messageId as string) ?? "";
}

// ---------------------------------------------------------------------------
// Fristen-Benachrichtigung (intern)
//
// Geht ausschließlich an kanzleiinterne Adressen (Sammeladresse des
// Sekretariats und/oder der zuständige Anwalt). Enthält Aktenzeichen und
// Kurzbezeichnung, weil die Nachricht ohne diese Angaben nicht zuordenbar und
// damit wertlos wäre. FRISTEN_NOTIFY_EMAIL darf deshalb nur auf interne
// Postfächer zeigen — nie auf Mandanten- oder Gegnerseite.
// ---------------------------------------------------------------------------

export type FristenMailAnlass = "erinnerung" | "ablauf";

export type FristenMailParams = {
    to: string[];
    anlass: FristenMailAnlass;
    typ: string;
    fristende: string;          // ISO
    notiz?: string | null;
    aktenzeichen?: string | null;
    bezeichnung: string;
    /** Bei Erwiderungsfristen: Akte wurde zur Klagevorbereitung markiert. */
    eskalationsHinweis?: boolean;
};

export async function sendFristenMail(params: FristenMailParams): Promise<string> {
    const transporter = createTransporter();
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "kanzlei@example.com";

    const fristDe = new Date(`${params.fristende}T00:00:00`).toLocaleDateString("de-DE");
    const akte = [params.aktenzeichen, params.bezeichnung].filter(Boolean).join(" — ");

    const istAblauf = params.anlass === "ablauf";
    const subject = istAblauf
        ? `FRIST ABGELAUFEN: ${params.typ} — ${akte} (${fristDe})`
        : `Fristerinnerung: ${params.typ} — ${akte} (fällig ${fristDe})`;

    const zeilen = [
        istAblauf
            ? `Die folgende Frist ist am ${fristDe} abgelaufen:`
            : `Die folgende Frist läuft am ${fristDe} ab:`,
        "",
        `Akte:      ${akte || "(ohne Bezeichnung)"}`,
        `Fristart:  ${params.typ}`,
        `Fristende: ${fristDe}`,
        ...(params.notiz ? [`Notiz:     ${params.notiz}`] : []),
        "",
        istAblauf
            ? "Bitte umgehend prüfen, welche Maßnahme erforderlich ist."
            : "Bitte prüfen, ob die erforderliche Maßnahme veranlasst ist.",
    ];

    if (params.eskalationsHinweis) {
        zeilen.push(
            "",
            "Die Akte wurde automatisch zur Klagevorbereitung markiert. Ein Klageentwurf",
            "wurde dabei NICHT erzeugt — die Klageschrift ist gesondert zu fertigen.",
        );
    }

    zeilen.push(
        "",
        "---",
        "Automatische Nachricht aus BKL Legal OS. Diese Benachrichtigung ist ein",
        "technisches Hilfsmittel und ersetzt die anwaltliche Fristenkontrolle nicht",
        "(§ 43 BRAO). Bitte weiterhin den Fristenkalender führen.",
    );

    const info = await transporter.sendMail({
        from,
        to: params.to,
        subject,
        text: zeilen.join("\n"),
    });

    return (info.messageId as string) ?? "";
}

export type AnspruchMailParams = {
    to: string;
    mandantName: string;
    attachment: { filename: string; content: Buffer };
    fristende: string;
};

export async function sendAnspruchMail(params: AnspruchMailParams): Promise<string> {
    const transporter = createTransporter();
    const from = process.env.SMTP_FROM ?? process.env.SMTP_USER ?? "kanzlei@example.com";

    const info = await transporter.sendMail({
        from,
        to: params.to,
        subject: "Anspruchsschreiben / Geltendmachung",
        text: [
            `Sehr geehrte/r ${params.mandantName},`,
            "",
            "im Anhang übermitteln wir Ihnen das Anspruchsschreiben.",
            `Reaktionsfrist: ${params.fristende}`,
            "",
            "⚠️ KI-HINWEIS: Dieses Schreiben wurde mit KI-Unterstützung erstellt und " +
            "vom zuständigen Anwalt geprüft und freigegeben.",
            "",
            "Mit freundlichen Grüßen",
        ].join("\n"),
        attachments: [
            {
                filename: params.attachment.filename,
                content: params.attachment.content,
            },
        ],
    });

    return (info.messageId as string) ?? "";
}
