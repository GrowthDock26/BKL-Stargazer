"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Loader2, AlertCircle, ChevronRight, FileText,
    Calendar, Plus, CheckCircle2, Send, FileCheck, Paperclip,
    Calculator, X, Gavel, ArrowRight, ScrollText, Mail, LineChart,
    ShieldCheck, IdCard, Upload, Copy, BellRing, Archive, ArchiveRestore,
} from "lucide-react";
import {
    getMatter, transitionMatter, getIntake,
    generateOnboarding, generateProzessvollmachtVorab, approveOnboarding, sendOnboarding, PAUSCHALE_TURNUS_OPTIONEN,
    listDocuments, addFrist, markFristDone, updateFrist, openMatterDocument, downloadMatterDocumentDocx,
    setzeAktenzeichen, archiveMatter, unarchiveMatter,
    getGwgStatus, startGwgAnschreiben, markGwgAnschreibenVersendet, uploadPersonalausweis,
    uebernehmePersonalausweisDaten, runGwgPruefung, confirmGwgPruefung, uebergeheGwgPruefung,
    unterliegtGwgAblauf,
} from "@/app/lib/mandateApi";
import type {
    MatterDetail, IntakeData, MatterDocument, FristCreate, Beratungsart, Honorarmodell, PauschaleTurnus,
    GwgStatus, PersonalausweisVorschlag, MatterKategorie, OrgRolle, Frist, FristUpdate,
} from "@/app/lib/mandateApi";
import { StateBadge } from "@/app/components/mandate/StateBadge";
import { KategorieBadge } from "@/app/components/mandate/KategorieBadge";
import { GwgRisikoBadge } from "@/app/components/mandate/GwgRisikoBadge";
import { DOC_TYPE_LABELS } from "@/app/lib/docTypeLabels";

// ---------------------------------------------------------------------------
// Workflow-Phasen (für die Fortschrittsanzeige)
// ---------------------------------------------------------------------------

const GWG_PHASE = { label: "GwG-Prüfung", states: ["GWG_ANSCHREIBEN_ERZEUGT", "GWG_ANSCHREIBEN_VERSANDT", "GWG_GEPRUEFT"] };

/** Zustände, in denen die Identifizierungsstrecke noch offen ist — muss mit
 *  GWG_OFFENE_ZUSTAENDE in backend/src/lib/tools/gwg.ts übereinstimmen. */
const GWG_OFFEN = ["NEU", "GWG_ANSCHREIBEN_ERZEUGT", "GWG_ANSCHREIBEN_VERSANDT"];

const PHASEN_BASE = [
    { label: "Aufnahme",    states: ["NEU", "AUFNAHME_ERFASST"] },
    { label: "Onboarding",  states: ["ONBOARDING_ERZEUGT", "ONBOARDING_VERSANDT"] },
    { label: "Rücklauf",    states: ["RUECKLAUF_BESTAETIGT"] },
    { label: "Anspruch",    states: ["ANSPRUCH_ENTWURF", "ANSPRUCH_FREIGEGEBEN", "ANSPRUCH_VERSANDT", "FRIST_LAEUFT", "FRIST_ABGELAUFEN"] },
    { label: "Klage",       states: ["KLAGE_ENTWURF", "KLAGE_GEPRUEFT", "KLAGE_EINGEREICHT"] },
];

/**
 * Nach einer Neuerzeugung bleiben alte Dokumentversionen als Audit-Trail in
 * matter_documents erhalten — `docs` ist nach created_at DESC sortiert, hier
 * wird pro doc_type nur die jeweils neueste Version behalten, damit weder
 * die Anzeige noch der lokale Download veraltete Fassungen mit anzeigt.
 */
