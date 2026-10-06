/**
 * Onboarding document generation and dispatch (§§ 3a RVG, 80 ZPO).
 *
 * 7.2 — Generates the onboarding package from DOCX templates:
 *   (a) Anschreiben
 *   (b) Honorarvereinbarung (§ 3a RVG — separate document, clearly labelled)
 *   (c) Prozessvollmacht (§ 80 ZPO)
 *   (d) Widerrufsbelehrung — entfällt beim Unternehmensmandat (§ 14 BGB),
 *       weil das Widerrufsrecht der §§ 312 ff., 355 BGB nur Verbrauchern
 *       (§ 13 BGB) zusteht.
 *
 * Jedes Dokument wird als PDF (Versandfassung) UND als bearbeitbare DOCX
 * abgelegt — siehe lib/matter/onboardingDokumente.ts.
 *
 * 7.3 — Sends the PDFs via EU-SMTP to the mandant's e-mail.
 *
 * CONSTRAINTS:
 *  - Template fill is deterministic (placeholder substitution only).
 *  - LLM (LOGICC) is used ONLY for the variable Sachverhalt passage in the
 *    Anschreiben, not for the Honorarvereinbarung or Vollmacht text.
 *  - Review gate before dispatch (configurable, default: ON).
 *  - § 3a Abs. 1 Satz 1 RVG: Honorarvereinbarung must be a separate document
 *    and be clearly labelled "Vergütungsvereinbarung".
 */

import { Router } from "express";
import crypto from "crypto";
import multer from "multer";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { downloadFile, uploadFile } from "../lib/storage";
import { completeText, DEFAULT_MAIN_MODEL } from "../lib/llm";
import { buildLegalSystemPrompt } from "../lib/klotzkette/system-prompt";
import { sendOnboardingMail, smtpEnabled } from "../lib/mail";
import { pseudonymisiere } from "../lib/matter/anonymize";
import { docxToPdf as _docxToPdfLib } from "../lib/convert";
import {
    dokumenteFuerMandat,
    erzeugeOnboardingDokumente,
    ladeAktiveVorlagen,
    type ErzeugtesDokument,
    type OnboardingDokumenttyp,
} from "../lib/matter/onboardingDokumente";

// mergeParams allows access to :matterId from parent router
export const onboardingRouter = Router({ mergeParams: true });

type Db = ReturnType<typeof createServerSupabase>;

const REVIEW_GATE_ENABLED =
    process.env.ONBOARDING_REVIEW_GATE !== "false"; // default: ON

const docxToPdf = _docxToPdfLib;

// ---------------------------------------------------------------------------
// Beratungsart + Stundensätze — steuern die Mandatsvereinbarung/Honorar-
// vereinbarung-Vorlage (rechtliche/steuerliche/beide Beratung, § 3a-Sätze).
// Werden vom Frontend als Abfrage VOR der Erzeugung eingeholt, nicht vom LLM
// entschieden — reine Textbaustein-Auswahl, keine Rechtsbewertung.
// ---------------------------------------------------------------------------

type Beratungsart = "rechtlich" | "steuerlich" | "beides" | "pro_real";

const BERATUNGSARTEN: Beratungsart[] = ["rechtlich", "steuerlich", "beides", "pro_real"];

type Honorarmodell = "stundensatz" | "rvg";

const HONORARMODELLE: Honorarmodell[] = ["stundensatz", "rvg"];

function resolveBeratungsartPlaceholders(art: Beratungsart): Record<string, string> {
    // ProReal-Mandate nutzen dieselben Textbausteine wie "rechtlich" — der
    // einzige Unterschied ist das (stets erzwungene) RVG-Honorarmodell.
    if (art === "rechtlich" || art === "pro_real") {
        return {
            BERATUNGSART_ADJ: "rechtliche",
            BERATUNGSART_ADJ_DEKLINIERT: "rechtlichen",
            GEBUEHRENORDNUNG: "Rechtsanwaltsvergütungsgesetz (RVG) nebst Vergütungsverzeichnis (VV RVG)",
        };
    }
    if (art === "steuerlich") {
        return {
            BERATUNGSART_ADJ: "steuerliche",
            BERATUNGSART_ADJ_DEKLINIERT: "steuerlichen",
            GEBUEHRENORDNUNG: "Steuerberater-Vergütungsverordnung (StBVV)",
        };
    }
    return {
        BERATUNGSART_ADJ: "rechtliche und steuerliche",
        BERATUNGSART_ADJ_DEKLINIERT: "rechtlichen und steuerlichen",
        GEBUEHRENORDNUNG:
            "Rechtsanwaltsvergütungsgesetz (RVG) nebst Vergütungsverzeichnis (VV RVG) sowie anstelle der Steuerberater-Vergütungsverordnung (StBVV)",
    };
}

/**
 * Fälligkeit der Pauschale. Zwei Formen, weil die Vorlage beide braucht:
 * das Adjektiv im Vertragssatz („eine jährliche Pauschale") und das Adverb in
 * der Abrechnungsklausel („wird jährlich fakturiert"). Eine einzige Form würde
 * an einer der beiden Stellen falsches Deutsch ergeben.
 */
const PAUSCHALE_TURNUS = {
    monatlich:        { adjektiv: "monatliche",        adverb: "monatlich" },
    vierteljaehrlich: { adjektiv: "vierteljährliche",  adverb: "vierteljährlich" },
    halbjaehrlich:    { adjektiv: "halbjährliche",     adverb: "halbjährlich" },
    jaehrlich:        { adjektiv: "jährliche",         adverb: "jährlich" },
} as const;

type PauschaleTurnus = keyof typeof PAUSCHALE_TURNUS;

function istTurnus(wert: unknown): wert is PauschaleTurnus {
    return typeof wert === "string" && wert in PAUSCHALE_TURNUS;
}

