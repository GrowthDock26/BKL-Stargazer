/**
 * PRE9/PRE10 — Interessentenvorgänge vor der Aktenanlage (Lastenheft WF-001
 * bis WF-003).
 *
 * Mounted at: /interessenten
 *
 * Der Ablauf selbst steht in lib/interessent/workflow.ts und ist dort ohne
 * Datenbank prüfbar. Diese Datei tut nur zwei Dinge: Rechte prüfen und
 * schreiben, was das Modell ausgerechnet hat.
 *
 * PHASE 1 VERSENDET NICHTS — das System hat keinen Mailausgang. Jede Aktion
 * bedeutet „das Sekretariat hat das getan"; der Vorgang landet über die
 * Wiedervorlage in einer Arbeitsliste.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import {
    ALLE_STATUS,
    bewerteFaelligkeit,
    heuteIso,
    istStatus,
    moeglicheAktionen,
    naechsteAufgabe,
    wendeAktionAn,
    type InteressentAktion,
    type InteressentStatus,
    type OrgRole,
} from "../lib/interessent/workflow";
import { erzeugeInteressentenUnterlagen, ladeBegleittext } from "../lib/interessent/unterlagen";

export const interessentenRouter = Router();

type Db = ReturnType<typeof createServerSupabase>;

// UNBEKANNT: Beteiligung bei Kurzanlage noch nicht geklärt. Wird in
// unterlagen.ts wie PRE9_PRE10 behandelt (beide Fragebögen/Vollmachten) und
// ist später per PATCH korrigierbar, sobald sich das im Gespräch klärt.
const KAMPAGNEN = ["PRE9", "PRE10", "PRE9_PRE10", "UNBEKANNT"] as const;
type Kampagne = (typeof KAMPAGNEN)[number];

/** Spalten, die der Anwender frei setzen darf — Status und Wiedervorlage NICHT. */
const STAMMDATEN_FELDER = [
    "kampagne",
    "anrede",
    "vorname",
    "nachname",
    "email",
    "telefon",
    "strasse",
    "hausnummer",
    "plz",
    "ort",
    "rsv_vorhanden",
    "rsv_name",
    "rsv_nummer",
    "quelle",
    "vermittler",
    "notiz",
] as const;

async function getOrgMember(userId: string, orgId: string, db: Db) {
    const { data } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
    return data as { role: OrgRole } | null;
}

type InteressentZeile = {
    id: string;
    org_id: string;
    kampagne: string;
    status: string;
    nachfass_stufe: number;
    wiedervorlage_am: string | null;
    matter_id: string | null;
    [k: string]: unknown;
};

/** Ergänzt die abgeleiteten Felder, die die Arbeitsliste braucht. */
function mitAbleitungen(zeile: InteressentZeile, heute: string, rolle: OrgRole) {
    const status = zeile.status as InteressentStatus;
    const nachfassStufe = zeile.nachfass_stufe ?? 0;
    const aufgabe = naechsteAufgabe({
        status,
        nachfassStufe,
        wiedervorlageAm: zeile.wiedervorlage_am,
        heute,
    });
    return {
        ...zeile,
        faelligkeit: bewerteFaelligkeit(zeile.wiedervorlage_am, heute),
        naechste_aufgabe: aufgabe.text,
        handlungsbedarf: aufgabe.faellig,
        moegliche_aktionen: moeglicheAktionen({ status, nachfassStufe, rolle, heute }),
    };
}

async function protokolliere(params: {
    db: Db;
    interessentId: string;
    orgId: string;
    vonStatus: string | null;
    nachStatus: string | null;
    aktion: string;
    notiz?: string | null;
    userId: string;
    rolle: string;
}) {
    const { db, interessentId, orgId, vonStatus, nachStatus, aktion, notiz, userId, rolle } = params;
    await db.from("interessent_events").insert({
        interessent_id: interessentId,
        org_id: orgId,
        von_status: vonStatus,
        nach_status: nachStatus,
        aktion,
        notiz: notiz ?? null,
        ausgeloest_von: userId,
        rolle,
    });
}