function latestPerDocType(list: MatterDocument[]): MatterDocument[] {
    const seen = new Set<string>();
    const result: MatterDocument[] = [];
    for (const d of list) {
        if (seen.has(d.doc_type)) continue;
        seen.add(d.doc_type);
        result.push(d);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Rollenrechte
//
// Spiegelt die serverseitigen Rollen-Gates (backend state-machine.ts sowie die
// Rollenprüfungen in onboarding.ts, anspruch.ts, gwg.ts). Dient ausschließlich
// dazu, Aktionen auszublenden, die ohnehin mit 403 abgelehnt würden — der Server
// bleibt die durchsetzende Instanz. Bei Änderungen dort hier mitpflegen.
// ---------------------------------------------------------------------------

const AKTION_ROLLEN: Record<string, OrgRolle[]> = {
    aufnahme:               ["Admin", "Anwalt", "Referendar", "ReFa"],
    gwg_versendet:          ["Admin", "Anwalt", "ReFa"],
    gwg_personalausweis:    ["Admin", "Anwalt", "Referendar", "ReFa"],
    gwg_pruefung:           ["Admin", "Anwalt", "Referendar", "ReFa"],
    gwg_bestaetigen:        ["Admin", "Anwalt"],
    onboarding_erzeugen:    ["Admin", "Anwalt", "Referendar"],
    onboarding_freigeben:   ["Admin", "Anwalt"],
    onboarding_versenden:   ["Admin", "Anwalt"],
    ruecklauf_bestaetigen:  ["Admin", "Anwalt", "ReFa"],
    anspruch:               ["Anwalt"],
    klage_geprueft:         ["Anwalt"],
    klage_eingereicht:      ["Anwalt"],
};

function rollenHinweis(aktion: string): string {
    const rollen = AKTION_ROLLEN[aktion] ?? [];
    return `Dieser Schritt ist folgenden Rollen vorbehalten: ${rollen.join(", ")}.`;
}

/** Welche Aktion gehört zum jeweiligen Aktenzustand (für den Berechtigungshinweis)? */
const ZUSTAND_AKTION: Record<string, string> = {
    NEU: "aufnahme",
    GWG_GEPRUEFT: "aufnahme",
    AUFNAHME_ERFASST: "onboarding_erzeugen",
    ONBOARDING_ERZEUGT: "onboarding_freigeben",
    ONBOARDING_VERSANDT: "ruecklauf_bestaetigen",
    RUECKLAUF_BESTAETIGT: "anspruch",
    ANSPRUCH_ENTWURF: "anspruch",
    ANSPRUCH_FREIGEGEBEN: "anspruch",
    KLAGE_ENTWURF: "klage_geprueft",
    KLAGE_GEPRUEFT: "klage_eingereicht",
};

/** Mandate in GwG-relevanten Kategorien durchlaufen zusätzlich die GwG-Phase vor der Aufnahme. */
function getPhasen(kategorie: string) {
    return unterliegtGwgAblauf(kategorie as MatterKategorie) ? [GWG_PHASE, ...PHASEN_BASE] : PHASEN_BASE;
}

function WorkflowFortschritt({ state, phasen }: { state: string; phasen: typeof PHASEN_BASE }) {
    const activeIndex = phasen.findIndex((p) => p.states.includes(state));
    return (
        <div className="flex items-center gap-0 mb-6">
            {phasen.map((p, i) => {
                const done = i < activeIndex;
                const active = i === activeIndex;
                const last = i === phasen.length - 1;
                return (
                    <div key={p.label} className="flex items-center flex-1 min-w-0">
                        <div className="flex flex-col items-center min-w-0 flex-1">
                            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                                done
                                    ? "bg-green-500 text-white"
                                    : active
                                    ? "bg-neutral-900 text-white"
                                    : "bg-neutral-200 text-neutral-400"
                            }`}>
                                {done ? <CheckCircle2 className="w-4 h-4" /> : i + 1}
                            </div>
                            <span className={`text-[10px] mt-1 font-medium truncate max-w-full ${
                                active ? "text-neutral-900" : done ? "text-green-600" : "text-neutral-400"
                            }`}>
                                {p.label}
                            </span>
                        </div>
                        {!last && (
                            <div className={`h-0.5 flex-1 mx-1 transition-colors ${
                                done ? "bg-green-400" : "bg-neutral-200"
                            }`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// "Nächste Aufgabe" — klartextliche Handlungsanweisung für die Assistentin
// ---------------------------------------------------------------------------

const NAECHSTE_AUFGABE: Record<string, { text: string; hinweis?: string; wer: string }> = {
    NEU: {
        text: "Aufnahmebogen ausfüllen",
        hinweis: "Mandantendaten und Sachverhalt erfassen.",
        wer: "ReFa / Anwalt",
    },
    GWG_ANSCHREIBEN_ERZEUGT: {
        text: "GwG-Anschreiben versenden",
        hinweis: "Hinweisschreiben mit Bitte um Personalausweis-Kopie herunterladen/kopieren und manuell an den Mandanten versenden.",
        wer: "ReFa",
    },
    GWG_ANSCHREIBEN_VERSANDT: {
        text: "Personalausweis hochladen und Risikoeinstufung durchführen",
        hinweis: "Sobald die Ausweiskopie eingegangen ist: hochladen, Daten prüfen, Kurzfragebogen ausfüllen und Einstufung durch den Anwalt bestätigen lassen.",
        wer: "ReFa / Anwalt",
    },
    GWG_GEPRUEFT: {
        text: "Aufnahmebogen ausfüllen",
        hinweis: "GwG-Prüfung abgeschlossen — Adresse/Geburtsdatum aus dem Personalausweis sind bereits vorbefüllt.",
        wer: "ReFa / Anwalt",
    },
    AUFNAHME_ERFASST: {
        text: "Onboarding-Dokumente erzeugen",
        hinweis: "Anschreiben, Honorarvereinbarung und Vollmacht werden automatisch erstellt.",
        wer: "ReFa / Anwalt",
    },
    ONBOARDING_ERZEUGT: {
        text: "Onboarding-Dokumente prüfen und versenden",
        hinweis: "Bitte Anwalt zur Freigabe auffordern, dann an Mandanten versenden.",
        wer: "Anwalt",
    },
    ONBOARDING_VERSANDT: {
        text: "Auf Rücklauf der Dokumente warten",
        hinweis: "Sobald die unterzeichnete Vollmacht und Honorarvereinbarung eingegangen sind → Rücklauf bestätigen.",
        wer: "ReFa",
    },
    RUECKLAUF_BESTAETIGT: {
        text: "Rücklauf bestätigen, dann Anspruchsschreiben erstellen",
        hinweis: "Vollmacht und Honorarvereinbarung müssen vorliegen. Der KI-Assistent erstellt einen Erstentwurf.",
        wer: "Anwalt",
    },
    ANSPRUCH_ENTWURF: {
        text: "KI-Entwurf prüfen und freigeben",
        hinweis: "Das Anspruchsschreiben wurde vom KI-Assistenten entworfen — bitte anwaltlich prüfen und freigeben.",
        wer: "Anwalt",
    },
    ANSPRUCH_FREIGEGEBEN: {
        text: "Anspruchsschreiben versenden",
        hinweis: "E-Mail-Adresse der Gegenseite eingeben und Reaktionsfrist setzen (Standard: 14 Tage).",
        wer: "Anwalt",
    },
    ANSPRUCH_VERSANDT: {
        text: "Reaktionsfrist läuft — Eingang der Antwort überwachen",
        hinweis: "Sobald die Frist abgelaufen ist oder eine Antwort eingeht, bitte Anwalt informieren.",
        wer: "ReFa",
    },
    FRIST_LAEUFT: {
        text: "Frist überwachen",
        hinweis:
            "Die Reaktionsfrist läuft und wird überwacht. Bei Fristablauf wird die Akte " +
            "automatisch zur Klagevorbereitung markiert — ein Dokument wird dabei nicht erzeugt.",
        wer: "ReFa",
    },
    FRIST_ABGELAUFEN: {
        text: "Frist ist abgelaufen — Klage vorbereiten",
        hinweis:
            "Die Reaktionsfrist ist verstrichen. Das System erstellt KEINEN Klageentwurf — " +
            "die Klageschrift ist außerhalb des Systems zu fertigen.",
        wer: "Anwalt",
    },
    KLAGE_ENTWURF: {
        text: "Klageschrift fertigen und prüfen",
        hinweis:
            "Die Klageschrift wird nicht automatisch erzeugt. Bitte außerhalb des Systems " +
            "fertigen, anwaltlich prüfen und anschließend hier bestätigen.",
        wer: "Anwalt",
    },
    KLAGE_GEPRUEFT: {
        text: "Klage über beA einreichen (§ 130d ZPO)",
        hinweis: "Die Klageschrift ist geprüft und kann über das beA beim zuständigen Gericht eingereicht werden.",
        wer: "Anwalt",
    },
    KLAGE_EINGEREICHT: {
        text: "Klage wurde eingereicht",
        hinweis: "Das Mandat läuft beim Gericht. Weitere Schritte richten sich nach dem gerichtlichen Verfahren.",
        wer: "",
    },
};

// Labels für Aktionsbuttons (Zustand → Button-Text)
const AKTION_LABELS: Record<string, string> = {
    AUFNAHME_ERFASST: "Aufnahme abgeschlossen",
    RUECKLAUF_BESTAETIGT: "Rücklauf eingegangen (Vollmacht + HV liegen vor)",
    FRIST_LAEUFT: "Frist läuft — weiter",
    FRIST_ABGELAUFEN: "Frist abgelaufen — Klage vorbereiten",
    KLAGE_ENTWURF: "Zur Klagevorbereitung markieren",
    KLAGE_GEPRUEFT: "Klageschrift geprüft",
    KLAGE_EINGEREICHT: "Klage über beA eingereicht",
};

const STATE_LABELS: Record<string, string> = {
    NEU: "Neu",
    GWG_ANSCHREIBEN_ERZEUGT: "GwG-Anschreiben erzeugt",
    GWG_ANSCHREIBEN_VERSANDT: "GwG-Anschreiben versandt",
    GWG_GEPRUEFT: "GwG geprüft",
    AUFNAHME_ERFASST: "Aufnahme erfasst",
    ONBOARDING_ERZEUGT: "Onboarding erzeugt",
    ONBOARDING_VERSANDT: "Onboarding versandt",
    RUECKLAUF_BESTAETIGT: "Rücklauf bestätigt",
    ANSPRUCH_ENTWURF: "Anspruch (Entwurf)",
    ANSPRUCH_FREIGEGEBEN: "Anspruch freigegeben",
    ANSPRUCH_VERSANDT: "Anspruch versandt",
    FRIST_LAEUFT: "Frist läuft",
    FRIST_ABGELAUFEN: "Frist abgelaufen",
    KLAGE_ENTWURF: "Klage (Entwurf)",
    KLAGE_GEPRUEFT: "Klage geprüft",
    KLAGE_EINGEREICHT: "Klage eingereicht",
};

const FRIST_TYPEN = [
    "Antwortfrist",
    "Klagefrist",
    "Berufungsfrist",
    "Revisionsfrist",
    "Verjährungsfrist",
    "Widerspruchsfrist",
    "Einspruchsfrist",
    "Notfrist",
    "Sonstige Frist",
];

export default function MandatDetailPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [matter, setMatter] = useState<MatterDetail | null>(null);
    const [intake, setIntake] = useState<IntakeData | null>(null);
    const [docs, setDocs] = useState<MatterDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [transitioning, setTransitioning] = useState(false);

    // GwG-Ablauf
    const [gwgStatus, setGwgStatus] = useState<GwgStatus | null>(null);
    const [gwgLoading, setGwgLoading] = useState(false);
    const [gwgMsg, setGwgMsg] = useState<string | null>(null);
    const [paVorschlag, setPaVorschlag] = useState<PersonalausweisVorschlag | null>(null);
    const [kopiert, setKopiert] = useState<string | null>(null);
    const [startEmail, setStartEmail] = useState("");
    const [showUebergehen, setShowUebergehen] = useState(false);
    const [uebergehenGrund, setUebergehenGrund] = useState("");
    const [pep, setPep] = useState<"" | "ja" | "nein">("");
    const [wbIdentisch, setWbIdentisch] = useState<"" | "ja" | "nein">("");
    const [transaktionsland, setTransaktionsland] = useState("");
    const gwgPanelRef = useRef<HTMLDivElement>(null);

    function openGwgPanel() {
        setTimeout(() => gwgPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }

    const [onboardingLoading, setOnboardingLoading] = useState(false);
    const [onboardingMsg, setOnboardingMsg] = useState<string | null>(null);
    const [showOnboardingForm, setShowOnboardingForm] = useState(false);
    const [vollmachtLoading, setVollmachtLoading] = useState(false);
    const onboardingPanelRef = useRef<HTMLDivElement>(null);

    function openOnboardingForm() {
        setShowOnboardingForm(true);
        // Das Panel liegt weiter unten auf der Seite — ohne Scroll wirkt der
        // Klick auf "Dokumente erzeugen" oben in der "Nächste Aufgabe"-Karte
        // wie ein Fehlklick, weil sich sichtbar nichts tut.
        setTimeout(() => onboardingPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    }
    const [beratungsart, setBeratungsart] = useState<Beratungsart>("rechtlich");
    const [honorarmodell, setHonorarmodell] = useState<Honorarmodell>("stundensatz");
    const [sachbearbeiter, setSachbearbeiter] = useState("");
    // Aus der Aktenanlage übernommen, hier korrigierbar — ob der Mandant als
    // Unternehmer handelt, klärt sich oft erst im Erstgespräch.
    const [unternehmensmandat, setUnternehmensmandat] = useState(false);
    // Pauschalvereinbarung — steuert einen optionalen Absatz der
    // Honorarvereinbarung. Ohne Haken erscheint er im Dokument gar nicht.
    const [pauschale, setPauschale] = useState(false);
    const [pauschaleZweck, setPauschaleZweck] = useState("");
    const [pauschaleBetrag, setPauschaleBetrag] = useState("");
    const [pauschaleUmfang, setPauschaleUmfang] = useState("");
    const [pauschaleTurnus, setPauschaleTurnus] = useState<PauschaleTurnus>("jaehrlich");
    const [aktenzeichenEingabe, setAktenzeichenEingabe] = useState("");
    const [azLoading, setAzLoading] = useState(false);
    const [stundensatzPartner, setStundensatzPartner] = useState("375");
    const [stundensatzAnwalt, setStundensatzAnwalt] = useState("350");
    const [stundensatzFachmitarbeiter, setStundensatzFachmitarbeiter] = useState("160");

    const [showFristForm, setShowFristForm] = useState(false);
    const [fristLoading, setFristLoading] = useState(false);
    const [editFristId, setEditFristId] = useState<string | null>(null);
    const [editFrist, setEditFrist] = useState<FristUpdate>({});
    const [fristForm, setFristForm] = useState<FristCreate>({
        typ: FRIST_TYPEN[0],
        startdatum: new Date().toISOString().slice(0, 10),
        fristende: "",
        reminderdatum: "",
        notiz: "",
    });

    const load = useCallback(async () => {
        try {
            const [m, i, d] = await Promise.all([getMatter(id), getIntake(id), listDocuments(id)]);
            setMatter(m);
            setIntake(i);
            setDocs(d);
            if (unterliegtGwgAblauf(m.kategorie)) {
                const g = await getGwgStatus(id);
                setGwgStatus(g);
                if (g.pruefung) {
                    setPep(g.pruefung.pep === true ? "ja" : g.pruefung.pep === false ? "nein" : "");
                    setWbIdentisch(
                        g.pruefung.wirtschaftlich_berechtigter_identisch === true
                            ? "ja"
                            : g.pruefung.wirtschaftlich_berechtigter_identisch === false
                              ? "nein"
                              : "",
                    );
                    setTransaktionsland(g.pruefung.transaktionsland ?? "");
                }
            }
            // ProReal-Mandate laufen immer als reines RVG-Mandat — Rechtsgebiet
            // und Honorarmodell im Onboarding-Formular entsprechend vorbelegen.
            if (m.kategorie === "pro_real") {
                setBeratungsart("pro_real");
                setHonorarmodell("rvg");
            }
            if (m.sachbearbeiter) {
                setSachbearbeiter((prev) => prev || m.sachbearbeiter || "");
            }
            setUnternehmensmandat(m.unternehmensmandat === true);
            setPauschale(m.pauschale_vereinbart === true);
            setPauschaleZweck((prev) => prev || m.pauschale_zweck || "");
            setPauschaleBetrag((prev) => prev || m.pauschale_betrag || "");
            setPauschaleUmfang((prev) => prev || m.pauschale_umfang || "");
            if (m.pauschale_turnus) setPauschaleTurnus(m.pauschale_turnus);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Laden");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    async function handleTransition(toState: string) {
        if (!matter) return;
        setTransitioning(true);
        setError(null);
        try {
            await transitionMatter(id, toState);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setTransitioning(false);
        }
    }

    /**
     * Kopiert Betreff und Text eines Mailentwurfs in die Zwischenablage.
     * Der Versand erfolgt manuell im Mailprogramm — ohne Kopierfunktion müsste
     * der Text mit der Maus markiert werden (Befund 5.2).
     */
    async function handleKopieren(schluessel: string, betreff: string | null, text: string | null) {
        const inhalt = [betreff, text].filter(Boolean).join("\n\n");
        if (!inhalt) return;
        try {
            await navigator.clipboard.writeText(inhalt);
            setKopiert(schluessel);
            setTimeout(() => setKopiert((k) => (k === schluessel ? null : k)), 2500);
        } catch {
            setError("Kopieren nicht möglich — bitte den Text manuell markieren.");
        }
    }

    async function handleStartGwg(e: React.FormEvent) {
        e.preventDefault();
        setGwgLoading(true);
        setError(null);
        try {
            await startGwgAnschreiben(id, startEmail.trim() || undefined);
            setGwgMsg("GwG-Ablauf gestartet — das Hinweisschreiben liegt unten bereit.");
            setStartEmail("");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setGwgLoading(false);
        }
    }

    async function handleUebergeheGwg(e: React.FormEvent) {
        e.preventDefault();
        setGwgLoading(true);
        setError(null);
        try {
            await uebergeheGwgPruefung(id, uebergehenGrund.trim());
            setGwgMsg("GwG-Prüfung übergangen. Der Aufnahmebogen ist jetzt freigeschaltet.");
            setShowUebergehen(false);
            setUebergehenGrund("");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setGwgLoading(false);
        }
    }

    async function handleMarkGwgVersendet() {
        setGwgLoading(true);
        setError(null);
        try {
            await markGwgAnschreibenVersendet(id);
            setGwgMsg("GwG-Anschreiben als versendet markiert.");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setGwgLoading(false);
        }
    }

    async function handleUploadPersonalausweis(file: File) {
        setGwgLoading(true);
        setGwgMsg(null);
        setError(null);
        try {
            const result = await uploadPersonalausweis(id, file);
            setPaVorschlag(result.vorschlag);
            setGwgMsg(
                `Ausweis gespeichert und ausgelesen (Konfidenz: ${result.konfidenz}). ` +
                    "Bitte Daten prüfen und übernehmen.",
            );
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Hochladen");
        } finally {
            setGwgLoading(false);
        }
    }

    async function handleUebernehmePersonalausweis() {
        if (!paVorschlag) return;
        setGwgLoading(true);
        setError(null);
        try {
            await uebernehmePersonalausweisDaten(id, paVorschlag);
            setGwgMsg("Mandantendaten aus dem Personalausweis übernommen.");
            setPaVorschlag(null);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setGwgLoading(false);
        }
    }

    async function handleRunGwgPruefung() {
        setGwgLoading(true);
        setError(null);
        try {
            await runGwgPruefung(id, {
                pep: pep === "" ? null : pep === "ja",
                wirtschaftlich_berechtigter_identisch: wbIdentisch === "" ? null : wbIdentisch === "ja",
                transaktionsland: transaktionsland.trim() || undefined,
            });
            setGwgMsg("Risikoeinstufung durchgeführt.");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setGwgLoading(false);
        }
    }

    async function handleConfirmGwgPruefung() {
        setGwgLoading(true);
        setError(null);
        try {
            await confirmGwgPruefung(id);
            setGwgMsg("GwG-Einstufung bestätigt — Aufnahmebogen ist jetzt freigeschaltet.");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setGwgLoading(false);
        }
    }

    async function handleAktenzeichen(e: React.FormEvent) {
        e.preventDefault();
        if (!aktenzeichenEingabe.trim()) return;
        setAzLoading(true);
        setError(null);
        try {
            await setzeAktenzeichen(id, aktenzeichenEingabe.trim());
            setAktenzeichenEingabe("");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Aktennummer konnte nicht gespeichert werden");
        } finally {
            setAzLoading(false);
        }
    }

    async function handleGenerateOnboarding(e: React.FormEvent) {
        e.preventDefault();
        setOnboardingLoading(true);
        setOnboardingMsg(null);
        setError(null);
        try {
            const result = await generateOnboarding(id, {
                beratungsart,
                honorarmodell,
                sachbearbeiter: sachbearbeiter.trim() || undefined,
                unternehmensmandat,
                pauschale,
                pauschale_zweck: pauschaleZweck.trim(),
                pauschale_betrag: pauschaleBetrag.trim(),
                pauschale_umfang: pauschaleUmfang.trim(),
                pauschale_turnus: pauschaleTurnus,
                // Bei reinem RVG-Mandat wird dieselbe Vorlage genutzt und vor
                // Versand manuell angepasst — Stundensätze werden trotzdem
                // (mit den Default-/zuletzt gesetzten Werten) mitgeschickt.
                stundensatz_partner: parseFloat(stundensatzPartner.replace(",", ".")) || undefined,
                stundensatz_anwalt: parseFloat(stundensatzAnwalt.replace(",", ".")) || undefined,
                stundensatz_fachmitarbeiter: parseFloat(stundensatzFachmitarbeiter.replace(",", ".")) || undefined,
            });
            setShowOnboardingForm(false);
            const basis = result.review_required
                ? "Dokumente wurden erzeugt. Bitte Anwalt zur Freigabe auffordern."
                : "Dokumente wurden erzeugt.";
            // Eine fehlgeschlagene PDF-Konvertierung kostet das Dokument nicht
            // mehr — es liegt dann nur als Word-Datei in der Akte. Das muss der
            // Anwender sehen, sonst sucht er später vergeblich nach dem PDF.
            setOnboardingMsg(
                result.warnungen?.length ? `${basis} ${result.warnungen.join(" ")}` : basis,
            );
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setOnboardingLoading(false);
        }
    }

    async function handleGenerateProzessvollmacht() {
        setVollmachtLoading(true);
        setOnboardingMsg(null);
        setError(null);
        try {
            const result = await generateProzessvollmachtVorab(id, {
                sachbearbeiter: sachbearbeiter.trim() || undefined,
            });
            setOnboardingMsg(
                result.warnungen?.length
                    ? `Prozessvollmacht wurde erzeugt. ${result.warnungen.join(" ")}`
                    : "Prozessvollmacht wurde erzeugt — unter \"Dokumente\" abrufbar.",
            );
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setVollmachtLoading(false);
        }
    }

    const [archivLoading, setArchivLoading] = useState(false);

    async function handleArchivieren() {
        if (!window.confirm("Akte archivieren? Sie verschwindet aus der Standardübersicht, bleibt aber vollständig erhalten und ist jederzeit wiederherstellbar.")) {
            return;
        }
        setArchivLoading(true);
        setError(null);
        try {
            await archiveMatter(id);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setArchivLoading(false);
        }
    }

    async function handleEntarchivieren() {
        setArchivLoading(true);
        setError(null);
        try {
            await unarchiveMatter(id);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setArchivLoading(false);
        }
    }

    async function handleApproveOnboarding() {
        setOnboardingLoading(true);
        setError(null);
        try {
            await approveOnboarding(id);
            setOnboardingMsg("Freigabe erteilt. Dokumente können jetzt versandt werden.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setOnboardingLoading(false);
        }
    }

    async function handleSendOnboarding() {
        setOnboardingLoading(true);
        setError(null);
        try {
            // Erst herunterladen, damit der Anwalt die Dateien in jedem Fall
            // lokal hat — unabhängig davon, ob SMTP konfiguriert ist.
            const onboardingDocs = latestPerDocType(docs.filter((d) => d.doc_type.startsWith("ONBOARDING_")));
            for (const d of onboardingDocs) {
                await openMatterDocument(id, d);
            }

            const result = await sendOnboarding(id);
            setOnboardingMsg(
                result.manuell_versenden
                    ? `Dokumente heruntergeladen. Bitte manuell per E-Mail an ${result.empfaenger} senden.`
                    : `Dokumente heruntergeladen und Onboarding-Paket an ${result.empfaenger} versandt.`,
            );
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setOnboardingLoading(false);
        }
    }

    async function handleAddFrist(e: React.FormEvent) {
        e.preventDefault();
        setFristLoading(true);
        setError(null);
        try {
            await addFrist(id, {
                ...fristForm,
                reminderdatum: fristForm.reminderdatum || undefined,
                notiz: fristForm.notiz || undefined,
            });
            setShowFristForm(false);
            setFristForm({
                typ: FRIST_TYPEN[0],
                startdatum: new Date().toISOString().slice(0, 10),
                fristende: "",
                reminderdatum: "",
                notiz: "",
            });
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Speichern");
        } finally {
            setFristLoading(false);
        }
    }

    function beginEditFrist(f: Frist) {
        setEditFristId(f.id);
        setEditFrist({
            typ: f.typ,
            startdatum: f.startdatum,
            fristende: f.fristende,
            reminderdatum: f.reminderdatum ?? "",
            notiz: f.notiz ?? "",
        });
    }

    async function handleSaveFrist(e: React.FormEvent) {
        e.preventDefault();
        if (!editFristId) return;
        setFristLoading(true);
        setError(null);
        try {
            await updateFrist(id, editFristId, editFrist);
            setEditFristId(null);
            setEditFrist({});
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Speichern");
        } finally {
            setFristLoading(false);
        }
    }

    async function handleMarkFristDone(fristId: string) {
        setError(null);
        try {
            await markFristDone(id, fristId);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
        );
    }

    if (!matter) {
        return (
            <div className="max-w-3xl mx-auto px-4 py-8">
                <p className="text-red-600">{error ?? "Akte nicht gefunden"}</p>
            </div>
        );
    }

    // Akten in GwG-Kategorien stehen nach der Anlage in NEU: Die GwG-Strecke
    // startet bewusst erst mit dem Rücklauf der Vollmacht, denn vorher steht
    // nicht fest, ob überhaupt ein Mandat zustande kommt. Der Aufnahmebogen
    // bleibt bis zur bestätigten Risikoeinstufung gesperrt.
    const gwgNachzuholen =
        matter.state === "NEU" && unterliegtGwgAblauf(matter.kategorie);

    const naechsteAufgabe = gwgNachzuholen
        ? {
              text: matter.aktenzeichen
                  ? "Auf Rücklauf der Vollmacht warten — danach GwG-Prüfung starten"
                  : "Auf Rücklauf der Vollmacht warten",
              hinweis:
                  "Sobald die unterzeichnete Vollmacht vorliegt: Akte in RA-Micro anlegen, " +
                  (matter.aktenzeichen ? "" : "die Aktennummer oben eintragen ") +
                  "und die GwG-Prüfung starten (Identifizierung nach §§ 10 ff. GwG). " +
                  "Der Aufnahmebogen wird erst nach bestätigter Risikoeinstufung freigeschaltet.",
              wer: "ReFa / Anwalt",
          }
        : NAECHSTE_AUFGABE[matter.state];
    // Pro-Real hat kein generisches Onboarding-Paket (siehe Direktaktion oben in
    // der "Nächste Aufgabe"-Karte) — das Panel hier würde sonst denselben,
    // jetzt serverseitig blockierten Weg anbieten.
    const showOnboarding =
        matter.kategorie !== "pro_real" && ["AUFNAHME_ERFASST", "ONBOARDING_ERZEUGT"].includes(matter.state);

    /** Darf der angemeldete Nutzer diese Aktion ausführen? (nur UI-Darstellung) */
    const darf = (aktion: string): boolean =>
        (AKTION_ROLLEN[aktion] ?? []).includes(matter.user_role);

    // Filtere Transitionen, die durch dedizierte Panels abgedeckt sind
    const genericTransitions = matter.possible_next_states.filter(
        (s) =>
            !["ONBOARDING_ERZEUGT", "ONBOARDING_VERSANDT",
              "GWG_ANSCHREIBEN_ERZEUGT", "GWG_ANSCHREIBEN_VERSANDT", "GWG_GEPRUEFT"].includes(s),
    );

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">

            {/* Zurück-Link + Titel */}
            <div>
                <button
                    onClick={() => router.push("/mandate")}
                    className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-4"
                >
                    <ArrowLeft className="w-4 h-4" /> Alle Mandate
                </button>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-xl font-semibold leading-tight">{matter.bezeichnung}</h1>
                        {matter.aktenzeichen ? (
                            <p className="text-sm text-neutral-500 font-mono mt-0.5">
                                RA-Micro {matter.aktenzeichen}
                            </p>
                        ) : (
                            /* Ohne Aktennummer: die Akte ist noch nicht in RA-Micro geführt.
                               Das ist der Regelfall bis zum Rücklauf der Vollmacht — deshalb
                               ein Eingabefeld statt einer Fehlermeldung. */
                            <form
                                onSubmit={(e) => void handleAktenzeichen(e)}
                                className="flex items-center gap-2 mt-1"
                            >
                                <input
                                    value={aktenzeichenEingabe}
                                    onChange={(e) => setAktenzeichenEingabe(e.target.value)}
                                    placeholder="RA-Micro Nr. nachtragen (123/24)"
                                    className="border border-neutral-300 rounded-lg px-2 py-1 text-xs font-mono w-56"
                                />
                                <button
                                    type="submit"
                                    disabled={azLoading || !aktenzeichenEingabe.trim()}
                                    className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1 hover:bg-neutral-50 disabled:opacity-40 text-neutral-600 flex items-center gap-1.5"
                                >
                                    {azLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                    Speichern
                                </button>
                            </form>
                        )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {["RUECKLAUF_BESTAETIGT", "ANSPRUCH_ENTWURF", "ANSPRUCH_FREIGEGEBEN", "ANSPRUCH_VERSANDT"].includes(matter.state) && (
                            <button
                                onClick={() => router.push(`/mandate/${id}/anspruch`)}
                                className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-600"
                            >
                                <Gavel className="w-3.5 h-3.5" />
                                Anspruch
                            </button>
                        )}
                        <button
                            onClick={() => router.push(`/mandate/${id}/dokumente`)}
                            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-600"
                        >
                            <Paperclip className="w-3.5 h-3.5" />
                            Dokumente{docs.length > 0 ? ` (${docs.length})` : ""}
                        </button>
                        {matter.kategorie === "pro_real" && (
                            <button
                                onClick={() => router.push(`/mandate/${id}/pre`)}
                                className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-600"
                                title="PRE-Fragebogen auslesen, Beteiligungen und Streitwert erfassen"
                            >
                                <LineChart className="w-3.5 h-3.5" />
                                Fragebogen
                            </button>
                        )}
                        {matter.kategorie !== "pro_real" && (
                            <button
                                onClick={() => void handleGenerateProzessvollmacht()}
                                disabled={vollmachtLoading}
                                className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 disabled:opacity-40 flex items-center gap-1.5 text-neutral-600"
                                title="Gerichtliche Vollmacht / Prozessvollmacht (§ 80 ZPO) sofort erzeugen — auch ohne vollständigen Aufnahmebogen"
                            >
                                {vollmachtLoading ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                    <FileCheck className="w-3.5 h-3.5" />
                                )}
                                Prozessvollmacht
                            </button>
                        )}
                        <button
                            onClick={() => router.push(`/mandate/${id}/rvg`)}
                            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-600"
                        >
                            <Calculator className="w-3.5 h-3.5" />
                            RVG
                        </button>
                        <button
                            onClick={() => router.push(`/mandate/${id}/nachlassverzeichnis`)}
                            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-600"
                            title="Nachlassverzeichnis — Vermögensaufnahme, Ermittlungsschreiben, Kündigungen"
                        >
                            <ScrollText className="w-3.5 h-3.5" />
                            Nachlass
                        </button>
                        {matter.user_role === "Admin" && (
                            matter.archiviert_am ? (
                                <button
                                    onClick={() => void handleEntarchivieren()}
                                    disabled={archivLoading}
                                    className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 disabled:opacity-40 flex items-center gap-1.5 text-neutral-600"
                                    title="Akte wieder in der Standardübersicht anzeigen"
                                >
                                    {archivLoading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <ArchiveRestore className="w-3.5 h-3.5" />
                                    )}
                                    Wiederherstellen
                                </button>
                            ) : (
                                <button
                                    onClick={() => void handleArchivieren()}
                                    disabled={archivLoading}
                                    className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50 disabled:opacity-40 flex items-center gap-1.5 text-neutral-600"
                                    title="Aus der Standardübersicht ausblenden — löscht nichts, jederzeit wiederherstellbar"
                                >
                                    {archivLoading ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Archive className="w-3.5 h-3.5" />
                                    )}
                                    Archivieren
                                </button>
                            )
                        )}
                        <KategorieBadge kategorie={matter.kategorie} />
                        <StateBadge state={matter.state} />
                    </div>
                </div>
            </div>

            {matter.archiviert_am && (
                <div className="border border-amber-200 bg-amber-50/60 rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
                    <Archive className="w-4 h-4 shrink-0" />
                    Diese Akte ist archiviert seit {new Date(matter.archiviert_am).toLocaleDateString("de-DE")}
                    {matter.user_role === "Admin" ? " — sie erscheint nicht in der Standardübersicht." : "."}
                </div>
            )}

            {/* Pro-Real-Mandate: gesonderter Kapitalmarktrecht-Workflow */}
            {matter.kategorie === "pro_real" && (
                <div className="border border-pink-200 bg-pink-50/40 rounded-xl p-4 flex items-center justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-pink-800">Pro Real Mandat</p>
                        <p className="text-xs text-pink-700 mt-0.5">
                            Die Mandatsunterlagen (Informationsschreiben, Fragebogen, Vollmacht,
                            Widerrufsbelehrung) wurden bereits vor der Aktenanlage über den
                            Interessenten-Workflow verschickt — ein zusätzliches generisches
                            Onboarding-Paket wird für Pro-Real-Mandate nicht erzeugt. Der
                            PRE-Fragebogen wertet den Rücklauf aus und berechnet daraus den
                            Streitwert (Zeichnungssumme + Agio − Auszahlungen).
                        </p>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                        <button
                            onClick={() => router.push(`/mandate/${id}/pre`)}
                            className="bg-pink-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-pink-700 flex items-center gap-1.5"
                        >
                            <LineChart className="w-3.5 h-3.5" />
                            PRE-Fragebogen &amp; Streitwert
                        </button>
                        {/* Die allgemeine Kapitalmarktseite ist ein Rechner mit
                            Chat-Assistent ohne Aktenbezug — als Werkzeug nützlich,
                            aber kein Schritt im Ablauf dieser Akte. */}
                        <button
                            onClick={() => router.push("/kapitalmarkt")}
                            className="text-xs text-pink-700 hover:underline text-center"
                        >
                            Kapitalmarkt-Werkzeuge (ohne Aktenbezug)
                        </button>
                    </div>
                </div>
            )}

            {/* Workflow-Fortschritt */}
            <WorkflowFortschritt state={matter.state} phasen={getPhasen(matter.kategorie)} />

            {/* Fehlermeldung */}
            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {onboardingMsg && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {onboardingMsg}
                </div>
            )}

            {/* ===== NÄCHSTE AUFGABE ===== */}
            {naechsteAufgabe && matter.state !== "KLAGE_EINGEREICHT" && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-[10px] font-semibold text-blue-500 uppercase tracking-wider mb-1">
                        Nächste Aufgabe {naechsteAufgabe.wer ? `· ${naechsteAufgabe.wer}` : ""}
                    </p>
                    <p className="font-semibold text-neutral-900">{naechsteAufgabe.text}</p>
                    {naechsteAufgabe.hinweis && (
                        <p className="text-sm text-neutral-600 mt-1">{naechsteAufgabe.hinweis}</p>
                    )}

                    {/* GwG-Ablauf nachholen — nur für Akten in NEU mit GwG-Kategorie.
                        E-Mail-Feld erscheint, wenn die Akte noch keine hinterlegt hat
                        (Bestandsakten von vor der Umstellung). */}
                    {gwgNachzuholen && darf("gwg_versendet") && (
                        <form onSubmit={(e) => void handleStartGwg(e)} className="mt-3 space-y-2">
                            {!matter.mandant_email && (
                                <div>
                                    <label className="block text-xs font-medium mb-1">
                                        E-Mail-Adresse des Mandanten <span className="text-red-500">*</span>
                                    </label>
                                    <input
                                        type="email"
                                        required
                                        value={startEmail}
                                        onChange={(e) => setStartEmail(e.target.value)}
                                        placeholder="mandant@beispiel.de"
                                        className="w-full max-w-sm border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                                    />
                                    <p className="text-[10px] text-neutral-500 mt-1">
                                        Wird für das GwG-Hinweisschreiben mit der Bitte um eine Ausweiskopie benötigt.
                                    </p>
                                </div>
                            )}
                            <button
                                type="submit"
                                disabled={gwgLoading}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {gwgLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                <ShieldCheck className="w-3.5 h-3.5" /> GwG-Prüfung starten
                            </button>
                        </form>
                    )}

                    {/* Abwahl durch den Anwalt — z.B. wenn die Legitimierung
                        bereits aus einem anderen Mandat vorliegt. Aus jedem
                        offenen GwG-Zustand heraus möglich, Begründung Pflicht. */}
                    {GWG_OFFEN.includes(matter.state) && darf("gwg_bestaetigen") && (
                        showUebergehen ? (
                            <form onSubmit={(e) => void handleUebergeheGwg(e)} className="mt-3 bg-white/70 border border-blue-100 rounded-lg p-3 space-y-2">
                                <label className="block text-xs font-semibold">
                                    Begründung für das Übergehen der GwG-Prüfung <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    minLength={10}
                                    value={uebergehenGrund}
                                    onChange={(e) => setUebergehenGrund(e.target.value)}
                                    placeholder="z. B. Legitimierung liegt aus Akte 44/25 vom 12.03.2026 vor"
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                                />
                                <p className="text-[10px] text-neutral-500">
                                    Wird mit Ihrem Namen und Zeitstempel dauerhaft in der Akte protokolliert.
                                    Die Entscheidung liegt nach § 10 Abs. 2 GwG bei Ihnen.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={gwgLoading || uebergehenGrund.trim().length < 10}
                                        className="border border-amber-400 bg-white text-amber-800 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-amber-50 disabled:opacity-40 flex items-center gap-1.5"
                                    >
                                        {gwgLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        Prüfung übergehen
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setShowUebergehen(false); setUebergehenGrund(""); }}
                                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-50"
                                    >
                                        Abbrechen
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <button
                                type="button"
                                onClick={() => setShowUebergehen(true)}
                                className="mt-3 text-xs text-neutral-500 hover:text-neutral-800 underline underline-offset-2"
                            >
                                GwG-Prüfung übergehen (Anwalt, mit Begründung)
                            </button>
                        )
                    )}

                    {/* Direktaktionen direkt in der "Nächste Aufgabe"-Karte */}
                    <div className="flex flex-wrap gap-2 mt-3">
                        {["GWG_ANSCHREIBEN_ERZEUGT", "GWG_ANSCHREIBEN_VERSANDT"].includes(matter.state) && (
                            <button
                                onClick={openGwgPanel}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5"
                            >
                                Zur GwG-Prüfung <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {["GWG_GEPRUEFT", "NEU"].includes(matter.state) && !intake && !gwgNachzuholen && darf("aufnahme") && (
                            <button
                                onClick={() => router.push(`/mandate/${id}/aufnahme`)}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5"
                            >
                                Aufnahmebogen ausfüllen <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {matter.state === "NEU" && intake && !gwgNachzuholen && darf("aufnahme") && (
                            <button
                                onClick={() => void handleTransition("AUFNAHME_ERFASST")}
                                disabled={transitioning}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {transitioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Aufnahme abschließen <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {matter.state === "AUFNAHME_ERFASST" && matter.kategorie !== "pro_real" && darf("onboarding_erzeugen") && (
                            <button
                                onClick={openOnboardingForm}
                                disabled={onboardingLoading || !intake}
                                title={!intake ? "Aufnahmebogen zuerst ausfüllen" : undefined}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {onboardingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Dokumente erzeugen <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {/* Pro-Real: kein generisches Onboarding-Paket — die
                            Mandatsunterlagen wurden bereits vor der Aktenanlage
                            über den Interessenten-Workflow verschickt. Dieser
                            Übergang bringt die Akte nur formal auf den erreichten
                            Stand, ohne etwas neu zu erzeugen oder zu versenden. */}
                        {matter.state === "AUFNAHME_ERFASST" && matter.kategorie === "pro_real" && darf("onboarding_freigeben") && (
                            <button
                                onClick={() => void handleTransition("ONBOARDING_VERSANDT")}
                                disabled={transitioning}
                                className="bg-pink-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-pink-700 disabled:opacity-50 flex items-center gap-1.5"
                                title="Die Mandatsunterlagen wurden bereits vor der Aktenanlage über den Interessenten-Workflow verschickt"
                            >
                                {transitioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Unterlagen bereits verschickt — weiter zu Rücklauf <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {matter.state === "ONBOARDING_ERZEUGT" && darf("onboarding_freigeben") && (
                            <>
                                <button
                                    onClick={() => void handleApproveOnboarding()}
                                    disabled={onboardingLoading}
                                    className="border border-blue-300 bg-white text-blue-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-50 disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {onboardingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    <CheckCircle2 className="w-3.5 h-3.5" /> Freigeben
                                </button>
                                <button
                                    onClick={() => void handleSendOnboarding()}
                                    disabled={onboardingLoading}
                                    className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                                >
                                    {onboardingLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    <Send className="w-3.5 h-3.5" /> Herunterladen und an Mandanten versenden
                                </button>
                            </>
                        )}
                        {matter.state === "ONBOARDING_VERSANDT" && darf("ruecklauf_bestaetigen") && (
                            <button
                                onClick={() => void handleTransition("RUECKLAUF_BESTAETIGT")}
                                disabled={transitioning}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {transitioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Rücklauf bestätigen <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {["RUECKLAUF_BESTAETIGT", "ANSPRUCH_ENTWURF", "ANSPRUCH_FREIGEGEBEN"].includes(matter.state) && darf("anspruch") && (
                            <button
                                onClick={() => router.push(`/mandate/${id}/anspruch`)}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5"
                            >
                                Zum Anspruchsschreiben <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {matter.state === "KLAGE_ENTWURF" && darf("klage_geprueft") && (
                            <button
                                onClick={() => void handleTransition("KLAGE_GEPRUEFT")}
                                disabled={transitioning}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {transitioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Klageschrift geprüft <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                        {matter.state === "KLAGE_GEPRUEFT" && darf("klage_eingereicht") && (
                            <button
                                onClick={() => void handleTransition("KLAGE_EINGEREICHT")}
                                disabled={transitioning}
                                className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {transitioning && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Klage eingereicht (beA) <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Statt eines Buttons, der serverseitig mit 403 endet: klarer Hinweis, wer zuständig ist. */}
                    {ZUSTAND_AKTION[matter.state] && !darf(ZUSTAND_AKTION[matter.state]) && (
                        <p className="text-xs text-neutral-500 mt-3 bg-white/70 border border-blue-100 rounded-lg px-3 py-2">
                            {rollenHinweis(ZUSTAND_AKTION[matter.state])} Ihre Rolle: {matter.user_role}.
                        </p>
                    )}
                </div>
            )}

            {/* Abgewählte GwG-Prüfung sichtbar machen — sonst wäre in der Akte
                nicht erkennbar, dass die Identifizierung bewusst unterblieben ist. */}
            {matter.gwg_uebersprungen_at && (
                <div className="border border-amber-200 bg-amber-50/50 rounded-xl p-4 flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-semibold text-amber-900">
                            GwG-Prüfung wurde übergangen
                        </p>
                        <p className="text-sm text-amber-800 mt-0.5">{matter.gwg_uebersprungen_grund}</p>
                        <p className="text-xs text-amber-700 mt-1">
                            Anwaltliche Entscheidung vom{" "}
                            {new Date(matter.gwg_uebersprungen_at).toLocaleDateString("de-DE")} — im Aktenprotokoll festgehalten.
                        </p>
                    </div>
                </div>
            )}

            {/* Begleitmail-Entwurf (Honorarvereinbarung)
                Steht bewusst UNTER der "Nächste Aufgabe"-Karte und ist eingeklappt:
                der Entwurf ist mehrere Absätze lang und hat die eigentliche
                Handlungsanweisung sonst aus dem sichtbaren Bereich geschoben. */}
            {matter.begleitmail_text && (
                <details className="border border-neutral-200 rounded-xl">
                    <summary className="px-5 py-3 text-sm font-medium text-neutral-600 cursor-pointer hover:text-neutral-800 flex items-center gap-2 list-none">
                        <Mail className="w-4 h-4" /> Begleitmail-Entwurf (Honorarvereinbarung)
                        <span className="text-xs text-neutral-400 font-normal">— zum Anzeigen klicken</span>
                    </summary>
                    <div className="px-5 pb-5">
                        <div className="flex items-start justify-between gap-3 mb-2">
                            <p className="text-xs text-neutral-400">
                                KI-Entwurf — nur Text, kein automatischer Versand. Bitte vor Verwendung prüfen.
                                Der Abschnitt zur Rücksendung von Vollmacht, Vereinbarung und Ausweiskopie ist fest vorgegeben.
                            </p>
                            <button
                                type="button"
                                onClick={() => void handleKopieren("begleitmail", matter.begleitmail_betreff, matter.begleitmail_text)}
                                className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1 hover:bg-neutral-50 flex items-center gap-1.5 text-neutral-600 shrink-0"
                            >
                                {kopiert === "begleitmail"
                                    ? <><CheckCircle2 className="w-3 h-3 text-green-600" /> Kopiert</>
                                    : <><Copy className="w-3 h-3" /> Kopieren</>}
                            </button>
                        </div>
                        <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
                            <p className="text-sm font-semibold">{matter.begleitmail_betreff}</p>
                            <p className="text-sm whitespace-pre-wrap text-neutral-700">{matter.begleitmail_text}</p>
                        </div>
                    </div>
                </details>
            )}

            {/* GwG-Panel — Anschreiben, Personalausweis-Upload, Risikoeinstufung */}
            {["GWG_ANSCHREIBEN_ERZEUGT", "GWG_ANSCHREIBEN_VERSANDT", "GWG_GEPRUEFT"].includes(matter.state) && (
                <div ref={gwgPanelRef} className="border border-teal-200 bg-teal-50/30 rounded-xl p-5 scroll-mt-4 space-y-5">
                    <h2 className="font-medium mb-1 flex items-center gap-2 text-sm">
                        <ShieldCheck className="w-4 h-4 text-teal-700" />
                        GwG-Prüfung (§§ 10 ff. GwG)
                    </h2>

                    {gwgMsg && (
                        <p className="text-sm text-teal-800 bg-teal-100 border border-teal-200 rounded-lg px-3 py-2">
                            {gwgMsg}
                        </p>
                    )}

                    {/* 1. Anschreiben-Entwurf */}
                    {gwgStatus?.gwg_mail_text && (
                        <div>
                            <div className="flex items-start justify-between gap-3 mb-2">
                                <h3 className="text-xs font-semibold text-neutral-600 flex items-center gap-1.5">
                                    <Mail className="w-3.5 h-3.5" /> GwG-Hinweisschreiben
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => void handleKopieren("gwg", gwgStatus.gwg_mail_betreff, gwgStatus.gwg_mail_text)}
                                    className="text-xs border border-teal-200 bg-white rounded-lg px-2.5 py-1 hover:bg-teal-50 flex items-center gap-1.5 text-teal-700 shrink-0"
                                >
                                    {kopiert === "gwg"
                                        ? <><CheckCircle2 className="w-3 h-3 text-green-600" /> Kopiert</>
                                        : <><Copy className="w-3 h-3" /> Kopieren</>}
                                </button>
                            </div>
                            <div className="bg-white rounded-lg border border-teal-100 p-4 space-y-2">
                                <p className="text-sm font-semibold">{gwgStatus.gwg_mail_betreff}</p>
                                <p className="text-sm whitespace-pre-wrap text-neutral-700">{gwgStatus.gwg_mail_text}</p>
                            </div>
                            {matter.state === "GWG_ANSCHREIBEN_ERZEUGT" && (
                                darf("gwg_versendet") ? (
                                    <button
                                        onClick={() => void handleMarkGwgVersendet()}
                                        disabled={gwgLoading}
                                        className="mt-2 bg-teal-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-teal-800 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {gwgLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                        <Send className="w-3.5 h-3.5" /> Als versendet markieren
                                    </button>
                                ) : (
                                    <p className="text-xs text-neutral-500 mt-2">{rollenHinweis("gwg_versendet")}</p>
                                )
                            )}
                        </div>
                    )}

                    {/* 2. Personalausweis-Upload */}
                    {["GWG_ANSCHREIBEN_VERSANDT", "GWG_GEPRUEFT"].includes(matter.state) && (
                        <div>
                            <h3 className="text-xs font-semibold text-neutral-600 mb-2 flex items-center gap-1.5">
                                <IdCard className="w-3.5 h-3.5" /> Personalausweis
                            </h3>
                            {gwgStatus?.personalausweis && !paVorschlag && (
                                <p className="text-xs text-neutral-500 mb-2">
                                    Zuletzt hochgeladen: {gwgStatus.personalausweis.filename} ({new Date(gwgStatus.personalausweis.created_at).toLocaleDateString("de-DE")})
                                </p>
                            )}
                            {!paVorschlag && (
                                <label className="inline-flex items-center gap-2 border border-teal-300 bg-white rounded-lg px-3 py-1.5 text-sm text-teal-700 hover:bg-teal-50 cursor-pointer">
                                    <Upload className="w-3.5 h-3.5" />
                                    Ausweisbild hochladen (JPEG/PNG)
                                    <input
                                        type="file"
                                        accept="image/jpeg,image/png,image/tiff,image/webp"
                                        className="hidden"
                                        onChange={(e) => {
                                            const f = e.target.files?.[0];
                                            if (f) void handleUploadPersonalausweis(f);
                                            e.target.value = "";
                                        }}
                                    />
                                </label>
                            )}

                            {paVorschlag && (
                                <div className="bg-white rounded-lg border border-teal-100 p-4 space-y-3 mt-2">
                                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        Bitte die ausgelesenen Daten prüfen und bei Bedarf korrigieren, bevor sie übernommen werden.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        {(
                                            [
                                                ["vorname", "Vorname"], ["nachname", "Nachname"],
                                                ["geburtsdatum", "Geburtsdatum (JJJJ-MM-TT)"], ["land_code", "Land (ISO, z.B. DE)"],
                                                ["strasse", "Straße"], ["hausnummer", "Hausnummer"],
                                                ["plz", "PLZ"], ["ort", "Ort"],
                                            ] as const
                                        ).map(([key, label]) => (
                                            <div key={key}>
                                                <label className="block text-[10px] text-neutral-400 mb-0.5">{label}</label>
                                                <input
                                                    type="text"
                                                    value={paVorschlag[key]}
                                                    onChange={(e) => setPaVorschlag({ ...paVorschlag, [key]: e.target.value })}
                                                    className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm"
                                                />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => void handleUebernehmePersonalausweis()}
                                            disabled={gwgLoading}
                                            className="bg-teal-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-teal-800 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {gwgLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                            Übernehmen
                                        </button>
                                        <button
                                            onClick={() => setPaVorschlag(null)}
                                            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-50"
                                        >
                                            Verwerfen
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 3. Kurzfragebogen + Risikoeinstufung */}
                    {["GWG_ANSCHREIBEN_VERSANDT", "GWG_GEPRUEFT"].includes(matter.state) && (
                        <div>
                            <h3 className="text-xs font-semibold text-neutral-600 mb-2">Risikoeinstufung</h3>
                            <div className="bg-white rounded-lg border border-teal-100 p-4 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-[10px] text-neutral-400 mb-0.5">
                                            Politisch exponierte Person (PEP)?
                                        </label>
                                        <select
                                            value={pep}
                                            onChange={(e) => setPep(e.target.value as typeof pep)}
                                            className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                                        >
                                            <option value="">Unbekannt</option>
                                            <option value="nein">Nein</option>
                                            <option value="ja">Ja</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-neutral-400 mb-0.5">
                                            Wirtschaftlich Berechtigter = Mandant?
                                        </label>
                                        <select
                                            value={wbIdentisch}
                                            onChange={(e) => setWbIdentisch(e.target.value as typeof wbIdentisch)}
                                            className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                                        >
                                            <option value="">Unbekannt</option>
                                            <option value="ja">Ja</option>
                                            <option value="nein">Nein</option>
                                        </select>
                                    </div>
                                    <div className="col-span-2">
                                        <label className="block text-[10px] text-neutral-400 mb-0.5">
                                            Land der Vermögenswerte/Transaktion (falls abweichend, ISO-Code)
                                        </label>
                                        <input
                                            type="text"
                                            value={transaktionsland}
                                            onChange={(e) => setTransaktionsland(e.target.value)}
                                            placeholder="z.B. DE"
                                            className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm"
                                        />
                                    </div>
                                </div>
                                <button
                                    onClick={() => void handleRunGwgPruefung()}
                                    disabled={gwgLoading}
                                    className="bg-teal-700 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-teal-800 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {gwgLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                    Risikoeinstufung durchführen
                                </button>

                                {gwgStatus?.pruefung && (
                                    <div className="border-t border-neutral-100 pt-3 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <GwgRisikoBadge risikoklasse={gwgStatus.pruefung.risikoklasse} />
                                            {gwgStatus.pruefung.bestaetigt_at && (
                                                <span className="text-xs text-neutral-400">
                                                    bestätigt am {new Date(gwgStatus.pruefung.bestaetigt_at).toLocaleDateString("de-DE")}
                                                </span>
                                            )}
                                        </div>
                                        {gwgStatus.pruefung.ausgeloeste_faktoren.length > 0 && (
                                            <ul className="text-xs text-neutral-600 list-disc list-inside space-y-0.5">
                                                {gwgStatus.pruefung.ausgeloeste_faktoren.map((f, i) => (
                                                    <li key={i}>{f.faktor} <span className="text-neutral-400">({f.rechtsgrundlage})</span></li>
                                                ))}
                                            </ul>
                                        )}
                                        {gwgStatus.pruefung.dokumentationsluecken.length > 0 && (
                                            <ul className="text-xs text-amber-700 list-disc list-inside space-y-0.5">
                                                {gwgStatus.pruefung.dokumentationsluecken.map((l, i) => (
                                                    <li key={i}>{l}</li>
                                                ))}
                                            </ul>
                                        )}
                                        <p className="text-xs text-neutral-500">{gwgStatus.pruefung.hinweis}</p>

                                        {matter.state === "GWG_ANSCHREIBEN_VERSANDT" && !gwgStatus.pruefung.bestaetigt_at && (
                                            darf("gwg_bestaetigen") ? (
                                                <button
                                                    onClick={() => void handleConfirmGwgPruefung()}
                                                    disabled={gwgLoading}
                                                    className="border border-teal-400 bg-white text-teal-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-teal-50 disabled:opacity-50 flex items-center gap-2"
                                                >
                                                    {gwgLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                                    <CheckCircle2 className="w-3.5 h-3.5" /> Einstufung bestätigen (Anwalt)
                                                </button>
                                            ) : (
                                                <p className="text-xs text-neutral-500">
                                                    {rollenHinweis("gwg_bestaetigen")} Die Bewertungshoheit liegt nach § 10 Abs. 2 GwG beim Anwalt.
                                                </p>
                                            )
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Mandant */}
            {intake ? (
                <div className="border border-neutral-200 rounded-xl p-5">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-medium text-sm text-neutral-700">Mandant</h2>
                        <button
                            onClick={() => router.push(`/mandate/${id}/aufnahme`)}
                            className="text-xs text-neutral-500 hover:text-neutral-800 flex items-center gap-1"
                        >
                            Bearbeiten <ChevronRight className="w-3 h-3" />
                        </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                        <div>
                            <span className="text-neutral-400 text-xs">Name</span>
                            <p className="font-semibold">
                                {[intake.anrede, intake.vorname, intake.nachname].filter(Boolean).join(" ")}
                            </p>
                        </div>
                        {intake.email && (
                            <div>
                                <span className="text-neutral-400 text-xs">E-Mail</span>
                                <p>{intake.email}</p>
                            </div>
                        )}
                        {intake.telefon && (
                            <div>
                                <span className="text-neutral-400 text-xs">Telefon</span>
                                <p>{intake.telefon}</p>
                            </div>
                        )}
                        {intake.ort && (
                            <div>
                                <span className="text-neutral-400 text-xs">Ort</span>
                                <p>{intake.plz} {intake.ort}</p>
                            </div>
                        )}
                        {intake.beratungskurzbeschreibung && (
                            <div className="col-span-2">
                                <span className="text-neutral-400 text-xs">Sachverhalt</span>
                                <p className="mt-0.5 text-sm">{intake.beratungskurzbeschreibung}</p>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="border border-dashed border-neutral-300 rounded-xl p-5 flex items-center justify-between">
                    <div>
                        <p className="font-medium text-sm">Aufnahmebogen fehlt noch</p>
                        <p className="text-xs text-neutral-500 mt-0.5">Mandantendaten noch nicht erfasst</p>
                    </div>
                    <button
                        onClick={() => router.push(`/mandate/${id}/aufnahme`)}
                        className="bg-neutral-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-neutral-700"
                    >
                        Jetzt ausfüllen
                    </button>
                </div>
            )}

            {/* Onboarding-Panel */}
            {showOnboarding && (
                <div ref={onboardingPanelRef} className="border border-blue-200 bg-blue-50/30 rounded-xl p-5 scroll-mt-4">
                    <h2 className="font-medium mb-1 flex items-center gap-2 text-sm">
                        <FileCheck className="w-4 h-4 text-blue-600" />
                        Onboarding-Dokumente
                    </h2>
                    <p className="text-xs text-neutral-500 mb-4">
                        Anschreiben, Mandatsvereinbarung mit Honorarvereinbarung (§ 3a RVG), Vollmacht (§ 80 ZPO)
                        und Widerrufsbelehrung (§ 312d BGB).
                    </p>

                    {["AUFNAHME_ERFASST", "ONBOARDING_ERZEUGT"].includes(matter.state) && !showOnboardingForm && darf("onboarding_erzeugen") && (
                        <button
                            onClick={openOnboardingForm}
                            disabled={onboardingLoading || !intake}
                            title={!intake ? "Aufnahmebogen zuerst ausfüllen" : undefined}
                            className={
                                matter.state === "ONBOARDING_ERZEUGT"
                                    ? "border border-blue-300 bg-white text-blue-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2 mb-3"
                                    : "bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                            }
                        >
                            {matter.state === "ONBOARDING_ERZEUGT" ? "Dokumente neu erzeugen" : "Dokumente erzeugen"}
                        </button>
                    )}

                    {["AUFNAHME_ERFASST", "ONBOARDING_ERZEUGT"].includes(matter.state) && showOnboardingForm && (
                        <form onSubmit={(e) => void handleGenerateOnboarding(e)} className="bg-white rounded-lg border border-blue-200 p-4 space-y-4">
                            {matter.state === "ONBOARDING_ERZEUGT" && (
                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                    Die bereits erzeugten Dokumente werden durch die neu erzeugten ersetzt. Eine
                                    ggf. bereits erteilte Freigabe wird zurückgesetzt.
                                </p>
                            )}
                            <div>
                                <label className="block text-xs font-semibold mb-1.5">
                                    Sachbearbeiter <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={sachbearbeiter}
                                    onChange={(e) => setSachbearbeiter(e.target.value)}
                                    placeholder="Name des Ansprechpartners für diese Akte"
                                    className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm"
                                />
                                <p className="text-[10px] text-neutral-400 mt-1">
                                    Erscheint im Briefkopf der Mandatsvereinbarung als Ansprechpartner.
                                </p>
                            </div>
                            {/* Unternehmensmandat — entscheidet über die
                                Widerrufsbelehrung (§§ 13, 14, 312 ff. BGB). */}
                            <div>
                                <label className="flex items-start gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={unternehmensmandat}
                                        onChange={(e) => setUnternehmensmandat(e.target.checked)}
                                        className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 accent-neutral-900"
                                    />
                                    <span>
                                        <span className="block text-xs font-semibold">Unternehmensmandat</span>
                                        <span className="block text-[10px] text-neutral-400 mt-0.5">
                                            Mandant handelt als Unternehmer (§ 14 BGB) — kein Widerrufsrecht,
                                            daher keine Widerrufsbelehrung im Paket. Die Angabe wird auf der
                                            Akte gespeichert.
                                        </span>
                                    </span>
                                </label>
                            </div>
                            {/* Pauschalvereinbarung — der zugehoerige Absatz
                                steht nur dann in der Honorarvereinbarung, wenn
                                hier ein Haken gesetzt ist. */}
                            <div>
                                <label className="flex items-start gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={pauschale}
                                        onChange={(e) => setPauschale(e.target.checked)}
                                        className="mt-0.5 h-3.5 w-3.5 rounded border-neutral-300 accent-neutral-900"
                                    />
                                    <span>
                                        <span className="block text-xs font-semibold">Pauschale vereinbart</span>
                                        <span className="block text-[10px] text-neutral-400 mt-0.5">
                                            Ohne Haken entfaellt der Absatz zur Pauschale in der
                                            Honorarvereinbarung vollstaendig.
                                        </span>
                                    </span>
                                </label>
                                {pauschale && (
                                    <div className="mt-2 ml-5 space-y-2">
                                        <div>
                                            <label className="block text-[10px] font-semibold mb-1 text-neutral-600">
                                                Wofuer gilt die Pauschale? <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={pauschaleZweck}
                                                onChange={(e) => setPauschaleZweck(e.target.value)}
                                                placeholder="z.B. laufende steuerliche Beratung"
                                                className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm"
                                            />
                                            <p className="text-[10px] text-neutral-400 mt-0.5">
                                                Steht im Satz: „Fuer die … vereinbaren wir eine Pauschale".
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold mb-1 text-neutral-600">
                                                Betrag <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="text"
                                                value={pauschaleBetrag}
                                                onChange={(e) => setPauschaleBetrag(e.target.value)}
                                                placeholder="z.B. 1.500,00 oder 500,00 monatlich"
                                                className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm"
                                            />
                                            <p className="text-[10px] text-neutral-400 mt-0.5">
                                                Wird als „in Hoehe von EUR …" eingesetzt.
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold mb-1 text-neutral-600">
                                                Faelligkeit <span className="text-red-500">*</span>
                                            </label>
                                            <select
                                                value={pauschaleTurnus}
                                                onChange={(e) => setPauschaleTurnus(e.target.value as PauschaleTurnus)}
                                                className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                                            >
                                                {PAUSCHALE_TURNUS_OPTIONEN.map((o) => (
                                                    <option key={o.value} value={o.value}>{o.label}</option>
                                                ))}
                                            </select>
                                            <p className="text-[10px] text-neutral-400 mt-0.5">
                                                Beugt den Vertragssatz („eine jaehrliche Pauschale") und
                                                steuert die Abrechnungsklausel.
                                            </p>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-semibold mb-1 text-neutral-600">
                                                Was ist umfasst? (optional)
                                            </label>
                                            <input
                                                type="text"
                                                value={pauschaleUmfang}
                                                onChange={(e) => setPauschaleUmfang(e.target.value)}
                                                placeholder="z.B. Jahresabschluss und laufende Buchhaltung"
                                                className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm"
                                            />
                                            <p className="text-[10px] text-neutral-400 mt-0.5">
                                                Steht im Satz: „Von dieser Pauschale ist … umfasst".
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            <div>
                                <label className="block text-xs font-semibold mb-1.5">
                                    Worum geht es bei diesem Mandat?
                                </label>
                                <div className="space-y-1.5">
                                    {(
                                        [
                                            { value: "rechtlich", label: "Nur rechtliche Beratung (Regelfall)" },
                                            { value: "steuerlich", label: "Nur steuerliche Beratung" },
                                            { value: "beides", label: "Rechtliche und steuerliche Beratung" },
                                            { value: "pro_real", label: "ProReal-Mandat (immer reines RVG-Mandat)" },
                                        ] as const
                                    ).map((opt) => (
                                        <label key={opt.value} className="flex items-center gap-2 text-sm cursor-pointer">
                                            <input
                                                type="radio"
                                                name="beratungsart"
                                                checked={beratungsart === opt.value}
                                                onChange={() => {
                                                    setBeratungsart(opt.value);
                                                    if (opt.value === "pro_real") setHonorarmodell("rvg");
                                                }}
                                            />
                                            {opt.label}
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-semibold mb-1.5">
                                    Honorarmodell
                                </label>
                                <div className="space-y-1.5">
                                    {(
                                        [
                                            { value: "stundensatz", label: "Stundensatzvereinbarung (§ 3a RVG)" },
                                            { value: "rvg", label: "Reines RVG-Mandat (gesetzliche Gebühren)" },
                                        ] as const
                                    ).map((opt) => (
                                        <label
                                            key={opt.value}
                                            className={`flex items-center gap-2 text-sm ${
                                                beratungsart === "pro_real" ? "cursor-not-allowed text-neutral-400" : "cursor-pointer"
                                            }`}
                                        >
                                            <input
                                                type="radio"
                                                name="honorarmodell"
                                                checked={honorarmodell === opt.value}
                                                disabled={beratungsart === "pro_real"}
                                                onChange={() => setHonorarmodell(opt.value)}
                                            />
                                            {opt.label}
                                        </label>
                                    ))}
                                </div>
                                {beratungsart === "pro_real" && (
                                    <p className="text-[10px] text-neutral-400 mt-1">
                                        ProReal-Mandate laufen immer als reines RVG-Mandat.
                                    </p>
                                )}
                                {honorarmodell === "rvg" && (
                                    <p className="text-[10px] text-amber-600 mt-1">
                                        Hinweis: Die Honorarvereinbarung wird aus derselben Vorlage erzeugt und muss vor Versand manuell auf gesetzliche RVG-Gebühren angepasst werden.
                                    </p>
                                )}
                            </div>

                            {honorarmodell === "stundensatz" && (
                            <div>
                                <label className="block text-xs font-semibold mb-1.5">
                                    Stundensätze (netto) — Regelsätze sind vorausgefüllt, bei Bedarf anpassen
                                </label>
                                <div className="grid grid-cols-3 gap-2">
                                    <div>
                                        <label className="block text-[10px] text-neutral-400 mb-0.5">
                                            Partner / Assoziierte Partner
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={stundensatzPartner}
                                                onChange={(e) => setStundensatzPartner(e.target.value)}
                                                className="w-full border border-neutral-300 rounded-lg pl-2 pr-8 py-1.5 text-sm"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">€</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-neutral-400 mb-0.5">
                                            Angestellte Anwälte
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={stundensatzAnwalt}
                                                onChange={(e) => setStundensatzAnwalt(e.target.value)}
                                                className="w-full border border-neutral-300 rounded-lg pl-2 pr-8 py-1.5 text-sm"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">€</span>
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] text-neutral-400 mb-0.5">
                                            Qualifizierte Fachmitarbeiter
                                        </label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                value={stundensatzFachmitarbeiter}
                                                onChange={(e) => setStundensatzFachmitarbeiter(e.target.value)}
                                                className="w-full border border-neutral-300 rounded-lg pl-2 pr-8 py-1.5 text-sm"
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">€</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            )}

                            <div className="flex gap-2">
                                <button
                                    type="submit"
                                    disabled={onboardingLoading}
                                    className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {onboardingLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                    {matter.state === "ONBOARDING_ERZEUGT" ? "Dokumente neu erzeugen" : "Dokumente erzeugen"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowOnboardingForm(false)}
                                    className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-50"
                                >
                                    Abbrechen
                                </button>
                            </div>
                        </form>
                    )}

                    {matter.state === "ONBOARDING_ERZEUGT" && (
                        <div className="mb-3">
                            <p className="text-xs font-semibold text-neutral-600 mb-1.5">
                                Vor der Freigabe prüfen:
                            </p>
                            {latestPerDocType(docs.filter((d) => d.doc_type.startsWith("ONBOARDING_"))).length === 0 ? (
                                <p className="text-xs text-neutral-400">Lade Dokumente…</p>
                            ) : (
                                <div className="space-y-1">
                                    {latestPerDocType(docs.filter((d) => d.doc_type.startsWith("ONBOARDING_")))
                                        .map((d) => (
                                            <div key={d.id} className="flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => void openMatterDocument(id, d).catch((e) => setError(e instanceof Error ? e.message : "Fehler beim Öffnen"))}
                                                    className="flex items-center gap-1.5 text-sm text-blue-700 hover:underline"
                                                >
                                                    <FileCheck className="w-3.5 h-3.5 shrink-0" />
                                                    {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                                                </button>
                                                {d.download_docx_url && (
                                                    <button
                                                        type="button"
                                                        onClick={() => void downloadMatterDocumentDocx(id, d).catch((e) => setError(e instanceof Error ? e.message : "Fehler beim Herunterladen"))}
                                                        className="text-xs text-neutral-500 hover:underline"
                                                        title="Als bearbeitbares Word-Dokument herunterladen"
                                                    >
                                                        Word
                                                    </button>
                                                )}
                                            </div>
                                        ))}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2 mt-2">
                        {matter.state === "ONBOARDING_ERZEUGT" && (
                            darf("onboarding_freigeben") ? (
                                <>
                                    <button
                                        onClick={() => void handleApproveOnboarding()}
                                        disabled={onboardingLoading}
                                        className="border border-blue-300 bg-white text-blue-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-50 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {onboardingLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                        <CheckCircle2 className="w-3.5 h-3.5" /> Freigeben
                                    </button>
                                    <button
                                        onClick={() => void handleSendOnboarding()}
                                        disabled={onboardingLoading}
                                        className="bg-blue-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {onboardingLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                        <Send className="w-3.5 h-3.5" /> Herunterladen und an Mandanten versenden
                                    </button>
                                </>
                            ) : (
                                <p className="text-xs text-neutral-500">{rollenHinweis("onboarding_freigeben")}</p>
                            )
                        )}
                    </div>
                </div>
            )}

            {/* Weitere Aktionen (nicht durch Panels abgedeckt) */}
            {genericTransitions.length > 0 &&
                !["NEU", "ONBOARDING_VERSANDT", "RUECKLAUF_BESTAETIGT",
                    "ANSPRUCH_ENTWURF", "ANSPRUCH_FREIGEGEBEN", "KLAGE_ENTWURF", "KLAGE_GEPRUEFT"].includes(matter.state) && (
                <div className="border border-neutral-200 rounded-xl p-4">
                    <div className="flex flex-wrap gap-2">
                        {genericTransitions.map((s) => (
                            <button
                                key={s}
                                onClick={() => void handleTransition(s)}
                                disabled={transitioning}
                                className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-50 disabled:opacity-50 flex items-center gap-1.5"
                            >
                                {transitioning && <Loader2 className="w-3 h-3 animate-spin" />}
                                {AKTION_LABELS[s] ?? STATE_LABELS[s] ?? s}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* Fristen */}
            <div className="border border-neutral-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-sm flex items-center gap-2 text-neutral-700">
                        <Calendar className="w-4 h-4" /> Fristen
                    </h2>
                    <button
                        onClick={() => setShowFristForm((v) => !v)}
                        className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1 hover:bg-neutral-50 flex items-center gap-1 text-neutral-600"
                    >
                        {showFristForm ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                        {showFristForm ? "Abbrechen" : "Hinzufügen"}
                    </button>
                </div>

                {showFristForm && (
                    <form onSubmit={(e) => void handleAddFrist(e)} className="mb-4 bg-neutral-50 rounded-lg p-4 space-y-3 border border-neutral-200">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-xs font-medium mb-1">Art der Frist</label>
                                <select
                                    value={fristForm.typ}
                                    onChange={(e) => setFristForm((f) => ({ ...f, typ: e.target.value }))}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-white"
                                >
                                    {FRIST_TYPEN.map((t) => <option key={t}>{t}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Startdatum</label>
                                <input
                                    type="date"
                                    required
                                    value={fristForm.startdatum}
                                    onChange={(e) => setFristForm((f) => ({ ...f, startdatum: e.target.value }))}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Fristende <span className="text-red-500">*</span></label>
                                <input
                                    type="date"
                                    required
                                    value={fristForm.fristende}
                                    onChange={(e) => setFristForm((f) => ({ ...f, fristende: e.target.value }))}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Erinnerung</label>
                                <input
                                    type="date"
                                    value={fristForm.reminderdatum}
                                    onChange={(e) => setFristForm((f) => ({ ...f, reminderdatum: e.target.value }))}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">Notiz (optional)</label>
                            <input
                                type="text"
                                value={fristForm.notiz}
                                onChange={(e) => setFristForm((f) => ({ ...f, notiz: e.target.value }))}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={fristLoading}
                            className="bg-neutral-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {fristLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                            Frist speichern
                        </button>
                    </form>
                )}

                {matter.fristen.length === 0 && !showFristForm ? (
                    <p className="text-sm text-neutral-400">Noch keine Fristen eingetragen</p>
                ) : (
                    <div className="space-y-2">
                        {matter.fristen.map((f) => editFristId === f.id ? (
                            <form
                                key={f.id}
                                onSubmit={(e) => void handleSaveFrist(e)}
                                className="bg-neutral-50 rounded-lg p-4 space-y-3 border border-neutral-300"
                            >
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium mb-1">Art der Frist</label>
                                        <select
                                            value={editFrist.typ ?? ""}
                                            onChange={(e) => setEditFrist((v) => ({ ...v, typ: e.target.value }))}
                                            className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm bg-white"
                                        >
                                            {/* Beim Anspruchsversand automatisch angelegte Fristen tragen einen
                                                technischen Typ, der nicht in der Auswahlliste steht — als eigene
                                                Option anzeigen, damit er beim Speichern nicht verloren geht. */}
                                            {!FRIST_TYPEN.includes(f.typ) && <option value={f.typ}>{f.typ}</option>}
                                            {FRIST_TYPEN.map((t) => <option key={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium mb-1">Startdatum</label>
                                        <input
                                            type="date"
                                            required
                                            value={editFrist.startdatum ?? ""}
                                            onChange={(e) => setEditFrist((v) => ({ ...v, startdatum: e.target.value }))}
                                            className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium mb-1">Fristende <span className="text-red-500">*</span></label>
                                        <input
                                            type="date"
                                            required
                                            value={editFrist.fristende ?? ""}
                                            onChange={(e) => setEditFrist((v) => ({ ...v, fristende: e.target.value }))}
                                            className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium mb-1">Erinnerung</label>
                                        <input
                                            type="date"
                                            value={editFrist.reminderdatum ?? ""}
                                            onChange={(e) => setEditFrist((v) => ({ ...v, reminderdatum: e.target.value }))}
                                            className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium mb-1">Notiz</label>
                                    <input
                                        type="text"
                                        value={editFrist.notiz ?? ""}
                                        onChange={(e) => setEditFrist((v) => ({ ...v, notiz: e.target.value }))}
                                        className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm"
                                    />
                                </div>
                                <p className="text-[10px] text-neutral-500">
                                    Wird das Fristende oder die Erinnerung geändert, werden bereits versandte
                                    Benachrichtigungen zurückgesetzt und erneut verschickt. Jede Änderung wird protokolliert.
                                </p>
                                <div className="flex gap-2">
                                    <button
                                        type="submit"
                                        disabled={fristLoading}
                                        className="bg-neutral-900 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {fristLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                                        Speichern
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setEditFristId(null); setEditFrist({}); }}
                                        className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100"
                                    >
                                        Abbrechen
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div key={f.id} className="flex items-center justify-between text-sm gap-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <button
                                        onClick={() => void handleMarkFristDone(f.id)}
                                        disabled={f.erledigt}
                                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                                            f.erledigt ? "bg-green-500 border-green-500 text-white" : "border-neutral-300 hover:border-neutral-500"
                                        }`}
                                        title={f.erledigt ? "Erledigt" : "Als erledigt markieren"}
                                    >
                                        {f.erledigt && <CheckCircle2 className="w-2.5 h-2.5" />}
                                    </button>
                                    <span className={f.erledigt ? "line-through text-neutral-400 truncate" : "truncate"}>
                                        {f.typ}
                                        {f.notiz && <span className="text-neutral-400 ml-1 text-xs">· {f.notiz}</span>}
                                    </span>
                                    {(f.ablauf_benachrichtigt_at || f.reminder_gesendet_at) && !f.erledigt && (
                                        <span
                                            className="text-[10px] text-neutral-400 flex items-center gap-0.5 shrink-0"
                                            title={
                                                f.ablauf_benachrichtigt_at
                                                    ? `Ablauf-Benachrichtigung versandt am ${new Date(f.ablauf_benachrichtigt_at).toLocaleDateString("de-DE")}`
                                                    : `Erinnerung versandt am ${new Date(f.reminder_gesendet_at!).toLocaleDateString("de-DE")}`
                                            }
                                        >
                                            <BellRing className="w-3 h-3" />
                                            benachrichtigt
                                        </span>
                                    )}
                                </div>
                                <span className="flex items-center gap-2 flex-shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => beginEditFrist(f)}
                                        className="text-xs text-neutral-500 hover:text-neutral-800"
                                    >
                                        Bearbeiten
                                    </button>
                                    <span className={`font-mono text-xs ${
                                        !f.erledigt && new Date(f.fristende) < new Date() ? "text-red-600 font-semibold" :
                                        f.erledigt ? "text-neutral-400" : "text-neutral-600"
                                    }`}>
                                        {new Date(f.fristende).toLocaleDateString("de-DE")}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Dokumente */}
            {docs.length > 0 && (
                <div className="border border-neutral-200 rounded-xl p-5">
                    <h2 className="font-medium text-sm mb-3 flex items-center gap-2 text-neutral-700">
                        <Paperclip className="w-4 h-4" /> Dokumente
                    </h2>
                    <div className="space-y-1">
                        {docs.map((d) => (
                            <div
                                key={d.id}
                                className="w-full flex items-center justify-between text-sm py-1.5 border-b border-neutral-100 last:border-0 hover:bg-neutral-50 rounded px-1 -mx-1"
                            >
                                <button
                                    type="button"
                                    onClick={() => void openMatterDocument(id, d).catch((e) => setError(e instanceof Error ? e.message : "Fehler beim Öffnen"))}
                                    className="font-medium text-blue-700 hover:underline truncate text-left"
                                >
                                    {DOC_TYPE_LABELS[d.doc_type] ?? d.doc_type}
                                </button>
                                <span className="flex items-center gap-3 ml-4 flex-shrink-0">
                                    {d.download_docx_url && (
                                        <button
                                            type="button"
                                            onClick={() => void downloadMatterDocumentDocx(id, d).catch((e) => setError(e instanceof Error ? e.message : "Fehler beim Herunterladen"))}
                                            className="text-xs text-neutral-500 hover:underline"
                                            title="Als bearbeitbares Word-Dokument herunterladen"
                                        >
                                            Word
                                        </button>
                                    )}
                                    <span className="text-neutral-400 text-xs">
                                        {new Date(d.created_at).toLocaleDateString("de-DE")}
                                    </span>
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Verlauf (eingeklappt / weniger prominent) */}
            {matter.transitions.length > 0 && (
                <details className="border border-neutral-100 rounded-xl">
                    <summary className="px-5 py-3 text-sm font-medium text-neutral-500 cursor-pointer hover:text-neutral-700 flex items-center gap-2 list-none">
                        <FileText className="w-4 h-4" /> Verlauf ({matter.transitions.length})
                    </summary>
                    <div className="px-5 pb-4 space-y-2">
                        {[...matter.transitions].reverse().map((t, i) => (
                            <div key={i} className="flex items-start gap-3 text-sm">
                                <span className="text-neutral-400 font-mono text-xs mt-0.5 shrink-0">
                                    {new Date(t.created_at).toLocaleDateString("de-DE")}
                                </span>
                                <span className="text-neutral-600">
                                    <span className="font-medium">{STATE_LABELS[t.from_state] ?? t.from_state}</span>
                                    {" → "}
                                    <span className="font-medium">{STATE_LABELS[t.to_state] ?? t.to_state}</span>
                                    {t.description && <span className="text-neutral-400"> · {t.description}</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                </details>
            )}
        </div>
    );
}