const STUNDENSATZ_DEFAULT = {
    partner: 375,
    anwalt: 350,
    fachmitarbeiter: 160,
};

function formatEuroDE(n: number): string {
    return n.toFixed(2).replace(".", ",");
}

function parseStundensatz(raw: unknown, fallback: number): number {
    const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : fallback;
}

// ---------------------------------------------------------------------------
// POST /onboarding/:matterId/generate — generate all three PDFs
//
// Body (JSON): beratungsart ("rechtlich" | "steuerlich" | "beides" | "pro_real",
// Pflicht), honorarmodell ("stundensatz" | "rvg", optional, Default
// "stundensatz" — bei beratungsart "pro_real" serverseitig immer "rvg";
// reine Metadaten-Angabe, reines RVG-Mandat nutzt dieselbe Honorarvereinbarung-
// Vorlage wie Stundensatzmandate und wird vor Versand manuell angepasst),
// stundensatz_partner, stundensatz_anwalt, stundensatz_fachmitarbeiter
// (optional, Default 375/350/160 EUR) — steuern die Mandatsvereinbarung/
// Honorarvereinbarung-Vorlage. Werden VOR der Erzeugung im UI abgefragt.
// ---------------------------------------------------------------------------

onboardingRouter.post("/generate", requireAuth, async (req, res) => {
    console.log("[onboarding/generate] DEBUG hit", { matterId: req.params.matterId, body: req.body });
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const beratungsart = (req.body?.beratungsart as string | undefined) ?? "rechtlich";
    if (!BERATUNGSARTEN.includes(beratungsart as Beratungsart)) {
        return void res.status(400).json({
            detail: `beratungsart muss einer von: ${BERATUNGSARTEN.join(", ")} sein`,
        });
    }
    const requestedHonorarmodell = (req.body?.honorarmodell as string | undefined) ?? "stundensatz";
    if (!HONORARMODELLE.includes(requestedHonorarmodell as Honorarmodell)) {
        return void res.status(400).json({
            detail: `honorarmodell muss einer von: ${HONORARMODELLE.join(", ")} sein`,
        });
    }
    // ProReal-Mandate laufen immer als reines RVG-Mandat — serverseitig
    // erzwungen, nicht nur als UI-Vorgabe (Konsistenzschutz).
    const honorarmodell: Honorarmodell =
        beratungsart === "pro_real" ? "rvg" : (requestedHonorarmodell as Honorarmodell);

    const stundensatzPartner = parseStundensatz(req.body?.stundensatz_partner, STUNDENSATZ_DEFAULT.partner);
    const stundensatzAnwalt = parseStundensatz(req.body?.stundensatz_anwalt, STUNDENSATZ_DEFAULT.anwalt);
    const stundensatzFachmitarbeiter = parseStundensatz(
        req.body?.stundensatz_fachmitarbeiter,
        STUNDENSATZ_DEFAULT.fachmitarbeiter,
    );

    // Load matter + org + mandant
    const { data: matter } = await db
        .from("matters")
        .select("id, org_id, state, kategorie, aktenzeichen, bezeichnung, sachbearbeiter, unternehmensmandat, pauschale_vereinbart, pauschale_zweck, pauschale_betrag, pauschale_umfang, pauschale_turnus")
        .eq("id", matterId)
        .maybeSingle();

    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    // Pro-Real-Mandate erhalten kein generisches Onboarding-Paket (Anschreiben,
    // Honorarvereinbarung, Vollmacht, Widerrufsbelehrung) — weder bei
    // Aktenanlage (siehe matters.ts) noch hier. Sie haben ihr eigenes,
    // vollständiges Dokumentpaket, das bereits vor der Aktenanlage über den
    // Interessenten-Workflow verschickt wurde (siehe lib/interessent/unterlagen.ts).
    // Ein generisches Paket würde u.a. um die Rücksendung einer
    // Honorarvereinbarung bitten, die es für dieses Mandat gar nicht gibt.
    if (matter.kategorie === "pro_real") {
        return void res.status(422).json({
            detail:
                "Pro-Real-Mandate erhalten kein generisches Onboarding-Paket — die " +
                "Mandatsunterlagen wurden bereits vor der Aktenanlage im " +
                "Interessenten-Workflow verschickt.",
        });
    }

    // Unternehmensmandat (§ 14 BGB) steuert, ob die Widerrufsbelehrung zum
    // Paket gehört. Die Angabe stammt aus der Aktenanlage, lässt sich hier aber
    // korrigieren — sie wird oft erst im Erstgespräch klar. Wie beim
    // Sachbearbeiter wird die Korrektur auf der Akte gespeichert, damit
    // Neuerzeugung und Begleitmail nicht auseinanderlaufen.
    const unternehmensmandatInput = req.body?.unternehmensmandat;
    const unternehmensmandat =
        unternehmensmandatInput === undefined || unternehmensmandatInput === null
            ? Boolean(matter.unternehmensmandat)
            : Boolean(unternehmensmandatInput);
    if (unternehmensmandat !== Boolean(matter.unternehmensmandat)) {
        await db.from("matters").update({ unternehmensmandat }).eq("id", matterId);
    }

    // Pauschalvereinbarung: Der Absatz „Alternativ/Zusatztext für Pauschalen"
    // steht nur dann in der Honorarvereinbarung, wenn hier ein Haken gesetzt
    // wurde. Ohne Angabe gilt der Stand der Akte — so verliert eine
    // Neuerzeugung die einmal erfassten Angaben nicht.
    const pauschaleInput = req.body?.pauschale;
    const pauschale =
        pauschaleInput === undefined || pauschaleInput === null
            ? Boolean(matter.pauschale_vereinbart)
            : Boolean(pauschaleInput);

    const textOderBestand = (feld: unknown, bestand: unknown): string =>
        feld === undefined || feld === null ? String(bestand ?? "") : String(feld).trim();

    const pauschaleZweck = textOderBestand(req.body?.pauschale_zweck, matter.pauschale_zweck);
    const pauschaleBetrag = textOderBestand(req.body?.pauschale_betrag, matter.pauschale_betrag);
    const pauschaleUmfang = textOderBestand(req.body?.pauschale_umfang, matter.pauschale_umfang);

    const turnusInput = req.body?.pauschale_turnus;
    const pauschaleTurnus: PauschaleTurnus = istTurnus(turnusInput)
        ? turnusInput
        : istTurnus(matter.pauschale_turnus)
          ? matter.pauschale_turnus
          : "jaehrlich";
    if (turnusInput !== undefined && turnusInput !== null && !istTurnus(turnusInput)) {
        return void res.status(400).json({
            detail:
                "pauschale_turnus muss einer von: " +
                Object.keys(PAUSCHALE_TURNUS).join(", ") + " sein",
        });
    }

    // Ohne Zweck und Betrag entstünde ein Vertragssatz mit Lücken („Für die
    // vereinbaren wir eine Pauschale in Höhe von EUR ."). Lieber hier abbrechen
    // als das dem Mandanten zuzumuten.
    if (pauschale && (!pauschaleZweck || !pauschaleBetrag)) {
        return void res.status(400).json({
            detail:
                "Bei einer Pauschalvereinbarung werden Zweck und Betrag benötigt — " +
                "beides steht im Absatz der Honorarvereinbarung.",
        });
    }

    if (
        pauschale !== Boolean(matter.pauschale_vereinbart) ||
        pauschaleZweck !== (matter.pauschale_zweck ?? "") ||
        pauschaleBetrag !== (matter.pauschale_betrag ?? "") ||
        pauschaleUmfang !== (matter.pauschale_umfang ?? "") ||
        pauschaleTurnus !== matter.pauschale_turnus
    ) {
        await db
            .from("matters")
            .update({
                pauschale_vereinbart: pauschale,
                pauschale_zweck: pauschaleZweck || null,
                pauschale_betrag: pauschaleBetrag || null,
                pauschale_umfang: pauschaleUmfang || null,
                pauschale_turnus: pauschaleTurnus,
            })
            .eq("id", matterId);
    }

    // Sachbearbeiter wird vor der Erzeugung abgefragt und auf der Akte
    // gespeichert, damit er bei künftigen Neuerzeugungen vorbefüllt ist.
    const sachbearbeiterInput = (req.body?.sachbearbeiter as string | undefined)?.trim();
    const sachbearbeiter = sachbearbeiterInput || matter.sachbearbeiter || "";
    if (!sachbearbeiter) {
        return void res.status(400).json({ detail: "Sachbearbeiter ist erforderlich" });
    }
    if (sachbearbeiterInput && sachbearbeiterInput !== matter.sachbearbeiter) {
        await db.from("matters").update({ sachbearbeiter: sachbearbeiterInput }).eq("id", matterId);
    }

    const { data: member } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", matter.org_id)
        .maybeSingle();

    if (!member) return void res.status(403).json({ detail: "Access denied" });
    if (!["Admin", "Anwalt", "Referendar"].includes(member.role)) {
        return void res.status(403).json({ detail: "Unzureichende Berechtigung" });
    }

    // Erstgenerierung (AUFNAHME_ERFASST) und erneute Erzeugung/Überschreiben
    // vor Versand (ONBOARDING_ERZEUGT) sind beide erlaubt — z.B. nachdem eine
    // neue Vorlage hochgeladen oder der Aufnahmebogen korrigiert wurde. Nach
    // Versand (ONBOARDING_VERSANDT+) ist keine Neuerzeugung mehr möglich.
    const isRegeneration = matter.state === "ONBOARDING_ERZEUGT";
    if (matter.state !== "AUFNAHME_ERFASST" && !isRegeneration) {
        return void res.status(422).json({
            detail: `Onboarding-Dokumente können nur vor Versand erzeugt werden (aktuell: ${matter.state}).`,
        });
    }

    const { data: mandant } = await db
        .from("mandanten")
        .select("*")
        .eq("matter_id", matterId)
        .maybeSingle();

    if (!mandant) {
        return void res.status(422).json({ detail: "Aufnahmebogen (Mandantendaten) fehlt" });
    }

    // Load active templates for this org
    // Reines RVG-Mandat nutzt dieselbe Honorarvereinbarung-Vorlage wie
    // Stundensatzmandate — wird bei Bedarf vor Versand manuell angepasst.
    //
    // Beim Verbrauchermandat ist die Widerrufsbelehrung Pflichtbestandteil des
    // Pakets: bei einem im Fernabsatz geschlossenen Verbrauchermandat beginnt
    // die 14-Tage-Frist ohne wirksame Belehrung nicht (§ 356 Abs. 3 BGB), und
    // ohne Belehrung samt ausdrücklichem Verlangen vorzeitigen Leistungsbeginns
    // kann der Vergütungsanspruch bei Widerruf entfallen (§ 357 Abs. 8 BGB).
    // Beim Unternehmensmandat (§ 14 BGB) besteht das Widerrufsrecht nicht und
    // die Belehrung entfällt.
    const requiredTemplates = dokumenteFuerMandat(unternehmensmandat);
    const { vorlagen: templateMap, fehlend: missing } = await ladeAktiveVorlagen(
        matter.org_id,
        requiredTemplates,
        db,
    );
    if (missing.length > 0) {
        return void res.status(422).json({
            detail: `Fehlende Vorlagen: ${missing.join(", ")}. Bitte Vorlagen hochladen.`,
        });
    }

    // LLM: generate Sachverhalt passage for Anschreiben ONLY
    //
    // Datenminimierung (Art. 5 Abs. 1 lit. c DSGVO): Name, Geburtsdatum und
    // Adresse werden nicht als Felder übermittelt, sondern durch ein Pseudonym
    // ersetzt. Das ist KEINE Anonymisierung — die freien Sachverhaltsfelder
    // gehen im Klartext an LOGICC und enthalten regelmäßig Klarnamen von
    // Mandant und Gegenseite. Rechtsgrundlage ist daher der AVV mit LOGICC
    // (Art. 28 DSGVO) und § 43e BRAO, nicht die Pseudonymisierung.
    const pseudonym = pseudonymisiere(matterId);
    let sachverhaltPassage = "";
    try {
        sachverhaltPassage = await completeText({
            model: DEFAULT_MAIN_MODEL,
            systemPrompt: buildLegalSystemPrompt(
                "Du bist ein deutschsprachiger Rechtsanwalt-Assistent. " +
                "Schreibe ausschließlich den Sachverhaltsabschnitt (3-5 Sätze) " +
                "für ein Anschreiben an den Mandanten. Kein Briefkopf, keine Grußformel. " +
                "Verwende 'der Mandant' statt des Namens. Gehe konkret auf die " +
                "genannten Angaben ein (Sachverhalt, Gegenpartei, bisherige " +
                "Schritte, Ziel) statt allgemein zu bleiben — lasse Angaben " +
                "weg, die nicht genannt wurden, statt sie zu erfinden.",
            ),
            user:
                `Mandant-Referenz: ${pseudonym}\n` +
                `Beratungsinhalt: ${mandant.beratungskurzbeschreibung || "(nicht angegeben)"}\n` +
                `Sachverhalt seit: ${mandant.sachverhalt_seit || "(nicht angegeben)"}\n` +
                `Gegenpartei: ${mandant.gegner || "(keine / nicht angegeben)"}\n` +
                `Bereits erfolgte Schritte: ${mandant.bisherige_schritte || "(nicht angegeben)"}\n` +
                `Ziel des Mandats: ${mandant.mandatsziel || "(nicht angegeben)"}\n` +
                `Aktenzeichen: ${matter.aktenzeichen || "noch nicht vergeben"}`,
            // gemini-2.5-pro (DEFAULT_MAIN_MODEL) kann sein Reasoning-Budget
            // vor dem sichtbaren Text ausschöpfen, wenn max_tokens zu niedrig
            // ist (verifiziert: 400 lieferte nur "{\n" zurück). 3000 lässt
            // genug Spielraum für Reasoning + Text.
            maxTokens: 3000,
        });
    } catch (err) {
        console.error("[onboarding] LLM sachverhalt error", err);
        sachverhaltPassage = "[Sachverhalt bitte manuell eintragen]";
    }

    const today = new Date().toLocaleDateString("de-DE");
    const mandantName = `${mandant.anrede ?? ""} ${mandant.vorname} ${mandant.nachname}`.trim();
    const mandantAdresse =
        [mandant.strasse, mandant.hausnummer, mandant.plz, mandant.ort]
            .filter(Boolean)
            .join(" ");

    const commonPlaceholders: Record<string, string> = {
        DATUM: today,
        AKTENZEICHEN: matter.aktenzeichen ?? "",
        MANDANT_NAME: mandantName,
        MANDANT_ANREDE: mandant.anrede ?? "Sehr geehrte/r",
        MANDANT_ADRESSE: mandantAdresse,
        MANDANT_EMAIL: mandant.email ?? "",
        BEZEICHNUNG: matter.bezeichnung ?? "",
        SACHVERHALT: sachverhaltPassage,
        SACHBEARBEITER: sachbearbeiter,
        ...resolveBeratungsartPlaceholders(beratungsart as Beratungsart),
        // Bei reinem RVG-Mandat wird dieselbe Vorlage genutzt und vor Versand
        // manuell angepasst — Stundensatz-Platzhalter werden trotzdem befüllt,
        // damit kein unaufgelöster {{...}}-Platzhalter im Dokument steht.
        STUNDENSATZ_PARTNER: formatEuroDE(stundensatzPartner),
        STUNDENSATZ_ANWALT: formatEuroDE(stundensatzAnwalt),
        STUNDENSATZ_FACHMITARBEITER: formatEuroDE(stundensatzFachmitarbeiter),
        PAUSCHALE_ZWECK: pauschaleZweck,
        PAUSCHALE_BETRAG: pauschaleBetrag,
        PAUSCHALE_UMFANG: pauschaleUmfang,
        PAUSCHALE_TURNUS: PAUSCHALE_TURNUS[pauschaleTurnus].adjektiv,
        PAUSCHALE_FAELLIGKEIT: PAUSCHALE_TURNUS[pauschaleTurnus].adverb,
    };

    let generatedDocs: ErzeugtesDokument[];
    let dokumentWarnungen: string[];
    try {
        const ergebnis = await erzeugeOnboardingDokumente({
            matterId,
            orgId: matter.org_id,
            userId,
            typen: requiredTemplates,
            vorlagen: templateMap,
            platzhalter: commonPlaceholders,
            bedingungen: { PAUSCHALE: pauschale },
            db,
        });
        generatedDocs = ergebnis.dokumente;
        dokumentWarnungen = ergebnis.warnungen;
    } catch (err) {
        return void res.status(500).json({ detail: err instanceof Error ? err.message : String(err) });
    }

    // Create or update the onboarding package record. Approve/Send rely on
    // exactly one row per matter_id (maybeSingle) — on regeneration we UPDATE
    // the existing row instead of inserting a second one, and reset the
    // review gate since the previously approved content no longer exists.
    //
    // Zuordnung über den Dokumenttyp statt über die Position: beim
    // Unternehmensmandat fehlt die Widerrufsbelehrung, eine Positionsannahme
    // würde dann das falsche Dokument in die Spalte schreiben.
    const docIdFuer = (typ: OnboardingDokumenttyp): string | null =>
        generatedDocs.find((d) => d.type === typ)?.docId ?? null;

    const { data: existingPkg } = await db
        .from("onboarding_packages")
        .select("id")
        .eq("matter_id", matterId)
        .maybeSingle();

    const pkgData = {
        anschreiben_doc_id: docIdFuer("ONBOARDING_ANSCHREIBEN"),
        honorarvereinbarung_doc_id: docIdFuer("ONBOARDING_HONORARVEREINBARUNG"),
        vollmacht_doc_id: docIdFuer("ONBOARDING_VOLLMACHT"),
        widerrufsbelehrung_doc_id: docIdFuer("ONBOARDING_WIDERRUFSBELEHRUNG"),
        review_gate_passed: !REVIEW_GATE_ENABLED,
        reviewed_by: null,
        reviewed_at: null,
    };
    if (existingPkg) {
        await db.from("onboarding_packages").update(pkgData).eq("id", existingPkg.id);
    } else {
        await db.from("onboarding_packages").insert({ matter_id: matterId, ...pkgData });
    }

    // Erstgenerierung: Zustandsübergang NEU→ONBOARDING_ERZEUGT protokollieren.
    // Bei erneuter Erzeugung bleibt der Zustand unverändert (kein Übergang).
    if (!isRegeneration) {
        await db.from("matter_transitions").insert({
            matter_id: matterId,
            from_state: "AUFNAHME_ERFASST",
            to_state: "ONBOARDING_ERZEUGT",
            triggered_by: userId,
            role: member.role,
            description: "Onboarding-Dokumente erzeugt (Review ausstehend: " + REVIEW_GATE_ENABLED + ")",
        });
        await db
            .from("matters")
            .update({ state: "ONBOARDING_ERZEUGT", updated_at: new Date().toISOString() })
            .eq("id", matterId);
    }

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: isRegeneration ? "onboarding_regenerated" : "onboarding_generated",
        actor_id: userId,
        actor_role: member.role,
        model_id: DEFAULT_MAIN_MODEL,
        details: {
            docs: generatedDocs.map((d) => ({ type: d.type, hash: d.hash })),
            review_gate: REVIEW_GATE_ENABLED,
            unternehmensmandat,
            pauschale,
            pauschale_turnus: pauschaleTurnus,
            beratungsart,
            honorarmodell,
            stundensatz_partner: stundensatzPartner,
            stundensatz_anwalt: stundensatzAnwalt,
            stundensatz_fachmitarbeiter: stundensatzFachmitarbeiter,
        },
    });

    res.json({
        state: "ONBOARDING_ERZEUGT",
        review_required: REVIEW_GATE_ENABLED,
        documents: generatedDocs,
        warnungen: dokumentWarnungen,
        unternehmensmandat,
        pauschale,
        pauschale_turnus: pauschaleTurnus,
        beratungsart,
        honorarmodell,
    });
});

