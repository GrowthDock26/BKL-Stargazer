/**
 * Anbindung an Open Legal Data (https://de.openlegaldata.io) — Entscheidungen
 * der INSTANZGERICHTE (OLG, LG, AG, VG, LAG, LSG …), die die amtliche
 * Bund-Quelle nicht führt.
 *
 * Warum diese Quelle: „Rechtsprechung im Internet" (rechtsprechung-im-internet.ts)
 * deckt nur die sechs obersten Bundesgerichte ab. Gerade im Kapitalanlagerecht
 * liegt ein großer Teil der einschlägigen Rechtsprechung aber bei den
 * Oberlandesgerichten — eine Recherche ohne sie bleibt lückenhaft.
 *
 * ZUGANG UND REGELN
 *
 * Die robots.txt von de.openlegaldata.io sperrt /api für Crawler; der Kommentar
 * unmittelbar darüber lädt zur Nutzung der Schnittstelle aber ausdrücklich ein
 * („download everything via our data dumps or API"). Die Sperre richtet sich
 * erkennbar gegen das Abgrasen der Website, nicht gegen die dafür vorgesehene
 * API. Wir halten uns deshalb an das, was der Betreiber inhaltlich verlangt:
 *
 *   - aussagekräftiger User-Agent mit Kontaktweg (Pflicht laut robots.txt),
 *   - keine Massenabzüge, nur anlassbezogene Suchen auf Nutzeranfrage,
 *   - Mindestabstand zwischen zwei Anfragen und Zwischenspeicher,
 *   - Host-Allowlist gegen SSRF, wie bei der Bund-Quelle.
 *
 * Wer den vollständigen Bestand braucht, nimmt die Datenabzüge des Projekts,
 * nicht diese Schnittstelle.
 *
 * LIZENZ: Open Database License (ODbL). Sie verlangt Namensnennung; die
 * Weitergabe abgeleiteter Datenbanken steht unter denselben Bedingungen. Für
 * die interne Nutzung in der Kanzlei ist das unproblematisch — deshalb reicht
 * jeder Treffer die Quellenangabe bis in die Oberfläche durch, statt sie zu
 * verschlucken. Die Entscheidungen sind nicht-amtliche Fassungen; maßgeblich
 * bleibt die Ausfertigung des Gerichts.
 */

import https from "https";

const ALLOWED_HOST = "de.openlegaldata.io";
const BASIS = `https://${ALLOWED_HOST}/api`;

export const OLD_ATTRIBUTION =
    "Open Legal Data (de.openlegaldata.io), Open Database License (ODbL) — " +
    "nicht-amtliche Fassung, maßgeblich ist die Ausfertigung des Gerichts";

/**
 * Pflicht laut robots.txt: ein genauer User-Agent, der den Betreiber benennt
 * oder einen Kontaktweg enthält. Über OPEN_LEGAL_DATA_USER_AGENT
 * überschreibbar, damit die Kanzlei ihren eigenen Kontakt eintragen kann.
 */
const USER_AGENT =
    process.env.OPEN_LEGAL_DATA_USER_AGENT ??
    "BKL-Legal-OS/1.0 (Kanzleisoftware; Kontakt: kanzlei@bkl-law.de)";

/** Mindestabstand zwischen zwei Anfragen. */
const MIN_ABSTAND_MS = 1000;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const TIMEOUT_MS = 25_000;
const MAX_TREFFER = 50;

let letzteAnfrage = 0;
let kette: Promise<unknown> = Promise.resolve();
const cache = new Map<string, { zeit: number; daten: unknown }>();

/**
 * Serialisiert alle Abrufe und hält den Mindestabstand ein.
 *
 * Ohne die Kette würde ein Modell, das mehrere Suchen gleichzeitig auslöst, den
 * Abstand aushebeln: Jeder Aufruf wartet dann zwar, aber alle warten parallel.
 */
