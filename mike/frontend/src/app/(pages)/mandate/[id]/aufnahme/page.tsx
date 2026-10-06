"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Loader2, Upload, X, AlertCircle, CheckCircle2,
    Sparkles, FileText, AlertTriangle,
} from "lucide-react";
import { getIntake, submitIntake, analyzeIntakeDocuments } from "@/app/lib/mandateApi";
import type { IntakeAnalyseResult } from "@/app/lib/mandateApi";

type FormData = {
    anrede: string; vorname: string; nachname: string;
    geburtsdatum: string; beruf: string; email: string;
    telefon: string; strasse: string; hausnummer: string;
    plz: string; ort: string; beratungskurzbeschreibung: string;
    sachverhalt_seit: string; gegner: string; bisherige_schritte: string;
    mandatsziel: string;
    rechtsschutzversicherung: string; rechtsschutzversicherung_name: string;
    rechtsschutzversicherung_nummer: string;
    datenschutz_hinweis_bestaetigt: string;
};

const EMPTY_FORM: FormData = {
    anrede: "", vorname: "", nachname: "", geburtsdatum: "", beruf: "",
    email: "", telefon: "", strasse: "", hausnummer: "", plz: "", ort: "",
    beratungskurzbeschreibung: "", sachverhalt_seit: "", gegner: "",
    bisherige_schritte: "", mandatsziel: "",
    rechtsschutzversicherung: "false", rechtsschutzversicherung_name: "",
    rechtsschutzversicherung_nummer: "",
    datenschutz_hinweis_bestaetigt: "false",
};

const FIELD_LABELS: Record<string, string> = {
    anrede: "Anrede", vorname: "Vorname", nachname: "Nachname",
    geburtsdatum: "Geburtsdatum", beruf: "Beruf", email: "E-Mail",
    telefon: "Telefon", strasse: "Straße", hausnummer: "Hausnr.",
    plz: "PLZ", ort: "Ort", beratungskurzbeschreibung: "Worum geht es",
    sachverhalt_seit: "Seit wann", gegner: "Gegenpartei",
    bisherige_schritte: "Bisherige Schritte", mandatsziel: "Ziel des Mandats",
    rechtsschutzversicherung_name: "Rechtsschutzversicherer",
    rechtsschutzversicherung_nummer: "Versicherungsscheinnummer",
};

function KiBadge() {
    return (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700 ml-1.5 align-middle">
            <Sparkles className="w-2.5 h-2.5" /> KI
        </span>
    );
}