// ---------------------------------------------------------------------------
// POST /onboarding/:matterId/prozessvollmacht-vorab — gerichtliche Vollmacht
// (Prozessvollmacht, § 80 ZPO) einzeln und jederzeit erzeugen, unabhängig vom
// Aufnahmebogen.
//
// Zu unterscheiden von ONBOARDING_VOLLMACHT: das ist die außergerichtliche
// Vollmacht, die bereits Teil des Standard-Onboardingpakets ist (Anschreiben,
// Honorarvereinbarung, Vollmacht, Widerrufsbelehrung — siehe /generate und
// onboardingPaket.ts) und zur Vertretung vor Gericht NICHT ermächtigt. Diese
// Prozessvollmacht ist ein eigener Dokumenttyp (ONBOARDING_PROZESSVOLLMACHT),
// bewusst nicht Teil des Pakets — sie wird gezielt und einzeln angefordert.
//
// Anders als /generate ist dieser Weg NICHT an matter.state gebunden: die
// Prozessvollmacht wird in der Praxis oft schon gebraucht, bevor der
// Aufnahmebogen vollständig ausgefüllt ist (z.B. für einen kurzfristigen
// Gerichtstermin). Fehlt die mandanten-Zeile noch, kommen Name/Adresse aus
// dem Request-Body oder aus matters.mandant_name — notfalls bleiben sie leer,
// statt die Erzeugung zu blockieren.
//
// Nicht verfügbar für ProReal-Mandate (kategorie "pro_real"): die haben eine
// eigene, kampagnenspezifische außergerichtliche Vollmacht über den
// PRE-Ablauf (siehe lib/interessent/unterlagen.ts) und keinen Gerichtsbezug.
//
// Body (JSON, alle Felder optional): sachbearbeiter, mandant_name,
// mandant_anrede, mandant_adresse.
// ---------------------------------------------------------------------------