async function hole<T>(pfad: string): Promise<T> {
    const url = `${BASIS}${pfad}`;
    const treffer = cache.get(url);
    if (treffer && Date.now() - treffer.zeit < CACHE_TTL_MS) return treffer.daten as T;

    const ausfuehren = async (): Promise<T> => {
        const wartezeit = MIN_ABSTAND_MS - (Date.now() - letzteAnfrage);
        if (wartezeit > 0) await new Promise((r) => setTimeout(r, wartezeit));
        letzteAnfrage = Date.now();

        const roh = await getJson(url);
        cache.set(url, { zeit: Date.now(), daten: roh });
        return roh as T;
    };

    kette = kette.then(ausfuehren, ausfuehren);
    return kette as Promise<T>;
}

function getJson(url: string): Promise<unknown> {
    const ziel = new URL(url);
    // Allowlist gegen SSRF — dieselbe Linie wie bei der Bund-Quelle.
    if (ziel.hostname !== ALLOWED_HOST || ziel.protocol !== "https:") {
        return Promise.reject(new Error(`Nicht erlaubter Host: ${ziel.hostname}`));
    }

    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            { headers: { "User-Agent": USER_AGENT, Accept: "application/json" } },
            (res) => {
                // Drosselung wird nicht stillschweigend als „keine Treffer"
                // verbucht: Eine gedrosselte Anfrage ist etwas anderes als ein
                // leeres Ergebnis, und der Anwender muss den Unterschied sehen.
                if (res.statusCode === 429) {
                    res.resume();
                    const retry = res.headers["retry-after"];
                    return reject(
                        new Error(
                            "Open Legal Data drosselt die Zugriffe (HTTP 429)" +
                                (retry ? `, erneut möglich in ${retry} s` : "") +
                                ". Bitte kurz warten.",
                        ),
                    );
                }
                if (!res.statusCode || res.statusCode >= 400) {
                    res.resume();
                    return reject(new Error(`HTTP ${res.statusCode} bei ${url}`));
                }
                let body = "";
                res.setEncoding("utf8");
                res.on("data", (c) => (body += c));
                res.on("end", () => {
                    try {
                        resolve(JSON.parse(body));
                    } catch (err) {
                        reject(new Error(`Antwort ist kein JSON: ${err}`));
                    }
                });
            },
        );
        req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error("Zeitüberschreitung")));
        req.on("error", reject);
    });
}

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

export type OldTreffer = {
    /** Klartextname, sofern auflösbar — sonst das Kürzel. */
    gericht: string | null;
    /** Das Kürzel der Quelle ("OLGK"), für Rückfragen und Debugging. */
    gerichtskuerzel: string | null;
    gerichtsstufe: string | null;
    entscheidungsdatum: string | null;
    aktenzeichen: string | null;
    doktyp: string | null;
    /** Fundstellenkontext aus der Suche, ohne Auszeichnungen. */
    vorschau: string | null;
    /**
     * Kennung für ladeInstanzEntscheidung(). Bewusst eine vollständige URL:
     * get_case_law erkennt am Host, welche Quelle gemeint ist, und die
     * Werkzeugschnittstelle zum Modell bleibt bei einem einzigen Feld.
     */
    link: string;
    quelle: "instanz";
    attribution: string;
};

export type OldEntscheidung = {
    gericht: string | null;
    entscheidungsdatum: string | null;
    aktenzeichen: string | null;
    doktyp: string | null;
    ecli: string | null;
    volltext: string;
    quelleUrl: string;
    attribution: string;
};

type SucheAntwort = {
    count: number;
    results: {
        id: number;
        court: string | null;
        court_level_of_appeal?: string | null;
        court_jurisdiction?: string | null;
        date: string | null;
        slug: string | null;
        decision_type?: string | null;
        snippets?: { text: string }[];
    }[];
};

