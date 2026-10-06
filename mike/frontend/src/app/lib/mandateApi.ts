/**
 * BKL Legal OS — Mandate API client.
 * Calls the BKL-specific backend routes (/orgs, /matters, /intake, /onboarding).
 */

import { supabase } from "@/lib/supabase";

const API_BASE =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

/** Sekunden vor Ablauf, ab denen das Token vorsorglich erneuert wird. */
const TOKEN_PUFFER = 120;

export const SITZUNG_ABGELAUFEN =
    "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich in einem NEUEN Browser-Tab an " +
    "und klicken Sie hier anschließend erneut auf Speichern — Ihre Eingaben bleiben dabei erhalten.";

/**
 * Authorization-Header, mit vorsorglicher Erneuerung der Sitzung.
 *
 * supabase.auth.getSession() liefert die gespeicherte Sitzung zurück und
 * erneuert nicht zuverlässig von selbst. Beim Ausfüllen langer Formulare —
 * Aufnahmebogen, PRE-Fragebogen — lief das Token deshalb ab, und das
 * Speichern scheiterte mit "Invalid or expired token", nachdem alles
 * eingetippt war. Deshalb wird hier gegen expires_at geprüft und rechtzeitig
 * erneuert.
 */
async function authHeaders(): Promise<Record<string, string>> {
    let { data: { session } } = await supabase.auth.getSession();

    const jetzt = Math.floor(Date.now() / 1000);
    if (session?.expires_at && session.expires_at - jetzt < TOKEN_PUFFER) {
        const { data } = await supabase.auth.refreshSession();
        if (data.session) session = data.session;
    }

    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

/**
 * Führt eine Anfrage mit Authentifizierung aus und wiederholt sie einmal,
 * falls der Server 401 meldet — etwa wenn das Token genau zwischen Prüfung
 * und Ankunft beim Server abläuft.
 */
async function fetchMitAuth(url: string, init?: RequestInit, accept = true): Promise<Response> {
    const bauen = async (): Promise<Response> => {
        const headers = await authHeaders();
        return fetch(url, {
            cache: "no-store",
            ...init,
            headers: {
                ...(accept ? { Accept: "application/json" } : {}),
                ...headers,
                ...(init?.headers as Record<string, string> | undefined),
            },
        });
    };

    let res = await bauen();
    if (res.status === 401) {
        const { data } = await supabase.auth.refreshSession();
        if (data.session) res = await bauen();
    }
    return res;
}

/** Wandelt eine Fehlerantwort in eine verständliche Meldung. */
async function fehlerAus(res: Response): Promise<Error> {
    if (res.status === 401) return new Error(SITZUNG_ABGELAUFEN);
    const txt = await res.text();
    let msg = txt;
    try { msg = (JSON.parse(txt) as { detail?: string }).detail ?? txt; } catch { /* noop */ }
    return new Error(msg || `Fehler ${res.status}`);
}

async function apiReq<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetchMitAuth(`${API_BASE}${path}`, init);
    if (!res.ok) throw await fehlerAus(res);
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Orgs
// ---------------------------------------------------------------------------

export type Org = {
    id: string;
    name: string;
    slug: string;
    role: string;
    created_at: string;
};

export async function listOrgs(): Promise<Org[]> {
    return apiReq<Org[]>("/orgs");
}

export async function createOrg(name: string): Promise<Org> {
    return apiReq<Org>("/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
}

// ---------------------------------------------------------------------------
// Matters
// ---------------------------------------------------------------------------

export const MATTER_KATEGORIEN = [
    { value: "erbrecht", label: "Erbrecht" },
    { value: "gesellschaftsrecht", label: "Gesellschaftsrecht" },
    { value: "kapitalmarktrecht", label: "Kapitalmarktrecht" },
    { value: "pro_real", label: "Pro Real Mandat" },
    { value: "steuerrecht", label: "Steuerrecht" },
    { value: "sonstiges", label: "sonstiges Beratungsmandat" },
] as const;

export type MatterKategorie = (typeof MATTER_KATEGORIEN)[number]["value"];

/**
 * Der GwG-Ablauf ist Hausregel für alle Mandatskategorien — siehe
 * unterliegtGwgAblauf() in backend/src/lib/tools/gwg.ts, die maßgebliche
 * Stelle. Ein Anwalt kann ihn im Einzelfall mit Begründung abwählen.
 *
 * Bleibt als Funktion bestehen, damit eine spätere Einschränkung auf einzelne
 * Kategorien nur hier und im Backend geändert werden muss.
 */
export function unterliegtGwgAblauf(_kategorie: MatterKategorie): boolean {
    return true;
}

export type Matter = {
    id: string;
    org_id: string;
    aktenzeichen: string | null;
    bezeichnung: string;
    state: string;
    kategorie: MatterKategorie;
    zustaendiger_anwalt_id: string | null;
    /**
     * Mandant handelt als Unternehmer (§ 14 BGB). Dann besteht kein
     * Widerrufsrecht (§§ 312 ff., 355 BGB) und das Onboarding-Paket wird ohne
     * Widerrufsbelehrung erzeugt.
     */
    unternehmensmandat?: boolean;
    /** Zeitpunkt der Archivierung durch einen Admin. null = aktiv. Löscht nichts. */
    archiviert_am: string | null;
    created_at: string;
    updated_at: string;
};

export type MatterDetail = Matter & {
    anfrage: string | null;
    mandant_name: string | null;
    mandant_email: string | null;
    begleitmail_betreff: string | null;
    begleitmail_text: string | null;
    gwg_mail_betreff: string | null;
    gwg_mail_text: string | null;
    /** Gesetzt, wenn ein Anwalt die Identifizierungsstrecke abgewählt hat. */
    gwg_uebersprungen_at: string | null;
    gwg_uebersprungen_grund: string | null;
    sachbearbeiter: string | null;
    pauschale_vereinbart?: boolean;
    pauschale_zweck?: string | null;
    pauschale_betrag?: string | null;
    pauschale_umfang?: string | null;
    pauschale_turnus?: PauschaleTurnus | null;
    /**
     * Rolle des angemeldeten Nutzers in der Kanzlei dieser Akte. Dient nur der
     * UI-Darstellung — die Durchsetzung erfolgt serverseitig.
     */
    user_role: OrgRolle;
    possible_next_states: string[];
    transitions: MatterTransition[];
    fristen: Frist[];
};

export type OrgRolle = "Admin" | "Anwalt" | "Referendar" | "ReFa";

export type MatterTransition = {
    from_state: string;
    to_state: string;
    triggered_by: string;
    role: string;
    description: string | null;
    created_at: string;
};

export type Frist = {
    id: string;
    typ: string;
    startdatum: string;
    fristende: string;
    reminderdatum: string | null;
    erledigt: boolean;
    notiz: string | null;
    /** Zeitpunkt der versandten Vorfrist-Erinnerung (null = noch nicht erinnert). */
    reminder_gesendet_at?: string | null;
    /** Zeitpunkt der versandten Ablauf-Benachrichtigung. */
    ablauf_benachrichtigt_at?: string | null;
};

export async function listMatters(orgId: string, opts?: { mitArchivierten?: boolean }): Promise<Matter[]> {
    const params = new URLSearchParams({ org_id: orgId });
    if (opts?.mitArchivierten) params.set("mit_archivierten", "true");
    return apiReq<Matter[]>(`/matters?${params.toString()}`);
}

/** Nur Admin. Blendet die Akte aus der Standardübersicht aus — löscht nichts. */
export async function archiveMatter(matterId: string): Promise<{ id: string; archiviert_am: string }> {
    return apiReq(`/matters/${matterId}/archivieren`, { method: "POST" });
}

export async function unarchiveMatter(matterId: string): Promise<{ id: string; archiviert_am: string | null }> {
    return apiReq(`/matters/${matterId}/entarchivieren`, { method: "POST" });
}

export type CreateMatterResult = Matter & {
    uploaded_documents: number;
    pro_real_workflow: boolean;
    /**
     * Ergebnis der automatischen Erzeugung des Onboarding-Pakets (Anschreiben,
     * Honorarvereinbarung, Vollmacht und — außer beim Unternehmensmandat —
     * Widerrufsbelehrung) samt Begleitmail-Entwurf.
     */
    onboarding_paket:
        | {
              ok: true;
              dokumente: { typ: string; doc_id: string; hat_pdf: boolean }[];
              fehlende_vorlagen: string[];
              warnungen: string[];
              begleitmail_betreff: string;
              begleitmail_text: string;
              begleitmail_warnung?: string;
          }
        | { ok: false; hinweis: string }
        | null;
    gwg_anschreiben: { betreff: string; text: string } | null;
};

export async function createMatter(payload: {
    org_id: string;
    bezeichnung: string;
    aktenzeichen?: string;
    kategorie: MatterKategorie;
    anfrage?: string;
    mandant_name?: string;
    mandant_email?: string;
    unternehmensmandat?: boolean;
    dateien?: File[];
}): Promise<CreateMatterResult> {
    const headers = await authHeaders();
    const form = new FormData();
    form.append("org_id", payload.org_id);
    form.append("bezeichnung", payload.bezeichnung);
    form.append("kategorie", payload.kategorie);
    form.append("unternehmensmandat", payload.unternehmensmandat ? "true" : "false");
    if (payload.aktenzeichen) form.append("aktenzeichen", payload.aktenzeichen);
    if (payload.anfrage) form.append("anfrage", payload.anfrage);
    if (payload.mandant_name) form.append("mandant_name", payload.mandant_name);
    if (payload.mandant_email) form.append("mandant_email", payload.mandant_email);
    if (payload.dateien) for (const f of payload.dateien) form.append("dateien", f);

    const res = await fetchMitAuth(`${API_BASE}/matters`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) {
        const txt = await res.text();
        let msg = txt;
        try { msg = (JSON.parse(txt) as { detail?: string }).detail ?? txt; } catch { /* noop */ }
        throw new Error(msg || `Fehler ${res.status}`);
    }
    return res.json() as Promise<CreateMatterResult>;
}

export async function getMatter(matterId: string): Promise<MatterDetail> {
    return apiReq<MatterDetail>(`/matters/${matterId}`);
}

export async function transitionMatter(
    matterId: string,
    toState: string,
    beschreibung?: string,
): Promise<{ ok: boolean; from: string; to: string }> {
    return apiReq(`/matters/${matterId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to_state: toState, beschreibung }),
    });
}

// ---------------------------------------------------------------------------
// Intake
// ---------------------------------------------------------------------------

export type IntakeData = {
    vorname: string;
    nachname: string;
    anrede: string | null;
    geburtsdatum: string | null;
    beruf: string | null;
    email: string | null;
    telefon: string | null;
    strasse: string | null;
    hausnummer: string | null;
    plz: string | null;
    ort: string | null;
    beratungskurzbeschreibung: string | null;
    sachverhalt_seit: string | null;
    gegner: string | null;
    bisherige_schritte: string | null;
    mandatsziel: string | null;
    rechtsschutzversicherung: boolean | null;
    rechtsschutzversicherung_name: string | null;
    rechtsschutzversicherung_nummer: string | null;
    created_at: string;
};

export async function getIntake(matterId: string): Promise<IntakeData | null> {
    return apiReq<IntakeData | null>(`/matters/${matterId}/intake`);
}

export async function submitIntake(
    matterId: string,
    data: Record<string, string>,
    files?: File[],
): Promise<{ mandant_id: string; state: string; uploaded_documents: number }> {
    const form = new FormData();
    for (const [k, v] of Object.entries(data)) form.append(k, v);
    if (files) for (const f of files) form.append("dateien", f);

    const res = await fetchMitAuth(`${API_BASE}/matters/${matterId}/intake`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw await fehlerAus(res);
    return res.json() as Promise<{ mandant_id: string; state: string; uploaded_documents: number }>;
}

export type IntakeAnalyseResult = {
    vorschlag: {
        anrede: string; vorname: string; nachname: string;
        geburtsdatum: string; beruf: string; email: string;
        telefon: string; strasse: string; hausnummer: string;
        plz: string; ort: string; beratungskurzbeschreibung: string;
        sachverhalt_seit: string; gegner: string; bisherige_schritte: string; mandatsziel: string;
        rechtsschutzversicherung_name: string; rechtsschutzversicherung_nummer: string;
    };
    /**
     * Beteiligungen/Anlagen aus dem Dokument. Steht bewusst NEBEN dem
     * Vorschlag: die Aufnahmeseite iteriert über alle Vorschlagsfelder und ruft
     * .trim() auf — ein Array dort würde das Formular zum Absturz bringen.
     * Der Inhalt ist zusätzlich als Klartext in beratungskurzbeschreibung
     * eingefügt, damit er beim Speichern erhalten bleibt.
     */
    beteiligungen: { bezeichnung: string; nummer: string; betrag: string }[];
    /** "vision" = aus Seitenbildern gelesen (Handschrift/Scan) — erhöhte Prüfpflicht. */
    methode: "vision" | "text";
    konfidenz: "hoch" | "mittel" | "niedrig";
    erkannte_felder: string[];
    dateien: string[];
};

export async function analyzeIntakeDocuments(
    matterId: string,
    files: File[],
): Promise<IntakeAnalyseResult> {
    const form = new FormData();
    for (const f of files) form.append("dateien", f);

    const res = await fetchMitAuth(`${API_BASE}/matters/${matterId}/intake/analyze`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw await fehlerAus(res);
    return res.json() as Promise<IntakeAnalyseResult>;
}

// ---------------------------------------------------------------------------
// GwG-Ablauf (Geldwäschegesetz) — Anschreiben, Personalausweis, Risikoeinstufung
// ---------------------------------------------------------------------------

export type GwgPruefung = {
    id: string;
    land_code: string | null;
    pep: boolean | null;
    wirtschaftlich_berechtigter_identisch: boolean | null;
    transaktionsland: string | null;
    risikoklasse: "niedrig" | "mittel" | "hoch" | "unvollstaendig" | "nicht_verpflichtet";
    ausgeloeste_faktoren: { faktor: string; rechtsgrundlage: string }[];
    dokumentationsluecken: string[];
    hinweis: string;
    bestaetigt_von?: string | null;
    bestaetigt_at?: string | null;
    created_at: string;
};

export type GwgStatus = {
    gwg_mail_betreff: string | null;
    gwg_mail_text: string | null;
    mandant_email: string | null;
    state: string;
    personalausweis: { id: string; filename: string; created_at: string } | null;
    pruefung: GwgPruefung | null;
};

export async function getGwgStatus(matterId: string): Promise<GwgStatus> {
    return apiReq<GwgStatus>(`/matters/${matterId}/gwg`);
}

/**
 * Startet den GwG-Ablauf für eine Akte, die noch im Zustand „Neu" steht —
 * für Bestandsakten, deren Kategorie erst nachträglich GwG-pflichtig wurde,
 * und als Wiederherstellung, falls die Erzeugung bei der Anlage fehlschlug.
 * Die E-Mail-Adresse darf hier nachgereicht werden.
 */
export async function startGwgAnschreiben(
    matterId: string,
    mandantEmail?: string,
): Promise<{ ok: boolean; state: string; betreff: string; text: string }> {
    return apiReq(`/matters/${matterId}/gwg/anschreiben`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mandantEmail ? { mandant_email: mandantEmail } : {}),
    });
}

/**
 * Wählt die GwG-Prüfung mit Begründung ab (nur Anwalt/Admin).
 * Die Akte springt damit auf „GwG geprüft" und der Aufnahmebogen ist frei.
 */
export async function uebergeheGwgPruefung(
    matterId: string,
    grund: string,
): Promise<{ ok: boolean; state: string; grund: string; uebersprungen_at: string }> {
    return apiReq(`/matters/${matterId}/gwg/uebergehen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grund }),
    });
}