onboardingRouter.post("/prozessvollmacht-vorab", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const { data: matter } = await db
        .from("matters")
        .select("id, org_id, kategorie, aktenzeichen, bezeichnung, mandant_name, mandant_email, sachbearbeiter")
        .eq("id", matterId)
        .maybeSingle();

    if (!matter) return void res.status(404).json({ detail: "Matter not found" });

    const { data: member } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", matter.org_id)
        .maybeSingle();

    if (!member) return void res.status(403).json({ detail: "Access denied" });
    if (!["Admin", "Anwalt", "Referendar"].includes(member.role)) {
        return void res.status(403).json({ detail: "Unzureichende Berechtigung" });
    }

    if (matter.kategorie === "pro_real") {
        return void res.status(422).json({
            detail:
                "ProReal-Mandate haben eine eigene, kampagnenspezifische außergerichtliche Vollmacht — " +
                "diese wird über den PRE-Ablauf erzeugt, nicht hier.",
        });
    }

    const sachbearbeiterInput = (req.body?.sachbearbeiter as string | undefined)?.trim();
    const sachbearbeiter = sachbearbeiterInput || matter.sachbearbeiter || "";
    if (!sachbearbeiter) {
        return void res.status(400).json({ detail: "Sachbearbeiter ist erforderlich" });
    }
    if (sachbearbeiterInput && sachbearbeiterInput !== matter.sachbearbeiter) {
        await db.from("matters").update({ sachbearbeiter: sachbearbeiterInput }).eq("id", matterId);
    }

    // Aufnahmebogen ist zu diesem Zeitpunkt oft noch nicht vorhanden — die
    // mandanten-Zeile existiert dann schlicht nicht (vorname/nachname sind
    // dort NOT NULL). Name/Adresse kommen dann aus dem Request-Body oder aus
    // der Akte, notfalls bleiben sie leer.
    const { data: mandant } = await db
        .from("mandanten")
        .select("anrede, vorname, nachname, strasse, hausnummer, plz, ort, email")
        .eq("matter_id", matterId)
        .maybeSingle();

    const mandantNameInput = (req.body?.mandant_name as string | undefined)?.trim();
    const mandantNameAusAufnahme = mandant
        ? `${mandant.anrede ?? ""} ${mandant.vorname} ${mandant.nachname}`.trim()
        : "";
    const mandantName = mandantNameInput || mandantNameAusAufnahme || matter.mandant_name || "";
    if (mandantNameInput && mandantNameInput !== matter.mandant_name) {
        await db.from("matters").update({ mandant_name: mandantNameInput }).eq("id", matterId);
    }

    const mandantAdresseAusAufnahme = mandant
        ? [mandant.strasse, mandant.hausnummer, mandant.plz, mandant.ort].filter(Boolean).join(" ")
        : "";
    const mandantAdresse =
        (req.body?.mandant_adresse as string | undefined)?.trim() || mandantAdresseAusAufnahme || "";

    const mandantAnrede =
        (req.body?.mandant_anrede as string | undefined)?.trim() || mandant?.anrede || "Sehr geehrte/r";

    const { vorlagen: templateMap, fehlend: missing } = await ladeAktiveVorlagen(
        matter.org_id,
        ["ONBOARDING_PROZESSVOLLMACHT"],
        db,
    );
    if (missing.length > 0) {
        return void res.status(422).json({
            detail: "Keine aktive Prozessvollmachts-Vorlage hinterlegt. Bitte unter Vorlagen hochladen.",
        });
    }

    const today = new Date().toLocaleDateString("de-DE");
    // Enthält auch Platzhalter, die diese Vorlage voraussichtlich nicht nutzt
    // (STUNDENSATZ_*, PAUSCHALE_*, BERATUNGSART_ADJ*) — leer/mit Default
    // gefüllt statt weggelassen, damit ein unerwartet geteilter Platzhalter
    // nicht als unaufgelöstes "{{...}}" im Dokument stehen bleibt.
    const platzhalter: Record<string, string> = {
        DATUM: today,
        AKTENZEICHEN: matter.aktenzeichen ?? "",
        BEZEICHNUNG: matter.bezeichnung ?? "",
        MANDANT_NAME: mandantName,
        MANDANT_ANREDE: mandantAnrede,
        MANDANT_ADRESSE: mandantAdresse,
        MANDANT_EMAIL: matter.mandant_email ?? mandant?.email ?? "",
        SACHBEARBEITER: sachbearbeiter,
        SACHVERHALT: "",
        ...resolveBeratungsartPlaceholders("rechtlich"),
        STUNDENSATZ_PARTNER: formatEuroDE(STUNDENSATZ_DEFAULT.partner),
        STUNDENSATZ_ANWALT: formatEuroDE(STUNDENSATZ_DEFAULT.anwalt),
        STUNDENSATZ_FACHMITARBEITER: formatEuroDE(STUNDENSATZ_DEFAULT.fachmitarbeiter),
        PAUSCHALE_ZWECK: "",
        PAUSCHALE_BETRAG: "",
        PAUSCHALE_UMFANG: "",
        PAUSCHALE_TURNUS: PAUSCHALE_TURNUS.jaehrlich.adjektiv,
        PAUSCHALE_FAELLIGKEIT: PAUSCHALE_TURNUS.jaehrlich.adverb,
    };

    let generatedDocs: ErzeugtesDokument[];
    let dokumentWarnungen: string[];
    try {
        const ergebnis = await erzeugeOnboardingDokumente({
            matterId,
            orgId: matter.org_id,
            userId,
            typen: ["ONBOARDING_PROZESSVOLLMACHT"],
            vorlagen: templateMap,
            platzhalter,
            bedingungen: { PAUSCHALE: false },
            db,
        });
        generatedDocs = ergebnis.dokumente;
        dokumentWarnungen = ergebnis.warnungen;
    } catch (err) {
        return void res.status(500).json({ detail: err instanceof Error ? err.message : String(err) });
    }

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "prozessvollmacht_vorab_erzeugt",
        actor_id: userId,
        actor_role: member.role,
        details: {
            docs: generatedDocs.map((d) => ({ type: d.type, hash: d.hash })),
            vor_aufnahmebogen: !mandant,
        },
    });

    res.json({
        documents: generatedDocs,
        warnungen: dokumentWarnungen,
    });
});