function entferneAuszeichnungen(html: string): string {
    return html
        .replace(/<[^>]+>/g, " ")
        // Numerische Referenzen zuerst: Die Quelle liefert Umlaute und
        // Gedankenstriche durchgängig als &#228; / &#8211;. Ohne diesen Schritt
        // stehen sie roh im Entscheidungstext — und damit in jedem Zitat, das
        // daraus übernommen wird.
        .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dez: string) => String.fromCodePoint(parseInt(dez, 10)))
        .replace(/&nbsp;/g, " ")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        // &amp; zuletzt: sonst würde "&amp;#228;" zu einem echten Umlaut
        // aufgelöst statt als literaler Text erhalten zu bleiben.
        .replace(/&amp;/g, "&")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/**
 * Rekonstruiert das Aktenzeichen aus dem Slug, weil die Suchantwort es nicht
 * als eigenes Feld führt: "olgk-2007-11-23-24-w-5207" → "24 W 52/07".
 *
 * Der Slug verliert Schrägstrich und Großschreibung. Beides ist mechanisch
 * wiederherstellbar: Der Registerbuchstabe wird großgeschrieben, und die
 * letzten beiden Ziffern der Endgruppe sind das Jahr.
 *
 * WICHTIG: Das bleibt eine Rekonstruktion. Verbindlich ist das `file_number`
 * aus der Detailantwort, das ladeInstanzEntscheidung() liefert — deshalb darf
 * aus der Trefferliste heraus nicht zitiert werden.
 */
function aktenzeichenAusSlug(slug: string | null): string | null {
    if (!slug) return null;
    const teile = slug.split("-");
    const datumIndex = teile.findIndex(
        (t, i) => /^\d{4}$/.test(t) && /^\d{2}$/.test(teile[i + 1] ?? ""),
    );
    if (datumIndex < 0) return null;

    const rest = teile.slice(datumIndex + 3);
    if (rest.length === 0) return null;

    const aufbereitet = rest.map((t, i) => {
        // Registerbuchstabe (W, U, O, ZR …) groß.
        if (/^[a-z]{1,3}$/.test(t)) return t.toUpperCase();
        // Endgruppe: mindestens drei Ziffern, die letzten beiden sind das Jahr.
        if (i === rest.length - 1 && /^\d{3,}$/.test(t)) {
            return `${t.slice(0, -2)}/${t.slice(-2)}`;
        }
        return t;
    });
    return aufbereitet.join(" ") || null;
}

// ---------------------------------------------------------------------------
// Gerichtsnamen
// ---------------------------------------------------------------------------

/**
 * Die Suche liefert Gerichte nur als Kürzel ("OLGK", "LGD"). Für eine
 * Trefferliste, die jemand überfliegen soll, ist das zu wenig — "OLGK" und
 * "OLGKOBL" unterscheidet man nicht im Vorbeigehen.
 *
 * Aufgelöst wird nur, was in den Treffern wirklich vorkommt (eine Anfrage je
 * unbekanntem Kürzel), und das Ergebnis bleibt dauerhaft im Speicher:
 * Gerichtsnamen ändern sich praktisch nie. Scheitert die Auflösung, bleibt das
 * Kürzel stehen — ein fehlender Klartextname ist kein Grund, die Suche
 * scheitern zu lassen.
 */
const gerichtsnamen = new Map<string, string>();

async function loeseGerichtsnamenAuf(codes: string[]): Promise<void> {
    const offen = [...new Set(codes.filter((c) => c && !gerichtsnamen.has(c)))];
    for (const code of offen) {
        try {
            const antwort = await hole<{ results?: { name?: string; code?: string }[] }>(
                `/courts/?code=${encodeURIComponent(code)}&page_size=1`,
            );
            const name = antwort.results?.[0]?.name;
            if (name) gerichtsnamen.set(code, name);
        } catch {
            // bewusst still: Kürzel bleibt stehen
        }
    }
}

// ---------------------------------------------------------------------------
// Suche
// ---------------------------------------------------------------------------

/**
 * Volltextsuche über die Entscheidungstexte der Instanzgerichte.
 *
 * `gericht`, `von` und `bis` filtern nach dem Abruf: Die Schnittstelle kennt
 * numerische Gerichts-IDs, aber keinen Freitext-Gerichtsfilter, und eine
 * ID-Auflösung wäre eine zusätzliche Anfrage je Suche.
 */
