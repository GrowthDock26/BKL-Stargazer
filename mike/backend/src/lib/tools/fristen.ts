/**
 * Deterministische Fristenberechnung (TypeScript-Port aus Klotzkette-Werkzeugen).
 *
 * Alle Berechnungen laufen serverseitig in Code — KEIN LLM ist an der
 * eigentlichen Berechnung beteiligt. Das LLM darf Ergebnisse nur erläutern.
 *
 * Rechtliche Grundlagen: §§ 186–193 BGB (Fristenrecht), § 222 ZPO,
 * § 31 VwVfG. Richtet sich nach: Bundeseinheitliche Feiertage + Länderliste.
 *
 * WICHTIG: Diese Berechnung ersetzt NICHT die anwaltliche Fristenkontrolle.
 * Der Anwalt ist verpflichtet, jede Frist eigenverantwortlich zu prüfen.
 */

// ---------------------------------------------------------------------------
// Feiertage (bundesweite Pflichtfeiertage; Bundesland-spezifische Feiertage
// müssen separat konfiguriert werden)
// ---------------------------------------------------------------------------

export type Bundesland =
    | "BW" | "BY" | "BE" | "BB" | "HB" | "HH" | "HE" | "MV"
    | "NI" | "NW" | "RP" | "SL" | "SN" | "ST" | "SH" | "TH";

/** Ostersonntag nach Gauss-Algorithmus */
function easterSunday(year: number): Date {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
}

function addDays(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
}

function isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
}

/** Bundesweite + länderspezifische Feiertage für ein Jahr */
function getHolidays(year: number, land: Bundesland): Set<string> {
    const easter = easterSunday(year);
    const holidays: Date[] = [
        // Bundesweite
        new Date(year, 0, 1),   // Neujahr
        new Date(year, 4, 1),   // Tag der Arbeit
        new Date(year, 9, 3),   // Tag der Deutschen Einheit
        new Date(year, 11, 25), // 1. Weihnachtstag
        new Date(year, 11, 26), // 2. Weihnachtstag
        // Ostern
        addDays(easter, -2),    // Karfreitag
        addDays(easter, 1),     // Ostermontag
        // Christi Himmelfahrt
        addDays(easter, 39),
        // Pfingstmontag
        addDays(easter, 50),
    ];

    // Länderspezifisch (Auswahl der relevantesten)
    if (["BW", "BY", "ST"].includes(land)) {
        holidays.push(new Date(year, 0, 6)); // Heilige Drei Könige
    }
    if (["BY", "SL"].includes(land)) {
        holidays.push(addDays(easter, 60)); // Fronleichnam
    }
    if (["NW", "BW", "BY", "HE", "RP", "SL", "SN", "TH"].includes(land)) {
        holidays.push(addDays(easter, 60)); // Fronleichnam (NW+)
    }
    if (["BY", "SL"].includes(land)) {
        holidays.push(new Date(year, 7, 15)); // Mariä Himmelfahrt
    }
    if (land === "BY") {
        holidays.push(new Date(year, 10, 1)); // Allerheiligen
    }
    if (["BW", "NW", "RP", "SL"].includes(land)) {
        holidays.push(new Date(year, 10, 1)); // Allerheiligen
    }
    if (["SN", "TH"].includes(land)) {
        holidays.push(new Date(year, 10, 18)); // Buß- und Bettag (letzter Mi im Nov)
    }
    if (["MV", "SN", "SL", "TH", "BB"].includes(land)) {
        holidays.push(new Date(year, 9, 31)); // Reformationstag
    }
    if (land === "HH") {
        holidays.push(new Date(year, 9, 31)); // Reformationstag
    }

    return new Set(holidays.map(isoDate));
}

function isWeekend(d: Date): boolean {
    const day = d.getDay();
    return day === 0 || day === 6;
}

function isHoliday(d: Date, holidays: Set<string>): boolean {
    return holidays.has(isoDate(d));
}

function isNonWorkday(d: Date, holidays: Set<string>): boolean {
    return isWeekend(d) || isHoliday(d, holidays);
}

// ---------------------------------------------------------------------------
// Core calculation functions
// ---------------------------------------------------------------------------

export type FristenOptions = {
    land?: Bundesland;
    /** If true, skip weekends and public holidays (§ 193 BGB / § 222 Abs. 2 ZPO). */
    skipNonWorkdays?: boolean;
};

export type FristenResult = {
    startDate: string;
    endDate: string;
    calendarDays: number;
    workdays: number;
    skippedDays: number;
    hinweis: string;
};