// ---------------------------------------------------------------------------
// POST /onboarding/:matterId/dokument/:docId/ersetzen
//
// Ersetzt ein erzeugtes Onboarding-Dokument durch eine überarbeitete Fassung.
//
// Ablauf für den Anwender: Word-Fassung herunterladen, im Textprogramm
// anpassen, hier wieder hochladen. Ohne diesen Weg wäre die Bearbeitung
// wirkungslos — versandt wird das im Paket hinterlegte Dokument, nicht die
// Datei auf dem eigenen Rechner.
//
// Die alte Fassung bleibt als eigene Zeile erhalten (Versionskette), das Paket
// zeigt auf die neue. Eine bereits erteilte Freigabe wird zurückgesetzt: sie
// galt einer anderen Fassung.
// ---------------------------------------------------------------------------

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** doc_type → Spalte im Onboarding-Paket */
const PAKET_SPALTE: Record<string, string> = {
    ONBOARDING_ANSCHREIBEN: "anschreiben_doc_id",
    ONBOARDING_HONORARVEREINBARUNG: "honorarvereinbarung_doc_id",
    ONBOARDING_VOLLMACHT: "vollmacht_doc_id",
    ONBOARDING_WIDERRUFSBELEHRUNG: "widerrufsbelehrung_doc_id",
};

const ersetzenUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        cb(null, file.mimetype === DOCX_MIME || file.mimetype === "application/pdf");
    },
});

onboardingRouter.post(
    "/dokument/:docId/ersetzen",
    requireAuth,
    ersetzenUpload.single("datei"),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { matterId, docId } = req.params;
        const db = createServerSupabase();

        const { data: matter } = await db
            .from("matters")
            .select("id, org_id, state")
            .eq("id", matterId)
            .maybeSingle();
        if (!matter) return void res.status(404).json({ detail: "Matter not found" });

        const { data: member } = await db
            .from("org_members")
            .select("role")
            .eq("user_id", userId)
            .eq("org_id", matter.org_id)
            .maybeSingle();
        if (!member || !["Admin", "Anwalt", "Referendar"].includes(member.role)) {
            return void res.status(403).json({ detail: "Unzureichende Berechtigung" });
        }

        if (matter.state !== "ONBOARDING_ERZEUGT") {
            return void res.status(422).json({
                detail:
                    "Dokumente können nur vor dem Versand ersetzt werden " +
                    `(aktueller Stand: ${matter.state}).`,
            });
        }

        const file = req.file;
        if (!file) {
            return void res.status(400).json({
                detail: "Bitte eine Word-Datei (.docx) oder ein PDF hochladen (Feld: datei).",
            });
        }

        const { data: alt } = await db
            .from("matter_documents")
            .select("id, doc_type, version_number, filename")
            .eq("id", docId)
            .eq("matter_id", matterId)
            .maybeSingle();
        if (!alt) return void res.status(404).json({ detail: "Dokument nicht gefunden" });
        if (!PAKET_SPALTE[alt.doc_type]) {
            return void res.status(422).json({
                detail: `Dokumenttyp ${alt.doc_type} gehört nicht zum Onboarding-Paket.`,
            });
        }

        // Word-Fassung zusätzlich als PDF ablegen — versandt wird immer das PDF,
        // damit beim Mandanten nichts verrutscht.
        let pdfBuf: Buffer;
        let docxBuf: Buffer | null = null;
        if (file.mimetype === DOCX_MIME) {
            docxBuf = file.buffer;
            try {
                pdfBuf = await docxToPdf(file.buffer);
            } catch (err) {
                console.error("[onboarding/ersetzen] PDF-Konvertierung fehlgeschlagen", err);
                return void res.status(500).json({
                    detail: `Die Word-Datei ließ sich nicht in ein PDF umwandeln: ${err instanceof Error ? err.message : err}`,
                });
            }
        } else {
            pdfBuf = file.buffer;
        }

        const version = (alt.version_number ?? 1) + 1;
        const zeitstempel = Date.now();
        const basis = `orgs/${matter.org_id}/matters/${matterId}/onboarding`;
        const pdfPfad = `${basis}/${alt.doc_type}_v${version}_${zeitstempel}.pdf`;
        await uploadFile(pdfPfad, pdfBuf, "application/pdf");

        let docxPfad: string | null = null;
        if (docxBuf) {
            docxPfad = `${basis}/${alt.doc_type}_v${version}_${zeitstempel}.docx`;
            await uploadFile(docxPfad, docxBuf, DOCX_MIME);
        }

        const { data: neu, error: insErr } = await db
            .from("matter_documents")
            .insert({
                matter_id: matterId,
                org_id: matter.org_id,
                filename: `${alt.doc_type}_v${version}_${zeitstempel}.pdf`,
                storage_path: pdfPfad,
                docx_storage_path: docxPfad,
                file_hash_sha256: crypto.createHash("sha256").update(pdfBuf).digest("hex"),
                file_size_bytes: pdfBuf.length,
                mime_type: "application/pdf",
                doc_type: alt.doc_type,
                version_number: version,
                uploaded_by: userId,
            })
            .select("id")
            .single();
        if (insErr || !neu) {
            return void res.status(500).json({ detail: insErr?.message ?? "Speichern fehlgeschlagen" });
        }

        // Paket auf die neue Fassung zeigen lassen und die Freigabe zurücksetzen —
        // freigegeben war die vorherige Fassung.
        const { data: pkg } = await db
            .from("onboarding_packages")
            .select("id")
            .eq("matter_id", matterId)
            .maybeSingle();
        if (pkg) {
            await db
                .from("onboarding_packages")
                .update({
                    [PAKET_SPALTE[alt.doc_type]]: neu.id,
                    review_gate_passed: !REVIEW_GATE_ENABLED,
                    reviewed_by: null,
                    reviewed_at: null,
                })
                .eq("id", pkg.id);
        }

        await db.from("audit_log").insert({
            org_id: matter.org_id,
            entity_type: "matter",
            entity_id: matterId,
            action: "onboarding_dokument_ersetzt",
            actor_id: userId,
            actor_role: member.role,
            details: {
                doc_type: alt.doc_type,
                alte_version: alt.version_number ?? 1,
                neue_version: version,
                hochgeladen_als: file.mimetype === DOCX_MIME ? "docx" : "pdf",
                dateiname: file.originalname,
                freigabe_zurueckgesetzt: REVIEW_GATE_ENABLED,
            },
        });

        res.json({
            ok: true,
            doc_id: neu.id,
            doc_type: alt.doc_type,
            version_number: version,
            review_erneut_erforderlich: REVIEW_GATE_ENABLED,
        });
    },
);

