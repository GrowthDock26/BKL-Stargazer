"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Loader2, AlertCircle, AlertTriangle, CheckCircle2,
    Upload, Plus, X, Calculator, LineChart,
} from "lucide-react";
import {
    getMatter, getPreStand, analysierePreFragebogen, uebernehmePreFragebogen,
} from "@/app/lib/mandateApi";
import type {
    MatterDetail, PreStand, PreBeteiligung, PreAuszahlung, PreFragebogenKopf,
} from "@/app/lib/mandateApi";

/** 62100 → "62.100,00 €" */
function euro(n: number): string {
    return `${n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

const LEERE_BETEILIGUNG: PreBeteiligung = {
    bezeichnung: "", vertragsnummer: "", zeichnungssumme: "", agio: "",
};

export default function PreFragebogenPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [matter, setMatter] = useState<MatterDetail | null>(null);
    const [stand, setStand] = useState<PreStand | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hinweis, setHinweis] = useState<string | null>(null);

    const [dateien, setDateien] = useState<File[]>([]);
    const [analysiere, setAnalysiere] = useState(false);
    const [speichere, setSpeichere] = useState(false);
    const [ausBild, setAusBild] = useState(false);

    // Bearbeitbarer Stand
    const [kopf, setKopf] = useState<PreFragebogenKopf>({});
    const [beteiligungen, setBeteiligungen] = useState<PreBeteiligung[]>([]);
    const [auszahlungen, setAuszahlungen] = useState<PreAuszahlung[]>([]);

    const load = useCallback(async () => {
        try {
            const [m, s] = await Promise.all([getMatter(id), getPreStand(id)]);
            setMatter(m);
            setStand(s);
            setKopf(s.fragebogen ?? {});
            setBeteiligungen(s.beteiligungen.length ? s.beteiligungen : []);
            setAuszahlungen(s.auszahlungen);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Laden");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => { void load(); }, [load]);

    async function handleAnalyse() {
        if (!dateien.length) return;
        setAnalysiere(true);
        setError(null);
        setHinweis(null);
        try {
            const r = await analysierePreFragebogen(id, dateien);
            setKopf(r.vorschlag);
            setBeteiligungen(r.beteiligungen.length ? r.beteiligungen : [{ ...LEERE_BETEILIGUNG }]);
            setAuszahlungen(r.auszahlungen);
            setStand((prev) => prev ? { ...prev, streitwert: r.streitwert, pruefung: r.pruefung } : prev);
            setAusBild(true);
            setDateien([]);
            setHinweis(
                `${r.seiten} Seite(n) ausgelesen. Bitte alle Werte gegen das Original prüfen und dann übernehmen.`,
            );
        } catch (e) {
            setError(e instanceof Error ? e.message : "Auslesen fehlgeschlagen");
        } finally {
            setAnalysiere(false);
        }
    }

    async function handleUebernehmen() {
        setSpeichere(true);
        setError(null);
        try {
            const s = await uebernehmePreFragebogen(id, { fragebogen: kopf, beteiligungen, auszahlungen });
            setStand(s);
            setKopf(s.fragebogen ?? {});
            setBeteiligungen(s.beteiligungen);
            setAuszahlungen(s.auszahlungen);
            setAusBild(false);
            setHinweis("Angaben übernommen. Der Streitwert wurde neu berechnet.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
        } finally {
            setSpeichere(false);
        }
    }

    function JaNein({ label, wert, onChange }: {
        label: string; wert: boolean | null | undefined;
        onChange: (v: boolean | null) => void;
    }) {
        return (
            <div className="flex items-center justify-between gap-3 py-1.5 border-b border-neutral-100 last:border-0">
                <span className="text-sm text-neutral-700">{label}</span>
                <div className="flex gap-1 shrink-0">
                    {([["ja", true], ["nein", false], ["offen", null]] as const).map(([text, v]) => (
                        <button
                            key={text}
                            type="button"
                            onClick={() => onChange(v)}
                            className={`text-xs px-2 py-0.5 rounded-md border transition-colors ${
                                wert === v
                                    ? "bg-neutral-900 text-white border-neutral-900"
                                    : "border-neutral-300 text-neutral-500 hover:bg-neutral-50"
                            }`}
                        >
                            {text}
                        </button>
                    ))}
                </div>
            </div>
        );
    }

    if (loading) {
        return <div className="flex items-center justify-center h-64"><Loader2 className="w-6 h-6 animate-spin text-neutral-400" /></div>;
    }
    if (!matter) {
        return <div className="max-w-3xl mx-auto px-4 py-8"><p className="text-red-600">{error ?? "Akte nicht gefunden"}</p></div>;
    }

    const sw = stand?.streitwert;
    const pruefung = stand?.pruefung;

    return (
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-5">
            <div>
                <button
                    onClick={() => router.push(`/mandate/${id}`)}
                    className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-4"
                >
                    <ArrowLeft className="w-4 h-4" /> Zur Akte
                </button>
                <h1 className="text-xl font-semibold flex items-center gap-2">
                    <LineChart className="w-5 h-5" /> PRE-Fragebogen
                </h1>
                <p className="text-sm text-neutral-500 mt-0.5">
                    {matter.aktenzeichen && <span className="font-mono">{matter.aktenzeichen} · </span>}
                    {matter.bezeichnung}
                </p>
            </div>

            {error && (
                <div className="flex items-start gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
                </div>
            )}
            {hinweis && (
                <div className="flex items-start gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {hinweis}
                </div>
            )}

            {/* ===== Upload ===== */}
            <div className="border border-violet-200 bg-violet-50/30 rounded-xl p-5">
                <h2 className="font-medium text-sm mb-1">Ausgefüllten Fragebogen auslesen</h2>
                <p className="text-xs text-neutral-500 mb-3">
                    Scan oder Foto der Rücksendung — auch handschriftlich. Zusätzliche Anlagen
                    (Zeichnungserklärung, Versicherungsschein) können mit hochgeladen werden.
                </p>

                <label className="inline-flex items-center gap-2 border border-violet-300 bg-white rounded-lg px-3 py-1.5 text-sm text-violet-700 hover:bg-violet-50 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> Dateien wählen (PDF, JPG, PNG)
                    <input
                        type="file"
                        multiple
                        accept="application/pdf,image/jpeg,image/png,image/tiff,image/webp"
                        className="hidden"
                        onChange={(e) => {
                            setDateien((p) => [...p, ...Array.from(e.target.files ?? [])]);
                            e.target.value = "";
                        }}
                    />
                </label>

                {dateien.length > 0 && (
                    <div className="mt-2 space-y-1">
                        {dateien.map((f, i) => (
                            <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-neutral-200">
                                <span className="truncate">{f.name}</span>
                                <button onClick={() => setDateien((p) => p.filter((_, j) => j !== i))}>
                                    <X className="w-3 h-3 text-neutral-400 hover:text-neutral-700" />
                                </button>
                            </div>
                        ))}
                        <button
                            onClick={() => void handleAnalyse()}
                            disabled={analysiere}
                            className="mt-2 bg-violet-600 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-violet-700 disabled:opacity-50 flex items-center gap-2"
                        >
                            {analysiere && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Auslesen
                        </button>
                    </div>
                )}

                {ausBild && (
                    <p className="text-xs text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 mt-3">
                        Aus einer handschriftlichen Vorlage gelesen. Beträge, Vertrags- und
                        Versicherungsscheinnummern bitte Zeichen für Zeichen gegen das Original prüfen —
                        sie bestimmen den Streitwert und damit die Gebühren.
                    </p>
                )}
            </div>

            {/* ===== Streitwert ===== */}
            {sw && (
                <div className={`border rounded-xl p-5 ${sw.belastbar ? "border-green-200 bg-green-50/40" : "border-amber-200 bg-amber-50/40"}`}>
                    <h2 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Calculator className="w-4 h-4" /> Streitwert
                    </h2>
                    <table className="text-sm w-full max-w-sm">
                        <tbody>
                            <tr><td className="py-0.5 text-neutral-600">Zeichnungssumme</td><td className="text-right font-mono">{euro(sw.zeichnungssummeGesamt)}</td></tr>
                            <tr><td className="py-0.5 text-neutral-600">+ Agio</td><td className="text-right font-mono">{euro(sw.agioGesamt)}</td></tr>
                            <tr><td className="py-0.5 text-neutral-600">− Auszahlungen</td><td className="text-right font-mono">{euro(sw.auszahlungenGesamt)}</td></tr>
                            <tr className="border-t border-neutral-300">
                                <td className="py-1 font-semibold">Streitwert</td>
                                <td className="text-right font-mono font-semibold">{euro(sw.streitwert)}</td>
                            </tr>
                        </tbody>
                    </table>

                    {!sw.belastbar && (
                        <p className="text-xs font-medium text-amber-900 mt-3">
                            Vorläufig — nicht ohne Klärung für Rechnungen verwenden.
                        </p>
                    )}
                    {sw.hinweise.length > 0 && (
                        <ul className="text-xs text-neutral-600 list-disc list-inside mt-1.5 space-y-0.5">
                            {sw.hinweise.map((h, i) => <li key={i}>{h}</li>)}
                        </ul>
                    )}
                    {sw.belastbar && (
                        <button
                            onClick={() => router.push(`/mandate/${id}/rvg`)}
                            className="text-xs text-neutral-600 hover:text-neutral-900 underline underline-offset-2 mt-3"
                        >
                            Gebühren mit diesem Streitwert berechnen
                        </button>
                    )}
                </div>
            )}

            {/* ===== Prüfung ===== */}
            {pruefung && (pruefung.luecken.length > 0 || pruefung.widersprueche.length > 0) && (
                <div className="border border-neutral-200 rounded-xl p-5">
                    <h2 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600" /> Rücklaufprüfung
                    </h2>
                    {pruefung.widersprueche.length > 0 && (
                        <div className="mb-3">
                            <p className="text-xs font-semibold text-red-700 mb-1">Widersprüchliche Angaben</p>
                            <ul className="text-sm text-red-700 list-disc list-inside space-y-0.5">
                                {pruefung.widersprueche.map((w, i) => <li key={i}>{w}</li>)}
                            </ul>
                        </div>
                    )}
                    {pruefung.luecken.length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-neutral-600 mb-1">
                                Fehlt noch ({pruefung.luecken.length}) — Grundlage für die Nachfrage beim Mandanten
                            </p>
                            <ul className="text-sm text-neutral-700 list-disc list-inside space-y-0.5">
                                {pruefung.luecken.map((l, i) => <li key={i}>{l}</li>)}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* ===== Beteiligungen ===== */}
            <div className="border border-neutral-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-sm">Beteiligungen</h2>
                    <button
                        onClick={() => setBeteiligungen((p) => [...p, { ...LEERE_BETEILIGUNG }])}
                        className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1 hover:bg-neutral-50 flex items-center gap-1 text-neutral-600"
                    >
                        <Plus className="w-3 h-3" /> Hinzufügen
                    </button>
                </div>

                {beteiligungen.length === 0 ? (
                    <p className="text-sm text-neutral-400">Noch keine Beteiligung erfasst.</p>
                ) : (
                    <div className="space-y-3">
                        {beteiligungen.map((b, i) => (
                            <div key={i} className="grid grid-cols-12 gap-2 items-end">
                                <div className="col-span-4">
                                    {i === 0 && <label className="block text-[10px] text-neutral-400 mb-0.5">Bezeichnung</label>}
                                    <input
                                        type="text" placeholder="Pro Real Europa 10"
                                        value={String(b.bezeichnung ?? "")}
                                        onChange={(e) => setBeteiligungen((p) => p.map((x, j) => j === i ? { ...x, bezeichnung: e.target.value } : x))}
                                        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm"
                                    />
                                </div>
                                <div className="col-span-3">
                                    {i === 0 && <label className="block text-[10px] text-neutral-400 mb-0.5">Vertragsnummer</label>}
                                    <input
                                        type="text"
                                        value={String(b.vertragsnummer ?? "")}
                                        onChange={(e) => setBeteiligungen((p) => p.map((x, j) => j === i ? { ...x, vertragsnummer: e.target.value } : x))}
                                        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm font-mono"
                                    />
                                </div>
                                <div className="col-span-2">
                                    {i === 0 && <label className="block text-[10px] text-neutral-400 mb-0.5">Zeichnung €</label>}
                                    <input
                                        type="text" inputMode="decimal"
                                        value={String(b.zeichnungssumme ?? "")}
                                        onChange={(e) => setBeteiligungen((p) => p.map((x, j) => j === i ? { ...x, zeichnungssumme: e.target.value } : x))}
                                        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm font-mono text-right"
                                    />
                                </div>
                                <div className="col-span-2">
                                    {i === 0 && <label className="block text-[10px] text-neutral-400 mb-0.5">Agio €</label>}
                                    <input
                                        type="text" inputMode="decimal"
                                        value={String(b.agio ?? "")}
                                        onChange={(e) => setBeteiligungen((p) => p.map((x, j) => j === i ? { ...x, agio: e.target.value } : x))}
                                        className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm font-mono text-right"
                                    />
                                </div>
                                <div className="col-span-1 pb-1.5">
                                    <button onClick={() => setBeteiligungen((p) => p.filter((_, j) => j !== i))}>
                                        <X className="w-4 h-4 text-neutral-400 hover:text-red-600" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ===== Auszahlungen ===== */}
            <div className="border border-neutral-200 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-medium text-sm">Erhaltene Auszahlungen</h2>
                    <button
                        onClick={() => setAuszahlungen((p) => [...p, { betrag: "", datum: "" }])}
                        className="text-xs border border-neutral-200 rounded-lg px-2.5 py-1 hover:bg-neutral-50 flex items-center gap-1 text-neutral-600"
                    >
                        <Plus className="w-3 h-3" /> Hinzufügen
                    </button>
                </div>

                {auszahlungen.length === 0 && (
                    <p className="text-sm text-neutral-400 mb-2">Keine Auszahlung erfasst.</p>
                )}
                <div className="space-y-2">
                    {auszahlungen.map((a, i) => (
                        <div key={i} className="flex gap-2 items-center">
                            <input
                                type="text" inputMode="decimal" placeholder="Betrag"
                                value={String(a.betrag ?? "")}
                                onChange={(e) => setAuszahlungen((p) => p.map((x, j) => j === i ? { ...x, betrag: e.target.value } : x))}
                                className="w-32 border border-neutral-300 rounded-lg px-2 py-1.5 text-sm font-mono text-right"
                            />
                            <input
                                type="date"
                                value={a.datum ?? ""}
                                onChange={(e) => setAuszahlungen((p) => p.map((x, j) => j === i ? { ...x, datum: e.target.value } : x))}
                                className="border border-neutral-300 rounded-lg px-2 py-1.5 text-sm"
                            />
                            <button onClick={() => setAuszahlungen((p) => p.filter((_, j) => j !== i))}>
                                <X className="w-4 h-4 text-neutral-400 hover:text-red-600" />
                            </button>
                        </div>
                    ))}
                </div>

                <label className="flex items-center gap-2 text-sm mt-3 pt-3 border-t border-neutral-100 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={kopf.auszahlungen_vollstaendig === true}
                        onChange={(e) => setKopf((k) => ({ ...k, auszahlungen_vollstaendig: e.target.checked }))}
                    />
                    Die Auszahlungen sind vollständig erfasst
                </label>
                <p className="text-[10px] text-neutral-500 mt-1">
                    Solange dieser Haken fehlt, gilt der Streitwert als vorläufig. Der Fragebogen
                    verweist häufig nur auf eine Anlage.
                </p>
            </div>

            {/* ===== Angaben und Anlagen ===== */}
            <div className="border border-neutral-200 rounded-xl p-5">
                <h2 className="font-medium text-sm mb-2">Angaben und Anlagen</h2>
                <JaNein label="Zeichnungserklärung beigefügt" wert={kopf.zeichnungserklaerung_beigefuegt}
                    onChange={(v) => setKopf((k) => ({ ...k, zeichnungserklaerung_beigefuegt: v }))} />
                <JaNein label="Vermögensanlagen-Informationsblatt (Seite 1) beigefügt" wert={kopf.vib_beigefuegt}
                    onChange={(v) => setKopf((k) => ({ ...k, vib_beigefuegt: v }))} />
                <JaNein label="Prospekt gelesen" wert={kopf.prospekt_gelesen}
                    onChange={(v) => setKopf((k) => ({ ...k, prospekt_gelesen: v }))} />
                <JaNein label="Prospekt nicht gelesen, aber vom Berater erläutert" wert={kopf.prospekt_durchgegangen}
                    onChange={(v) => setKopf((k) => ({ ...k, prospekt_durchgegangen: v }))} />
                <JaNein label="Kopie des Versicherungsscheins beigefügt" wert={kopf.rsv_kopie_beigefuegt}
                    onChange={(v) => setKopf((k) => ({ ...k, rsv_kopie_beigefuegt: v }))} />
                <JaNein label="Ansprüche bereits anderweitig geltend gemacht" wert={kopf.anderweitig_geltend_gemacht}
                    onChange={(v) => setKopf((k) => ({ ...k, anderweitig_geltend_gemacht: v }))} />
                <JaNein label="Ansprüche wegen anderer Anlage bei der One Group" wert={kopf.andere_anlage_one_group}
                    onChange={(v) => setKopf((k) => ({ ...k, andere_anlage_one_group: v }))} />
                <JaNein label="Ansprüche wegen sonstiger Vermögensanlage" wert={kopf.andere_anlage_sonst}
                    onChange={(v) => setKopf((k) => ({ ...k, andere_anlage_sonst: v }))} />

                <div className="grid grid-cols-2 gap-3 mt-4">
                    <div>
                        <label className="block text-[10px] text-neutral-400 mb-0.5">Prospekt erhalten am</label>
                        <input type="date" value={kopf.prospekt_erhalten_am ?? ""}
                            onChange={(e) => setKopf((k) => ({ ...k, prospekt_erhalten_am: e.target.value }))}
                            className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                        <label className="block text-[10px] text-neutral-400 mb-0.5">Rechtsschutz abgeschlossen am</label>
                        <input type="date" value={kopf.rsv_abgeschlossen_am ?? ""}
                            onChange={(e) => setKopf((k) => ({ ...k, rsv_abgeschlossen_am: e.target.value }))}
                            className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                    <div className="col-span-2">
                        <label className="block text-[10px] text-neutral-400 mb-0.5">Versicherungsnehmer (falls abweichend)</label>
                        <input type="text" value={kopf.rsv_versicherungsnehmer ?? ""}
                            onChange={(e) => setKopf((k) => ({ ...k, rsv_versicherungsnehmer: e.target.value }))}
                            className="w-full border border-neutral-300 rounded-lg px-2 py-1.5 text-sm" />
                    </div>
                </div>
                <p className="text-[10px] text-neutral-500 mt-2">
                    Versicherer und Versicherungsscheinnummer stehen im Aufnahmebogen und werden von
                    dort übernommen.
                </p>
            </div>

            <button
                onClick={() => void handleUebernehmen()}
                disabled={speichere}
                className="bg-neutral-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 flex items-center gap-2"
            >
                {speichere && <Loader2 className="w-4 h-4 animate-spin" />}
                Geprüfte Angaben übernehmen
            </button>
        </div>
    );
}
