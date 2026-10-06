/**
 * Anbindung an die offizielle Bund-Quelle „Rechtsprechung im Internet"
 * (https://www.rechtsprechung-im-internet.de) — Entscheidungen der obersten
 * Bundesgerichte (BVerfG, BGH, BVerwG, BFH, BAG, BSG) als maschinenlesbare
 * XML-Daten.
 *
 * Zwei Suchpfade:
 *   1. sucheRechtsprechung()     — durchsucht nur das Inhaltsverzeichnis
 *      (rii-toc.xml, >10 MB, Gericht/Datum/Aktenzeichen als Metadaten). Kein
 *      Volltext — nur zum Eingrenzen nach Gericht/Zeitraum ohne Suchbegriff.
 *   2. volltextsucheRechtsprechung() — nutzt die echte Volltextsuche des
 *      Justizportals (Suchmaske "Suchbegriffe"), die Entscheidungstexte
 *      selbst durchsucht, nicht nur Metadaten. Das ist der Pfad, den die
 *      Assistentin für inhaltliche Rechercheanfragen ("Rechtsprechung zu X")
 *      nutzen sollte — reine Metadatensuche findet damit kaum etwas.
 *
 * Beide Pfade liefern ein `link`-Feld im selben Format (ZIP-URL je
 * Entscheidung), sodass ladeEntscheidung() unverändert für beide funktioniert.
 *
 * Das ToC wird im Speicher gecacht (TTL), damit nicht bei jeder Suche 10 MB
 * geladen werden müssen.
 *
 * SICHERHEIT: Es werden ausschließlich URLs des Hosts
 * www.rechtsprechung-im-internet.de abgerufen (Allowlist gegen SSRF).
 */

import https from "https";
import JSZip from "jszip";

const ALLOWED_HOST = "www.rechtsprechung-im-internet.de";
const TOC_URL = `https://${ALLOWED_HOST}/rii-toc.xml`;
const SEARCH_URL = `https://${ALLOWED_HOST}/jportal/portal/page/bsjrsprod.psml/js_peid/Suchportlet1/media-type/html`;
const TOC_TTL_MS = 12 * 60 * 60 * 1000; // 12 Stunden
const MAX_TREFFER = 200;

let tocCache: { xml: string; fetchedAt: number } | null = null;

export type RspTreffer = {
    gericht: string | null;
    entscheidungsdatum: string | null; // ISO yyyy-mm-dd
    aktenzeichen: string | null;
    link: string; // https-ZIP-URL der Einzelentscheidung
};

export type RspVolltextTreffer = {
    docId: string;
    gericht: string | null;
    aktenzeichen: string | null;
    entscheidungsdatum: string | null; // ISO yyyy-mm-dd
    doktyp: string | null;
    titel: string | null;
    normen: string | null;
    /** Kurzer Ausschnitt mit Fundstelle(n) des Suchbegriffs im Kontext. */
    vorschau: string | null;
    link: string; // https-ZIP-URL der Einzelentscheidung (= ladeEntscheidung-kompatibel)
};

export type RspEntscheidung = {
    doknr: string | null;
    ecli: string | null;
    gericht: string | null;       // gertyp, z.B. "BGH"
    spruchkoerper: string | null; // z.B. "9. Zivilsenat"
    entscheidungsdatum: string | null; // ISO yyyy-mm-dd
    aktenzeichen: string | null;
    doktyp: string | null;        // Urteil, Beschluss …
    normen: string | null;        // angewandte Vorschriften
    titelzeile: string | null;
    leitsatz: string | null;
    volltext: string;             // bereinigter Klartext aller Inhaltsteile
    quelleUrl: string;
};

// ---------------------------------------------------------------------------
// HTTP — nur Allowlist-Host, mit Redirect-Behandlung
// ---------------------------------------------------------------------------

function assertAllowed(url: string): URL {
    const u = new URL(url.replace(/^http:\/\//, "https://"));
    if (u.hostname !== ALLOWED_HOST) {
        throw new Error(`Nicht erlaubter Host: ${u.hostname}`);
    }
    return u;
}

function httpsGet(url: string, redirects = 0): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        if (redirects > 5) return reject(new Error("Zu viele Weiterleitungen"));
        let u: URL;
        try { u = assertAllowed(url); } catch (e) { return reject(e); }
        https.get(u, (res) => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
                res.resume();
                return resolve(httpsGet(res.headers.location, redirects + 1));
            }
            if (status !== 200) {
                res.resume();
                return reject(new Error(`HTTP ${status} für ${u.href}`));
            }
            const chunks: Buffer[] = [];
            res.on("data", (c) => chunks.push(c as Buffer));
            res.on("end", () => resolve(Buffer.concat(chunks)));
            res.on("error", reject);
        }).on("error", reject);
    });
}

// ---------------------------------------------------------------------------
// Hilfen
// ---------------------------------------------------------------------------