export async function markGwgAnschreibenVersendet(
    matterId: string,
): Promise<{ ok: boolean; state: string }> {
    return apiReq(`/matters/${matterId}/gwg/versendet`, { method: "POST" });
}

export type PersonalausweisVorschlag = {
    vorname: string;
    nachname: string;
    geburtsdatum: string;
    strasse: string;
    hausnummer: string;
    plz: string;
    ort: string;
    land_code: string;
    staatsangehoerigkeit_code: string;
};

export async function uploadPersonalausweis(
    matterId: string,
    datei: File,
): Promise<{ vorschlag: PersonalausweisVorschlag; konfidenz: string }> {
    const form = new FormData();
    form.append("datei", datei);
    const res = await fetchMitAuth(`${API_BASE}/matters/${matterId}/gwg/personalausweis`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw await fehlerAus(res);
    return res.json() as Promise<{ vorschlag: PersonalausweisVorschlag; konfidenz: string }>;
}

export async function uebernehmePersonalausweisDaten(
    matterId: string,
    daten: PersonalausweisVorschlag,
): Promise<{ ok: boolean; mandant_id: string }> {
    return apiReq(`/matters/${matterId}/gwg/personalausweis/uebernehmen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(daten),
    });
}

export async function runGwgPruefung(
    matterId: string,
    payload: {
        pep: boolean | null;
        wirtschaftlich_berechtigter_identisch: boolean | null;
        transaktionsland?: string;
    },
): Promise<GwgPruefung> {
    return apiReq<GwgPruefung>(`/matters/${matterId}/gwg/pruefung`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function confirmGwgPruefung(
    matterId: string,
): Promise<{ ok: boolean; state: string }> {
    return apiReq(`/matters/${matterId}/gwg/pruefung/bestaetigen`, { method: "POST" });
}

// ---------------------------------------------------------------------------
// PRE9/PRE10-Fragebogen
// ---------------------------------------------------------------------------

export type PreBeteiligung = {
    bezeichnung?: string | null;
    vertragsnummer?: string | null;
    zeichnungssumme?: string | number | null;
    agio?: string | number | null;
    gesamt?: string | number | null;
};

export type PreAuszahlung = { betrag?: string | number | null; datum?: string | null };

export type PreStreitwert = {
    zeichnungssummeGesamt: number;
    agioGesamt: number;
    auszahlungenGesamt: number;
    streitwert: number;
    /** false = eine Angabe fehlt oder ist unlesbar; Zahl ist nur ein Zwischenstand. */
    belastbar: boolean;
    hinweise: string[];
};

export type PrePruefung = { vollstaendig: boolean; luecken: string[]; widersprueche: string[] };

export type PreFragebogenKopf = {
    zeichnungserklaerung_beigefuegt?: boolean | null;
    vib_beigefuegt?: boolean | null;
    rsv_kopie_beigefuegt?: boolean | null;
    prospekt_erhalten_am?: string | null;
    prospekt_gelesen?: boolean | null;
    prospekt_durchgegangen?: boolean | null;
    rsv_versicherer?: string | null;
    rsv_versicherungsnehmer?: string | null;
    rsv_scheinnummer?: string | null;
    rsv_abgeschlossen_am?: string | null;
    anderweitig_geltend_gemacht?: boolean | null;
    andere_anlage_one_group?: boolean | null;
    andere_anlage_sonst?: boolean | null;
    auszahlungen_vollstaendig?: boolean | null;
    konfidenz?: string | null;
};

export type PreStand = {
    fragebogen: PreFragebogenKopf | null;
    beteiligungen: PreBeteiligung[];
    auszahlungen: PreAuszahlung[];
    streitwert: PreStreitwert;
    pruefung: PrePruefung;
};

export type PreAnalyse = {
    vorschlag: PreFragebogenKopf;
    beteiligungen: PreBeteiligung[];
    auszahlungen: PreAuszahlung[];
    streitwert: PreStreitwert;
    pruefung: PrePruefung;
    seiten: number;
};

export async function getPreStand(matterId: string): Promise<PreStand> {
    return apiReq<PreStand>(`/matters/${matterId}/pre`);
}

export async function analysierePreFragebogen(
    matterId: string,
    dateien: File[],
): Promise<PreAnalyse> {
    const form = new FormData();
    for (const f of dateien) form.append("dateien", f);
    const res = await fetchMitAuth(`${API_BASE}/matters/${matterId}/pre/analyse`, {
        method: "POST",
        body: form,
    });
    if (!res.ok) throw await fehlerAus(res);
    return res.json() as Promise<PreAnalyse>;
}

export async function uebernehmePreFragebogen(
    matterId: string,
    daten: {
        fragebogen: PreFragebogenKopf;
        beteiligungen: PreBeteiligung[];
        auszahlungen: PreAuszahlung[];
    },
): Promise<PreStand> {
    return apiReq<PreStand>(`/matters/${matterId}/pre/uebernehmen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(daten),
    });
}