// ---------------------------------------------------------------------------
// POST /onboarding/:matterId/approve — mark review gate passed
// ---------------------------------------------------------------------------

onboardingRouter.post("/approve", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const { data: matter } = await db
        .from("matters")
        .select("id, org_id, state")
        .eq("id", matterId)
        .maybeSingle();

    if (!matter || matter.state !== "ONBOARDING_ERZEUGT") {
        return void res.status(422).json({ detail: "Matter not in ONBOARDING_ERZEUGT state" });
    }

    const { data: member } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", matter.org_id)
        .maybeSingle();

    if (!member || !["Anwalt", "Admin"].includes(member.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt oder Admin darf freigeben" });
    }

    await db
        .from("onboarding_packages")
        .update({ review_gate_passed: true, reviewed_by: userId, reviewed_at: new Date().toISOString() })
        .eq("matter_id", matterId);

    res.json({ ok: true, review_gate_passed: true });
});

// ---------------------------------------------------------------------------
// POST /onboarding/:matterId/send — send PDFs via e-mail
// ---------------------------------------------------------------------------

onboardingRouter.post("/send", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { matterId } = req.params;
    const db = createServerSupabase();

    const { data: matter } = await db
        .from("matters")
        .select("id, org_id, state, unternehmensmandat")
        .eq("id", matterId)
        .maybeSingle();

    if (!matter || matter.state !== "ONBOARDING_ERZEUGT") {
        return void res.status(422).json({ detail: "Matter not in ONBOARDING_ERZEUGT state" });
    }

    const { data: member } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", matter.org_id)
        .maybeSingle();

    if (!member || !["Anwalt", "Admin"].includes(member.role)) {
        return void res.status(403).json({ detail: "Nur Anwalt oder Admin darf versenden" });
    }

    // Check review gate
    const { data: pkg } = await db
        .from("onboarding_packages")
        .select("review_gate_passed, anschreiben_doc_id, honorarvereinbarung_doc_id, vollmacht_doc_id, widerrufsbelehrung_doc_id")
        .eq("matter_id", matterId)
        .maybeSingle();

    if (REVIEW_GATE_ENABLED && !pkg?.review_gate_passed) {
        return void res.status(422).json({ detail: "Review-Gate muss vor Versand bestätigt werden" });
    }

    const { data: mandant } = await db
        .from("mandanten")
        .select("email, vorname, nachname")
        .eq("matter_id", matterId)
        .maybeSingle();

    if (!mandant?.email) {
        return void res.status(422).json({ detail: "Mandanten-E-Mail-Adresse fehlt" });
    }

    // Load PDF buffers
    const docIds = [
        pkg?.anschreiben_doc_id,
        pkg?.honorarvereinbarung_doc_id,
        pkg?.vollmacht_doc_id,
        pkg?.widerrufsbelehrung_doc_id,
    ].filter(Boolean) as string[];

    const { data: docs } = await db
        .from("matter_documents")
        .select("id, filename, storage_path, file_hash_sha256")
        .in("id", docIds);

    const attachments: { filename: string; content: Buffer }[] = [];
    const docHashes: { filename: string; sha256: string }[] = [];

    for (const doc of docs ?? []) {
        const arrayBuf = await downloadFile(doc.storage_path);
        if (!arrayBuf) continue;
        const buf = Buffer.from(arrayBuf);
        attachments.push({ filename: doc.filename, content: buf });
        docHashes.push({ filename: doc.filename, sha256: doc.file_hash_sha256 ?? "" });
    }

    let smtpMessageId: string | undefined;
    if (smtpEnabled) {
        try {
            smtpMessageId = await sendOnboardingMail({
                to: mandant.email,
                mandantName: `${mandant.vorname} ${mandant.nachname}`,
                attachments,
                unternehmensmandat: Boolean(matter.unternehmensmandat),
            });
        } catch (err) {
            return void res.status(500).json({ detail: `E-Mail-Versand fehlgeschlagen: ${err}` });
        }
    }

    // Log mail
    await db.from("mail_log").insert({
        matter_id: matterId,
        org_id: matter.org_id,
        empfaenger: mandant.email,
        betreff: "Onboarding-Unterlagen",
        doc_hashes: docHashes,
        smtp_message_id: smtpMessageId,
        sent_by: userId,
    });

    // Transition to ONBOARDING_VERSANDT
    await db.from("matter_transitions").insert({
        matter_id: matterId,
        from_state: "ONBOARDING_ERZEUGT",
        to_state: "ONBOARDING_VERSANDT",
        triggered_by: userId,
        role: member.role,
        description: `Onboarding-PDFs an ${mandant.email} versandt`,
    });
    await db
        .from("matters")
        .update({ state: "ONBOARDING_VERSANDT", updated_at: new Date().toISOString() })
        .eq("id", matterId);

    await db.from("audit_log").insert({
        org_id: matter.org_id,
        entity_type: "matter",
        entity_id: matterId,
        action: "onboarding_versandt",
        actor_id: userId,
        actor_role: member.role,
        details: { empfaenger: mandant.email, doc_hashes: docHashes },
    });

    res.json({
        ok: true,
        state: "ONBOARDING_VERSANDT",
        empfaenger: mandant.email,
        manuell_versenden: !smtpEnabled,
        hinweis: !smtpEnabled
            ? `Bitte Dokumente manuell per E-Mail an ${mandant.email} senden.`
            : undefined,
    });
});
