"use client";

import { useEffect, useState, useCallback } from "react";
import {
    Upload, Search, Loader2, AlertCircle, CheckCircle2, Trash2,
    FileText, BookOpen, Gavel, Scale, Briefcase, Building2,
    Sparkles, ChevronDown, ChevronUp, Send, X, Plus,
    Landmark, Download, ExternalLink,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

type Rechtsgebiet = "alle" | "erbrecht" | "kapitalmarkt" | "kapitalmarktrecht" | "arbeitsrecht" | "gesellschaftsrecht" | "litigation" | "allgemein";
type Dokumenttyp = "alle" | "urteil" | "aufsatz" | "kommentar" | "gesetze" | "sonstiges" | "muster" | "hinweis" | "handbuch";

type Dokument = {
    id: string;
    titel: string;
    rechtsgebiet: string;
    dokumenttyp: string;
    gericht: string | null;
    aktenzeichen: string | null;
    entscheidungsdatum: string | null;
    ki_zusammenfassung: string | null;
    ki_kernaussagen: string | null;
    file_size_bytes: number | null;
    created_at: string;
};

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

const RECHTSGEBIETE: { value: Rechtsgebiet; label: string; icon: React.ReactNode }[] = [
    { value: "alle", label: "Alle Gebiete", icon: <BookOpen className="w-3.5 h-3.5" /> },
    { value: "erbrecht", label: "Erbrecht", icon: <Scale className="w-3.5 h-3.5" /> },
    { value: "kapitalmarkt", label: "Kapitalmarktrecht", icon: <Gavel className="w-3.5 h-3.5" /> },
    { value: "arbeitsrecht", label: "Arbeitsrecht", icon: <Briefcase className="w-3.5 h-3.5" /> },
    { value: "gesellschaftsrecht", label: "Gesellschaftsrecht", icon: <Building2 className="w-3.5 h-3.5" /> },
    { value: "litigation", label: "Litigation", icon: <Gavel className="w-3.5 h-3.5" /> },
    { value: "allgemein", label: "Allgemein", icon: <FileText className="w-3.5 h-3.5" /> },
];

const DOKUMENTTYPEN: { value: Dokumenttyp; label: string }[] = [
    { value: "alle", label: "Alle Typen" },
    { value: "muster", label: "Muster / Vorlage" },
    { value: "hinweis", label: "Hinweis / Checkliste" },
    { value: "handbuch", label: "Handbuch" },
    { value: "urteil", label: "Urteil / Beschluss" },
    { value: "aufsatz", label: "Fachaufsatz" },
    { value: "kommentar", label: "Kommentar" },
    { value: "gesetze", label: "Gesetzestext" },
    { value: "sonstiges", label: "Sonstiges" },
];

const RECHTSGEBIET_COLORS: Record<string, string> = {
    erbrecht: "bg-purple-100 text-purple-700",
    kapitalmarkt: "bg-blue-100 text-blue-700",
    kapitalmarktrecht: "bg-blue-100 text-blue-700",
    arbeitsrecht: "bg-orange-100 text-orange-700",
    gesellschaftsrecht: "bg-green-100 text-green-700",
    litigation: "bg-indigo-100 text-indigo-700",
    allgemein: "bg-neutral-100 text-neutral-600",
};

const DOKUMENTTYP_COLORS: Record<string, string> = {
    muster: "bg-red-100 text-red-700",
    hinweis: "bg-amber-100 text-amber-700",
    handbuch: "bg-sky-100 text-sky-700",
    urteil: "bg-neutral-100 text-neutral-600",
    aufsatz: "bg-yellow-100 text-yellow-700",
    kommentar: "bg-indigo-100 text-indigo-700",
    gesetze: "bg-teal-100 text-teal-700",
    sonstiges: "bg-neutral-100 text-neutral-500",
};

async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

// ---------------------------------------------------------------------------
// Upload-Formular
// ---------------------------------------------------------------------------

function UploadFormular({ onSuccess }: { onSuccess: () => void }) {
    const [file, setFile] = useState<File | null>(null);
    const [form, setForm] = useState({
        titel: "",
        rechtsgebiet: "allgemein" as Rechtsgebiet,
        dokumenttyp: "urteil" as Dokumenttyp,
        gericht: "",
        aktenzeichen: "",
        entscheidungsdatum: "",
    });
    const [uploading, setUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
        setForm((f) => ({ ...f, [k]: v }));
    }

    async function handleUpload(e: React.FormEvent) {
        e.preventDefault();
        if (!file || !form.titel.trim()) return;
        setUploading(true);
        setError(null);

        try {
            const headers = await authHeaders();
            const fd = new FormData();
            fd.append("datei", file);
            fd.append("titel", form.titel);
            fd.append("rechtsgebiet", form.rechtsgebiet === "alle" ? "allgemein" : form.rechtsgebiet);
            fd.append("dokumenttyp", form.dokumenttyp === "alle" ? "sonstiges" : form.dokumenttyp);
            if (form.gericht) fd.append("gericht", form.gericht);
            if (form.aktenzeichen) fd.append("aktenzeichen", form.aktenzeichen);
            if (form.entscheidungsdatum) fd.append("entscheidungsdatum", form.entscheidungsdatum);

            const res = await fetch(`${API_BASE}/wissensbasis/upload`, {
                method: "POST",
                headers,
                body: fd,
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(d.detail ?? `Fehler ${res.status}`);
            }
            setFile(null);
            setForm({ titel: "", rechtsgebiet: "allgemein", dokumenttyp: "muster", gericht: "", aktenzeichen: "", entscheidungsdatum: "" });
            onSuccess();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setUploading(false);
        }
    }

    // Gericht/AZ nur bei urteil und kommentar anzeigen
    const isUrteil = ["urteil", "kommentar"].includes(form.dokumenttyp);
    const isMusterTyp = ["muster", "hinweis", "handbuch"].includes(form.dokumenttyp);

    return (
        <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
            {/* Datei */}
            {!file ? (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neutral-300 rounded-xl px-6 py-8 cursor-pointer hover:bg-neutral-50 hover:border-neutral-400 transition-colors">
                    <Upload className="w-7 h-7 text-neutral-400" />
                    <span className="text-sm font-medium text-neutral-600">Dokument hochladen (PDF oder Word)</span>
                    <span className="text-xs text-neutral-400">max. 30 MB</span>
                    <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                            setFile(f);
                            if (!form.titel) set("titel", f.name.replace(/\.[^.]+$/, ""));
                        }
                    }} />
                </label>
            ) : (
                <div className="flex items-center justify-between border border-neutral-200 rounded-xl px-4 py-3 bg-neutral-50">
                    <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-neutral-500" />
                        <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
                        <span className="text-xs text-neutral-400">({(file.size / 1024).toFixed(0)} KB)</span>
                    </div>
                    <button type="button" onClick={() => setFile(null)} className="text-neutral-400 hover:text-red-500 ml-2">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}

            <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                    <label className="block text-xs font-medium mb-1">Titel <span className="text-red-500">*</span></label>
                    <input
                        required
                        value={form.titel}
                        onChange={(e) => set("titel", e.target.value)}
                        placeholder="z.B. BGH II ZR 229/09 — Prospekthaftung Hintermänner"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium mb-1">Rechtsgebiet</label>
                    <select value={form.rechtsgebiet} onChange={(e) => set("rechtsgebiet", e.target.value as Rechtsgebiet)}
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400">
                        {RECHTSGEBIETE.filter(r => r.value !== "alle").map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium mb-1">Dokumenttyp</label>
                    <select value={form.dokumenttyp} onChange={(e) => set("dokumenttyp", e.target.value as Dokumenttyp)}
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400">
                        {DOKUMENTTYPEN.filter(t => t.value !== "alle").map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                </div>
                {isMusterTyp && (
                    <div className="col-span-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                        <strong>{form.dokumenttyp === "muster" ? "Muster/Vorlage" : form.dokumenttyp === "hinweis" ? "Hinweis/Checkliste" : "Handbuch"}:</strong>{" "}
                        Wird als Volltext in die Wissensdatenbank aufgenommen und steht Erbse sowie anderen Agenten direkt zur Verfügung.
                    </div>
                )}
                {isUrteil && (
                    <>
                        <div>
                            <label className="block text-xs font-medium mb-1">Gericht</label>
                            <input value={form.gericht} onChange={(e) => set("gericht", e.target.value)}
                                placeholder="z.B. BGH, BAG, OLG München"
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">Aktenzeichen</label>
                            <input value={form.aktenzeichen} onChange={(e) => set("aktenzeichen", e.target.value)}
                                placeholder="z.B. II ZR 229/09"
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">Entscheidungsdatum</label>
                            <input type="date" value={form.entscheidungsdatum} onChange={(e) => set("entscheidungsdatum", e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                        </div>
                    </>
                )}
            </div>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            <div className="flex gap-2 items-center">
                <button
                    type="submit"
                    disabled={uploading || !file || !form.titel.trim()}
                    className="bkl-btn-primary px-5 py-2 gap-2 disabled:!opacity-40 rounded-lg"
                >
                    {uploading
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird hochgeladen & analysiert…</>
                        : <><Upload className="w-4 h-4" /> Hochladen</>
                    }
                </button>
                {uploading && <span className="text-xs text-neutral-500">KI-Zusammenfassung wird erstellt…</span>}
            </div>
        </form>
    );
}

// ---------------------------------------------------------------------------
// Dokument-Karte
// ---------------------------------------------------------------------------

function DokumentKarte({ dok, onDelete }: { dok: Dokument; onDelete: () => void }) {
    const [expanded, setExpanded] = useState(false);
    const [analyse, setAnalyse] = useState("");
    const [analyseFrage, setAnalyseFrage] = useState("");
    const [analyseLoading, setAnalyseLoading] = useState(false);
    const [analyseError, setAnalyseError] = useState<string | null>(null);
    const [showAnalyseForm, setShowAnalyseForm] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const kernaussagen: string[] = dok.ki_kernaussagen
        ? JSON.parse(dok.ki_kernaussagen) as string[]
        : [];

    async function handleAnalysieren(frage?: string) {
        setAnalyseLoading(true);
        setAnalyseError(null);
        try {
            const headers = await authHeaders();
            const res = await fetch(`${API_BASE}/wissensbasis/${dok.id}/analysieren`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ frage: frage ?? "" }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(d.detail ?? "Fehler");
            }
            const data = await res.json() as { analyse: string };
            setAnalyse(data.analyse);
            setExpanded(true);
        } catch (e) {
            setAnalyseError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setAnalyseLoading(false);
        }
    }

    async function handleDelete() {
        if (!confirm(`„${dok.titel}" wirklich löschen?`)) return;
        setDeleting(true);
        try {
            const headers = await authHeaders();
            await fetch(`${API_BASE}/wissensbasis/${dok.id}`, { method: "DELETE", headers });
            onDelete();
        } catch { setDeleting(false); }
    }

    return (
        <div className="border border-neutral-200 rounded-xl overflow-hidden hover:border-neutral-300 transition-colors">
            <div className="px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${RECHTSGEBIET_COLORS[dok.rechtsgebiet] ?? "bg-neutral-100 text-neutral-600"}`}>
                                {RECHTSGEBIETE.find(r => r.value === dok.rechtsgebiet)?.label ?? dok.rechtsgebiet}
                            </span>
                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${DOKUMENTTYP_COLORS[dok.dokumenttyp] ?? "bg-neutral-100"}`}>
                                {DOKUMENTTYPEN.find(t => t.value === dok.dokumenttyp)?.label ?? dok.dokumenttyp}
                            </span>
                            {dok.gericht && <span className="text-xs text-neutral-500 font-medium">{dok.gericht}</span>}
                            {dok.aktenzeichen && <span className="text-xs font-mono text-neutral-500">{dok.aktenzeichen}</span>}
                            {dok.entscheidungsdatum && (
                                <span className="text-xs text-neutral-400">
                                    {new Date(dok.entscheidungsdatum).toLocaleDateString("de-DE")}
                                </span>
                            )}
                        </div>
                        <h3 className="font-medium text-sm text-neutral-900">{dok.titel}</h3>
                        {dok.ki_zusammenfassung && (
                            <p className="text-xs text-neutral-500 mt-1 line-clamp-2">{dok.ki_zusammenfassung}</p>
                        )}
                        {kernaussagen.length > 0 && !expanded && (
                            <div className="flex flex-wrap gap-1 mt-2">
                                {kernaussagen.slice(0, 2).map((k, i) => (
                                    <span key={i} className="text-[10px] bg-neutral-100 text-neutral-600 px-2 py-0.5 rounded-full">{k}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                            onClick={() => void handleAnalysieren()}
                            disabled={analyseLoading}
                            title="KI-Analyse"
                            className="text-xs bg-violet-100 text-violet-700 rounded-lg px-2.5 py-1.5 hover:bg-violet-200 flex items-center gap-1 font-medium"
                        >
                            {analyseLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                            Analysieren
                        </button>
                        <button
                            onClick={() => setExpanded(v => !v)}
                            className="text-neutral-400 hover:text-neutral-600 p-1"
                        >
                            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                        <button
                            onClick={() => void handleDelete()}
                            disabled={deleting}
                            className="text-neutral-300 hover:text-red-500 p-1"
                            title="Löschen"
                        >
                            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded: Analyse + Frageformular */}
            {expanded && (
                <div className="border-t border-neutral-100 px-4 py-4 bg-neutral-50/50 space-y-4">
                    {kernaussagen.length > 0 && (
                        <div>
                            <p className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider mb-1.5">KI-Kernaussagen</p>
                            <ul className="space-y-1">
                                {kernaussagen.map((k, i) => (
                                    <li key={i} className="text-xs text-neutral-700 flex items-start gap-1.5">
                                        <span className="text-neutral-400 mt-0.5">·</span> {k}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {analyseError && (
                        <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {analyseError}
                        </div>
                    )}

                    {analyse && (
                        <div className="bg-white border border-neutral-200 rounded-xl p-4">
                            <div className="flex items-center gap-1.5 mb-2">
                                <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                                <span className="text-xs font-semibold text-violet-700">KI-Analyse</span>
                            </div>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap text-neutral-800">{analyse}</p>
                        </div>
                    )}

                    {/* Spezifische Frage stellen */}
                    {!showAnalyseForm ? (
                        <button
                            onClick={() => setShowAnalyseForm(true)}
                            className="text-xs text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
                        >
                            <Plus className="w-3 h-3" /> Spezifische Frage zu diesem Dokument stellen
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={analyseFrage}
                                onChange={(e) => setAnalyseFrage(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") void handleAnalysieren(analyseFrage); }}
                                placeholder="z.B. Welche Auswirkung hat das Urteil auf Verjährungsfristen?"
                                className="flex-1 border border-neutral-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                            />
                            <button
                                onClick={() => void handleAnalysieren(analyseFrage)}
                                disabled={analyseLoading || !analyseFrage.trim()}
                                className="bg-neutral-900 text-white rounded-lg px-3 py-1.5 disabled:opacity-40"
                            >
                                {analyseLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                            </button>
                            <button onClick={() => setShowAnalyseForm(false)} className="text-neutral-400 hover:text-neutral-600 px-1">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Rechtsprechung-Recherche (rechtsprechung-im-internet.de)
// ---------------------------------------------------------------------------

type RspTreffer = {
    gericht: string | null;
    entscheidungsdatum: string | null;
    aktenzeichen: string | null;
    link: string;
};

const IMPORT_GEBIETE = RECHTSGEBIETE.filter((r) => r.value !== "alle");

function RechercheTab({ onImported }: { onImported: () => void }) {
    const [q, setQ] = useState("");
    const [gericht, setGericht] = useState("");
    const [von, setVon] = useState("");
    const [bis, setBis] = useState("");
    const [gebiet, setGebiet] = useState<Rechtsgebiet>("erbrecht");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [treffer, setTreffer] = useState<RspTreffer[] | null>(null);
    const [importStatus, setImportStatus] = useState<Record<string, "laden" | "ok" | "vorhanden" | "fehler">>({});

    async function suchen() {
        if (!q.trim() && !gericht.trim() && !von && !bis) {
            setError("Bitte mindestens ein Suchkriterium angeben.");
            return;
        }
        setLoading(true); setError(null); setTreffer(null);
        try {
            const headers = await authHeaders();
            const params = new URLSearchParams();
            if (q.trim()) params.set("q", q.trim());
            if (gericht.trim()) params.set("gericht", gericht.trim());
            if (von) params.set("von", von);
            if (bis) params.set("bis", bis);
            params.set("limit", "50");
            const res = await fetch(`${API_BASE}/rechtsprechung/suche?${params}`, { headers });
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(d.detail ?? `Fehler ${res.status}`);
            }
            const data = await res.json() as { treffer: RspTreffer[] };
            setTreffer(data.treffer);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setLoading(false);
        }
    }

    async function importieren(link: string) {
        setImportStatus((s) => ({ ...s, [link]: "laden" }));
        try {
            const headers = await authHeaders();
            const res = await fetch(`${API_BASE}/rechtsprechung/import`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ link, rechtsgebiet: gebiet }),
            });
            if (res.status === 409) {
                setImportStatus((s) => ({ ...s, [link]: "vorhanden" }));
                return;
            }
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(d.detail ?? `Fehler ${res.status}`);
            }
            setImportStatus((s) => ({ ...s, [link]: "ok" }));
            onImported();
        } catch {
            setImportStatus((s) => ({ ...s, [link]: "fehler" }));
        }
    }

    return (
        <div className="space-y-5">
            <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3 text-xs text-sky-800 flex gap-2">
                <Landmark className="w-4 h-4 shrink-0 mt-0.5" />
                <span>
                    Recherche in der amtlichen Quelle <strong>Rechtsprechung im Internet</strong> (Bund) — Entscheidungen
                    der obersten Bundesgerichte (BVerfG, BGH, BVerwG, BFH, BAG, BSG). Importierte Entscheidungen werden
                    KI-zusammengefasst und stehen anschließend der Assistentin zur Verfügung.
                </span>
            </div>

            {/* Suchformular */}
            <div className="border border-neutral-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                        <label className="block text-xs font-medium mb-1">Suchbegriff (Gericht oder Aktenzeichen)</label>
                        <input value={q} onChange={(e) => setQ(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void suchen(); }}
                            placeholder="z.B. IV ZR 261/19 oder BGH"
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                    </div>
                    <div>
                        <label className="block text-xs font-medium mb-1">Gericht (Filter)</label>
                        <input value={gericht} onChange={(e) => setGericht(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") void suchen(); }}
                            placeholder="z.B. BGH, BAG, BFH"
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-medium mb-1">von</label>
                            <input type="date" value={von} onChange={(e) => setVon(e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">bis</label>
                            <input type="date" value={bis} onChange={(e) => setBis(e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                    <button onClick={() => void suchen()} disabled={loading}
                        className="bg-neutral-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center gap-2">
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Suche…</> : <><Search className="w-4 h-4" /> Suchen</>}
                    </button>
                    <div className="flex items-center gap-2 ml-auto">
                        <label className="text-xs text-neutral-500">Import als Rechtsgebiet:</label>
                        <select value={gebiet} onChange={(e) => setGebiet(e.target.value as Rechtsgebiet)}
                            className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400">
                            {IMPORT_GEBIETE.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                    </div>
                </div>
                {error && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                    </div>
                )}
            </div>

            {/* Ergebnisse */}
            {treffer && (
                treffer.length === 0 ? (
                    <p className="text-sm text-neutral-400 text-center py-10">Keine Entscheidungen gefunden.</p>
                ) : (
                    <div className="space-y-2">
                        <p className="text-xs text-neutral-500">{treffer.length} Entscheidung(en) — neueste zuerst</p>
                        {treffer.map((t) => {
                            const st = importStatus[t.link];
                            return (
                                <div key={t.link} className="border border-neutral-200 rounded-xl px-4 py-3 flex items-center gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {t.gericht && <span className="text-sm font-medium text-neutral-800">{t.gericht}</span>}
                                            {t.aktenzeichen && <span className="text-xs font-mono text-neutral-500">{t.aktenzeichen}</span>}
                                            {t.entscheidungsdatum && (
                                                <span className="text-xs text-neutral-400">{new Date(t.entscheidungsdatum).toLocaleDateString("de-DE")}</span>
                                            )}
                                        </div>
                                        <a href={t.link} target="_blank" rel="noopener noreferrer"
                                            className="text-[11px] text-neutral-400 hover:text-neutral-600 inline-flex items-center gap-1 mt-0.5">
                                            Quelle <ExternalLink className="w-3 h-3" />
                                        </a>
                                    </div>
                                    <button
                                        onClick={() => void importieren(t.link)}
                                        disabled={st === "laden" || st === "ok" || st === "vorhanden"}
                                        className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 ${
                                            st === "ok" ? "bg-green-100 text-green-700"
                                            : st === "vorhanden" ? "bg-neutral-100 text-neutral-500"
                                            : st === "fehler" ? "bg-red-100 text-red-700"
                                            : "bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                                        }`}>
                                        {st === "laden" ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Import…</>
                                            : st === "ok" ? <><CheckCircle2 className="w-3.5 h-3.5" /> Übernommen</>
                                            : st === "vorhanden" ? <><CheckCircle2 className="w-3.5 h-3.5" /> Bereits vorhanden</>
                                            : st === "fehler" ? <><AlertCircle className="w-3.5 h-3.5" /> Erneut versuchen</>
                                            : <><Download className="w-3.5 h-3.5" /> In Wissensbasis</>}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Hauptseite
// ---------------------------------------------------------------------------

export default function WissensbasisPage() {
    const [tab, setTab] = useState<"bibliothek" | "upload" | "recherche">("bibliothek");
    const [dokumente, setDokumente] = useState<Dokument[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<Rechtsgebiet>("alle");
    const [typFilter, setTypFilter] = useState<Dokumenttyp>("alle");
    const [suche, setSuche] = useState("");
    const [uploadSuccess, setUploadSuccess] = useState(false);

    const laden = useCallback(async () => {
        setLoading(true);
        try {
            const headers = await authHeaders();
            const params = new URLSearchParams();
            if (filter !== "alle") params.set("rechtsgebiet", filter);
            if (typFilter !== "alle") params.set("dokumenttyp", typFilter);
            if (suche.trim()) params.set("suche", suche.trim());

            const res = await fetch(`${API_BASE}/wissensbasis?${params}`, { headers });
            if (res.ok) setDokumente(await res.json() as Dokument[]);
        } catch { /* ignore */ }
        setLoading(false);
    }, [filter, typFilter, suche]);

    useEffect(() => { void laden(); }, [laden]);

    function handleUploadSuccess() {
        setUploadSuccess(true);
        setTab("bibliothek");
        void laden();
        setTimeout(() => setUploadSuccess(false), 4000);
    }

    function handleImported() {
        // Bibliothek im Hintergrund aktualisieren; Nutzer bleibt in der Recherche
        void laden();
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <BookOpen className="w-6 h-6" /> Wissensdatenbank
                    </h1>
                    <p className="text-sm text-neutral-500 mt-0.5">
                        Urteile, Aufsätze, Kommentare — hochladen, durchsuchen, analysieren
                    </p>
                </div>
                <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
                    <button
                        onClick={() => setTab("bibliothek")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "bibliothek" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                    >
                        <BookOpen className="w-3.5 h-3.5" /> Bibliothek {dokumente.length > 0 && <span className="ml-1 text-xs bg-neutral-200 rounded-full px-1.5">{dokumente.length}</span>}
                    </button>
                    <button
                        onClick={() => setTab("recherche")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "recherche" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                    >
                        <Landmark className="w-3.5 h-3.5" /> Recherche
                    </button>
                    <button
                        onClick={() => setTab("upload")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "upload" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                    >
                        <Upload className="w-3.5 h-3.5" /> Hochladen
                    </button>
                </div>
            </div>

            {uploadSuccess && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-6 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Dokument hochgeladen — KI-Zusammenfassung wurde automatisch erstellt.
                </div>
            )}

            {tab === "recherche" ? (
                <RechercheTab onImported={handleImported} />
            ) : tab === "upload" ? (
                <div className="border border-neutral-200 rounded-xl p-6">
                    <h2 className="font-semibold mb-4 flex items-center gap-2">
                        <Upload className="w-4 h-4" /> Neues Dokument hinzufügen
                    </h2>
                    <UploadFormular onSuccess={handleUploadSuccess} />
                </div>
            ) : (
                <>
                    {/* Filter */}
                    <div className="space-y-3 mb-6">
                        {/* Suche */}
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                            <input
                                type="text"
                                value={suche}
                                onChange={(e) => setSuche(e.target.value)}
                                placeholder="Suchen nach Titel, Gericht, Aktenzeichen…"
                                className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                            />
                        </div>

                        {/* Rechtsgebiet-Tabs */}
                        <div className="flex flex-wrap gap-2">
                            {RECHTSGEBIETE.map((r) => (
                                <button
                                    key={r.value}
                                    onClick={() => setFilter(r.value)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                        filter === r.value
                                            ? "bg-neutral-900 text-white border-neutral-900"
                                            : "border-neutral-200 hover:bg-neutral-50"
                                    }`}
                                >
                                    {r.icon} {r.label}
                                </button>
                            ))}
                        </div>

                        {/* Dokumenttyp */}
                        <div className="flex flex-wrap gap-2">
                            {DOKUMENTTYPEN.map((t) => (
                                <button
                                    key={t.value}
                                    onClick={() => setTypFilter(t.value)}
                                    className={`px-3 py-1 rounded-lg text-xs border transition-colors ${
                                        typFilter === t.value
                                            ? "bg-neutral-700 text-white border-neutral-700"
                                            : "border-neutral-200 text-neutral-600 hover:bg-neutral-50"
                                    }`}
                                >
                                    {t.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Liste */}
                    {loading ? (
                        <div className="flex items-center justify-center py-20">
                            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                        </div>
                    ) : dokumente.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                            <BookOpen className="w-12 h-12 mb-4" />
                            <p className="text-base font-medium">Noch keine Dokumente vorhanden</p>
                            <p className="text-sm mt-1">Laden Sie Urteile, Aufsätze oder Kommentare hoch.</p>
                            <button
                                onClick={() => setTab("upload")}
                                className="mt-4 bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-neutral-700 flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" /> Erstes Dokument hochladen
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {dokumente.map((d) => (
                                <DokumentKarte key={d.id} dok={d} onDelete={() => void laden()} />
                            ))}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