// ---------------------------------------------------------------------------
// Onboarding
// ---------------------------------------------------------------------------

export type Beratungsart = "rechtlich" | "steuerlich" | "beides" | "pro_real";

/** Fälligkeit einer Pauschale — Reihenfolge wie im Auswahlfeld. */
export const PAUSCHALE_TURNUS_OPTIONEN = [
    { value: "monatlich", label: "monatlich" },
    { value: "vierteljaehrlich", label: "vierteljährlich" },
    { value: "halbjaehrlich", label: "halbjährlich" },
    { value: "jaehrlich", label: "jährlich" },
] as const;

export type PauschaleTurnus = (typeof PAUSCHALE_TURNUS_OPTIONEN)[number]["value"];
export type Honorarmodell = "stundensatz" | "rvg";

export async function generateOnboarding(
    matterId: string,
    payload: {
        beratungsart: Beratungsart;
        honorarmodell: Honorarmodell;
        sachbearbeiter?: string;
        /** Korrigiert die Angabe aus der Aktenanlage und wird dort gespeichert. */
        unternehmensmandat?: boolean;
        /** Steuert den Pauschal-Absatz der Honorarvereinbarung. */
        pauschale?: boolean;
        pauschale_zweck?: string;
        pauschale_betrag?: string;
        pauschale_umfang?: string;
        pauschale_turnus?: PauschaleTurnus;
        stundensatz_partner?: number;
        stundensatz_anwalt?: number;
        stundensatz_fachmitarbeiter?: number;
    },
) {
    return apiReq<{
        state: string;
        review_required: boolean;
        documents: { type: string; docId: string; hash: string; hatPdf: boolean }[];
        /** Nicht-fatale Probleme, v.a. fehlgeschlagene PDF-Konvertierung. */
        warnungen: string[];
        unternehmensmandat: boolean;
        pauschale: boolean;
        pauschale_turnus: PauschaleTurnus;
        beratungsart: Beratungsart;
        honorarmodell: Honorarmodell;
    }>(
        `/matters/${matterId}/onboarding/generate`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        },
    );
}

