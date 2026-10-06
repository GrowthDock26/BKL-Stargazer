/**
 * Erkennt, ob die Textebene eines PDFs echter Text oder OCR-Rauschen ist.
 *
 * Gescannte handschriftliche Dokumente kommen häufig MIT Textebene an: der
 * Scanner hat eine OCR laufen lassen, die an der Handschrift gescheitert ist
 * und Zeichensalat hinterlassen hat. Beispiel aus einem echten Mandantenbrief:
 *
 *     "2, lq 7ö  I 2 11 t/l 4, a 7-  (/   r,  2t 7' ?1 ,s 4 g  ,61"
 *
 * Das sind 770 Zeichen — jede Längenschwelle hält das für Text. Erst die
 * Wortstruktur verrät den Unterschied: echter deutscher Text besteht zu einem
 * erheblichen Teil aus zusammenhängenden Buchstabenfolgen ab vier Zeichen,
 * OCR-Rauschen fast gar nicht.
 *
 * Deterministisch, kein LLM.
 */

/** Kürzere Textebenen sind ohnehin nicht auswertbar. */
const MINDESTLAENGE = 100;

/**
 * Anteil echter Wörter, ab dem eine Textebene als brauchbar gilt.
 *
 * Gemessen an realen Vorlagen: deutsche Fließtexte liegen über 0,4, das oben
 * zitierte OCR-Rauschen bei 0,0. Der Wert liegt bewusst tief — im Zweifel
 * lieber die Vision-Strecke nutzen (kostet etwas mehr) als Buchstabensalat
 * auswerten (liefert garantiert nichts).
 */
const MINDEST_WORTANTEIL = 0.15;

const BUCHSTABEN = /^[A-Za-zÄÖÜäöüßÀ-ÿ]{4,}$/;
const RANDZEICHEN = /^[^A-Za-zÄÖÜäöüßÀ-ÿ]+|[^A-Za-zÄÖÜäöüßÀ-ÿ]+$/g;

export type Textbewertung = {
    brauchbar: boolean;
    zeichen: number;
    tokens: number;
    woerter: number;
    wortanteil: number;
    grund: string;
};

/**
 * Bewertet eine extrahierte Textebene.
 *
 * Satzzeichen am Wortrand werden vor der Prüfung entfernt, damit "Herren,"
 * als Wort zählt, "t/l" aber nicht.
 */
export function bewerteTextebene(roh: string): Textbewertung {
    const text = (roh ?? "").trim();
    const zeichen = text.length;

    if (zeichen < MINDESTLAENGE) {
        return {
            brauchbar: false,
            zeichen,
            tokens: 0,
            woerter: 0,
            wortanteil: 0,
            grund: `Textebene zu kurz (${zeichen} Zeichen, mindestens ${MINDESTLAENGE}).`,
        };
    }

    const tokens = text.split(/\s+/).filter(Boolean);
    const woerter = tokens.filter((t) => BUCHSTABEN.test(t.replace(RANDZEICHEN, ""))).length;
    const wortanteil = tokens.length > 0 ? woerter / tokens.length : 0;

    if (wortanteil < MINDEST_WORTANTEIL) {
        return {
            brauchbar: false,
            zeichen,
            tokens: tokens.length,
            woerter,
            wortanteil,
            grund:
                `Textebene wirkt wie OCR-Rauschen (nur ${(wortanteil * 100).toFixed(0)} % erkennbare Wörter, ` +
                `${woerter} von ${tokens.length} Zeichenfolgen). Wird als Bild ausgewertet.`,
        };
    }

    return {
        brauchbar: true,
        zeichen,
        tokens: tokens.length,
        woerter,
        wortanteil,
        grund: `Brauchbare Textebene (${(wortanteil * 100).toFixed(0)} % erkennbare Wörter).`,
    };
}