// ---------------------------------------------------------------------------
// GET / — Arbeitsliste
//
// Query: org_id (Pflicht), kampagne, status, nur_faellig=true, mit_erledigten=true
//
// Standardmäßig ohne abgeschlossene Vorgänge: Wer die Liste öffnet, will die
// offene Arbeit sehen, nicht die Historie einer Kampagne mit 100+ Einträgen.
// ---------------------------------------------------------------------------

interessentenRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const orgId = req.query.org_id as string | undefined;
    if (!orgId) return void res.status(400).json({ detail: "org_id required" });

    const db = createServerSupabase();
    const member = await getOrgMember(userId, orgId, db);
    if (!member) return void res.status(403).json({ detail: "Not a member of this organization" });

    let query = db.from("interessenten").select("*").eq("org_id", orgId);

    const kampagne = req.query.kampagne as string | undefined;
    if (kampagne) query = query.eq("kampagne", kampagne);

    const status = req.query.status as string | undefined;
    if (status) query = query.eq("status", status);

    if (req.query.mit_erledigten !== "true" && !status) {
        query = query.not("status", "in", "(AKTE_ANGELEGT,KEIN_INTERESSE)");
    }

    // Fällige zuerst; Vorgänge ohne Wiedervorlage (frisch angelegt, wartet auf
    // den ersten Schritt) danach. nullsFirst: false hält sie unten.
    const { data, error } = await query
        .order("wiedervorlage_am", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: true });

    if (error) return void res.status(500).json({ detail: error.message });

    const heute = heuteIso();
    let zeilen = (data ?? []).map((z) => mitAbleitungen(z as InteressentZeile, heute, member.role));
    if (req.query.nur_faellig === "true") {
        zeilen = zeilen.filter((z) => z.handlungsbedarf);
    }

    res.json({
        heute,
        anzahl: zeilen.length,
        // Zählung über den ungefilterten Bestand der Organisation, damit die
        // Kopfzeile der Liste auch bei aktivem Filter stimmt.
        statistik: await zaehleNachStatus(orgId, kampagne, db),
        interessenten: zeilen,
    });
});

async function zaehleNachStatus(orgId: string, kampagne: string | undefined, db: Db) {
    let q = db.from("interessenten").select("status").eq("org_id", orgId);
    if (kampagne) q = q.eq("kampagne", kampagne);
    const { data } = await q;
    const zaehler: Record<string, number> = {};
    for (const s of ALLE_STATUS) zaehler[s] = 0;
    for (const zeile of data ?? []) {
        const s = (zeile as { status: string }).status;
        zaehler[s] = (zaehler[s] ?? 0) + 1;
    }
    return zaehler;
}

// ---------------------------------------------------------------------------
// POST / — Vorgang anlegen (WF-001)
// ---------------------------------------------------------------------------

interessentenRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { org_id, nachname } = req.body ?? {};

    if (!org_id || !String(nachname ?? "").trim()) {
        return void res.status(400).json({ detail: "org_id und nachname sind erforderlich" });
    }

    // Ohne Angabe UNBEKANNT statt eines geratenen PRE9 — sonst würde eine
    // tatsächliche PRE10- oder Doppel-Beteiligung ein falsches, unvollständiges
    // Unterlagenpaket auslösen (siehe unterlagen.ts).
    const kampagne = (req.body?.kampagne as string | undefined) ?? "UNBEKANNT";
    if (!KAMPAGNEN.includes(kampagne as Kampagne)) {
        return void res.status(400).json({ detail: `kampagne muss ${KAMPAGNEN.join(" oder ")} sein` });
    }

    const db = createServerSupabase();
    const member = await getOrgMember(userId, org_id, db);
    if (!member) return void res.status(403).json({ detail: "Not a member of this organization" });

    const werte: Record<string, unknown> = { org_id, created_by: userId, status: "INTERESSENT" };
    for (const feld of STAMMDATEN_FELDER) {
        if (req.body?.[feld] !== undefined) werte[feld] = req.body[feld];
    }
    werte.kampagne = kampagne;
    werte.nachname = String(nachname).trim();

    const { data, error } = await db.from("interessenten").insert(werte).select("*").single();
    if (error) {
        if (error.code === "PGRST205") {
            return void res.status(500).json({
                detail:
                    "Die Tabelle „interessenten“ fehlt noch. " +
                    "Bitte migration-2026-08-06.sql im Supabase-SQL-Editor ausführen.",
            });
        }
        return void res.status(500).json({ detail: error.message });
    }

    await protokolliere({
        db,
        interessentId: data.id,
        orgId: org_id,
        vonStatus: null,
        nachStatus: "INTERESSENT",
        aktion: "angelegt",
        userId,
        rolle: member.role,
    });

    res.status(201).json(mitAbleitungen(data as InteressentZeile, heuteIso(), member.role));
});

// ---------------------------------------------------------------------------
// GET /:id — Vorgang mit Protokoll
// ---------------------------------------------------------------------------

interessentenRouter.get("/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const { data: vorgang } = await db
        .from("interessenten")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
    if (!vorgang) return void res.status(404).json({ detail: "Vorgang nicht gefunden" });

    const member = await getOrgMember(userId, vorgang.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { data: events } = await db
        .from("interessent_events")
        .select("*")
        .eq("interessent_id", req.params.id)
        .order("created_at", { ascending: false });

    res.json({
        ...mitAbleitungen(vorgang as InteressentZeile, heuteIso(), member.role),
        user_role: member.role,
        protokoll: events ?? [],
    });
});

// ---------------------------------------------------------------------------
// PATCH /:id — Stammdaten ändern
//
// Status, Wiedervorlage und Nachfassstufe sind hier bewusst gesperrt: Sie
// gehören dem Ablauf und laufen ausschließlich über /aktion, damit jeder
// Wechsel im Protokoll steht.
// ---------------------------------------------------------------------------

interessentenRouter.patch("/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const { data: vorgang } = await db
        .from("interessenten")
        .select("id, org_id")
        .eq("id", req.params.id)
        .maybeSingle();
    if (!vorgang) return void res.status(404).json({ detail: "Vorgang nicht gefunden" });

    const member = await getOrgMember(userId, vorgang.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const aenderungen: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const feld of STAMMDATEN_FELDER) {
        if (req.body?.[feld] !== undefined) aenderungen[feld] = req.body[feld];
    }

    const { data, error } = await db
        .from("interessenten")
        .update(aenderungen)
        .eq("id", req.params.id)
        .select("*")
        .single();
    if (error) return void res.status(500).json({ detail: error.message });

    res.json(mitAbleitungen(data as InteressentZeile, heuteIso(), member.role));
});

// ---------------------------------------------------------------------------
// POST /:id/aktion — Ablaufschritt (WF-001, WF-002)
//
// Body: { aktion, notiz? }
// ---------------------------------------------------------------------------