function isoDate(d: string | null): string | null {
    if (!d) return null;
    const m = d.match(/^(\d{4})(\d{2})(\d{2})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function normalize(s?: string | null): string {
    return (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

// Inneren Inhalt des ersten <tag>…</tag> zurückgeben (null bei selbstschließend)
function tagInhalt(name: string, xml: string): string | null {
    const m = xml.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`));
    return m ? m[1] : null;
}

// HTML/Markup aus einem Inhaltsteil in lesbaren Klartext überführen
function stripHtml(s: string | null): string {
    if (!s) return "";
    return s
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/(p|dd|dt|div|tr|li)>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]*\n[ \t]*/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

// ---------------------------------------------------------------------------
// ToC laden (gecacht) + durchsuchen
// ---------------------------------------------------------------------------

async function getToc(force = false): Promise<string> {
    const now = Date.now();
    if (!force && tocCache && now - tocCache.fetchedAt < TOC_TTL_MS) return tocCache.xml;
    const buf = await httpsGet(TOC_URL);
    tocCache = { xml: buf.toString("utf8"), fetchedAt: now };
    return tocCache.xml;
}

const ITEM_RE = /<item>([\s\S]*?)<\/item>/g;

/**
 * Durchsucht das Inhaltsverzeichnis. Filter (alle optional, UND-verknüpft):
 *   q       — Substring in Gericht ODER Aktenzeichen
 *   gericht — Substring im Gericht (z.B. "BGH", "BAG")
 *   von/bis — Entscheidungsdatum (ISO yyyy-mm-dd), inklusiv
 * Ergebnis ist nach Datum absteigend (neueste zuerst) und auf `limit` begrenzt.
 */
export async function sucheRechtsprechung(opts: {
    q?: string; gericht?: string; von?: string; bis?: string; limit?: number;
}): Promise<RspTreffer[]> {
    const xml = await getToc();
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), MAX_TREFFER);
    const qNorm = normalize(opts.q);
    const gerNorm = normalize(opts.gericht);
    const von = opts.von ? opts.von.replace(/-/g, "") : null; // yyyymmdd
    const bis = opts.bis ? opts.bis.replace(/-/g, "") : null;

    const treffer: (RspTreffer & { _sort: string })[] = [];
    let m: RegExpExecArray | null;
    ITEM_RE.lastIndex = 0;
    while ((m = ITEM_RE.exec(xml)) !== null) {
        const block = m[1];
        const gericht = tagInhalt("gericht", block)?.trim() ?? null;
        const datum = tagInhalt("entsch-datum", block)?.trim() ?? null; // yyyymmdd
        const az = tagInhalt("aktenzeichen", block)?.trim() ?? null;
        const link = tagInhalt("link", block)?.trim() ?? null;
        if (!link) continue;
        if (von && datum && datum < von) continue;
        if (bis && datum && datum > bis) continue;
        if (gerNorm && !normalize(gericht).includes(gerNorm)) continue;
        if (qNorm && !normalize(`${gericht ?? ""} ${az ?? ""}`).includes(qNorm)) continue;

        treffer.push({
            gericht,
            entscheidungsdatum: isoDate(datum),
            aktenzeichen: az,
            link: link.replace(/^http:\/\//, "https://"),
            _sort: datum ?? "",
        });
    }

    treffer.sort((a, b) => b._sort.localeCompare(a._sort));
    return treffer.slice(0, limit).map(({ _sort, ...t }) => { void _sort; return t; });
}

// ---------------------------------------------------------------------------
// Einzelentscheidung laden
// ---------------------------------------------------------------------------

const TEIL_LABEL: Record<string, string> = {
    titelzeile: "Titel",
    leitsatz: "Leitsatz",
    tenor: "Tenor",
    tatbestand: "Tatbestand",
    entscheidungsgruende: "Entscheidungsgründe",
    gruende: "Gründe",
    abwmeinung: "Abweichende Meinung",
    sonstosatz: "Sonstiger Orientierungssatz",
};

/**
 * Lädt eine Einzelentscheidung über ihre ZIP-Link-URL (aus sucheRechtsprechung)
 * und liefert Metadaten plus bereinigten Volltext.
 */
export async function ladeEntscheidung(link: string): Promise<RspEntscheidung> {
    const u = assertAllowed(link);
    const buf = await httpsGet(u.href);
    const zip = await JSZip.loadAsync(buf);
    const name = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".xml"));
    if (!name) throw new Error("Keine XML-Datei im Entscheidungs-Archiv gefunden");
    const xml = await zip.file(name)!.async("string");

    const meta = (t: string) => tagInhalt(t, xml)?.trim() ?? null;
    const teil = (t: string) => stripHtml(tagInhalt(t, xml));

    const volltextTeile = Object.keys(TEIL_LABEL)
        .map((t) => {
            const inhalt = teil(t);
            return inhalt ? `## ${TEIL_LABEL[t]}\n${inhalt}` : "";
        })
        .filter(Boolean);

    return {
        doknr: meta("doknr"),
        ecli: meta("ecli") || null,
        gericht: meta("gertyp"),
        spruchkoerper: meta("spruchkoerper"),
        entscheidungsdatum: isoDate(meta("entsch-datum")),
        aktenzeichen: meta("aktenzeichen"),
        doktyp: meta("doktyp"),
        normen: meta("norm"),
        titelzeile: teil("titelzeile") || null,
        leitsatz: teil("leitsatz") || null,
        volltext: volltextTeile.join("\n\n"),
        quelleUrl: u.href,
    };
}

// ---------------------------------------------------------------------------
// Volltextsuche (echte Suchmaske des Justizportals, kein Metadaten-Grep)
// ---------------------------------------------------------------------------

function stripTagsToText(s: string): string {
    return s
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
        .replace(/\s+/g, " ")
        .trim();
}

function isoDateFromDMY(d: string | null): string | null {
    if (!d) return null;
    const m = d.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Parst die Trefferliste der HTML-Suchergebnisseite in strukturierte Treffer. */
function parseVolltextTrefferHtml(html: string): RspVolltextTreffer[] {
    const blocks = html.split(/<tr valign="top">/).slice(1);
    const treffer: RspVolltextTreffer[] = [];
    const seen = new Set<string>();

    for (const block of blocks) {
        const docIdMatch = block.match(/doc\.id=(jb-[A-Za-z0-9]+)/);
        if (!docIdMatch) continue;
        const docId = docIdMatch[1];
        if (seen.has(docId)) continue; // jeder Treffer erscheint 2x (Kurztext/Langtext-Link)
        seen.add(docId);

        const dateMatch = block.match(/<span\s*>(\d{2}\.\d{2}\.\d{4})<\/span>/);
        const gerichtAzMatch = block.match(
            /<strong>([^<]+)<\/strong>\s*\|\s*([^<]+?)<span class='tlAsyncData'/,
        );
        const doktypMatch = block.match(/<em>([^<]+)<\/em>/);
        const titelMatch = block.match(/<\/em>\s*\|\s*<strong>([^<]+)<\/strong>/);
        const normenMatch = block.match(/<\/strong>\s*\n?\s*\|\s*([^<]+)<\/span>/);
        const previewMatch = block.match(
            /<span class="docPreview">([\s\S]*?)<\/span>\s*\n*\s*\n*\s*<\/a>/,
        );

        treffer.push({
            docId,
            gericht: gerichtAzMatch ? gerichtAzMatch[1].trim() : null,
            aktenzeichen: gerichtAzMatch ? gerichtAzMatch[2].trim() : null,
            entscheidungsdatum: isoDateFromDMY(dateMatch ? dateMatch[1] : null),
            doktyp: doktypMatch ? doktypMatch[1].trim() : null,
            titel: titelMatch ? stripTagsToText(titelMatch[1]) : null,
            normen: normenMatch ? stripTagsToText(normenMatch[1]) : null,
            vorschau: previewMatch
                ? stripTagsToText(previewMatch[1]).slice(0, 400)
                : null,
            link: `https://${ALLOWED_HOST}/jportal/docs/bsjrs/${docId}.zip`,
        });
    }
    return treffer;
}

/**
 * Echte Volltextsuche über die Suchmaske von rechtsprechung-im-internet.de.
 * Durchsucht die Entscheidungstexte selbst (nicht nur Gericht/Aktenzeichen
 * wie sucheRechtsprechung). `gericht`/`von`/`bis` filtern die Treffer nach
 * dem Abruf zusätzlich clientseitig, da die einfache Suchmaske keine
 * serverseitigen Facetten dafür anbietet.
 */
export async function volltextsucheRechtsprechung(opts: {
    query: string;
    gericht?: string;
    von?: string; // ISO yyyy-mm-dd
    bis?: string;
    limit?: number;
}): Promise<{ gesamttreffer: number; treffer: RspVolltextTreffer[] }> {
    const query = opts.query.trim();
    if (!query) return { gesamttreffer: 0, treffer: [] };

    const params = new URLSearchParams({
        query,
        form: "bsjrsFastSearch",
        action: "portlets.jw.MainAction",
        eventSubmit_doSearch: "suchen",
        deletemask: "no",
        wt_form: "1",
        desc: "all",
    });
    const buf = await httpsGet(`${SEARCH_URL}?${params.toString()}`);
    const html = buf.toString("utf8");

    const gesamtMatch = html.match(
        /id='numberhits'>\s*<span[^>]*>([\d.]+)<\/span>/,
    );
    const gesamttreffer = gesamtMatch
        ? parseInt(gesamtMatch[1].replace(/\./g, ""), 10)
        : 0;

    let treffer = parseVolltextTrefferHtml(html);

    const gerNorm = normalize(opts.gericht);
    const von = opts.von ?? null;
    const bis = opts.bis ?? null;
    if (gerNorm) {
        treffer = treffer.filter((t) => normalize(t.gericht).includes(gerNorm));
    }
    if (von) {
        treffer = treffer.filter(
            (t) => !t.entscheidungsdatum || t.entscheidungsdatum >= von,
        );
    }
    if (bis) {
        treffer = treffer.filter(
            (t) => !t.entscheidungsdatum || t.entscheidungsdatum <= bis,
        );
    }

    const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
    return { gesamttreffer, treffer: treffer.slice(0, limit) };
}
