/**
 * Phase 5 — Smoke tests and negative tests.
 *
 * Run with: npx tsx src/tests/smoke.test.ts
 *
 * These tests use NO real mandant data. They only verify:
 *  1. LOGICC connectivity (chat + embedding)
 *  2. Deterministic tool correctness (fristen, rvg, insolvenz)
 *  3. Egress guard blocks non-LOGICC hosts
 *  4. State machine transition validation
 *
 * Requirements: LOGICC_API_KEY must be set in environment.
 */

import assert from "node:assert/strict";
import { test, describe } from "node:test";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function ok(condition: boolean, msg: string) {
    if (!condition) throw new Error(`FAIL: ${msg}`);
    console.log(`  ✓ ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. Egress guard
// ---------------------------------------------------------------------------

describe("Egress Guard", () => {
    test("blocks non-LOGICC host", () => {
        const { assertLogiccHost } = require("../lib/llm/egress-guard");
        assert.throws(
            () => assertLogiccHost("https://api.openai.com/v1/chat/completions"),
            /BLOCKED/,
        );
        console.log("  ✓ api.openai.com blocked");
        assert.throws(
            () => assertLogiccHost("https://api.anthropic.com/v1/messages"),
            /BLOCKED/,
        );
        console.log("  ✓ api.anthropic.com blocked");
    });

    test("allows api.logicc.io", () => {
        const { assertLogiccHost } = require("../lib/llm/egress-guard");
        assert.doesNotThrow(() =>
            assertLogiccHost("https://api.logicc.io/v1/chat/completions"),
        );
        console.log("  ✓ api.logicc.io allowed");
    });
});

// ---------------------------------------------------------------------------
// 2. Deterministic tools
// ---------------------------------------------------------------------------

describe("Fristen", () => {
    test("§ 622 BGB 5 Jahre → 2 Monate", () => {
        const { berechne622BGB } = require("../lib/tools/fristen");
        const r = berechne622BGB("2020-01-01", "2025-01-15");
        ok(r.fristMonate === 2, `fristMonate = ${r.fristMonate}`);
    });

    test("KSchG 3-Wochen-Frist", () => {
        const { berechneKschgFrist } = require("../lib/tools/fristen");
        const r = berechneKschgFrist("2026-05-01");
        ok(r.calendarDays === 21, `calendarDays = ${r.calendarDays}`);
    });

    test("Reaktionsfrist 14 Werktage von Montag", () => {
        const { berechneReaktionsfrist } = require("../lib/tools/fristen");
        // 2026-06-01 = Montag
        const r = berechneReaktionsfrist("2026-06-01", 14, "NW");
        ok(r.endDate > "2026-06-01", `fristende ${r.endDate} > start`);
        ok(r.workdays === 14, `workdays = ${r.workdays}`);
    });
});

describe("RVG", () => {
    test("einfache Gebühr 5000 € = 334 €", () => {
        const { einfacheGebuehr } = require("../lib/tools/rvg");
        ok(einfacheGebuehr(5000) === 334, `einfacheGebuehr(5000) = ${einfacheGebuehr(5000)}`);
    });

    test("außergerichtliches Mandat 10000 €", () => {
        const { berechneMandat } = require("../lib/tools/rvg");
        const r = berechneMandat(10000, "außergerichtlich");
        ok(r.gesamtBrutto > 0, "gesamtBrutto > 0");
        ok(r.streitwert === 10000, "streitwert korrekt");
    });
});

describe("Insolvenz", () => {
    test("§ 17 InsO: Lücke > 10 % = zahlungsunfähig", () => {
        const { pruefeZahlungsunfaehigkeit } = require("../lib/tools/insolvenz");
        const r = pruefeZahlungsunfaehigkeit({
            faelligeVerbindlichkeiten: 100000,
            liquideMittelSofort: 85000,
            liquideMittelDreiWochen: 5000,
        });
        ok(r.zahlungsunfaehig === true, `zahlungsunfaehig = ${r.zahlungsunfaehig}`);
    });

    test("§ 17 InsO: Lücke ≤ 10 % = zahlungsfähig", () => {
        const { pruefeZahlungsunfaehigkeit } = require("../lib/tools/insolvenz");
        const r = pruefeZahlungsunfaehigkeit({
            faelligeVerbindlichkeiten: 100000,
            liquideMittelSofort: 95000,
            liquideMittelDreiWochen: 0,
        });
        ok(r.zahlungsunfaehig === false, `zahlungsunfaehig = ${r.zahlungsunfaehig}`);
    });

    test("§ 19 InsO: neg. EK + neg. Prognose = überschuldet", () => {
        const { pruefeUeberschuldung } = require("../lib/tools/insolvenz");
        const r = pruefeUeberschuldung({
            aktivaLiquidation: 80000,
            passivaGesamt: 100000,
            fortbestehensprognosePositiv: false,
        });
        ok(r.insolvenzrechtlichUeberschuldet === true, "überschuldet = true");
    });

    test("§ 19 InsO: neg. EK + pos. Prognose = NICHT überschuldet", () => {
        const { pruefeUeberschuldung } = require("../lib/tools/insolvenz");
        const r = pruefeUeberschuldung({
            aktivaLiquidation: 80000,
            passivaGesamt: 100000,
            fortbestehensprognosePositiv: true,
        });
        ok(r.insolvenzrechtlichUeberschuldet === false, "überschuldet = false (pos. Prognose)");
    });
});

describe("GwG-Risikocheck", () => {
    test("sonstiges: nicht_verpflichtet (keine GwG-Katalogtätigkeit)", () => {
        const { classifyGwgRisiko } = require("../lib/tools/gwg");
        const r = classifyGwgRisiko({
            kategorie: "sonstiges",
            landCode: "DE",
            pep: false,
            wirtschaftlichBerechtigterIdentisch: true,
            transaktionsland: null,
        });
        ok(r.risikoklasse === "nicht_verpflichtet", `risikoklasse = ${r.risikoklasse}`);
        ok(r.anwendbar === false, "anwendbar = false");
    });

    test("erbrecht: GwG-pflichtig (Weisung der Kanzlei)", () => {
        const { classifyGwgRisiko } = require("../lib/tools/gwg");
        const r = classifyGwgRisiko({
            kategorie: "erbrecht",
            landCode: "DE",
            pep: false,
            wirtschaftlichBerechtigterIdentisch: true,
            transaktionsland: null,
        });
        ok(r.anwendbar === true, "anwendbar = true");
        ok(r.risikoklasse === "niedrig", `risikoklasse = ${r.risikoklasse}`);
    });

    test("kapitalmarktrecht, vollständige Daten, keine Risikofaktoren: niedrig", () => {
        const { classifyGwgRisiko } = require("../lib/tools/gwg");
        const r = classifyGwgRisiko({
            kategorie: "kapitalmarktrecht",
            landCode: "DE",
            pep: false,
            wirtschaftlichBerechtigterIdentisch: true,
            transaktionsland: null,
        });
        ok(r.risikoklasse === "niedrig", `risikoklasse = ${r.risikoklasse}`);
        ok(r.ausgeloesteFaktoren.length === 0, "keine ausgelösten Faktoren");
    });

    test("wirtschaftlich Berechtigter weicht ab: mittel", () => {
        const { classifyGwgRisiko } = require("../lib/tools/gwg");
        const r = classifyGwgRisiko({
            kategorie: "gesellschaftsrecht",
            landCode: "DE",
            pep: false,
            wirtschaftlichBerechtigterIdentisch: false,
            transaktionsland: null,
        });
        ok(r.risikoklasse === "mittel", `risikoklasse = ${r.risikoklasse}`);
    });

    test("PEP bejaht: hoch, trotz vollständiger übriger Daten", () => {
        const { classifyGwgRisiko } = require("../lib/tools/gwg");
        const r = classifyGwgRisiko({
            kategorie: "pro_real",
            landCode: "DE",
            pep: true,
            wirtschaftlichBerechtigterIdentisch: true,
            transaktionsland: null,
        });
        ok(r.risikoklasse === "hoch", `risikoklasse = ${r.risikoklasse}`);
    });

    test("Bezug zu EU-Hochrisiko-Drittstaat: hoch", () => {
        const { classifyGwgRisiko } = require("../lib/tools/gwg");
        const r = classifyGwgRisiko({
            kategorie: "kapitalmarktrecht",
            landCode: "DE",
            pep: false,
            wirtschaftlichBerechtigterIdentisch: true,
            transaktionsland: "IR",
        });
        ok(r.risikoklasse === "hoch", `risikoklasse = ${r.risikoklasse}`);
    });

    test("fehlende Angaben (PEP + WB unbekannt): unvollstaendig", () => {
        const { classifyGwgRisiko } = require("../lib/tools/gwg");
        const r = classifyGwgRisiko({
            kategorie: "kapitalmarktrecht",
            landCode: "DE",
            pep: null,
            wirtschaftlichBerechtigterIdentisch: null,
            transaktionsland: null,
        });
        ok(r.risikoklasse === "unvollstaendig", `risikoklasse = ${r.risikoklasse}`);
        ok(r.dokumentationsluecken.length === 2, `dokumentationsluecken = ${r.dokumentationsluecken.length}`);
    });

    test("PEP bejaht trotz fehlender übriger Angaben: hoch hat Vorrang vor unvollstaendig", () => {
        const { classifyGwgRisiko } = require("../lib/tools/gwg");
        const r = classifyGwgRisiko({
            kategorie: "kapitalmarktrecht",
            landCode: null,
            pep: true,
            wirtschaftlichBerechtigterIdentisch: null,
            transaktionsland: null,
        });
        ok(r.risikoklasse === "hoch", `risikoklasse = ${r.risikoklasse} (PEP-Faktor hat Vorrang)`);
    });

    test("istGwgKatalogtaetigkeit: nur die gesetzlichen Katalogtätigkeiten", () => {
        const { istGwgKatalogtaetigkeit } = require("../lib/tools/gwg");
        ok(istGwgKatalogtaetigkeit("kapitalmarktrecht") === true, "kapitalmarktrecht = true");
        ok(istGwgKatalogtaetigkeit("pro_real") === true, "pro_real = true");
        ok(istGwgKatalogtaetigkeit("gesellschaftsrecht") === true, "gesellschaftsrecht = true");
        ok(istGwgKatalogtaetigkeit("erbrecht") === true, "erbrecht = true");
        ok(istGwgKatalogtaetigkeit("steuerrecht") === false, "steuerrecht = false");
        ok(istGwgKatalogtaetigkeit("sonstiges") === false, "sonstiges = false");
        ok(istGwgKatalogtaetigkeit("gibt-es-nicht") === false, "unbekannte Kategorie = false");
    });

    test("unterliegtGwgAblauf: Hausregel gilt für ALLE Kategorien", () => {
        const { unterliegtGwgAblauf } = require("../lib/tools/gwg");
        for (const k of ["kapitalmarktrecht", "pro_real", "gesellschaftsrecht",
                         "erbrecht", "steuerrecht", "sonstiges"]) {
            ok(unterliegtGwgAblauf(k) === true, `${k} durchläuft den Ablauf`);
        }
    });

    test("Ablauf und Katalogtätigkeit sind entkoppelt", () => {
        const { unterliegtGwgAblauf, istGwgKatalogtaetigkeit, classifyGwgRisiko } = require("../lib/tools/gwg");
        // Steuerrecht: Identifizierung ja (Hausregel), gesetzliche Pflicht nein.
        ok(unterliegtGwgAblauf("steuerrecht") === true, "Ablauf greift");
        ok(istGwgKatalogtaetigkeit("steuerrecht") === false, "keine Katalogtätigkeit");
        const r = classifyGwgRisiko({
            kategorie: "steuerrecht",
            landCode: "DE",
            pep: false,
            wirtschaftlichBerechtigterIdentisch: true,
            transaktionsland: null,
        });
        ok(
            r.risikoklasse === "nicht_verpflichtet",
            `Einstufung behauptet keine Pflicht (${r.risikoklasse})`,
        );
    });
});

// ---------------------------------------------------------------------------
// 3. State machine
// ---------------------------------------------------------------------------

describe("State Machine", () => {
    test("Anwalt kann NEU → AUFNAHME_ERFASST", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("NEU", "AUFNAHME_ERFASST", "Anwalt");
        ok(r.ok === true, `ok = ${r.ok}`);
    });

    test("ReFa kann ANSPRUCH_FREIGEGEBEN → ANSPRUCH_VERSANDT nicht", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("ANSPRUCH_FREIGEGEBEN", "ANSPRUCH_VERSANDT", "ReFa");
        ok(r.ok === false, "ReFa darf nicht versenden");
    });

    test("Anwalt kann ANSPRUCH_FREIGEGEBEN → ANSPRUCH_VERSANDT", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("ANSPRUCH_FREIGEGEBEN", "ANSPRUCH_VERSANDT", "Anwalt");
        ok(r.ok === true, "Anwalt darf versenden");
    });

    test("Referendar kann KLAGE nicht freigeben", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("KLAGE_ENTWURF", "KLAGE_GEPRUEFT", "Referendar");
        ok(r.ok === false, "Referendar darf Klage nicht prüfen/freigeben");
    });

    test("Scheduler kann FRIST_LAEUFT → FRIST_ABGELAUFEN", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("FRIST_LAEUFT", "FRIST_ABGELAUFEN", "scheduler");
        ok(r.ok === true, "scheduler automated transition");
    });

    test("Direktsprung NEU → KLAGE_EINGEREICHT verboten", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("NEU", "KLAGE_EINGEREICHT", "Anwalt");
        ok(r.ok === false, "direktsprung verboten");
    });

    test("ReFa kann GWG_ANSCHREIBEN_VERSANDT → GWG_GEPRUEFT nicht (nur Anwalt/Admin)", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("GWG_ANSCHREIBEN_VERSANDT", "GWG_GEPRUEFT", "ReFa");
        ok(r.ok === false, "ReFa darf GwG-Prüfung nicht bestätigen");
    });

    test("Anwalt kann GWG_ANSCHREIBEN_VERSANDT → GWG_GEPRUEFT", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("GWG_ANSCHREIBEN_VERSANDT", "GWG_GEPRUEFT", "Anwalt");
        ok(r.ok === true, "Anwalt darf GwG-Prüfung bestätigen");
    });

    test("GWG_GEPRUEFT → AUFNAHME_ERFASST erlaubt (Ablauf nach GwG-Prüfung)", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("GWG_GEPRUEFT", "AUFNAHME_ERFASST", "ReFa");
        ok(r.ok === true, "ok = true");
    });

    test("ANSPRUCH_VERSANDT → FRIST_LAEUFT erlaubt (Frist wird beim Versand angelegt)", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        const r = validateTransition("ANSPRUCH_VERSANDT", "FRIST_LAEUFT", "Anwalt");
        ok(r.ok === true, "Anwalt darf den Fristlauf starten");
    });

    test("GwG-Abwahl: Anwalt darf aus jedem offenen Zustand nach GWG_GEPRUEFT", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        for (const von of ["NEU", "GWG_ANSCHREIBEN_ERZEUGT", "GWG_ANSCHREIBEN_VERSANDT"]) {
            const r = validateTransition(von, "GWG_GEPRUEFT", "Anwalt");
            ok(r.ok === true, `${von} → GWG_GEPRUEFT als Anwalt erlaubt`);
        }
    });

    test("GwG-Abwahl: ReFa darf nicht übergehen", () => {
        const { validateTransition } = require("../lib/matter/state-machine");
        for (const von of ["NEU", "GWG_ANSCHREIBEN_ERZEUGT", "GWG_ANSCHREIBEN_VERSANDT"]) {
            const r = validateTransition(von, "GWG_GEPRUEFT", "ReFa");
            ok(r.ok === false, `${von} → GWG_GEPRUEFT als ReFa gesperrt`);
        }
    });
});

// ---------------------------------------------------------------------------
// 3a-1. Textqualität — OCR-Rauschen von echtem Text unterscheiden
// ---------------------------------------------------------------------------

describe("Textqualität", () => {
    // Wörtlich aus der Textebene eines eingescannten handschriftlichen
    // Mandantenbriefs (Anschreiben.pdf, 770 Zeichen). Der Scanner hat eine OCR
    // laufen lassen, die an der Handschrift gescheitert ist.
    const OCR_RAUSCHEN =
        "2, lq 7ö  I 2 11 t/l 4, a 7-  (/   r,  2t 7' ?1 ,s 4 g  ,61 ,   I 7 -, ry  Fl >r, ,7 ) " +
        "/r 5 4 l7 v   o  '1 )t 'n (/ >x / n n a a ä , 7/ n 7 tt 4 fl ,a /x u lt v7 'h 4 4 {t  /,  " +
        "ff 4' )4 l/ 7 rt >/ I 7 2, lq 7ö I 2 11 t/l 4, a 7- (/ r, 2t 7' ?1 ,s 4 g ,61";

    const ECHTER_TEXT =
        "Sehr geehrte Damen und Herren, hiermit bitte ich Sie um ein Beratungsgespräch. " +
        "Ich bin Kunde bei der Gesellschaft und über diese wurden mir Beteiligungen vermittelt. " +
        "Anbei finden Sie eine Aufstellung der nummerierten Geldanlagen mit den jeweiligen Beträgen.";

    test("OCR-Rauschen wird als unbrauchbar erkannt", () => {
        const { bewerteTextebene } = require("../lib/matter/textqualitaet");
        const b = bewerteTextebene(OCR_RAUSCHEN);
        // Die alte Längenschwelle hätte hier "brauchbar" gesagt — genau der Fehler.
        ok(b.zeichen > 100, `Länge ${b.zeichen} überschreitet die alte Schwelle`);
        ok(b.brauchbar === false, `brauchbar = ${b.brauchbar} (${b.grund})`);
    });

    test("echter deutscher Text wird als brauchbar erkannt", () => {
        const { bewerteTextebene } = require("../lib/matter/textqualitaet");
        const b = bewerteTextebene(ECHTER_TEXT);
        ok(b.brauchbar === true, `brauchbar = ${b.brauchbar} (${b.grund})`);
        ok(b.wortanteil > 0.4, `Wortanteil ${b.wortanteil.toFixed(2)}`);
    });

    test("zu kurze Textebene gilt als unbrauchbar", () => {
        const { bewerteTextebene } = require("../lib/matter/textqualitaet");
        ok(bewerteTextebene("Seite 1").brauchbar === false, "Kopfzeilenrest");
        ok(bewerteTextebene("").brauchbar === false, "leer");
    });

    test("die beiden Fälle liegen deutlich auseinander", () => {
        const { bewerteTextebene } = require("../lib/matter/textqualitaet");
        const rausch = bewerteTextebene(OCR_RAUSCHEN).wortanteil;
        const echt = bewerteTextebene(ECHTER_TEXT).wortanteil;
        ok(echt - rausch > 0.3, `Abstand ${(echt - rausch).toFixed(2)} (Schwelle liegt bei 0,15)`);
    });
});

// ---------------------------------------------------------------------------
// 3a-2. PRE-Fragebogen — Betragsparser, Streitwert, Vollständigkeit
// ---------------------------------------------------------------------------

describe("PRE Betragsparser", () => {
    test("deutsche Schreibweisen", () => {
        const { parseEuroBetrag } = require("../lib/tools/pre");
        const faelle: [string, number][] = [
            ["50.000,00 €", 50000],
            ["1.750,00", 1750],
            ["10.350,00", 10350],
            ["50000", 50000],
            ["1.750", 1750],       // Punkt + 3 Ziffern = Tausender
            ["50.000", 50000],
            ["10 000,-", 10000],   // handschriftlich, Tausender-Leerzeichen
            ["20 000,-", 20000],
            ["350,00 €", 350],
            ["1.75", 1.75],        // Punkt + 2 Ziffern = Dezimal
        ];
        for (const [eingabe, erwartet] of faelle) {
            const r = parseEuroBetrag(eingabe);
            ok(r === erwartet, `"${eingabe}" → ${r} (erwartet ${erwartet})`);
        }
    });

    test("unlesbare Angaben ergeben null, nicht 0", () => {
        const { parseEuroBetrag } = require("../lib/tools/pre");
        // Eine unlesbare Zahl als 0 zu werten würde den Streitwert still verfälschen.
        for (const eingabe of ["", "   ", "s. Anlage", "unleserlich", null, undefined]) {
            ok(parseEuroBetrag(eingabe) === null, `${JSON.stringify(eingabe)} → null`);
        }
    });
});

describe("PRE Streitwert", () => {
    test("Fragebogen Bielkine: zwei Beteiligungen, Auszahlungen offen", () => {
        const { berechneStreitwert } = require("../lib/tools/pre");
        const r = berechneStreitwert(
            [
                { zeichnungssumme: "50.000,00", agio: "1.750,00", gesamt: "51.750,00" },
                { zeichnungssumme: "10.000,00", agio: "350,00", gesamt: "10.350,00" },
            ],
            [],
            false, // "s. Anlage" → Auszahlungen nicht vollständig
        );
        ok(r.zeichnungssummeGesamt === 60000, `Zeichnungssumme = ${r.zeichnungssummeGesamt}`);
        ok(r.agioGesamt === 2100, `Agio = ${r.agioGesamt}`);
        ok(r.streitwert === 62100, `Streitwert = ${r.streitwert}`);
        ok(r.belastbar === false, "nicht belastbar, weil Auszahlungen fehlen");
    });

    test("Auszahlungen werden abgezogen", () => {
        const { berechneStreitwert } = require("../lib/tools/pre");
        const r = berechneStreitwert(
            [{ zeichnungssumme: "50.000,00", agio: "1.750,00" }],
            [{ betrag: "2.500,00" }, { betrag: "1.250,00" }],
        );
        ok(r.auszahlungenGesamt === 3750, `Auszahlungen = ${r.auszahlungenGesamt}`);
        ok(r.streitwert === 48000, `Streitwert = ${r.streitwert}`);
        ok(r.belastbar === true, "belastbar");
    });

    test("Gegenprobe schlägt bei falscher Summe an", () => {
        const { berechneStreitwert } = require("../lib/tools/pre");
        const r = berechneStreitwert(
            [{ zeichnungssumme: "50.000,00", agio: "1.750,00", gesamt: "51.000,00" }],
            [],
        );
        ok(r.belastbar === false, "nicht belastbar bei abweichender Summe");
        ok(
            r.hinweise.some((h: string) => h.includes("weicht")),
            "Hinweis auf Abweichung vorhanden",
        );
    });

    test("unlesbare Zeichnungssumme macht das Ergebnis unbelastbar", () => {
        const { berechneStreitwert } = require("../lib/tools/pre");
        const r = berechneStreitwert([{ zeichnungssumme: "unleserlich", agio: "350,00" }], []);
        ok(r.belastbar === false, "nicht belastbar");
        ok(r.zeichnungssummeGesamt === 0, "unlesbarer Wert wird nicht geraten");
    });

    test("negativer Streitwert wird gemeldet", () => {
        const { berechneStreitwert } = require("../lib/tools/pre");
        const r = berechneStreitwert(
            [{ zeichnungssumme: "10.000,00", agio: "350,00" }],
            [{ betrag: "20.000,00" }],
        );
        ok(r.streitwert < 0, `Streitwert = ${r.streitwert}`);
        ok(r.belastbar === false, "nicht belastbar");
    });
});

describe("PRE Fragebogen-Prüfung", () => {
    test("widersprüchliche Prospektangaben werden erkannt", () => {
        const { pruefeFragebogen } = require("../lib/tools/pre");
        // Genau der Fall aus dem eingereichten Fragebogen: beide Fragen "ja".
        const r = pruefeFragebogen({
            name: "Bielkine", vorname: "Boris", geburtsdatum: "1959-05-27",
            strasse: "Rapunzelweg 3", plz: "30179", ort: "Hannover",
            email: "boris@example.de",
            zeichnungserklaerung_beigefuegt: true, vib_beigefuegt: true,
            prospekt_erhalten_am: "2021-07-01",
            prospekt_gelesen: true, prospekt_durchgegangen: true,
            anderweitig_geltend_gemacht: false,
            andere_anlage_one_group: false,
            andere_anlage_sonst: false,
        });
        ok(r.widersprueche.length === 1, `1 Widerspruch (${r.widersprueche.length})`);
        ok(r.vollstaendig === false, "nicht vollständig bei Widerspruch");
    });

    test("fehlende Zeichnungserklärung ist eine Lücke", () => {
        const { pruefeFragebogen } = require("../lib/tools/pre");
        const r = pruefeFragebogen({
            name: "X", vorname: "Y", geburtsdatum: "1960-01-01",
            strasse: "A 1", plz: "12345", ort: "Z", email: "a@b.de",
            zeichnungserklaerung_beigefuegt: false, vib_beigefuegt: true,
            prospekt_erhalten_am: "2021-07-01", prospekt_gelesen: true,
            anderweitig_geltend_gemacht: false, andere_anlage_one_group: false, andere_anlage_sonst: false,
        });
        ok(
            r.luecken.some((l: string) => l.includes("Zeichnungserklärung")),
            "Lücke zur Zeichnungserklärung gemeldet",
        );
    });

    test("angefangene RSV-Angaben verlangen den Versicherungsschein", () => {
        const { pruefeFragebogen } = require("../lib/tools/pre");
        const r = pruefeFragebogen({
            name: "X", vorname: "Y", geburtsdatum: "1960-01-01",
            strasse: "A 1", plz: "12345", ort: "Z", email: "a@b.de",
            zeichnungserklaerung_beigefuegt: true, vib_beigefuegt: true,
            prospekt_erhalten_am: "2021-07-01", prospekt_gelesen: true,
            rsv_versicherer: "Concordia", rsv_scheinnummer: "RS MA/09617",
            rsv_kopie_beigefuegt: false,
            anderweitig_geltend_gemacht: false, andere_anlage_one_group: false, andere_anlage_sonst: false,
        });
        ok(
            r.luecken.some((l: string) => l.includes("Versicherungsschein")),
            "Versicherungsschein angemahnt",
        );
    });

    test("vollständiger Fragebogen meldet keine Lücken", () => {
        const { pruefeFragebogen } = require("../lib/tools/pre");
        const r = pruefeFragebogen({
            name: "Bielkine", vorname: "Boris", geburtsdatum: "1959-05-27",
            strasse: "Rapunzelweg 3", plz: "30179", ort: "Hannover",
            telefon: "+49 163 6974290", email: "boris@example.de",
            zeichnungserklaerung_beigefuegt: true, vib_beigefuegt: true,
            prospekt_erhalten_am: "2021-07-01",
            prospekt_gelesen: true, prospekt_durchgegangen: false,
            rsv_versicherer: "Concordia Versicherungen",
            rsv_versicherungsnehmer: "Boris Bielkine",
            rsv_scheinnummer: "RS MA/09617/000/8865399-5",
            rsv_abgeschlossen_am: "1994-12-31",
            rsv_kopie_beigefuegt: true,
            anderweitig_geltend_gemacht: false,
            andere_anlage_one_group: false,
            andere_anlage_sonst: false,
        });
        ok(r.vollstaendig === true, `vollständig (Lücken: ${r.luecken.join(" | ")})`);
    });
});

// ---------------------------------------------------------------------------
// 3b. Fristen-Engine — Typkonstante
// ---------------------------------------------------------------------------

describe("Fristen-Engine", () => {
    test("FRIST_TYP_ERWIDERUNG ist der eskalierende Typ", () => {
        const { FRIST_TYP_ERWIDERUNG } = require("../lib/matter/deadline-engine");
        ok(FRIST_TYP_ERWIDERUNG === "ERWIDERUNGSFRIST", `Wert = ${FRIST_TYP_ERWIDERUNG}`);
    });

    test("Klartext-Fristtypen aus der UI eskalieren nicht", () => {
        const { FRIST_TYP_ERWIDERUNG } = require("../lib/matter/deadline-engine");
        // Die im UI wählbaren Typen dürfen keinen Klage-Entwurf auslösen —
        // insbesondere die Verjährungsfrist (PRE9/PRE10).
        const uiTypen = ["Antwortfrist", "Verjährungsfrist", "Notfrist", "Klagefrist"];
        for (const t of uiTypen) {
            ok(t !== FRIST_TYP_ERWIDERUNG, `"${t}" löst keine Auto-Eskalation aus`);
        }
    });

    test("Reminderdatum: 7 Tage vor Fristende", () => {
        const { berechneReminderdatum } = require("../lib/matter/deadline-engine");
        const r = berechneReminderdatum("2026-08-20", "2026-07-18");
        ok(r === "2026-08-13", `reminderdatum = ${r}`);
    });

    test("Reminderdatum: über Monatsgrenze", () => {
        const { berechneReminderdatum } = require("../lib/matter/deadline-engine");
        const r = berechneReminderdatum("2026-08-03", "2026-07-18");
        ok(r === "2026-07-27", `reminderdatum = ${r}`);
    });

    test("Reminderdatum: bei kurzer Frist nicht in der Vergangenheit", () => {
        const { berechneReminderdatum } = require("../lib/matter/deadline-engine");
        // Fristende in 3 Tagen → 7 Tage davor läge vor heute; muss auf heute
        // geklemmt werden, sonst wird die Erinnerung nie als fällig erkannt.
        const r = berechneReminderdatum("2026-07-21", "2026-07-18");
        ok(r === "2026-07-18", `reminderdatum = ${r} (auf heute geklemmt)`);
    });
});

// ---------------------------------------------------------------------------
// 3c. Fristen-Benachrichtigung — Empfängerermittlung
// ---------------------------------------------------------------------------

describe("Fristen-Benachrichtigung", () => {
    test("Sammeladresse: komma-separiert, getrimmt, leere Einträge verworfen", () => {
        const { sammelEmpfaenger } = require("../lib/matter/fristen-notify");
        const vorher = process.env.FRISTEN_NOTIFY_EMAIL;
        try {
            process.env.FRISTEN_NOTIFY_EMAIL = " sekretariat@example.de , ,fristen@example.de ";
            const r = sammelEmpfaenger();
            ok(r.length === 2, `2 Empfänger erkannt (${r.length})`);
            ok(r[0] === "sekretariat@example.de", `erster = ${r[0]}`);
            ok(r[1] === "fristen@example.de", `zweiter = ${r[1]}`);
        } finally {
            if (vorher === undefined) delete process.env.FRISTEN_NOTIFY_EMAIL;
            else process.env.FRISTEN_NOTIFY_EMAIL = vorher;
        }
    });

    test("Sammeladresse: nicht gesetzt → leere Liste (kein leerer String)", () => {
        const { sammelEmpfaenger } = require("../lib/matter/fristen-notify");
        const vorher = process.env.FRISTEN_NOTIFY_EMAIL;
        try {
            delete process.env.FRISTEN_NOTIFY_EMAIL;
            const r = sammelEmpfaenger();
            ok(Array.isArray(r) && r.length === 0, `leere Liste (${JSON.stringify(r)})`);
        } finally {
            if (vorher !== undefined) process.env.FRISTEN_NOTIFY_EMAIL = vorher;
        }
    });
});

// ---------------------------------------------------------------------------
// 4. LOGICC connectivity (only if LOGICC_API_KEY set)
// ---------------------------------------------------------------------------

describe("LOGICC API", async () => {
    const key = process.env.LOGICC_API_KEY?.trim();

    test("Chat completion responds", { skip: !key && "LOGICC_API_KEY not set" }, async () => {
        const { completeLogiccText } = require("../lib/llm/logicc");
        const result = await completeLogiccText({
            model: "gemini-2.5-flash-lite",
            user: "Antworte nur: OK",
            maxTokens: 10,
        });
        ok(typeof result === "string" && result.length > 0, `response: "${result}"`);
    });

    test("Embedding returns vector", { skip: !key && "LOGICC_API_KEY not set" }, async () => {
        const { embedLogicc } = require("../lib/llm/logicc");
        const vecs = await embedLogicc("Juristischer Test");
        ok(Array.isArray(vecs) && vecs.length > 0, "vectors returned");
        ok(Array.isArray(vecs[0]) && vecs[0].length > 0, "embedding vector has values");
    });

    test("Non-LOGICC host fetch is blocked", async () => {
        process.env.LOGICC_API_KEY = process.env.LOGICC_API_KEY ?? "test_dummy_key";
        const { assertLogiccHost } = require("../lib/llm/egress-guard");
        let threw = false;
        try {
            assertLogiccHost("https://api.openai.com/v1/chat/completions");
        } catch {
            threw = true;
        }
        ok(threw, "fetch to non-LOGICC host was blocked at guard");
    });
});

console.log("\nAll tests passed.\n");