interessentenRouter.post("/:id/aktion", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const { data: vorgang } = await db
        .from("interessenten")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
    if (!vorgang) return void res.status(404).json({ detail: "Vorgang nicht gefunden" });

    const member = await getOrgMember(userId, vorgang.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const aktion = req.body?.aktion as InteressentAktion | undefined;
    if (!aktion) return void res.status(400).json({ detail: "aktion fehlt" });
    if (!istStatus(vorgang.status)) {
        return void res.status(500).json({ detail: `Unbekannter Status: ${vorgang.status}` });
    }

    const heute = heuteIso();
    const ergebnis = wendeAktionAn({
        status: vorgang.status,
        nachfassStufe: vorgang.nachfass_stufe ?? 0,
        aktion,
        rolle: member.role,
        heute,
    });

    if (!ergebnis.ok) return void res.status(422).json({ detail: ergebnis.grund });

    const aenderungen: Record<string, unknown> = {
        status: ergebnis.nach,
        nachfass_stufe: ergebnis.nachfassStufe,
        wiedervorlage_am: ergebnis.wiedervorlageAm,
        updated_at: new Date().toISOString(),
    };
    if (aktion === "unterlagen_versendet") aenderungen.unterlagen_versendet_am = heute;
    if (ergebnis.vertriebInformieren) aenderungen.vertrieb_informiert_am = heute;

    const { data, error } = await db
        .from("interessenten")
        .update(aenderungen)
        .eq("id", req.params.id)
        .select("*")
        .single();
    if (error) return void res.status(500).json({ detail: error.message });

    await protokolliere({
        db,
        interessentId: vorgang.id,
        orgId: vorgang.org_id,
        vonStatus: vorgang.status,
        nachStatus: ergebnis.nach,
        aktion,
        notiz: (req.body?.notiz as string | undefined) ?? ergebnis.beschreibung,
        userId,
        rolle: member.role,
    });

    res.json({
        ...mitAbleitungen(data as InteressentZeile, heute, member.role),
        beschreibung: ergebnis.beschreibung,
        // Phase 1 verschickt nichts — der Hinweis an den Finanzvertrieb ist eine
        // Aufgabe für das Sekretariat, kein automatischer Vorgang. Empfänger,
        // Kanal und Datenumfang sind im Lastenheft noch offen.
        vertrieb_informieren: ergebnis.vertriebInformieren,
    });
});

// ---------------------------------------------------------------------------
// GET /:id/begleittext — Wortlaut der Begleit-E-Mail zum Kopieren
//
// Getrennt vom Paket, damit die Anzeige nicht jedes Mal die PDF-Umwandlung
// aller Unterlagen auslöst. Welcher der beiden Texte gilt, entscheidet die
// Kampagne: Bei einer Beteiligung liegt eine Vollmacht bei, bei beiden zwei.
// ---------------------------------------------------------------------------

interessentenRouter.get("/:id/begleittext", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const { data: vorgang } = await db
        .from("interessenten")
        .select("id, org_id, kampagne")
        .eq("id", req.params.id)
        .maybeSingle();
    if (!vorgang) return void res.status(404).json({ detail: "Vorgang nicht gefunden" });

    const member = await getOrgMember(userId, vorgang.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const { typ, text } = await ladeBegleittext(vorgang.org_id, vorgang.kampagne, db);
    res.json({ kampagne: vorgang.kampagne, vorlage: typ, text });
});

// ---------------------------------------------------------------------------
// GET /:id/unterlagen — WF-001: Unterlagen vorbereiten und ausliefern
//
// Liefert ein ZIP mit Anschreiben, Fragebogen, Vollmacht, Kostenaufklärung und
// Widerrufsbelehrung — als PDF zum Versenden, dazu die Word-Fassungen für den
// Fall, dass im Einzelfall etwas angepasst werden muss.
//
// Der Abruf ändert den Status NICHT. Vorbereiten und Versenden sind zwei
// verschiedene Dinge: Wer das Paket herunterlädt, hat es noch nicht verschickt,
// und eine Wiedervorlage, die auf einen Klick statt auf eine tatsächlich
// versandte Mail zählt, wäre falsch.
// ---------------------------------------------------------------------------