export async function sucheInstanzRechtsprechung(opts: {
    query: string;
    gericht?: string;
    von?: string;
    bis?: string;
    limit?: number;
}): Promise<{ gesamttreffer: number; treffer: OldTreffer[] }> {
    const query = (opts.query ?? "").trim();
    if (!query) return { gesamttreffer: 0, treffer: [] };

    const limit = Math.min(Math.max(opts.limit ?? 20, 1), MAX_TREFFER);
    // Doppelt so viele holen wie angefordert, weil Gericht und Zeitraum erst
    // nach dem Abruf filtern — sonst bleibt bei gesetztem Filter oft nichts übrig.
    const params = new URLSearchParams({
        text: query,
        page_size: String(Math.min(limit * 2, MAX_TREFFER)),
    });

    const antwort = await hole<SucheAntwort>(`/cases/search/?${params.toString()}`);

    await loeseGerichtsnamenAuf((antwort.results ?? []).map((r) => r.court ?? ""));

    let treffer: OldTreffer[] = (antwort.results ?? []).map((r) => ({
        gericht: (r.court ? gerichtsnamen.get(r.court) : null) ?? r.court ?? null,
        gerichtskuerzel: r.court ?? null,
        gerichtsstufe: r.court_level_of_appeal ?? null,
        entscheidungsdatum: r.date ?? null,
        aktenzeichen: aktenzeichenAusSlug(r.slug),
        doktyp: r.decision_type ?? null,
        vorschau: r.snippets?.length
            ? entferneAuszeichnungen(r.snippets.map((s) => s.text).join(" … "))
            : null,
        link: `https://${ALLOWED_HOST}/api/cases/${r.id}/`,
        quelle: "instanz" as const,
        attribution: OLD_ATTRIBUTION,
    }));

    if (opts.gericht) {
        const suchbegriff = opts.gericht.toLowerCase();
        treffer = treffer.filter(
            (t) =>
                (t.gericht ?? "").toLowerCase().includes(suchbegriff) ||
                (t.gerichtsstufe ?? "").toLowerCase().includes(suchbegriff),
        );
    }
    if (opts.von) {
        treffer = treffer.filter((t) => !t.entscheidungsdatum || t.entscheidungsdatum >= opts.von!);
    }
    if (opts.bis) {
        treffer = treffer.filter((t) => !t.entscheidungsdatum || t.entscheidungsdatum <= opts.bis!);
    }

    return { gesamttreffer: antwort.count ?? treffer.length, treffer: treffer.slice(0, limit) };
}

/** Erkennt, ob ein `link` aus einem Treffer zu dieser Quelle gehört. */
export function istInstanzLink(link: string): boolean {
    try {
        return new URL(link).hostname === ALLOWED_HOST;
    } catch {
        return false;
    }
}

export async function ladeInstanzEntscheidung(link: string): Promise<OldEntscheidung> {
    const ziel = new URL(link);
    if (ziel.hostname !== ALLOWED_HOST) throw new Error(`Nicht erlaubter Host: ${ziel.hostname}`);

    const id = ziel.pathname.match(/\/cases\/(\d+)\//)?.[1];
    if (!id) throw new Error(`Keine Entscheidungs-ID in ${link}`);

    const d = await hole<{
        id: number;
        court?: { name?: string; slug?: string } | string | null;
        date?: string | null;
        file_number?: string | null;
        type?: string | null;
        ecli?: string | null;
        content?: string | null;
        slug?: string | null;
    }>(`/cases/${id}/`);

    const gericht = typeof d.court === "string" ? d.court : (d.court?.name ?? null);

    return {
        gericht,
        entscheidungsdatum: d.date ?? null,
        aktenzeichen: d.file_number ?? aktenzeichenAusSlug(d.slug ?? null),
        doktyp: d.type ?? null,
        ecli: d.ecli ?? null,
        volltext: entferneAuszeichnungen(d.content ?? ""),
        quelleUrl: d.slug
            ? `https://${ALLOWED_HOST}/case/${d.slug}`
            : `https://${ALLOWED_HOST}/api/cases/${id}/`,
        attribution: OLD_ATTRIBUTION,
    };
}
