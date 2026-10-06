/**
 * Automatischer erster Schritt nach Aktenanlage — für alle Kategorien:
 *
 *   1. Das vollständige Onboarding-Paket aus den Kanzleivorlagen — Anschreiben,
 *      Honorarvereinbarung (§ 3a RVG), Vollmacht (§ 80 ZPO) und, außer bei
 *      einem Unternehmensmandat, die Widerrufsbelehrung. Deterministisches
 *      Template-Fill, kein LLM (eine Vorlage darf nicht durch KI-Ausgabe
 *      verändert werden). Jedes Dokument liegt als bearbeitbare Word-Datei vor.
 *   2. Begleitmail-Entwurf — die KI verfasst NUR den Text der E-Mail. Wird als
 *      Entwurf gespeichert, NICHT automatisch versandt (Versand bleibt Teil des
 *      Onboarding-Freigabe-/Versand-Ablaufs in onboarding.ts).
 *
 * Diese Fassung entsteht VOR dem Aufnahmebogen: Adresse, Geburtsdatum und die
 * Honorarparameter sind noch nicht bekannt und bleiben leer. Sie ist die
 * Arbeitsgrundlage des Anwalts, nicht die Versandfassung — die entsteht in
 * onboarding.ts, sobald die Aufnahme abgeschlossen ist. Welches Dokument der
 * Anwalt am Ende verwendet, entscheidet er selbst; deshalb wird das Paket
 * vollständig erzeugt und nicht auf die Honorarvereinbarung verkürzt.
 *
 * Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO): An LOGICC gehen ein Pseudonym
 * und die Anfrage-Kurzbeschreibung, keine Namens-, Geburts- oder Adressfelder.
 * Das ist KEINE Anonymisierung — die Anfrage-Kurzbeschreibung ist ein freies
 * Textfeld und kann Klarnamen enthalten. Rechtsgrundlage ist daher der AVV mit
 * LOGICC (Art. 28 DSGVO) und § 43e BRAO.
 */

import { createServerSupabase } from "../supabase";
import { completeText, DEFAULT_MAIN_MODEL } from "../llm";
import { buildLegalSystemPrompt } from "../klotzkette/system-prompt";
import { pseudonymisiere } from "./anonymize";
import {
    dokumenteFuerMandat,
    erzeugeOnboardingDokumente,
    ladeAktiveVorlagen,
    ONBOARDING_DOKUMENTTYPEN,
    type OnboardingDokumenttyp,
} from "./onboardingDokumente";

/** Nur die vier Pakettypen — nicht der volle OnboardingDokumenttyp-Union, denn
 *  dokumenteFuerMandat() liefert nie den eigenständigen Prozessvollmacht-Typ. */
type PaketDokumenttyp = (typeof ONBOARDING_DOKUMENTTYPEN)[number];

type Db = ReturnType<typeof createServerSupabase>;

const KATEGORIE_LABEL: Record<string, string> = {
    erbrecht: "Erbrecht",
    gesellschaftsrecht: "Gesellschaftsrecht",
    kapitalmarktrecht: "Kapitalmarktrecht",
    pro_real: "Pro Real Mandat",
    steuerrecht: "Steuerrecht",
    sonstiges: "sonstiges Beratungsmandat",
};

const TYP_LABEL: Record<PaketDokumenttyp, string> = {
    ONBOARDING_ANSCHREIBEN: "Anschreiben",
    ONBOARDING_HONORARVEREINBARUNG: "Honorarvereinbarung",
    ONBOARDING_VOLLMACHT: "Vollmacht",
    ONBOARDING_WIDERRUFSBELEHRUNG: "Widerrufsbelehrung",
};

/**
 * Fester Rücksendungs-Passus, der an jeden Begleitmail-Entwurf angehängt wird.
 *
 * Bewusst NICHT dem LLM überlassen: welche Unterlagen zurückkommen müssen, ist
 * eine feste Anforderung des Mandatsablaufs (Vollmacht § 80 ZPO,
 * Vergütungsvereinbarung § 3a RVG, Ausweiskopie §§ 10 ff. GwG). Ein Modell,
 * das den Passus in einem von zwanzig Fällen weglässt, würde unbemerkt
 * unvollständige Rückläufe produzieren.
 *
 * Der Widerrufs-Absatz entfällt beim Unternehmensmandat: dort liegt dem Paket
 * keine Widerrufsbelehrung bei, und ein Verweis auf ein nicht beigefügtes
 * Dokument ist schlimmer als gar keiner.
 */