interessentenRouter.get("/:id/unterlagen", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const { data: vorgang } = await db
        .from("interessenten")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
    if (!vorgang) return void res.status(404).json({ detail: "Vorgang nicht gefunden" });

    const member = await getOrgMember(userId, vorgang.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    let ergebnis;
    try {
        ergebnis = await erzeugeInteressentenUnterlagen(vorgang, db);
    } catch (err) {
        return void res.status(500).json({
            detail: `Unterlagen konnten nicht erzeugt werden: ${err instanceof Error ? err.message : err}`,
        });
    }

    if (ergebnis.enthalten.length === 0) {
        return void res.status(422).json({
            detail:
                "Keine Vorlagen hinterlegt — bitte unter „Vorlagen“ hochladen. Erwartet werden: " +
                ergebnis.fehlendeVorlagen.join(", ") + ".",
        });
    }

    await protokolliere({
        db,
        interessentId: vorgang.id,
        orgId: vorgang.org_id,
        vonStatus: vorgang.status,
        nachStatus: vorgang.status,
        aktion: "unterlagen_vorbereitet",
        notiz:
            `Enthalten: ${ergebnis.enthalten.join(", ")}` +
            (ergebnis.fehlendeVorlagen.length ? ` | Ohne Vorlage: ${ergebnis.fehlendeVorlagen.join(", ")}` : ""),
        userId,
        rolle: member.role,
    });

    // Unvollständigkeit und PDF-Probleme müssen ankommen, auch wenn der Browser
    // nur die Datei sieht — deshalb zusätzlich als Kopfzeile, die das Frontend
    // ausliest und anzeigt.
    const hinweise = [
        ...ergebnis.fehlendeVorlagen.map((t) => `Ohne Vorlage: ${t}`),
        ...ergebnis.warnungen,
    ];
    if (hinweise.length) {
        res.setHeader("X-Unterlagen-Hinweis", encodeURIComponent(hinweise.join(" | ")));
        res.setHeader("Access-Control-Expose-Headers", "X-Unterlagen-Hinweis");
    }

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${ergebnis.dateiname}"`);
    res.send(ergebnis.zip);
});

// ---------------------------------------------------------------------------
// POST /:id/akte — WF-003: Vorgang in eine Akte überführen
//
// Legt KEINE Akte an, sondern liefert die Daten für das Anlageformular und
// verknüpft den Vorgang, sobald die Akte existiert (Body: matter_id).
//
// Bewusst zweistufig: Die Aktenanlage erzeugt Aktenzeichen, Pflichtfristen und
// das Dokumentenpaket und prüft die Aktennummer auf Dubletten. Diese Logik zu
// duplizieren hieße, sie über kurz oder lang auseinanderlaufen zu lassen.
// ---------------------------------------------------------------------------

interessentenRouter.post("/:id/akte", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();

    const { data: vorgang } = await db
        .from("interessenten")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle();
    if (!vorgang) return void res.status(404).json({ detail: "Vorgang nicht gefunden" });

    const member = await getOrgMember(userId, vorgang.org_id, db);
    if (!member) return void res.status(403).json({ detail: "Access denied" });

    const matterId = req.body?.matter_id as string | undefined;
    if (!matterId) return void res.status(400).json({ detail: "matter_id fehlt" });

    const { data: matter } = await db
        .from("matters")
        .select("id, org_id")
        .eq("id", matterId)
        .maybeSingle();
    if (!matter || matter.org_id !== vorgang.org_id) {
        return void res.status(404).json({ detail: "Akte nicht gefunden" });
    }

    const { data, error } = await db
        .from("interessenten")
        .update({
            matter_id: matterId,
            status: "AKTE_ANGELEGT",
            wiedervorlage_am: null,
            updated_at: new Date().toISOString(),
        })
        .eq("id", req.params.id)
        .select("*")
        .single();
    if (error) return void res.status(500).json({ detail: error.message });

    await protokolliere({
        db,
        interessentId: vorgang.id,
        orgId: vorgang.org_id,
        vonStatus: vorgang.status,
        nachStatus: "AKTE_ANGELEGT",
        aktion: "akte_angelegt",
        notiz: `Akte ${matterId} verknüpft`,
        userId,
        rolle: member.role,
    });

    res.json(mitAbleitungen(data as InteressentZeile, heuteIso(), member.role));
});