/**
 * Erzeugt die gerichtliche Vollmacht (Prozessvollmacht, § 80 ZPO) einzeln —
 * unabhängig vom Stand des Aufnahmebogens. Getrennt von der außergerichtlichen
 * ONBOARDING_VOLLMACHT, die bereits Teil des Onboarding-Pakets ist. Nicht für
 * ProReal-Mandate (kategorie "pro_real"), die haben eine eigene
 * kampagnenspezifische außergerichtliche Vollmacht im PRE-Ablauf.
 */
export async function generateProzessvollmachtVorab(
    matterId: string,
    payload?: {
        sachbearbeiter?: string;
        mandant_name?: string;
        mandant_anrede?: string;
        mandant_adresse?: string;
    },
) {
    return apiReq<{
        documents: { type: string; docId: string; hash: string; hatPdf: boolean }[];
        warnungen: string[];
    }>(`/matters/${matterId}/onboarding/prozessvollmacht-vorab`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
    });
}

export async function approveOnboarding(matterId: string) {
    return apiReq<{ ok: boolean }>(`/matters/${matterId}/onboarding/approve`, {
        method: "POST",
    });
}

export async function sendOnboarding(matterId: string) {
    return apiReq<{ ok: boolean; state: string; empfaenger: string; manuell_versenden?: boolean; hinweis?: string }>(
        `/matters/${matterId}/onboarding/send`,
        { method: "POST" },
    );
}

