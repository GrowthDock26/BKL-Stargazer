"use client";

/**
 * PRE9/PRE10 — Arbeitsliste der Interessentenvorgänge (Lastenheft WF-001 ff.).
 *
 * Zeigt, was heute zu tun ist. Bei über 100 Vorgängen ist das die eigentliche
 * Leistung: nicht die Automatisierung einzelner Schritte, sondern dass keiner
 * durchrutscht. Deshalb stehen fällige Wiedervorlagen oben und die
 * Handlungsanweisung im Klartext in der Zeile.
 *
 * Der Ablauf selbst liegt im Backend (lib/interessent/workflow.ts); diese Seite
 * rendert nur die Schaltflächen, die der Server als zulässig meldet.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    AlertCircle, ArrowLeft, Loader2, Plus, Users, CircleAlert, Clock, Check, Download,
} from "lucide-react";
import {
    listOrgs, listInteressenten, createInteressent, interessentAktion,
    ladeInteressentenUnterlagen, ladeBegleittext, INTERESSENT_STATUS_LABEL, PRE_KAMPAGNEN,
} from "@/app/lib/mandateApi";
import type { Interessent, InteressentenListe, InteressentStatus, Org, PreKampagne } from "@/app/lib/mandateApi";



/** Reihenfolge der Kopfzeile — folgt dem Ablauf, nicht dem Alphabet. */
const STATUS_REIHENFOLGE: InteressentStatus[] = [
    "INTERESSENT",
    "TELEFONTERMIN",
    "UNTERLAGEN_VERSENDET",
    "NACHFORDERUNG",
    "UNTERLAGEN_VOLLSTAENDIG",
    "AKTE_ANGELEGT",
    "KEIN_INTERESSE",
];

function formatDE(iso: string | null): string {
    if (!iso) return "—";
    const [j, m, t] = iso.split("-");
    return `${t}.${m}.${j}`;
}

