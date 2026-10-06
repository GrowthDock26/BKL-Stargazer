"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Loader2, AlertCircle, CheckCircle2, Send,
    Sparkles, AlertTriangle, Pencil, RotateCcw,
} from "lucide-react";
import {
    getMatter, getAnspruchDraft, generateAnspruch,
    updateAnspruchDraft, approveAnspruch, sendAnspruch,
} from "@/app/lib/mandateApi";
import type { MatterDetail, AnspruchDraft } from "@/app/lib/mandateApi";
import { StateBadge } from "@/app/components/mandate/StateBadge";

export default function AnspruchPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [matter, setMatter] = useState<MatterDetail | null>(null);
    const [draft, setDraft] = useState<AnspruchDraft | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [generating, setGenerating] = useState(false);
    const [saving, setSaving] = useState(false);
    const [approving, setApproving] = useState(false);
    const [sending, setSending] = useState(false);

    const [editText, setEditText] = useState("");
    const [isDirty, setIsDirty] = useState(false);
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Send form
    const [showSendForm, setShowSendForm] = useState(false);
    const [sendForm, setSendForm] = useState({
        empfaenger_email: "",
        empfaenger_name: "",
        fristende: (() => {
            const d = new Date();
            d.setDate(d.getDate() + 14);
            return d.toISOString().slice(0, 10);
        })(),
    });

    const load = useCallback(async () => {
        try {
            const [m, d] = await Promise.all([getMatter(id), getAnspruchDraft(id)]);
            setMatter(m);
            setDraft(d);
            if (d) setEditText(d.entwurf_text);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Laden");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    // Autosave on text change (debounced 1.5s)
    useEffect(() => {
        if (!isDirty || !draft) return;
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            setSaving(true);
            try {
                const updated = await updateAnspruchDraft(id, editText);
                setDraft(updated);
                setIsDirty(false);
            } catch { /* silent */ }
            setSaving(false);
        }, 1500);
        return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
    }, [editText, isDirty, draft, id]);

    async function handleGenerate() {
        setGenerating(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await generateAnspruch(id);
            setEditText(result.entwurf_text);
            setIsDirty(false);
            await load();
            setSuccess("Entwurf erzeugt. Bitte prüfen und ggf. anpassen.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setGenerating(false);
        }
    }

    async function handleApprove() {
        // Save pending edits first
        if (isDirty) {
            setSaving(true);
            try {
                await updateAnspruchDraft(id, editText);
                setIsDirty(false);
            } catch (e) {
                setError(e instanceof Error ? e.message : "Fehler beim Speichern");
                setSaving(false);
                return;
            }
            setSaving(false);
        }
        setApproving(true);
        setError(null);
        try {
            await approveAnspruch(id);
            setSuccess("Anspruchsschreiben freigegeben.");
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setApproving(false);
        }
    }

    async function handleSend(e: React.FormEvent) {
        e.preventDefault();
        setSending(true);
        setError(null);
        try {
            const result = await sendAnspruch(id, sendForm);
            // Die Reaktionsfrist wird beim Versand automatisch als überwachte
            // Frist angelegt. Schlägt das fehl, liefert das Backend
            // frist_angelegt: false plus einen Warnhinweis — der darf nicht
            // untergehen, sonst läuft die Frist unbemerkt.
            const fristTeil = result.frist_angelegt
                ? ` Reaktionsfrist bis ${new Date(result.fristende).toLocaleDateString("de-DE")} ist eingetragen und wird überwacht (Erinnerung ab ${new Date(result.reminderdatum).toLocaleDateString("de-DE")}).`
                : "";
            setSuccess(`Anspruchsschreiben versandt an ${result.empfaenger}.${fristTeil}`);
            if (result.hinweis) setError(result.hinweis);
            setShowSendForm(false);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setSending(false);
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

    const canGenerate = matter.state === "RUECKLAUF_BESTAETIGT";
    const canEdit = ["ANSPRUCH_ENTWURF", "ANSPRUCH_FREIGEGEBEN"].includes(matter.state);
    const canApprove = matter.state === "ANSPRUCH_ENTWURF" && !!draft;
    const canSend = matter.state === "ANSPRUCH_FREIGEGEBEN" && !!draft?.approved_by;
    // Nach erfolgreichem Versand wechselt die Akte direkt nach FRIST_LAEUFT
    // (die Reaktionsfrist wird dabei angelegt). ANSPRUCH_VERSANDT bleibt nur
    // stehen, wenn das Anlegen der Frist fehlgeschlagen ist — dann fehlt die
    // Fristüberwachung und darauf muss deutlich hingewiesen werden.
    const alreadySent = ["ANSPRUCH_VERSANDT", "FRIST_LAEUFT"].includes(matter.state);
    const fristFehlt = matter.state === "ANSPRUCH_VERSANDT";

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
            {/* Header */}
            <div>
                <button
                    onClick={() => router.push(`/mandate/${id}`)}
                    className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-4"
                >
                    <ArrowLeft className="w-4 h-4" /> Zurück zur Akte
                </button>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold">Anspruchsschreiben</h1>
                        <p className="text-sm text-neutral-500 mt-1">{matter.bezeichnung}</p>
                        {matter.aktenzeichen && (
                            <p className="text-xs text-neutral-400 font-mono">Az. {matter.aktenzeichen}</p>
                        )}
                    </div>
                    <StateBadge state={matter.state} />
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {success && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {success}
                </div>
            )}

            {/* KI-Hinweis */}
            <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                    <strong>KI-Hinweis (Art. 13 KI-VO):</strong> Dieser Entwurf wurde von einem KI-System
                    (LOGICC) erstellt. Das Schreiben muss vor Freigabe und Versand vollständig anwaltlich
                    geprüft werden. KI-generierte Rechtstexte sind als Entwurf zu betrachten.
                </p>
            </div>

            {/* Kein Entwurf — generieren */}
            {!draft && canGenerate && (
                <div className="border border-dashed border-neutral-300 rounded-xl p-8 text-center">
                    <Sparkles className="w-8 h-8 text-neutral-400 mx-auto mb-3" />
                    <p className="font-medium text-sm mb-1">Noch kein Entwurf vorhanden</p>
                    <p className="text-xs text-neutral-500 mb-4">
                        LOGICC (KI) erzeugt auf Basis des Sachverhalts einen anwaltlichen Erstenwurf.
                    </p>
                    <button
                        onClick={() => void handleGenerate()}
                        disabled={generating}
                        className="bg-neutral-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2 mx-auto"
                    >
                        {generating
                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird erzeugt…</>
                            : <><Sparkles className="w-4 h-4" /> Entwurf erzeugen</>
                        }
                    </button>
                </div>
            )}

            {/* Wartestate */}
            {!draft && !canGenerate && !alreadySent && (
                <div className="border border-neutral-200 rounded-xl p-6 text-center text-sm text-neutral-500">
                    <p>Anspruchsschreiben ist im Zustand <strong>{matter.state}</strong> nicht verfügbar.</p>
                    <p className="text-xs mt-1">Erforderlich: Rücklauf bestätigt (RUECKLAUF_BESTAETIGT)</p>
                </div>
            )}

            {/* Entwurf-Editor */}
            {(draft || alreadySent) && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 bg-neutral-50 border-b border-neutral-200">
                        <div className="flex items-center gap-2">
                            <Pencil className="w-4 h-4 text-neutral-500" />
                            <span className="text-sm font-medium">Entwurf</span>
                            {draft?.model_id && (
                                <span className="text-xs text-neutral-400">via {draft.model_id}</span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {saving && <span className="text-xs text-neutral-400 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Speichern…</span>}
                            {draft?.approved_by && (
                                <span className="text-xs text-green-700 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Freigegeben
                                </span>
                            )}
                            {canGenerate && draft && (
                                <button
                                    onClick={() => void handleGenerate()}
                                    disabled={generating}
                                    className="text-xs border border-neutral-200 rounded px-2 py-1 hover:bg-neutral-100 flex items-center gap-1"
                                    title="Neuen Entwurf erzeugen"
                                >
                                    <RotateCcw className="w-3 h-3" /> Neu
                                </button>
                            )}
                        </div>
                    </div>
                    <textarea
                        value={editText}
                        onChange={(e) => {
                            if (!canEdit) return;
                            setEditText(e.target.value);
                            setIsDirty(true);
                        }}
                        readOnly={!canEdit}
                        rows={20}
                        className={`w-full px-4 py-4 text-sm font-mono leading-relaxed focus:outline-none resize-none ${
                            canEdit ? "bg-white" : "bg-neutral-50 text-neutral-600"
                        }`}
                        placeholder="Entwurfstext wird hier angezeigt…"
                    />
                </div>
            )}

            {/* Aktionen */}
            {(canApprove || canSend) && (
                <div className="border border-neutral-200 rounded-xl p-5 space-y-4">
                    <h2 className="font-medium">Nächste Schritte</h2>

                    {canApprove && (
                        <div className="flex items-start gap-3">
                            <button
                                onClick={() => void handleApprove()}
                                disabled={approving}
                                className="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {approving && <Loader2 className="w-4 h-4 animate-spin" />}
                                <CheckCircle2 className="w-4 h-4" /> Anspruchsschreiben freigeben
                            </button>
                            <p className="text-xs text-neutral-500 mt-2">
                                Durch Freigabe bestätigen Sie, den Entwurf anwaltlich geprüft zu haben.
                            </p>
                        </div>
                    )}

                    {canSend && (
                        <>
                            {!showSendForm ? (
                                <button
                                    onClick={() => setShowSendForm(true)}
                                    className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 flex items-center gap-2"
                                >
                                    <Send className="w-4 h-4" /> Versenden…
                                </button>
                            ) : (
                                <form onSubmit={(e) => void handleSend(e)} className="bg-neutral-50 rounded-lg p-4 space-y-3 border border-neutral-200">
                                    <h3 className="text-sm font-medium">Empfänger</h3>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-medium mb-1">
                                                E-Mail <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="email"
                                                required
                                                value={sendForm.empfaenger_email}
                                                onChange={(e) => setSendForm((f) => ({ ...f, empfaenger_email: e.target.value }))}
                                                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                                placeholder="gegenseite@kanzlei.de"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium mb-1">Name</label>
                                            <input
                                                type="text"
                                                value={sendForm.empfaenger_name}
                                                onChange={(e) => setSendForm((f) => ({ ...f, empfaenger_name: e.target.value }))}
                                                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                                placeholder="Kanzlei Muster"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-medium mb-1">
                                                Reaktionsfrist <span className="text-red-500">*</span>
                                            </label>
                                            <input
                                                type="date"
                                                required
                                                value={sendForm.fristende}
                                                onChange={(e) => setSendForm((f) => ({ ...f, fristende: e.target.value }))}
                                                className="w-full border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            type="submit"
                                            disabled={sending}
                                            className="bg-blue-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {sending && <Loader2 className="w-3 h-3 animate-spin" />}
                                            <Send className="w-3.5 h-3.5" /> Versenden
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowSendForm(false)}
                                            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm hover:bg-neutral-100"
                                        >
                                            Abbrechen
                                        </button>
                                    </div>
                                </form>
                            )}
                        </>
                    )}
                </div>
            )}

            {alreadySent && !fristFehlt && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Anspruchsschreiben wurde versandt. Die Reaktionsfrist ist eingetragen und wird überwacht.
                </div>
            )}

            {fristFehlt && (
                <div className="flex items-start gap-2 text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>
                        Anspruchsschreiben wurde versandt, aber die Reaktionsfrist konnte nicht
                        automatisch angelegt werden. <strong>Die Frist wird derzeit nicht überwacht.</strong>{" "}
                        Bitte die Frist sofort in der Akte eintragen und zusätzlich im Fristenkalender notieren.
                    </span>
                </div>
            )}
        </div>
    );
}