// ---------------------------------------------------------------------------
// Fristen
// ---------------------------------------------------------------------------

export type FristCreate = {
    typ: string;
    startdatum: string;
    fristende: string;
    reminderdatum?: string;
    notiz?: string;
};

export async function addFrist(matterId: string, data: FristCreate): Promise<Frist> {
    return apiReq<Frist>(`/matters/${matterId}/fristen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
}

export async function markFristDone(matterId: string, fristId: string): Promise<Frist> {
    return apiReq<Frist>(`/matters/${matterId}/fristen/${fristId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ erledigt: true }),
    });
}

export type FristUpdate = Partial<{
    typ: string;
    startdatum: string;
    fristende: string;
    /** Leerstring löscht das Erinnerungsdatum. */
    reminderdatum: string;
    notiz: string;
    erledigt: boolean;
}>;

/**
 * Ändert eine Frist. Nur übergebene Felder werden angefasst.
 * Wird fristende oder reminderdatum geändert, setzt das Backend die
 * Benachrichtigungs-Zeitstempel zurück — eine verlängerte Frist wird also
 * erneut erinnert.
 */
export async function updateFrist(
    matterId: string,
    fristId: string,
    patch: FristUpdate,
): Promise<Frist> {
    return apiReq<Frist>(`/matters/${matterId}/fristen/${fristId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
    });
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export type MatterDocument = {
    id: string;
    filename: string;
    doc_type: string;
    version_number: number;
    file_hash_sha256: string | null;
    created_at: string;
    download_url: string;
    download_docx_url: string | null;
};

export async function listDocuments(matterId: string): Promise<MatterDocument[]> {
    return apiReq<MatterDocument[]>(`/matters/${matterId}/documents`);
}

/**
 * Lädt ein Aktendokument authentifiziert herunter und öffnet es in einem
 * neuen Tab (PDFs) bzw. stößt den Browser-Download an (sonstige Typen).
 * Ein einfacher <a href> würde keinen Authorization-Header mitsenden.
 *
 * WICHTIG: window.open() NACH einem await wird von Chrome/Edge als Popup
 * geblockt (gilt nicht mehr als direkte Nutzerinteraktion) — meist ohne
 * sichtbare Fehlermeldung, das Dokument "verschwindet" einfach. Ein
 * synthetischer <a>-Klick (auch mit target="_blank") umgeht das, weil
 * Browser echte Klick-Events auf Anchor-Elemente nicht als Popup werten.
 */
export async function openMatterDocument(matterId: string, doc: MatterDocument): Promise<void> {
    const res = await fetchMitAuth(`${API_BASE}${doc.download_url}`, undefined, false);
    if (!res.ok) throw new Error(`Dokument konnte nicht geladen werden (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    if (doc.filename.toLowerCase().endsWith(".pdf")) {
        a.target = "_blank";
        a.rel = "noopener";
    } else {
        a.download = doc.filename;
    }
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

/**
 * Lädt die bearbeitbare Word-Fassung eines generierten Onboarding-Dokuments
 * herunter (nur vorhanden, wenn doc.download_docx_url gesetzt ist).
 */
export async function downloadMatterDocumentDocx(matterId: string, doc: MatterDocument): Promise<void> {
    if (!doc.download_docx_url) throw new Error("Keine Word-Fassung verfügbar");
    const res = await fetchMitAuth(`${API_BASE}${doc.download_docx_url}`, undefined, false);
    if (!res.ok) throw new Error(`Word-Dokument konnte nicht geladen werden (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.filename.replace(/\.pdf$/i, ".docx");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------------------------------------------------------------------------
// Anspruchsschreiben
// ---------------------------------------------------------------------------

export type AnspruchDraft = {
    id: string;
    entwurf_text: string;
    model_id: string | null;
    approved_by: string | null;
    approved_at: string | null;
    created_at: string;
    updated_at: string;
};

export async function getAnspruchDraft(matterId: string): Promise<AnspruchDraft | null> {
    try {
        return await apiReq<AnspruchDraft>(`/matters/${matterId}/anspruch`);
    } catch {
        return null;
    }
}

export async function generateAnspruch(
    matterId: string,
): Promise<{ draft_id: string; entwurf_text: string; state: string }> {
    return apiReq(`/matters/${matterId}/anspruch/generate`, { method: "POST" });
}

export async function updateAnspruchDraft(
    matterId: string,
    entwurf_text: string,
): Promise<AnspruchDraft> {
    return apiReq(`/matters/${matterId}/anspruch`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entwurf_text }),
    });
}

export async function approveAnspruch(
    matterId: string,
): Promise<{ ok: boolean; state: string }> {
    return apiReq(`/matters/${matterId}/anspruch/approve`, { method: "POST" });
}

export async function sendAnspruch(
    matterId: string,
    payload: { empfaenger_email: string; empfaenger_name: string; fristende: string },
): Promise<{
    ok: boolean;
    state: string;
    empfaenger: string;
    frist_angelegt: boolean;
    fristende: string;
    reminderdatum: string;
    manuell_versenden?: boolean;
    hinweis?: string;
}> {
    return apiReq(`/matters/${matterId}/anspruch/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

// ---------------------------------------------------------------------------
// Org-weite Fristen-Übersicht
// ---------------------------------------------------------------------------

export type FristOverview = Frist & {
    matter_id: string;
    matters: {
        id: string;
        aktenzeichen: string | null;
        bezeichnung: string;
        state: string;
    } | null;
};

export async function listAllFristen(
    orgId: string,
    options?: { erledigt?: boolean; days?: number },
): Promise<FristOverview[]> {
    const params = new URLSearchParams({ org_id: orgId });
    if (options?.erledigt !== undefined) params.set("erledigt", String(options.erledigt));
    if (options?.days !== undefined) params.set("days", String(options.days));
    return apiReq<FristOverview[]>(`/fristen?${params.toString()}`);
}

// ---------------------------------------------------------------------------
// Vorlagenverwaltung (matter_templates)
// ---------------------------------------------------------------------------

export const TEMPLATE_TYPES = [
    { value: "ONBOARDING_ANSCHREIBEN", label: "Anschreiben" },
    { value: "ONBOARDING_HONORARVEREINBARUNG", label: "Mandats-/Honorarvereinbarung" },
    { value: "ONBOARDING_VOLLMACHT", label: "Vollmacht" },
    { value: "ONBOARDING_WIDERRUFSBELEHRUNG", label: "Widerrufsbelehrung" },
    { value: "ANSPRUCH_SCHREIBEN", label: "Anspruchsschreiben" },
    { value: "KLAGE_SCHRIFT", label: "Klageschrift" },
] as const;

export type MatterTemplateType = (typeof TEMPLATE_TYPES)[number]["value"];

export type MatterTemplate = {
    id: string;
    template_type: MatterTemplateType;
    name: string;
    is_active: boolean;
    version_number: number;
    created_at: string;
};

export async function listTemplates(orgId: string): Promise<MatterTemplate[]> {
    return apiReq<MatterTemplate[]>(`/orgs/${orgId}/templates`);
}

export async function uploadTemplate(
    orgId: string,
    params: { templateType: MatterTemplateType; name: string; file: File },
): Promise<MatterTemplate> {
    const form = new FormData();
    form.append("template_type", params.templateType);
    form.append("name", params.name);
    form.append("file", params.file);
    return apiReq<MatterTemplate>(`/orgs/${orgId}/templates`, {
        method: "POST",
        body: form,
    });
}

export async function deactivateTemplate(orgId: string, templateId: string): Promise<void> {
    await apiReq<void>(`/orgs/${orgId}/templates/${templateId}`, { method: "DELETE" });
}

export async function downloadTemplate(
    orgId: string,
    template: MatterTemplate,
): Promise<void> {
    const res = await fetchMitAuth(`${API_BASE}/orgs/${orgId}/templates/${template.id}/download`, undefined, false);
    if (!res.ok) throw new Error(`Vorlage konnte nicht geladen werden (${res.status})`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${template.name}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
}

// ---------------------------------------------------------------------------
// PRE9/PRE10 — Interessentenvorgänge vor der Aktenanlage (Lastenheft WF-001 ff.)
// ---------------------------------------------------------------------------

// Kein eigener Status "Mandat angenommen": Die Annahme-Entscheidung fällt
// fachlich erst mit dem bestätigten Rücklauf — das IST UNTERLAGEN_VOLLSTAENDIG,
// kein weiterer Zwischenschritt danach. Siehe backend/src/lib/interessent/workflow.ts.
export type InteressentStatus =
    | "INTERESSENT"
    | "TELEFONTERMIN"
    | "UNTERLAGEN_VERSENDET"
    | "NACHFORDERUNG"
    | "UNTERLAGEN_VOLLSTAENDIG"
    | "AKTE_ANGELEGT"
    | "KEIN_INTERESSE";

export type Faelligkeit = "ueberfaellig" | "heute" | "offen" | "keine";

export const INTERESSENT_STATUS_LABEL: Record<InteressentStatus, string> = {
    INTERESSENT: "Interessent",
    TELEFONTERMIN: "Telefontermin",
    UNTERLAGEN_VERSENDET: "Unterlagen versendet",
    NACHFORDERUNG: "Nachforderung",
    UNTERLAGEN_VOLLSTAENDIG: "Unterlagen vollständig",
    AKTE_ANGELEGT: "Akte angelegt",
    KEIN_INTERESSE: "Kein Interesse",
};

export type PreKampagne = "PRE9" | "PRE10" | "PRE9_PRE10" | "UNBEKANNT";

export const PRE_KAMPAGNEN = [
    { value: "UNBEKANNT", label: "noch unbekannt", kurz: "unbekannt" },
    { value: "PRE9", label: "ProReal Europa 9", kurz: "PRE9" },
    { value: "PRE10", label: "ProReal Europa 10", kurz: "PRE10" },
    { value: "PRE9_PRE10", label: "beide (9 und 10)", kurz: "PRE9+10" },
] as const;

export type Interessent = {
    id: string;
    org_id: string;
    kampagne: PreKampagne;
    anrede: string | null;
    vorname: string | null;
    nachname: string;
    email: string | null;
    telefon: string | null;
    strasse: string | null;
    hausnummer: string | null;
    plz: string | null;
    ort: string | null;
    rsv_vorhanden: boolean;
    rsv_name: string | null;
    rsv_nummer: string | null;
    quelle: string | null;
    vermittler: string | null;
    status: InteressentStatus;
    wiedervorlage_am: string | null;
    nachfass_stufe: number;
    unterlagen_versendet_am: string | null;
    vertrieb_informiert_am: string | null;
    matter_id: string | null;
    notiz: string | null;
    created_at: string;
    updated_at: string;
    /** Vom Server abgeleitet — nicht in der Datenbank. */
    faelligkeit: Faelligkeit;
    naechste_aufgabe: string;
    handlungsbedarf: boolean;
    moegliche_aktionen: { aktion: string; label: string }[];
};

export type InteressentenListe = {
    heute: string;
    anzahl: number;
    statistik: Record<string, number>;
    interessenten: Interessent[];
};

export async function listInteressenten(
    orgId: string,
    opts?: { kampagne?: string; status?: string; nurFaellig?: boolean; mitErledigten?: boolean },
): Promise<InteressentenListe> {
    const p = new URLSearchParams({ org_id: orgId });
    if (opts?.kampagne) p.set("kampagne", opts.kampagne);
    if (opts?.status) p.set("status", opts.status);
    if (opts?.nurFaellig) p.set("nur_faellig", "true");
    if (opts?.mitErledigten) p.set("mit_erledigten", "true");
    return apiReq<InteressentenListe>(`/interessenten?${p.toString()}`);
}

export async function createInteressent(payload: {
    org_id: string;
    nachname: string;
    kampagne?: PreKampagne;
    vorname?: string;
    email?: string;
    telefon?: string;
    strasse?: string;
    hausnummer?: string;
    plz?: string;
    ort?: string;
    rsv_vorhanden?: boolean;
    rsv_name?: string;
    vermittler?: string;
    notiz?: string;
}): Promise<Interessent> {
    return apiReq<Interessent>("/interessenten", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
}

export async function interessentAktion(
    id: string,
    aktion: string,
    notiz?: string,
): Promise<Interessent & { beschreibung: string; vertrieb_informieren: boolean }> {
    return apiReq<Interessent & { beschreibung: string; vertrieb_informieren: boolean }>(
        `/interessenten/${id}/aktion`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ aktion, notiz }),
        },
    );
}

/**
 * Trägt die RA-Micro-Aktennummer nach oder korrigiert sie. Sie entsteht erst,
 * wenn die Akte nach Rücklauf der Vollmacht in RA-Micro geführt wird.
 */
export async function setzeAktenzeichen(
    matterId: string,
    aktenzeichen: string,
): Promise<{ id: string; aktenzeichen: string | null }> {
    return apiReq<{ id: string; aktenzeichen: string | null }>(`/matters/${matterId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aktenzeichen }),
    });
}

/**
 * Bereitet die WF-001-Unterlagen für einen Interessenten auf und lädt sie als
 * ZIP herunter (PDF zum Versenden, Word-Fassungen zum Anpassen).
 *
 * Gibt einen Hinweistext zurück, wenn Vorlagen fehlen oder ein PDF nicht
 * erzeugt werden konnte — sonst sähe die Mitarbeiterin nur eine Datei und
 * bemerkte die Lücke erst beim Empfänger.
 */
export async function ladeBegleittext(
    id: string,
): Promise<{ kampagne: string; vorlage: string; text: string | null }> {
    return apiReq<{ kampagne: string; vorlage: string; text: string | null }>(
        `/interessenten/${id}/begleittext`,
    );
}

export async function ladeInteressentenUnterlagen(id: string): Promise<string | null> {
    const res = await fetchMitAuth(`${API_BASE}/interessenten/${id}/unterlagen`, undefined, false);
    if (!res.ok) throw await fehlerAus(res);

    const roherHinweis = res.headers.get("X-Unterlagen-Hinweis");
    const blob = await res.blob();

    const zuordnung = res.headers.get("Content-Disposition") ?? "";
    const name = /filename="([^"]+)"/.exec(zuordnung)?.[1] ?? "Unterlagen.zip";

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);

    return roherHinweis ? decodeURIComponent(roherHinweis) : null;
}

// ---------------------------------------------------------------------------
// Wissensdatenbank — Fundstellen an einer Akte (z.B. beck-online-Downloads)
// ---------------------------------------------------------------------------

export type WissensbasisQuelle = "eigenes" | "beck-online" | "sonstige-lizenzquelle";

export const WISSENSBASIS_QUELLEN: { value: WissensbasisQuelle; label: string }[] = [
    { value: "beck-online", label: "beck-online" },
    { value: "sonstige-lizenzquelle", label: "andere Datenbank (juris u.a.)" },
    { value: "eigenes", label: "eigenes Dokument" },
];

export type MatterWissensDokument = {
    id: string;
    titel: string;
    rechtsgebiet: string;
    dokumenttyp: string;
    quelle: WissensbasisQuelle;
    fundstelle: string | null;
    ki_zusammenfassung: string | null;
    created_at: string;
};

export async function listMatterWissensbasis(matterId: string): Promise<MatterWissensDokument[]> {
    return apiReq<MatterWissensDokument[]>(`/wissensbasis?matter_id=${encodeURIComponent(matterId)}`);
}

/**
 * Lädt ein manuell heruntergeladenes Dokument (z.B. aus beck-online) hoch und
 * verknüpft es zugleich mit der Akte. Bei einer lizenzierten Quelle ist die
 * Fundstelle Pflicht — das Backend lehnt sonst ab (siehe routes/wissensbasis.ts).
 */
export async function uploadMatterWissensbasis(params: {
    matterId: string;
    datei: File;
    titel: string;
    rechtsgebiet: string;
    dokumenttyp: string;
    quelle: WissensbasisQuelle;
    fundstelle?: string;
}): Promise<MatterWissensDokument> {
    const form = new FormData();
    form.append("datei", params.datei);
    form.append("titel", params.titel);
    form.append("rechtsgebiet", params.rechtsgebiet);
    form.append("dokumenttyp", params.dokumenttyp);
    form.append("quelle", params.quelle);
    if (params.fundstelle) form.append("fundstelle", params.fundstelle);
    form.append("matter_id", params.matterId);

    const res = await fetchMitAuth(`${API_BASE}/wissensbasis/upload`, { method: "POST", body: form });
    if (!res.ok) throw await fehlerAus(res);
    return res.json() as Promise<MatterWissensDokument>;
}