export default function InteressentenPage() {
    const router = useRouter();
    const [org, setOrg] = useState<Org | null>(null);
    const [daten, setDaten] = useState<InteressentenListe | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hinweis, setHinweis] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<string | null>(null);
    // Begleittext zum Kopieren — steht als Vorlage in der Kanzlei, nicht im Programm.
    const [textFuer, setTextFuer] = useState<{ name: string; text: string } | null>(null);

    // Filter
    const [kampagne, setKampagne] = useState<string>("");
    const [nurFaellig, setNurFaellig] = useState(false);
    const [mitErledigten, setMitErledigten] = useState(false);

    // Neuer Vorgang
    const [showForm, setShowForm] = useState(false);
    const [formLoading, setFormLoading] = useState(false);
    const [neuNachname, setNeuNachname] = useState("");
    const [neuVorname, setNeuVorname] = useState("");
    const [neuKampagne, setNeuKampagne] = useState<PreKampagne>("UNBEKANNT");
    const [neuEmail, setNeuEmail] = useState("");
    const [neuTelefon, setNeuTelefon] = useState("");
    const [neuStrasse, setNeuStrasse] = useState("");
    const [neuHausnummer, setNeuHausnummer] = useState("");
    const [neuPlz, setNeuPlz] = useState("");
    const [neuOrt, setNeuOrt] = useState("");
    const [neuVermittler, setNeuVermittler] = useState("");
    const [neuRsv, setNeuRsv] = useState(false);

    const laden = useCallback(
        async (aktuelleOrg: Org) => {
            try {
                const d = await listInteressenten(aktuelleOrg.id, {
                    kampagne: kampagne || undefined,
                    nurFaellig,
                    mitErledigten,
                });
                setDaten(d);
                setError(null);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Fehler beim Laden");
            } finally {
                setLoading(false);
            }
        },
        [kampagne, nurFaellig, mitErledigten],
    );

    useEffect(() => {
        void (async () => {
            try {
                const orgs = await listOrgs();
                if (orgs.length === 0) {
                    setLoading(false);
                    return;
                }
                setOrg(orgs[0]);
                await laden(orgs[0]);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Fehler beim Laden");
                setLoading(false);
            }
        })();
        // Beim Filterwechsel neu laden — org wird dabei nicht erneut geholt.
    }, [laden]);

    async function handleAktion(v: Interessent, aktion: string) {
        if (!org) return;
        setBusyId(v.id);
        setError(null);
        setHinweis(null);
        try {
            const ergebnis = await interessentAktion(v.id, aktion);
            // Der Hinweis an den Finanzvertrieb ist in Phase 1 Handarbeit — das
            // System hat keinen Mailausgang und kennt den Empfänger nicht.
            setHinweis(
                ergebnis.vertrieb_informieren
                    ? `${ergebnis.beschreibung}. Bitte zusätzlich den Finanzvertrieb informieren` +
                      `${v.vermittler ? ` (${v.vermittler})` : ""}.`
                    : ergebnis.beschreibung,
            );
            await laden(org);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Aktion fehlgeschlagen");
        } finally {
            setBusyId(null);
        }
    }

    async function handleUnterlagen(v: Interessent) {
        setBusyId(v.id);
        setError(null);
        setHinweis(null);
        try {
            const warnung = await ladeInteressentenUnterlagen(v.id);
            setHinweis(
                warnung
                    ? `Unterlagen heruntergeladen — aber unvollständig: ${warnung}`
                    : "Unterlagen heruntergeladen. Bitte der E-Mail an den Interessenten anhängen.",
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Unterlagen konnten nicht erzeugt werden");
        } finally {
            setBusyId(null);
        }
    }

    async function handleBegleittext(v: Interessent) {
        setBusyId(v.id);
        setError(null);
        try {
            const { text } = await ladeBegleittext(v.id);
            if (!text) {
                setError("Für diese Kampagne ist kein Begleittext als Vorlage hinterlegt.");
                return;
            }
            setTextFuer({ name: [v.vorname, v.nachname].filter(Boolean).join(" "), text });
        } catch (e) {
            setError(e instanceof Error ? e.message : "Begleittext konnte nicht geladen werden");
        } finally {
            setBusyId(null);
        }
    }

    async function handleAnlegen(e: React.FormEvent) {
        e.preventDefault();
        if (!org || !neuNachname.trim()) return;
        setFormLoading(true);
        setError(null);
        try {
            await createInteressent({
                org_id: org.id,
                nachname: neuNachname.trim(),
                vorname: neuVorname.trim() || undefined,
                kampagne: neuKampagne,
                email: neuEmail.trim() || undefined,
                telefon: neuTelefon.trim() || undefined,
                strasse: neuStrasse.trim() || undefined,
                hausnummer: neuHausnummer.trim() || undefined,
                plz: neuPlz.trim() || undefined,
                ort: neuOrt.trim() || undefined,
                vermittler: neuVermittler.trim() || undefined,
                rsv_vorhanden: neuRsv,
            });
            setShowForm(false);
            setNeuNachname("");
            setNeuVorname("");
            setNeuEmail("");
            setNeuTelefon("");
            setNeuStrasse("");
            setNeuHausnummer("");
            setNeuPlz("");
            setNeuOrt("");
            setNeuVermittler("");
            setNeuRsv(false);
            await laden(org);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Anlegen");
        } finally {
            setFormLoading(false);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
        );
    }

    const faellig = (daten?.interessenten ?? []).filter((v) => v.handlungsbedarf).length;

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
            <button
                onClick={() => router.push("/mandate")}
                className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-6"
            >
                <ArrowLeft className="w-4 h-4" /> Zurück zu den Mandaten
            </button>

            <div className="flex items-start justify-between gap-4 mb-6">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <Users className="w-6 h-6 text-neutral-500" />
                        PRE-Kampagne
                    </h1>
                    <p className="text-sm text-neutral-500 mt-0.5">
                        Interessentenvorgänge vor der Aktenanlage
                        {faellig > 0 && (
                            <span className="text-red-600 font-medium">
                                {" "}· {faellig} {faellig === 1 ? "Vorgang" : "Vorgänge"} zu bearbeiten
                            </span>
                        )}
                    </p>
                </div>
                <button
                    onClick={() => setShowForm((v) => !v)}
                    className="bg-neutral-900 text-white rounded-lg px-3 py-2 text-sm font-medium hover:bg-neutral-700 flex items-center gap-2 shrink-0"
                >
                    <Plus className="w-4 h-4" /> Neuer Vorgang
                </button>
            </div>

            {error && (
                <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    {error}
                </div>
            )}
            {hinweis && (
                <div className="flex items-start gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4 text-sm">
                    <Check className="w-4 h-4 shrink-0 mt-0.5" />
                    {hinweis}
                </div>
            )}

            {textFuer && (
                <div className="border border-neutral-300 rounded-xl p-4 mb-4 bg-white">
                    <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                            <p className="text-sm font-semibold">Begleittext für die E-Mail</p>
                            <p className="text-xs text-neutral-500">
                                an {textFuer.name || "den Interessenten"} — Wortlaut aus der hinterlegten Vorlage
                            </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={() => void navigator.clipboard.writeText(textFuer.text)}
                                className="text-xs border border-neutral-300 rounded-lg px-2.5 py-1.5 hover:bg-neutral-50"
                            >
                                Kopieren
                            </button>
                            <button
                                onClick={() => setTextFuer(null)}
                                className="text-xs text-neutral-500 hover:text-neutral-800 px-1"
                                aria-label="Schliessen"
                            >
                                Schliessen
                            </button>
                        </div>
                    </div>
                    <pre className="text-sm whitespace-pre-wrap text-neutral-700 bg-neutral-50 border border-neutral-200 rounded-lg p-3 max-h-72 overflow-y-auto font-sans">
{textFuer.text}
                    </pre>
                    <p className="text-[11px] text-neutral-400 mt-2">
                        Die Anrede steht so in der Vorlage („Sehr geehrte Frau /Sehr geehrter Herr") —
                        bitte vor dem Versand anpassen.
                    </p>
                </div>
            )}

            {showForm && (
                <form
                    onSubmit={(e) => void handleAnlegen(e)}
                    className="border border-neutral-200 rounded-xl p-5 mb-6 space-y-4 bg-neutral-50/50"
                >
                    <h2 className="text-base font-semibold">Neuen Interessenten aufnehmen</h2>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-medium mb-1">
                                Nachname <span className="text-red-500">*</span>
                            </label>
                            <input
                                required
                                value={neuNachname}
                                onChange={(e) => setNeuNachname(e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">Vorname</label>
                            <input
                                value={neuVorname}
                                onChange={(e) => setNeuVorname(e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">Kampagne</label>
                            <select
                                value={neuKampagne}
                                onChange={(e) => setNeuKampagne(e.target.value as PreKampagne)}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white"
                            >
                                {PRE_KAMPAGNEN.map((k) => (
                                    <option key={k.value} value={k.value}>{k.label}</option>
                                ))}
                            </select>
                            <p className="text-[11px] text-neutral-400 mt-1">
                                Bestimmt, welche Fragebögen und Vollmachten das Versandpaket enthält.
                                Bei „noch unbekannt" gehen vorsorglich beide Sätze raus. Später
                                änderbar, falls sich erst im Gespräch klärt.
                            </p>
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">E-Mail</label>
                            <input
                                type="email"
                                value={neuEmail}
                                onChange={(e) => setNeuEmail(e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">Telefon</label>
                            <input
                                value={neuTelefon}
                                onChange={(e) => setNeuTelefon(e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">Finanzvertrieb</label>
                            <input
                                value={neuVermittler}
                                onChange={(e) => setNeuVermittler(e.target.value)}
                                placeholder="Vermittler, über den der Kontakt kam"
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                            />
                        </div>
                    </div>

                    {/* Adresse — optional, soweit schon bekannt. Wird bei WF-001
                        gebraucht, um die Unterlagen direkt korrekt zu adressieren;
                        fehlt sie hier, bleiben die entsprechenden Zeilen im
                        Paket leer und werden von Hand ergänzt. */}
                    <div>
                        <p className="text-xs font-medium mb-2 text-neutral-600">
                            Adresse <span className="font-normal text-neutral-400">(optional, soweit bekannt)</span>
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium mb-1">Straße</label>
                                <input
                                    value={neuStrasse}
                                    onChange={(e) => setNeuStrasse(e.target.value)}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">Hausnummer</label>
                                <input
                                    value={neuHausnummer}
                                    onChange={(e) => setNeuHausnummer(e.target.value)}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium mb-1">PLZ</label>
                                <input
                                    value={neuPlz}
                                    onChange={(e) => setNeuPlz(e.target.value)}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-xs font-medium mb-1">Ort</label>
                                <input
                                    value={neuOrt}
                                    onChange={(e) => setNeuOrt(e.target.value)}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm"
                                />
                            </div>
                        </div>
                    </div>

                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                            type="checkbox"
                            checked={neuRsv}
                            onChange={(e) => setNeuRsv(e.target.checked)}
                            className="h-4 w-4 rounded border-neutral-300 accent-neutral-900"
                        />
                        Rechtsschutzversicherung vorhanden
                    </label>
                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={formLoading}
                            className="bg-neutral-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {formLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                            Anlegen
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowForm(false)}
                            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-50"
                        >
                            Abbrechen
                        </button>
                    </div>
                </form>
            )}

            {/* Bestand nach Status */}
            {daten && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {STATUS_REIHENFOLGE.filter((s) => (daten.statistik[s] ?? 0) > 0).map((s) => (
                        <span
                            key={s}
                            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1 text-neutral-600 bg-white"
                        >
                            {INTERESSENT_STATUS_LABEL[s]}{" "}
                            <span className="font-semibold text-neutral-900">{daten.statistik[s]}</span>
                        </span>
                    ))}
                </div>
            )}

            {/* Filter */}
            <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
                <select
                    value={kampagne}
                    onChange={(e) => setKampagne(e.target.value)}
                    className="border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                >
                    <option value="">Alle Kampagnen</option>
                    {PRE_KAMPAGNEN.map((k) => (
                        <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                </select>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={nurFaellig}
                        onChange={(e) => setNurFaellig(e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-300 accent-neutral-900"
                    />
                    Nur mit Handlungsbedarf
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={mitErledigten}
                        onChange={(e) => setMitErledigten(e.target.checked)}
                        className="h-4 w-4 rounded border-neutral-300 accent-neutral-900"
                    />
                    Abgeschlossene einblenden
                </label>
            </div>

            {!daten || daten.interessenten.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
                    <Users className="w-12 h-12 mb-4" />
                    <p className="text-base font-medium">Keine Vorgänge</p>
                    <p className="text-sm mt-1">
                        Legen Sie oben den ersten Interessenten an.
                    </p>
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-xl divide-y divide-neutral-100">
                    {daten.interessenten.map((v) => (
                        <VorgangZeile
                            key={v.id}
                            v={v}
                            busy={busyId === v.id}
                            onAktion={(a) => void handleAktion(v, a)}
                            onUnterlagen={() => void handleUnterlagen(v)}
                            onBegleittext={() => void handleBegleittext(v)}
                            onAkte={() => router.push("/mandate")}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

function VorgangZeile({
    v,
    busy,
    onAktion,
    onUnterlagen,
    onBegleittext,
    onAkte,
}: {
    v: Interessent;
    busy: boolean;
    onAktion: (aktion: string) => void;
    onUnterlagen: () => void;
    onBegleittext: () => void;
    onAkte: () => void;
}) {
    const ampel =
        v.faelligkeit === "ueberfaellig"
            ? { farbe: "bg-red-500", text: "text-red-600", label: `überfällig seit ${formatDE(v.wiedervorlage_am)}` }
            : v.faelligkeit === "heute"
              ? { farbe: "bg-amber-500", text: "text-amber-600", label: "heute fällig" }
              : v.faelligkeit === "offen"
                ? { farbe: "bg-neutral-300", text: "text-neutral-500", label: `Wiedervorlage ${formatDE(v.wiedervorlage_am)}` }
                : { farbe: "bg-neutral-200", text: "text-neutral-400", label: "keine Wiedervorlage" };

    return (
        <div className="px-4 py-3 hover:bg-neutral-50">
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${ampel.farbe}`} />
                        <span className="text-sm font-medium text-neutral-900 truncate">
                            {[v.vorname, v.nachname].filter(Boolean).join(" ")}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-neutral-400 border border-neutral-200 rounded px-1.5 py-0.5">
                            {PRE_KAMPAGNEN.find((k) => k.value === v.kampagne)?.kurz ?? v.kampagne}
                        </span>
                        <span className="text-xs text-neutral-500">
                            {INTERESSENT_STATUS_LABEL[v.status]}
                            {v.nachfass_stufe > 0 && ` · ${v.nachfass_stufe}. Nachfassung`}
                        </span>
                    </div>
                    <p className="text-xs text-neutral-600 mt-1 ml-4 flex items-center gap-1.5">
                        {v.handlungsbedarf ? (
                            <CircleAlert className="w-3.5 h-3.5 text-red-500 shrink-0" />
                        ) : (
                            <Clock className="w-3.5 h-3.5 text-neutral-300 shrink-0" />
                        )}
                        {v.naechste_aufgabe}
                    </p>
                    <p className={`text-[11px] mt-0.5 ml-4 ${ampel.text}`}>
                        {ampel.label}
                        {v.email ? ` · ${v.email}` : ""}
                        {v.rsv_vorhanden ? " · RSV" : ""}
                        {v.vertrieb_informiert_am ? ` · Vertrieb informiert ${formatDE(v.vertrieb_informiert_am)}` : ""}
                    </p>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-1.5 shrink-0 max-w-[45%]">
                    {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-400" />}
                    {/* Unterlagen bleiben abrufbar, solange der Vorgang laeuft —
                        beim Nachfassen wird dasselbe Paket noch einmal gebraucht. */}
                    {!["AKTE_ANGELEGT", "KEIN_INTERESSE"].includes(v.status) && (
                        <button
                            onClick={onUnterlagen}
                            disabled={busy}
                            className="text-xs border border-neutral-300 rounded-lg px-2.5 py-1.5 hover:bg-white disabled:opacity-50 text-neutral-700 flex items-center gap-1.5"
                            title="Anschreiben, Fragebogen, Vollmacht, Kostenaufklaerung und Widerrufsbelehrung als ZIP"
                        >
                            <Download className="w-3.5 h-3.5" />
                            Unterlagen
                        </button>
                    )}
                    {!["AKTE_ANGELEGT", "KEIN_INTERESSE"].includes(v.status) && (
                        <button
                            onClick={onBegleittext}
                            disabled={busy}
                            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-white disabled:opacity-50 text-neutral-600"
                            title="Wortlaut der Begleit-E-Mail anzeigen"
                        >
                            Begleittext
                        </button>
                    )}
                    {v.status === "UNTERLAGEN_VOLLSTAENDIG" && (
                        <button
                            onClick={onAkte}
                            className="text-xs bg-neutral-900 text-white rounded-lg px-2.5 py-1.5 hover:bg-neutral-700"
                            title="Akte über die Mandatsübersicht anlegen und anschließend verknüpfen"
                        >
                            Akte anlegen
                        </button>
                    )}
                    {v.moegliche_aktionen.map((a) => (
                        <button
                            key={a.aktion}
                            onClick={() => onAktion(a.aktion)}
                            disabled={busy}
                            className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1.5 hover:bg-white disabled:opacity-50 text-neutral-600"
                        >
                            {a.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}