function ruecksendungsPassus(unternehmensmandat: boolean): string {
    const zeilen = [
        "Bitte senden Sie uns hierzu die folgenden Unterlagen zurück:",
        "",
        "1. die beigefügte Vollmacht — unterschrieben,",
        "2. die beigefügte Vergütungs-/Mandatsvereinbarung — unterschrieben,",
        "3. eine Kopie Ihres gültigen Personalausweises oder Reisepasses.",
        "",
        "Die Ausweiskopie benötigen wir zur Erfüllung unserer gesetzlichen",
        "Identifizierungspflichten (§§ 10 ff. Geldwäschegesetz). Ihre Daten werden",
        "ausschließlich zu diesem Zweck verwendet und vertraulich behandelt.",
    ];

    if (!unternehmensmandat) {
        zeilen.push(
            "",
            "Ebenfalls beigefügt ist die Widerrufsbelehrung. Sie dient Ihrer Information",
            "und muss nicht zurückgesandt werden. Wenn wir bereits vor Ablauf der",
            "Widerrufsfrist für Sie tätig werden sollen, bitten wir zusätzlich um die",
            "unterschriebene 'Erklärung zum vorzeitigen Beginn der Leistung' aus diesem",
            "Dokument.",
        );
    }

    zeilen.push(
        "",
        "Eine Rücksendung per E-Mail genügt zunächst; das Original bitten wir",
        "anschließend auf dem Postweg nachzureichen.",
    );

    return zeilen.join("\n");
}

export type OnboardingPaketResult =
    | {
          ok: true;
          dokumente: { typ: OnboardingDokumenttyp; doc_id: string; hat_pdf: boolean }[];
          /** Angeforderte Dokumente ohne hinterlegte Vorlage — im UI als Hinweis anzeigen. */
          fehlende_vorlagen: OnboardingDokumenttyp[];
          /** Nicht-fatale Probleme, v.a. fehlgeschlagene PDF-Konvertierung. */
          warnungen: string[];
          begleitmail_betreff: string;
          begleitmail_text: string;
          /**
           * Gesetzt, wenn der KI-Entwurf des Begleittexts fehlgeschlagen ist und
           * der Platzhalter-Text greift. Vorher wurde dieser Fehler nur in die
           * Server-Konsole geschrieben — der Anwender sah stillschweigend
           * "[Begleittext bitte manuell ergänzen]" (Befund 5.3).
           */
          begleitmail_warnung?: string;
      }
    | { ok: false; hinweis: string };