/**
 * Berechnet das Fristende ab einem Startdatum (§§ 186–193 BGB).
 *
 * @param startIso  Startdatum im Format YYYY-MM-DD
 * @param days      Frist in Tagen (Kalender- oder Werktage je nach skipNonWorkdays)
 * @param opts      Optionen
 */
export function berechneKalenderfrist(
    startIso: string,
    days: number,
    opts: FristenOptions = {},
): FristenResult {
    const { land = "NW", skipNonWorkdays = false } = opts;
    const start = new Date(startIso + "T00:00:00");

    if (Number.isNaN(start.getTime())) {
        throw new Error(`Ungültiges Startdatum: ${startIso}`);
    }

    let current = new Date(start);
    let workdays = 0;
    let calDays = 0;
    let skipped = 0;

    const holidays2 = getHolidays(start.getFullYear(), land);
    const holidaysNext = getHolidays(start.getFullYear() + 1, land);
    const allHolidays = new Set([...holidays2, ...holidaysNext]);

    // Advance start by 1 (Fristbeginn § 187 Abs. 1 BGB: Tag des Ereignisses zählt nicht)
    current = addDays(current, 1);
    calDays++;

    while (workdays < days) {
        if (skipNonWorkdays && isNonWorkday(current, allHolidays)) {
            skipped++;
        } else {
            workdays++;
        }
        if (workdays < days) {
            current = addDays(current, 1);
            calDays++;
        }
    }

    // § 193 BGB: Fristende fällt auf Nicht-Arbeitstag → nächster Arbeitstag
    while (isNonWorkday(current, allHolidays)) {
        current = addDays(current, 1);
        calDays++;
        skipped++;
    }

    return {
        startDate: startIso,
        endDate: isoDate(current),
        calendarDays: calDays,
        workdays: days,
        skippedDays: skipped,
        hinweis:
            "HINWEIS: Diese Berechnung ist ein technisches Hilfsmittel. " +
            "Die anwaltliche Fristenkontrolle obliegt dem zuständigen Anwalt. " +
            "Bitte eigenverantwortlich prüfen (§§ 186–193 BGB, § 222 ZPO).",
    };
}

/** Berechnet die Reaktionsfrist ab Zugang eines Schreibens (Werktage). */
export function berechneReaktionsfrist(
    zugangIso: string,
    werktageFrist: number,
    land: Bundesland = "NW",
): FristenResult {
    return berechneKalenderfrist(zugangIso, werktageFrist, {
        land,
        skipNonWorkdays: true,
    });
}

/** Berechnet Kündigungsfristen nach § 622 BGB anhand Betriebszugehörigkeit. */
export function berechne622BGB(
    eintrittIso: string,
    kuendigungIso: string,
): { fristMonate: number; fristEnde: string; hinweis: string } {
    const eintritt = new Date(eintrittIso);
    const kuendigung = new Date(kuendigungIso);

    if (Number.isNaN(eintritt.getTime()) || Number.isNaN(kuendigung.getTime())) {
        throw new Error("Ungültiges Datum");
    }

    const jahre = Math.floor(
        (kuendigung.getTime() - eintritt.getTime()) / (365.25 * 24 * 3600 * 1000),
    );

    let monate = 1; // Grundkündigung: 4 Wochen zum 15. oder Monatsende
    if (jahre >= 2) monate = 1;
    if (jahre >= 5) monate = 2;
    if (jahre >= 8) monate = 3;
    if (jahre >= 10) monate = 4;
    if (jahre >= 12) monate = 5;
    if (jahre >= 15) monate = 6;
    if (jahre >= 20) monate = 7;

    const ende = new Date(kuendigung);
    ende.setMonth(ende.getMonth() + monate);
    // Zum Monatsende
    ende.setDate(0); // Letzter Tag des Vormonats + monate

    return {
        fristMonate: monate,
        fristEnde: isoDate(ende),
        hinweis: `§ 622 Abs. 2 BGB: ${jahre} Dienstjahre → ${monate} Monat(e) Frist, zum Monatsende. ` +
            "Tarifverträge, Kollektivvereinbarungen und Probezeit prüfen. " +
            "Anwaltliche Überprüfung erforderlich.",
    };
}

/** Berechnet die absolute 3-Wochen-Frist für KSchG-Klage (§ 4 KSchG). */
export function berechneKschgFrist(kuendigungsZugangIso: string): FristenResult {
    return berechneKalenderfrist(kuendigungsZugangIso, 21, {
        skipNonWorkdays: false, // § 4 KSchG: Kalenderwochen
    });
}