export default function AufnahmePage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const errorRef = useRef<HTMLDivElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [form, setForm] = useState<FormData>(EMPTY_FORM);

    // KI-Analyse
    const [analyseFiles, setAnalyseFiles] = useState<File[]>([]);
    const [analysing, setAnalysing] = useState(false);
    const [analyseResult, setAnalyseResult] = useState<IntakeAnalyseResult | null>(null);
    const [kiFelder, setKiFelder] = useState<Set<string>>(new Set());
    const [analyseError, setAnalyseError] = useState<string | null>(null);

    useEffect(() => {
        getIntake(id)
            .then((data) => {
                if (data) {
                    setForm((f) => ({
                        ...f,
                        anrede: data.anrede ?? "",
                        vorname: data.vorname,
                        nachname: data.nachname,
                        geburtsdatum: data.geburtsdatum ?? "",
                        beruf: data.beruf ?? "",
                        email: data.email ?? "",
                        telefon: data.telefon ?? "",
                        strasse: data.strasse ?? "",
                        hausnummer: data.hausnummer ?? "",
                        plz: data.plz ?? "",
                        ort: data.ort ?? "",
                        beratungskurzbeschreibung: data.beratungskurzbeschreibung ?? "",
                        sachverhalt_seit: data.sachverhalt_seit ?? "",
                        gegner: data.gegner ?? "",
                        bisherige_schritte: data.bisherige_schritte ?? "",
                        mandatsziel: data.mandatsziel ?? "",
                        rechtsschutzversicherung: data.rechtsschutzversicherung ? "true" : "false",
                        rechtsschutzversicherung_name: data.rechtsschutzversicherung_name ?? "",
                        rechtsschutzversicherung_nummer: data.rechtsschutzversicherung_nummer ?? "",
                    }));
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [id]);

    function set(field: keyof FormData, value: string) {
        setForm((f) => ({ ...f, [field]: value }));
        // Wenn manuell bearbeitet: KI-Markierung für dieses Feld entfernen
        setKiFelder((prev) => { const n = new Set(prev); n.delete(field); return n; });
    }

    function handleAnalyseFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const added = Array.from(e.target.files ?? []);
        setAnalyseFiles((prev) => [...prev, ...added]);
        e.target.value = "";
    }

    async function handleAnalyse() {
        if (!analyseFiles.length) return;
        setAnalysing(true);
        setAnalyseError(null);
        setAnalyseResult(null);
        try {
            const result = await analyzeIntakeDocuments(id, analyseFiles);
            setAnalyseResult(result);

            // Formular mit KI-Vorschlägen befüllen (nur nicht-leere Felder)
            const erkannt = new Set<string>();
            setForm((prev) => {
                const updated = { ...prev };
                const v = result.vorschlag;
                const felder = Object.keys(v) as (keyof typeof v)[];
                for (const field of felder) {
                    if (v[field]?.trim()) {
                        (updated as Record<string, string>)[field] = v[field];
                        erkannt.add(field);
                    }
                }
                return updated;
            });
            setKiFelder(erkannt);
        } catch (e) {
            setAnalyseError(e instanceof Error ? e.message : "Analyse fehlgeschlagen");
        } finally {
            setAnalysing(false);
        }
    }

    function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
        const added = Array.from(e.target.files ?? []);
        setFiles((prev) => [...prev, ...added]);
        e.target.value = "";
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (form.datenschutz_hinweis_bestaetigt !== "true") {
            setError("Bitte bestätigen Sie den Datenschutzhinweis (Art. 13 DSGVO).");
            setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
            return;
        }
        setSaving(true);
        setError(null);
        try {
            await submitIntake(id, form, files);
            setSuccess(true);
            setTimeout(() => router.push(`/mandate/${id}`), 1500);
        } catch (e) {
            const msg = e instanceof Error ? e.message : "Fehler beim Speichern";
            setError(msg);
            setTimeout(() => errorRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
        } finally {
            setSaving(false);
        }
    }

    const inputClass = (field: string) =>
        `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 ${
            kiFelder.has(field)
                ? "border-violet-300 bg-violet-50/50 focus:ring-violet-300"
                : "border-neutral-300"
        }`;

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8">
            <button
                onClick={() => router.push(`/mandate/${id}`)}
                className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-6"
            >
                <ArrowLeft className="w-4 h-4" /> Zurück zur Akte
            </button>

            <h1 className="text-2xl font-semibold mb-1">Aufnahmebogen</h1>
            <p className="text-sm text-neutral-500 mb-8">
                Laden Sie zuerst ein Dokument hoch — die KI füllt das Formular automatisch aus.
            </p>

            {/* ===== KI-ANALYSE BEREICH ===== */}
            <div className="border-2 border-violet-200 bg-violet-50/30 rounded-xl p-5 mb-8">
                <div className="flex items-center gap-2 mb-1">
                    <Sparkles className="w-5 h-5 text-violet-600" />
                    <h2 className="font-semibold text-violet-900">Dokument analysieren (KI)</h2>
                </div>
                <p className="text-xs text-neutral-500 mb-4">
                    Laden Sie ein Dokument hoch (z.B. Beitrittserklärung, Anwaltsschreiben, Vollmacht, Vertrag).
                    Die KI erkennt automatisch Name, Adresse, Kontakt und Sachverhalt.
                </p>

                {/* Datei-Upload für Analyse */}
                <label className="flex items-center gap-2 border border-dashed border-violet-300 rounded-lg px-4 py-3 cursor-pointer hover:bg-violet-50 text-sm text-neutral-600 mb-2">
                    <Upload className="w-4 h-4 text-violet-500" />
                    Dokument auswählen (PDF oder Word)
                    <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx"
                        className="hidden"
                        onChange={handleAnalyseFiles}
                    />
                </label>

                {analyseFiles.length > 0 && (
                    <ul className="mb-3 space-y-1">
                        {analyseFiles.map((f, i) => (
                            <li key={i} className="flex items-center justify-between text-sm bg-white rounded-lg px-3 py-1.5 border border-violet-100">
                                <span className="flex items-center gap-1.5 truncate">
                                    <FileText className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
                                    {f.name}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setAnalyseFiles((p) => p.filter((_, j) => j !== i))}
                                    className="ml-2 text-neutral-400 hover:text-red-500"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}

                <button
                    type="button"
                    onClick={() => void handleAnalyse()}
                    disabled={!analyseFiles.length || analysing}
                    className="bg-violet-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-violet-700 disabled:opacity-40 flex items-center gap-2"
                >
                    {analysing
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird analysiert…</>
                        : <><Sparkles className="w-4 h-4" /> Jetzt analysieren</>
                    }
                </button>

                {analyseError && (
                    <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3 text-sm">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {analyseError}
                    </div>
                )}

                {analyseResult && !analysing && (
                    <div className="mt-3 bg-white border border-violet-200 rounded-lg px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-medium text-violet-800 flex items-center gap-1.5">
                                <CheckCircle2 className="w-4 h-4 text-green-500" />
                                {analyseResult.erkannte_felder.length} Felder erkannt
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                analyseResult.konfidenz === "hoch"
                                    ? "bg-green-100 text-green-700"
                                    : analyseResult.konfidenz === "mittel"
                                    ? "bg-yellow-100 text-yellow-700"
                                    : "bg-orange-100 text-orange-700"
                            }`}>
                                Konfidenz: {analyseResult.konfidenz}
                            </span>
                        </div>
                        <p className="text-xs text-neutral-500">
                            Mit <KiBadge /> markierte Felder wurden automatisch befüllt.
                            Bitte prüfen und bei Bedarf korrigieren.
                        </p>

                        {/* Aus Handschrift/Scan gelesene Werte verdienen eine
                            deutlichere Warnung als aus Textdateien übernommene. */}
                        {analyseResult.methode === "vision" && (
                            <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-2">
                                Aus einem Bild bzw. einer handschriftlichen Vorlage gelesen. Zahlen,
                                Vertragsnummern und Eigennamen bitte besonders sorgfältig gegen das
                                Original prüfen.
                            </p>
                        )}

                        {analyseResult.beteiligungen.length > 0 && (
                            <div className="mt-3 border-t border-neutral-100 pt-3">
                                <p className="text-xs font-semibold text-neutral-600 mb-1.5">
                                    Erkannte Beteiligungen ({analyseResult.beteiligungen.length})
                                </p>
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="text-neutral-400 text-left">
                                            <th className="font-medium pb-1">Bezeichnung</th>
                                            <th className="font-medium pb-1">Nummer</th>
                                            <th className="font-medium pb-1 text-right">Betrag</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {analyseResult.beteiligungen.map((b, i) => (
                                            <tr key={i} className="border-t border-neutral-100">
                                                <td className="py-1">{b.bezeichnung || "—"}</td>
                                                <td className="py-1 font-mono">{b.nummer || "—"}</td>
                                                <td className="py-1 text-right font-mono">
                                                    {b.betrag ? `${b.betrag} €` : "—"}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <p className="text-[10px] text-neutral-500 mt-1.5">
                                    Für diese Angaben gibt es noch kein eigenes Feld — sie wurden in die
                                    Beratungsbeschreibung übernommen und werden mit dieser gespeichert.
                                </p>
                            </div>
                        )}
                    </div>
                )}

                {/* Disclaimer */}
                <div className="flex gap-2 mt-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-800">
                    <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    KI-Ergebnisse sind Vorschläge — bitte alle Felder vor dem Speichern prüfen.
                </div>
            </div>

            {/* ===== AUFNAHMEFORMULAR ===== */}
            {success && (
                <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-6 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Aufnahmebogen gespeichert. Sie werden weitergeleitet…
                </div>
            )}

            {error && (
                <div ref={errorRef} className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-8">

                {/* Persönliche Daten */}
                <section>
                    <h2 className="text-base font-semibold mb-4 pb-2 border-b border-neutral-100">
                        Persönliche Daten
                    </h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">Anrede{kiFelder.has("anrede") && <KiBadge />}</label>
                                <select
                                    value={form.anrede}
                                    onChange={(e) => set("anrede", e.target.value)}
                                    className={inputClass("anrede")}
                                >
                                    <option value="">–</option>
                                    <option>Herr</option>
                                    <option>Frau</option>
                                    <option>Divers</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Vorname <span className="text-red-500">*</span>
                                    {kiFelder.has("vorname") && <KiBadge />}
                                </label>
                                <input
                                    required
                                    value={form.vorname}
                                    onChange={(e) => set("vorname", e.target.value)}
                                    className={inputClass("vorname")}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Nachname <span className="text-red-500">*</span>
                                    {kiFelder.has("nachname") && <KiBadge />}
                                </label>
                                <input
                                    required
                                    value={form.nachname}
                                    onChange={(e) => set("nachname", e.target.value)}
                                    className={inputClass("nachname")}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Geburtsdatum{kiFelder.has("geburtsdatum") && <KiBadge />}
                                </label>
                                <input
                                    type="date"
                                    value={form.geburtsdatum}
                                    onChange={(e) => set("geburtsdatum", e.target.value)}
                                    className={inputClass("geburtsdatum")}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Beruf{kiFelder.has("beruf") && <KiBadge />}
                                </label>
                                <input
                                    value={form.beruf}
                                    onChange={(e) => set("beruf", e.target.value)}
                                    className={inputClass("beruf")}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Kontakt */}
                <section>
                    <h2 className="text-base font-semibold mb-4 pb-2 border-b border-neutral-100">
                        Kontakt
                    </h2>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                E-Mail{kiFelder.has("email") && <KiBadge />}
                            </label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => set("email", e.target.value)}
                                className={inputClass("email")}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Telefon{kiFelder.has("telefon") && <KiBadge />}
                            </label>
                            <input
                                type="tel"
                                value={form.telefon}
                                onChange={(e) => set("telefon", e.target.value)}
                                className={inputClass("telefon")}
                            />
                        </div>
                    </div>
                </section>

                {/* Adresse */}
                <section>
                    <h2 className="text-base font-semibold mb-4 pb-2 border-b border-neutral-100">
                        Adresse
                    </h2>
                    <div className="space-y-4">
                        <div className="grid grid-cols-4 gap-4">
                            <div className="col-span-3">
                                <label className="block text-sm font-medium mb-1">
                                    Straße{kiFelder.has("strasse") && <KiBadge />}
                                </label>
                                <input
                                    value={form.strasse}
                                    onChange={(e) => set("strasse", e.target.value)}
                                    className={inputClass("strasse")}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Nr.{kiFelder.has("hausnummer") && <KiBadge />}
                                </label>
                                <input
                                    value={form.hausnummer}
                                    onChange={(e) => set("hausnummer", e.target.value)}
                                    className={inputClass("hausnummer")}
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    PLZ{kiFelder.has("plz") && <KiBadge />}
                                </label>
                                <input
                                    value={form.plz}
                                    onChange={(e) => set("plz", e.target.value)}
                                    className={inputClass("plz")}
                                />
                            </div>
                            <div className="col-span-3">
                                <label className="block text-sm font-medium mb-1">
                                    Ort{kiFelder.has("ort") && <KiBadge />}
                                </label>
                                <input
                                    value={form.ort}
                                    onChange={(e) => set("ort", e.target.value)}
                                    className={inputClass("ort")}
                                />
                            </div>
                        </div>
                    </div>
                </section>

                {/* Rechtsschutzversicherung */}
                <section>
                    <h2 className="text-base font-semibold mb-4 pb-2 border-b border-neutral-100">
                        Rechtsschutzversicherung
                    </h2>
                    <div className="space-y-4">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                type="checkbox"
                                className="rounded"
                                checked={form.rechtsschutzversicherung === "true"}
                                onChange={(e) => set("rechtsschutzversicherung", e.target.checked ? "true" : "false")}
                            />
                            <span className="text-sm font-medium">Mandant hat eine Rechtsschutzversicherung</span>
                        </label>
                        {form.rechtsschutzversicherung === "true" && (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Versicherer{kiFelder.has("rechtsschutzversicherung_name") && <KiBadge />}
                                    </label>
                                    <input
                                        value={form.rechtsschutzversicherung_name}
                                        onChange={(e) => set("rechtsschutzversicherung_name", e.target.value)}
                                        className={inputClass("rechtsschutzversicherung_name")}
                                        placeholder="z.B. ARAG, DAS, Roland"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-1">
                                        Versicherungsscheinnummer{kiFelder.has("rechtsschutzversicherung_nummer") && <KiBadge />}
                                    </label>
                                    <input
                                        value={form.rechtsschutzversicherung_nummer}
                                        onChange={(e) => set("rechtsschutzversicherung_nummer", e.target.value)}
                                        className={inputClass("rechtsschutzversicherung_nummer")}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                </section>

                {/* Sachverhalt */}
                <section>
                    <h2 className="text-base font-semibold mb-1 pb-2 border-b border-neutral-100">
                        Sachverhalt
                    </h2>
                    <p className="text-xs text-neutral-500 mb-4">
                        Diese Angaben fließen direkt in die Mandats-/Honorarvereinbarung und das
                        Anschreiben ein — je genauer, desto weniger muss später manuell nachbearbeitet werden.
                    </p>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Worum geht es? <span className="text-red-500 ml-0.5">*</span>
                                {kiFelder.has("beratungskurzbeschreibung") && <KiBadge />}
                            </label>
                            <textarea
                                required
                                rows={4}
                                value={form.beratungskurzbeschreibung}
                                onChange={(e) => set("beratungskurzbeschreibung", e.target.value)}
                                className={`${inputClass("beratungskurzbeschreibung")} resize-none`}
                                placeholder="Bitte schildern Sie den Sachverhalt…"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Seit wann / wann eingetreten?
                                    {kiFelder.has("sachverhalt_seit") && <KiBadge />}
                                </label>
                                <input
                                    type="date"
                                    value={form.sachverhalt_seit}
                                    onChange={(e) => set("sachverhalt_seit", e.target.value)}
                                    className={inputClass("sachverhalt_seit")}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    Gegenpartei (falls vorhanden)
                                    {kiFelder.has("gegner") && <KiBadge />}
                                </label>
                                <input
                                    value={form.gegner}
                                    onChange={(e) => set("gegner", e.target.value)}
                                    className={inputClass("gegner")}
                                    placeholder="Name, ggf. Kanzlei/Versicherung"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Bereits erfolgte Schritte
                                {kiFelder.has("bisherige_schritte") && <KiBadge />}
                            </label>
                            <textarea
                                rows={2}
                                value={form.bisherige_schritte}
                                onChange={(e) => set("bisherige_schritte", e.target.value)}
                                className={`${inputClass("bisherige_schritte")} resize-none`}
                                placeholder="z.B. Schreiben, gesetzte Fristen, bisheriger Kontakt mit der Gegenseite"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Ziel des Mandats
                                {kiFelder.has("mandatsziel") && <KiBadge />}
                            </label>
                            <textarea
                                rows={2}
                                value={form.mandatsziel}
                                onChange={(e) => set("mandatsziel", e.target.value)}
                                className={`${inputClass("mandatsziel")} resize-none`}
                                placeholder="Was möchte der Mandant erreichen?"
                            />
                        </div>
                    </div>
                </section>

                {/* Weitere Dokumente */}
                <section>
                    <h2 className="text-base font-semibold mb-4 pb-2 border-b border-neutral-100">
                        Weitere Unterlagen (optional)
                    </h2>
                    <label className="flex items-center gap-2 border border-dashed border-neutral-300 rounded-lg px-4 py-3 cursor-pointer hover:bg-neutral-50 text-sm text-neutral-600">
                        <Upload className="w-4 h-4" />
                        Dateien auswählen (PDF, Word, JPEG, PNG · max. 20 MB)
                        <input
                            type="file"
                            multiple
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.tiff,.tif"
                            className="hidden"
                            onChange={handleFiles}
                        />
                    </label>
                    {files.length > 0 && (
                        <ul className="mt-2 space-y-1">
                            {files.map((f, i) => (
                                <li key={i} className="flex items-center justify-between text-sm px-3 py-1.5 bg-neutral-50 rounded-lg">
                                    <span className="truncate text-neutral-700">{f.name}</span>
                                    <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))} className="ml-2 text-neutral-400 hover:text-red-600">
                                        <X className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                {/* Datenschutz */}
                <section className="bg-neutral-50 border border-neutral-200 rounded-xl p-5">
                    <h2 className="text-sm font-semibold mb-2">Datenschutzhinweis (Art. 13 DSGVO)</h2>
                    <p className="text-xs text-neutral-500 mb-4 leading-relaxed">
                        Die von Ihnen eingegebenen Daten werden ausschließlich zur Mandatsbearbeitung
                        durch unsere Kanzlei verwendet. Eine Weitergabe an Dritte erfolgt nur, soweit
                        dies zur Mandatsführung erforderlich ist. Ihre Daten werden auf EU-Servern
                        gespeichert. Sie haben das Recht auf Auskunft, Berichtigung, Löschung und
                        Datenübertragbarkeit. Verantwortlicher: BKL Rechtsanwälte.
                    </p>
                    <label className="flex items-start gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-0.5 rounded"
                            checked={form.datenschutz_hinweis_bestaetigt === "true"}
                            onChange={(e) => set("datenschutz_hinweis_bestaetigt", e.target.checked ? "true" : "false")}
                        />
                        <span className="text-sm">
                            Ich habe den Datenschutzhinweis zur Kenntnis genommen und stimme der
                            Verarbeitung meiner Daten zu. <span className="text-red-500">*</span>
                        </span>
                    </label>
                </section>

                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={saving || success}
                        className="bg-neutral-900 text-white rounded-lg px-6 py-2.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2"
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        Aufnahmebogen speichern
                    </button>
                    <button
                        type="button"
                        onClick={() => router.push(`/mandate/${id}`)}
                        className="border border-neutral-300 rounded-lg px-4 py-2.5 text-sm hover:bg-neutral-100"
                    >
                        Abbrechen
                    </button>
                </div>
            </form>
        </div>
        </div>
    );
}