export async function generateOnboardingPaketUndBegleitmail(params: {
    matterId: string;
    orgId: string;
    bezeichnung: string;
    aktenzeichen: string | null;
    kategorie: string;
    anfrage: string | null;
    mandantName: string | null;
    unternehmensmandat: boolean;
    userId: string;
    db: Db;
}): Promise<OnboardingPaketResult> {
    const {
        matterId,
        orgId,
        bezeichnung,
        aktenzeichen,
        kategorie,
        anfrage,
        mandantName,
        unternehmensmandat,
        userId,
        db,
    } = params;

    const gewuenscht = dokumenteFuerMandat(unternehmensmandat);
    const { vorlagen, fehlend } = await ladeAktiveVorlagen(orgId, gewuenscht, db);
    const zuErzeugen = gewuenscht.filter((t) => vorlagen[t]);

    if (zuErzeugen.length === 0) {
        return {
            ok: false,
            hinweis:
                "Keine Onboarding-Vorlagen hinterlegt — bitte unter „Vorlagen“ hochladen. " +
                "Die Akte wurde trotzdem angelegt.",
        };
    }

    const today = new Date().toLocaleDateString("de-DE");
    const platzhalter: Record<string, string> = {
        DATUM: today,
        AKTENZEICHEN: aktenzeichen ?? "",
        BEZEICHNUNG: bezeichnung,
        MANDANT_NAME: mandantName?.trim() || "[Mandant]",
        MANDANT_ANREDE: "Sehr geehrte/r",
        MANDANT_ADRESSE: "",
        MANDANT_EMAIL: "",
        // Diese Voranlage entsteht vor Aufnahmebogen und Honorarmodell-Wahl —
        // die eigentliche, vollständig befüllte Fassung entsteht erst über
        // onboarding.ts nach Abschluss der Aufnahme. Leere Fallbacks statt
        // fehlender Keys, damit kein unaufgelöster {{...}}-Platzhalter stehen bleibt.
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
        // Ohne Pauschale faellt der Block ohnehin heraus; die Werte stehen nur
        // hier, damit kein unaufgeloester Platzhalter uebrig bleiben kann.
        PAUSCHALE_TURNUS: "",
        PAUSCHALE_FAELLIGKEIT: "",
    };

    let dokumente: { typ: OnboardingDokumenttyp; doc_id: string; hat_pdf: boolean }[];
    let warnungen: string[];
    try {
        const ergebnis = await erzeugeOnboardingDokumente({
            matterId,
            orgId,
            userId,
            typen: zuErzeugen,
            vorlagen,
            platzhalter,
            // Bei der Aktenanlage ist noch nicht besprochen, ob es eine
            // Pauschale gibt — der Absatz entfällt. Wird eine vereinbart, wird
            // sie im Erzeugen-Dialog gesetzt und das Paket neu erzeugt.
            bedingungen: { PAUSCHALE: false },
            db,
        });
        dokumente = ergebnis.dokumente.map((d) => ({
            typ: d.type,
            doc_id: d.docId,
            hat_pdf: d.hatPdf,
        }));
        warnungen = ergebnis.warnungen;
    } catch (err) {
        return { ok: false, hinweis: err instanceof Error ? err.message : String(err) };
    }

    // Begleitmail-Entwurf: NUR der E-Mail-Text ist LLM-generiert, die Dokumente
    // selbst bleiben unverändert deterministisch.
    const pseudonym = pseudonymisiere(matterId);
    let betreff = `Mandatsunterlagen — ${bezeichnung}`;
    let text = "[Begleittext bitte manuell ergänzen]";
    let llmFehler: string | null = null;
    try {
        const kategorieLabel = KATEGORIE_LABEL[kategorie] ?? kategorie;
        const raw = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: buildLegalSystemPrompt(
                "Du bist ein deutschsprachiger Rechtsanwalt-Assistent. Verfasse den " +
                    "Entwurf einer kurzen, höflichen Begleit-E-Mail, die dem Mandanten " +
                    "die Mandatsunterlagen übermittelt. Antworte " +
                    "ausschließlich als JSON: {\"betreff\": \"...\", \"text\": \"...\"}. " +
                    "Verwende 'der Mandant'/'Sie' statt eines Namens (Platzhalter " +
                    "[Anrede] am Anfang). Kein Briefkopf, keine Signatur, keine " +
                    "rechtliche Bewertung — nur die Begleitzeilen. Zähle NICHT auf, " +
                    "welche Unterlagen zurückzusenden sind — dieser Abschnitt wird " +
                    "anschließend automatisch angefügt.",
            ),
            user:
                `Mandat-Referenz: ${pseudonym}\n` +
                `Rechtsgebiet/Kategorie: ${kategorieLabel}\n` +
                `Kurzbezeichnung: ${bezeichnung}\n` +
                `Beigefügte Unterlagen: ${dokumente.map((d) => TYP_LABEL[d.typ as PaketDokumenttyp] ?? d.typ).join(", ")}\n` +
                `Anfrage/Kontext: ${anfrage?.trim() || "(nicht angegeben)"}`,
            // gemini-2.5-pro (DEFAULT_MAIN_MODEL) verbraucht bei niedrigem
            // max_tokens sein Reasoning-Budget vollständig, bevor der
            // sichtbare JSON-Text beginnt — 400 lieferte in der Praxis nur
            // "{\n" zurück. 3000 lässt genug Spielraum für Reasoning + Text.
            maxTokens: 3000,
            jsonMode: true,
        });
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
            const parsed = JSON.parse(match[0]) as { betreff?: string; text?: string };
            if (parsed.betreff?.trim()) betreff = parsed.betreff.trim();
            if (parsed.text?.trim()) text = parsed.text.trim();
        }
    } catch (err) {
        console.error("[onboardingPaket] Begleitmail-Entwurf fehlgeschlagen", err);
        llmFehler = err instanceof Error ? err.message : String(err);
    }

    // Rücksendungs-Passus deterministisch anhängen — unabhängig davon, ob der
    // LLM-Entwurf gelungen ist oder der Fallback-Text greift.
    text = `${text}\n\n${ruecksendungsPassus(unternehmensmandat)}`;

    await db
        .from("matters")
        .update({ begleitmail_betreff: betreff, begleitmail_text: text, updated_at: new Date().toISOString() })
        .eq("id", matterId);

    await db.from("audit_log").insert({
        org_id: orgId,
        entity_type: "matter",
        entity_id: matterId,
        action: "onboarding_paket_begleitmail_erzeugt",
        actor_id: userId,
        model_id: DEFAULT_MAIN_MODEL,
        details: {
            dokumente: dokumente.map((d) => d.typ),
            unternehmensmandat,
            fehlende_vorlagen: fehlend,
        },
    });

    return {
        ok: true,
        dokumente,
        fehlende_vorlagen: fehlend,
        warnungen,
        begleitmail_betreff: betreff,
        begleitmail_text: text,
        ...(llmFehler
            ? {
                  begleitmail_warnung:
                      "Der KI-Entwurf des Begleittexts ist fehlgeschlagen — die E-Mail enthält nur " +
                      "den Platzhalter und den Rücksendungs-Abschnitt. Bitte den Einleitungstext " +
                      `manuell ergänzen. (Ursache: ${llmFehler})`,
              }
            : {}),
    };
}
