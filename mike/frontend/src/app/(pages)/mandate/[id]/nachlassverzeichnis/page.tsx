"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, Loader2, Plus, Trash2, Upload, FileText,
    Send, Download, AlertTriangle, CheckCircle2,
    Building2, Home, TrendingUp, Shield, Package,
    CreditCard, BarChart3, Mail, X, Eye, Pencil, FileDown, Truck,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Kategorie = "konto_depot" | "immobilie" | "beteiligung" | "versicherung" | "sonstiges";
type SchreibenTyp = "ermittlung_bank" | "ermittlung_versicherung" | "ermittlung_depot" | "ermittlung_grundbuch" | "kuendigung_versicherung" | "kuendigung_abo" | "kuendigung_kfz" | "kuendigung_sonstiges";
type SchreibenStatus = "ENTWURF" | "FREIGEGEBEN" | "VERSANDT";

type Position = {
    id: string; kategorie: Kategorie; bezeichnung: string; inhaber?: string;
    geschaetzter_wert?: number; notizen?: string;
    bank_name?: string; iban?: string; konto_nr?: string;
    adresse?: string; grundbuch_band_blatt?: string;
    gesellschaft_name?: string; rechtsform?: string; handelsregister_nr?: string; anteil_prozent?: number;
    versicherung_art?: string; versicherung_nr?: string; versicherung_anbieter?: string; praemie_monatlich?: number; ablaufleistung?: number;
    gegenstand_typ?: string; gegenstand_beschreibung?: string; standort?: string;
    erstellt_am: string;
};

type Schreiben = {
    id: string; schreiben_typ: SchreibenTyp; empfaenger_name: string;
    betreff?: string; entwurf_text: string; status: SchreibenStatus; erstellt_am: string;
};

type KontoVorschlag = {
    kategorie: string; bezeichnung: string; bank_name?: string | null;
    iban?: string | null; inhaber?: string | null;
    geschaetzter_wert?: number | null; notizen?: string | null;
    _ist_konto_vorschlag: true;
};

type GrundbuchErgebnis = {
    grundbuchamt?: string; grundbuch_blatt?: string; gemarkung?: string;
    flur_flurstueck?: string; grundstuecksgroesse_qm?: number;
    nutzungsart?: string; lage_adresse?: string;
    eigentuemer?: { name: string; anteil?: string }[];
    abteilung_ii?: { lasten?: { bezeichnung: string; berechtigter?: string }[]; hinweis?: string };
    abteilung_iii?: { grundschulden?: { betrag_eur: number; glaeubiger?: string; zinssatz_pct?: number; status?: string }[]; gesamtbelastung_eur?: number; hinweis?: string };
    besonderheiten?: string | null;
    zusammenfassung?: string;
};

type ImmobilienVorschlag = {
    kategorie: string; bezeichnung: string; adresse?: string | null;
    grundbuch_amt?: string | null; grundbuch_band_blatt?: string | null;
    grundstuecksflaeche?: number | null; nutzungsart?: string | null; notizen?: string | null;
};

type HrErgebnis = {
    firma?: string; rechtsform?: string; registergericht?: string; registernummer?: string;
    geschaeftsanschrift?: string; geschaeftszweck?: string; stammkapital_eur?: number;
    beteiligung_erblasser?: { anteil_pct?: number; anteil_beschreibung?: string; nennwert_eur?: number; art?: string } | null;
    alle_gesellschafter?: { name: string; anteil_pct?: number; funktion?: string }[];
    geschaeftsfuehrer_vorstand?: { name: string; funktion?: string }[];
    eintragungsdatum?: string; letzte_aenderung?: string; status?: string;
    besonderheiten?: string | null; zusammenfassung?: string;
};

type BeteiligungVorschlag = {
    kategorie: string; bezeichnung: string; gesellschaft_name?: string | null;
    rechtsform?: string | null; handelsregister_nr?: string | null;
    handelsregister_gericht?: string | null; anteil_prozent?: number | null;
    nennwert?: number | null; notizen?: string | null;
};

type Kontoanalyse = {
    id: string; dateiname: string; analysiert_am: string;
    ki_ergebnis?: {
        konto_identifikation?: { bank?: string; iban_gekuerzt?: string; kontoinhaber?: string; konto_typ?: string };
        kontostand_todestag?: { betrag_eur?: number; datum?: string; hinweis?: string };
        zeitraum?: { von: string; bis: string };
        bank?: string; iban_gekuerzt?: string;
        regelmaessige_eingaenge?: { bezeichnung: string; betrag_monatlich: number; absender?: string }[];
        regelmaessige_ausgaenge?: { bezeichnung: string; betrag: number; empfaenger?: string; typ?: string }[];
        auffaellige_transaktionen?: { datum: string; betrag: number; empfaenger?: string; auffaelligkeitsgrund?: string }[];
        erkannte_vermoegenswerte?: { typ: string; anbieter?: string; hinweis?: string }[];
        zusammenfassung?: string;
    };
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

const EUR = (n?: number) => n != null ? n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : "—";

const KATEGORIEN: { value: Kategorie; label: string; icon: React.ReactNode; color: string }[] = [
    { value: "konto_depot", label: "Konten & Depots", icon: <CreditCard className="w-4 h-4" />, color: "bg-blue-100 text-blue-700" },
    { value: "immobilie", label: "Immobilien", icon: <Home className="w-4 h-4" />, color: "bg-green-100 text-green-700" },
    { value: "beteiligung", label: "Beteiligungen", icon: <Building2 className="w-4 h-4" />, color: "bg-purple-100 text-purple-700" },
    { value: "versicherung", label: "Versicherungen", icon: <Shield className="w-4 h-4" />, color: "bg-orange-100 text-orange-700" },
    { value: "sonstiges", label: "Sonstiges", icon: <Package className="w-4 h-4" />, color: "bg-neutral-100 text-neutral-600" },
];

const STATUS_COLORS: Record<SchreibenStatus, string> = {
    ENTWURF: "bg-amber-100 text-amber-700",
    FREIGEGEBEN: "bg-blue-100 text-blue-700",
    VERSANDT: "bg-green-100 text-green-700",
};

// ---------------------------------------------------------------------------
// Neue Position — Formular
// ---------------------------------------------------------------------------

// Position → String-Formular (für den Bearbeiten-Modus)
function positionToForm(p: Position): Record<string, string> {
    const f: Record<string, string> = {};
    const keys: (keyof Position)[] = [
        "bezeichnung", "inhaber", "notizen", "bank_name", "iban", "konto_nr",
        "adresse", "grundbuch_band_blatt", "gesellschaft_name", "rechtsform",
        "handelsregister_nr", "versicherung_art", "versicherung_anbieter",
        "versicherung_nr", "gegenstand_typ", "standort",
    ];
    for (const k of keys) {
        const v = p[k];
        if (v != null) f[k] = String(v);
    }
    if (p.geschaetzter_wert != null) f.geschaetzter_wert = String(p.geschaetzter_wert);
    if (p.anteil_prozent != null) f.anteil_prozent = String(p.anteil_prozent);
    if (p.praemie_monatlich != null) f.praemie_monatlich = String(p.praemie_monatlich);
    return f;
}

function NeuePositionForm({ matterId, existing, onSaved, onCancel }: {
    matterId: string; existing?: Position; onSaved: () => void; onCancel: () => void;
}) {
    const [kat, setKat] = useState<Kategorie>(existing?.kategorie ?? "konto_depot");
    const [form, setForm] = useState<Record<string, string>>(existing ? positionToForm(existing) : {});
    const [saving, setSaving] = useState(false);
    const [err, setErr] = useState<string | null>(null);
    const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
        setForm((prev) => ({ ...prev, [k]: e.target.value }));

    async function save() {
        if (!form.bezeichnung?.trim()) { setErr("Bezeichnung ist erforderlich"); return; }
        setSaving(true); setErr(null);
        try {
            const headers = await authHeaders();
            const body = {
                kategorie: kat, ...form,
                geschaetzter_wert: form.geschaetzter_wert ? parseFloat(form.geschaetzter_wert) : null,
                anteil_prozent: form.anteil_prozent ? parseFloat(form.anteil_prozent) : undefined,
                praemie_monatlich: form.praemie_monatlich ? parseFloat(form.praemie_monatlich) : undefined,
            };
            const url = existing
                ? `${API_BASE}/matters/${matterId}/nachlassverzeichnis/positionen/${existing.id}`
                : `${API_BASE}/matters/${matterId}/nachlassverzeichnis/positionen`;
            const r = await fetch(url, {
                method: existing ? "PATCH" : "POST",
                headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
            });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            onSaved();
        } catch (e) { setErr(e instanceof Error ? e.message : "Fehler"); }
        finally { setSaving(false); }
    }

    const inp = (label: string, key: string, placeholder?: string, type = "text") => (
        <div>
            <label className="block text-xs font-medium text-neutral-600 mb-1">{label}</label>
            <input type={type} value={form[key] ?? ""} onChange={set(key)} placeholder={placeholder}
                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
        </div>
    );

    return (
        <div className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-sm">{existing ? "Position bearbeiten" : "Neue Position"}</h3>
                <button onClick={onCancel} className="text-neutral-400 hover:text-neutral-700"><X className="w-4 h-4" /></button>
            </div>

            <div>
                <label className="block text-xs font-medium text-neutral-600 mb-2">Kategorie</label>
                <div className="grid grid-cols-5 gap-2">
                    {KATEGORIEN.map((k) => (
                        <button key={k.value} onClick={() => setKat(k.value)}
                            className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 text-xs font-medium transition-colors ${kat === k.value ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                            {k.icon}<span className="text-center leading-tight">{k.label.replace(" & ", "\n& ")}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {inp("Bezeichnung *", "bezeichnung", "z.B. Girokonto Sparkasse München")}
                {inp("Inhaber", "inhaber", "Name des Erblassers")}
                {inp("Geschätzter Wert (€)", "geschaetzter_wert", "z.B. 25000", "number")}
                {kat === "konto_depot" && inp("Bank", "bank_name", "z.B. Sparkasse München")}
                {kat === "konto_depot" && inp("IBAN (letzte 4 Ziffern)", "iban", "****1234")}
                {kat === "immobilie" && inp("Adresse", "adresse", "Straße, PLZ Ort")}
                {kat === "immobilie" && inp("Grundbuch Band/Blatt", "grundbuch_band_blatt", "z.B. Band 12, Blatt 345")}
                {kat === "beteiligung" && inp("Gesellschaft", "gesellschaft_name", "z.B. Muster GmbH")}
                {kat === "beteiligung" && inp("Rechtsform", "rechtsform", "GmbH, KG, GbR...")}
                {kat === "beteiligung" && inp("HR-Nummer", "handelsregister_nr", "HRB 12345")}
                {kat === "beteiligung" && inp("Anteil (%)", "anteil_prozent", "z.B. 25", "number")}
                {kat === "versicherung" && inp("Versicherungsart", "versicherung_art", "Lebensversicherung, Unfallversicherung...")}
                {kat === "versicherung" && inp("Anbieter", "versicherung_anbieter", "z.B. Allianz")}
                {kat === "versicherung" && inp("Vertragsnummer", "versicherung_nr", "VSN-12345")}
                {kat === "versicherung" && inp("Monatliche Prämie (€)", "praemie_monatlich", "z.B. 89", "number")}
                {kat === "sonstiges" && inp("Art des Gegenstands", "gegenstand_typ", "Kunst, KFZ, Schmuck, Schließfach...")}
                {kat === "sonstiges" && inp("Standort", "standort", "Wo befindet sich der Gegenstand")}
            </div>

            <div>
                <label className="block text-xs font-medium text-neutral-600 mb-1">Notizen</label>
                <textarea value={form.notizen ?? ""} onChange={set("notizen")} rows={2} placeholder="Weitere Hinweise..."
                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-400" />
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}
            <div className="flex gap-2 justify-end">
                <button onClick={onCancel} className="px-4 py-2 text-sm text-neutral-600 hover:text-neutral-800">Abbrechen</button>
                <button onClick={save} disabled={saving}
                    className="px-4 py-2 bg-neutral-900 text-white text-sm rounded-lg hover:bg-neutral-700 disabled:opacity-40 flex items-center gap-2">
                    {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Speichern
                </button>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function NachlassverzeichnisPage() {
    const { id: matterId } = useParams() as { id: string };
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"vermögen" | "kontoauszug" | "ermittlung" | "kündigung" | "entwurf">("vermögen");
    const [data, setData] = useState<{ positionen: Position[]; schreiben: Schreiben[]; erblasser?: string; sterbedatum?: string | null; zusammenfassung?: { geschaetzter_gesamtwert: number; kategorien: Record<string, number> } } | null>(null);
    const [analysen, setAnalysen] = useState<Kontoanalyse[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showNeuePosition, setShowNeuePosition] = useState(false);
    const [editPos, setEditPos] = useState<Position | null>(null);

    // Zentral gepflegter Todestag des Erblassers (Default für alle Datumsfelder)
    const [zentralerSterbetag, setZentralerSterbetag] = useState("");
    const [sterbetagSaving, setSterbetagSaving] = useState(false);

    // Dokument-Analyse — Typ-Auswahl
    const [dokTyp, setDokTyp] = useState<"kontoauszug" | "grundbuch" | "handelsregister">("kontoauszug");

    // Kontoauszug
    const [kDateien, setKDateien] = useState<File[]>([]);
    const [kTodestag, setKTodestag] = useState("");
    const [kLoading, setKLoading] = useState(false);
    const [kError, setKError] = useState<string | null>(null);
    const [kResult, setKResult] = useState<Kontoanalyse | null>(null);
    const [kVorschlag, setKVorschlag] = useState<KontoVorschlag | null>(null);
    const [kVorschlagSaving, setKVorschlagSaving] = useState(false);
    const [kVorschlagSaved, setKVorschlagSaved] = useState(false);
    const kFileRef = useRef<HTMLInputElement>(null);

    // Grundbuch
    const [gbDateien, setGbDateien] = useState<File[]>([]);
    const [gbLoading, setGbLoading] = useState(false);
    const [gbError, setGbError] = useState<string | null>(null);
    const [gbErgebnis, setGbErgebnis] = useState<GrundbuchErgebnis | null>(null);
    const [gbVorschlag, setGbVorschlag] = useState<ImmobilienVorschlag | null>(null);
    const [gbWert, setGbWert] = useState("");
    const [gbVorschlagSaving, setGbVorschlagSaving] = useState(false);
    const [gbVorschlagSaved, setGbVorschlagSaved] = useState(false);
    const gbFileRef = useRef<HTMLInputElement>(null);

    // Handelsregister
    const [hrDateien, setHrDateien] = useState<File[]>([]);
    const [hrLoading, setHrLoading] = useState(false);
    const [hrError, setHrError] = useState<string | null>(null);
    const [hrErgebnis, setHrErgebnis] = useState<HrErgebnis | null>(null);
    const [hrVorschlag, setHrVorschlag] = useState<BeteiligungVorschlag | null>(null);
    const [hrVorschlagSaving, setHrVorschlagSaving] = useState(false);
    const [hrVorschlagSaved, setHrVorschlagSaved] = useState(false);
    const hrFileRef = useRef<HTMLInputElement>(null);

    // Ermittlung
    const [eTyp, setETyp] = useState("ermittlung_bank");
    const [eEmpfaenger, setEEmpfaenger] = useState("");
    const [eAdresse, setEAdresse] = useState("");
    const [eSterbetag, setESterbetag] = useState("");
    const [eLoading, setELoading] = useState(false);
    const [eError, setEError] = useState<string | null>(null);

    // Kündigung
    const [kuEmpfaenger, setKuEmpfaenger] = useState("");
    const [kuArt, setKuArt] = useState("");
    const [kuNr, setKuNr] = useState("");
    const [kuSterbetag, setKuSterbetag] = useState("");
    const [kuLoading, setKuLoading] = useState(false);
    const [kuError, setKuError] = useState<string | null>(null);

    // Entwurf
    const [entwurf, setEntwurf] = useState<{ entwurf: string; gesamtwert: number; positionen_anzahl: number } | null>(null);
    const [entwurfLoading, setEntwurfLoading] = useState(false);

    // Selected Schreiben
    const [selectedSchreiben, setSelectedSchreiben] = useState<Schreiben | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const headers = await authHeaders();
            const [nlvRes, analysenRes] = await Promise.all([
                fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis`, { headers }),
                fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/kontoanalysen`, { headers }),
            ]);
            if (nlvRes.ok) {
                const json = await nlvRes.json() as { sterbedatum?: string | null };
                setData(json as never);
                if (json.sterbedatum) {
                    setZentralerSterbetag(json.sterbedatum);
                    setKTodestag((v) => v || json.sterbedatum!);
                    setESterbetag((v) => v || json.sterbedatum!);
                    setKuSterbetag((v) => v || json.sterbedatum!);
                }
            }
            if (analysenRes.ok) setAnalysen(await analysenRes.json());
        } catch { setError("Daten konnten nicht geladen werden"); }
        finally { setLoading(false); }
    }, [matterId]);

    useEffect(() => { void load(); }, [load]);

    async function deletePosition(posId: string) {
        if (!confirm("Position löschen?")) return;
        const headers = await authHeaders();
        await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/positionen/${posId}`, { method: "DELETE", headers });
        void load();
    }

    async function reloadAnalysen() {
        const headers = await authHeaders();
        const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/kontoanalysen`, { headers });
        if (r.ok) setAnalysen(await r.json());
    }

    async function uploadKontoauszug() {
        if (!kDateien.length) return;
        setKLoading(true); setKError(null); setKResult(null); setKVorschlag(null); setKVorschlagSaved(false);
        try {
            const headers = await authHeaders();
            const form = new FormData();
            for (const f of kDateien) form.append("datei", f);
            if (kTodestag) form.append("todestag", kTodestag);
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/kontoauszug/analysieren`, { method: "POST", headers, body: form });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            const result = await r.json() as { analyse: Kontoanalyse; konto_vorschlag?: KontoVorschlag };
            setKResult(result.analyse);
            setKVorschlag(result.konto_vorschlag ?? null);
            setKDateien([]);
            void reloadAnalysen();
        } catch (e) { setKError(e instanceof Error ? e.message : "Fehler"); }
        finally { setKLoading(false); }
    }

    async function kontoVorschlagUebernehmen() {
        if (!kVorschlag) return;
        setKVorschlagSaving(true);
        try {
            const headers = await authHeaders();
            const body = {
                kategorie: kVorschlag.kategorie,
                bezeichnung: kVorschlag.bezeichnung,
                bank_name: kVorschlag.bank_name ?? undefined,
                iban: kVorschlag.iban ?? undefined,
                inhaber: kVorschlag.inhaber ?? undefined,
                geschaetzter_wert: kVorschlag.geschaetzter_wert ?? undefined,
                notizen: kVorschlag.notizen ?? undefined,
            };
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/positionen`, {
                method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
            });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            setKVorschlagSaved(true);
            void load();
        } catch (e) { setKError(e instanceof Error ? e.message : "Fehler beim Übernehmen"); }
        finally { setKVorschlagSaving(false); }
    }

    async function uploadGrundbuch() {
        if (!gbDateien.length) return;
        setGbLoading(true); setGbError(null); setGbErgebnis(null); setGbVorschlag(null); setGbVorschlagSaved(false);
        try {
            const headers = await authHeaders();
            const form = new FormData();
            for (const f of gbDateien) form.append("datei", f);
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/grundbuch/analysieren`, { method: "POST", headers, body: form });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            const result = await r.json() as { ki_ergebnis: GrundbuchErgebnis; immobilien_vorschlag?: ImmobilienVorschlag };
            setGbErgebnis(result.ki_ergebnis);
            setGbVorschlag(result.immobilien_vorschlag ?? null);
            setGbDateien([]);
        } catch (e) { setGbError(e instanceof Error ? e.message : "Fehler"); }
        finally { setGbLoading(false); }
    }

    async function grundbuchVorschlagUebernehmen() {
        if (!gbVorschlag) return;
        setGbVorschlagSaving(true);
        try {
            const headers = await authHeaders();
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/positionen`, {
                method: "POST", headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ ...gbVorschlag, geschaetzter_wert: gbWert ? parseFloat(gbWert) : undefined }),
            });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            setGbVorschlagSaved(true);
            setGbWert("");
            void load();
        } catch (e) { setGbError(e instanceof Error ? e.message : "Fehler beim Übernehmen"); }
        finally { setGbVorschlagSaving(false); }
    }

    async function uploadHandelsregister() {
        if (!hrDateien.length) return;
        setHrLoading(true); setHrError(null); setHrErgebnis(null); setHrVorschlag(null); setHrVorschlagSaved(false);
        try {
            const headers = await authHeaders();
            const form = new FormData();
            for (const f of hrDateien) form.append("datei", f);
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/handelsregister/analysieren`, { method: "POST", headers, body: form });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            const result = await r.json() as { ki_ergebnis: HrErgebnis; beteiligung_vorschlag?: BeteiligungVorschlag };
            setHrErgebnis(result.ki_ergebnis);
            setHrVorschlag(result.beteiligung_vorschlag ?? null);
            setHrDateien([]);
        } catch (e) { setHrError(e instanceof Error ? e.message : "Fehler"); }
        finally { setHrLoading(false); }
    }

    async function hrVorschlagUebernehmen() {
        if (!hrVorschlag) return;
        setHrVorschlagSaving(true);
        try {
            const headers = await authHeaders();
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/positionen`, {
                method: "POST", headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ ...hrVorschlag }),
            });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            setHrVorschlagSaved(true);
            void load();
        } catch (e) { setHrError(e instanceof Error ? e.message : "Fehler beim Übernehmen"); }
        finally { setHrVorschlagSaving(false); }
    }

    async function createErmittlung() {
        if (!eEmpfaenger.trim()) { setEError("Empfänger erforderlich"); return; }
        setELoading(true); setEError(null);
        try {
            const headers = await authHeaders();
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/schreiben/ermittlung`, {
                method: "POST", headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ typ: eTyp, empfaenger_name: eEmpfaenger, empfaenger_adresse: eAdresse, sterbetag: eSterbetag }),
            });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            const s = await r.json() as Schreiben;
            setSelectedSchreiben(s);
            setEEmpfaenger(""); setEAdresse(""); setESterbetag("");
            void load();
        } catch (e) { setEError(e instanceof Error ? e.message : "Fehler"); }
        finally { setELoading(false); }
    }

    async function createKuendigung() {
        if (!kuEmpfaenger.trim() || !kuArt.trim()) { setKuError("Empfänger und Vertragsart erforderlich"); return; }
        setKuLoading(true); setKuError(null);
        try {
            const headers = await authHeaders();
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/schreiben/kuendigung`, {
                method: "POST", headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ empfaenger_name: kuEmpfaenger, vertragsart: kuArt, vertragsnummer: kuNr, sterbetag: kuSterbetag }),
            });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Fehler");
            const s = await r.json() as Schreiben;
            setSelectedSchreiben(s);
            setKuEmpfaenger(""); setKuArt(""); setKuNr(""); setKuSterbetag("");
            void load();
        } catch (e) { setKuError(e instanceof Error ? e.message : "Fehler"); }
        finally { setKuLoading(false); }
    }

    async function loadEntwurf() {
        setEntwurfLoading(true);
        try {
            const headers = await authHeaders();
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/entwurf`, { headers });
            if (!r.ok) throw new Error("Fehler beim Laden");
            setEntwurf(await r.json());
        } catch { /* ignore */ }
        finally { setEntwurfLoading(false); }
    }

    async function freigeben(schreibenId: string) {
        const headers = await authHeaders();
        const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/schreiben/${schreibenId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ status: "FREIGEGEBEN" }),
        });
        if (r.ok) {
            void load();
            if (selectedSchreiben?.id === schreibenId) setSelectedSchreiben(await r.json());
        } else {
            const detail = ((await r.json().catch(() => ({}))) as { detail?: string }).detail
                ?? "Freigabe fehlgeschlagen";
            alert(detail);
        }
    }

    async function alsVersandtMarkieren(schreibenId: string) {
        const headers = await authHeaders();
        const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/schreiben/${schreibenId}`, {
            method: "PATCH", headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify({ status: "VERSANDT" }),
        });
        if (r.ok) {
            void load();
            if (selectedSchreiben?.id === schreibenId) setSelectedSchreiben(await r.json());
        } else {
            const detail = ((await r.json().catch(() => ({}))) as { detail?: string }).detail
                ?? "Aktion fehlgeschlagen";
            alert(detail);
        }
    }

    async function saveSterbetag(value: string) {
        setZentralerSterbetag(value);
        // Leere Datumsfelder mit dem zentralen Wert befüllen
        setKTodestag((v) => v || value);
        setESterbetag((v) => v || value);
        setKuSterbetag((v) => v || value);
        setSterbetagSaving(true);
        try {
            const headers = await authHeaders();
            await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/sterbedatum`, {
                method: "PATCH", headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ sterbedatum: value || null }),
            });
        } catch { /* ignore — UI behält den Wert lokal */ }
        finally { setSterbetagSaving(false); }
    }

    async function downloadDocx(titel: string, text: string) {
        try {
            const headers = await authHeaders();
            const r = await fetch(`${API_BASE}/matters/${matterId}/nachlassverzeichnis/export/docx`, {
                method: "POST", headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ titel, text }),
            });
            if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { detail?: string }).detail ?? "Export fehlgeschlagen");
            const blob = await r.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `${titel.replace(/[^a-zA-Z0-9 äöüÄÖÜß_-]/g, "").trim().slice(0, 80) || "Nachlassverzeichnis"}.docx`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } catch (e) { alert(e instanceof Error ? e.message : "Export fehlgeschlagen"); }
    }

    if (loading) return (
        <div className="flex items-center justify-center h-full">
            <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
        </div>
    );

    if (error) return (
        <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
                <AlertTriangle className="w-8 h-8 text-red-400 mx-auto" />
                <p className="text-sm text-neutral-600">{error}</p>
            </div>
        </div>
    );

    const positionen = data?.positionen ?? [];
    const schreiben = data?.schreiben ?? [];
    const gesamtwert = data?.zusammenfassung?.geschaetzter_gesamtwert ?? 0;

    const TABS = [
        { key: "vermögen", label: "Vermögensverzeichnis", icon: <BarChart3 className="w-3.5 h-3.5" /> },
        { key: "kontoauszug", label: "Dokument-Analyse", icon: <TrendingUp className="w-3.5 h-3.5" /> },
        { key: "ermittlung", label: "Ermittlungsschreiben", icon: <Mail className="w-3.5 h-3.5" /> },
        { key: "kündigung", label: "Kündigungen", icon: <X className="w-3.5 h-3.5" /> },
        { key: "entwurf", label: "Gesamtentwurf", icon: <FileText className="w-3.5 h-3.5" /> },
    ] as const;

    return (
        <div className="flex flex-col h-full max-h-[calc(100dvh-0px)]">
            {/* Header */}
            <div className="px-6 py-4 border-b border-neutral-200 bg-white shrink-0">
                <div className="flex items-center gap-3 mb-3">
                    <button onClick={() => router.push(`/mandate/${matterId}`)} className="text-neutral-400 hover:text-neutral-700">
                        <ArrowLeft className="w-4 h-4" />
                    </button>
                    <div>
                        <h1 className="text-lg font-semibold">Nachlassverzeichnis</h1>
                        <p className="text-xs text-neutral-500">Vermögensaufnahme · Ermittlungsschreiben · Kündigungen</p>
                    </div>
                    <div className="ml-auto flex items-center gap-3">
                        <label className="flex items-center gap-2 text-xs text-neutral-500">
                            <span className="whitespace-nowrap">Todestag</span>
                            <input type="date" value={zentralerSterbetag}
                                onChange={(e) => void saveSterbetag(e.target.value)}
                                className="border border-neutral-300 rounded-lg px-2 py-1 text-sm text-neutral-800 focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                            {sterbetagSaving && <Loader2 className="w-3 h-3 animate-spin text-neutral-400" />}
                        </label>
                        {gesamtwert > 0 && (
                            <div className="bg-neutral-900 text-white px-3 py-1.5 rounded-lg text-sm font-mono font-semibold whitespace-nowrap">
                                ca. {EUR(gesamtwert)}
                            </div>
                        )}
                    </div>
                </div>
                <div className="flex gap-1 overflow-x-auto">
                    {TABS.map((t) => (
                        <button key={t.key} onClick={() => setActiveTab(t.key as typeof activeTab)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeTab === t.key ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}>
                            {t.icon}{t.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">

                {/* ── TAB: VERMÖGENSVERZEICHNIS ─────────────────────────────── */}
                {activeTab === "vermögen" && (
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold">Vermögenspositionen ({positionen.length})</h2>
                            <button onClick={() => setShowNeuePosition(true)} className="flex items-center gap-1.5 bg-neutral-900 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-neutral-700">
                                <Plus className="w-3.5 h-3.5" /> Position hinzufügen
                            </button>
                        </div>

                        {(showNeuePosition || editPos) && (
                            <NeuePositionForm matterId={matterId} existing={editPos ?? undefined}
                                onSaved={() => { setShowNeuePosition(false); setEditPos(null); void load(); }}
                                onCancel={() => { setShowNeuePosition(false); setEditPos(null); }} />
                        )}

                        {positionen.length === 0 && !showNeuePosition && (
                            <div className="text-center py-12 text-neutral-400">
                                <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
                                <p className="text-sm">Noch keine Vermögenspositionen erfasst.</p>
                                <p className="text-xs mt-1">Klicken Sie auf „Position hinzufügen“ oder laden Sie Kontoauszüge hoch.</p>
                            </div>
                        )}

                        {KATEGORIEN.map(({ value, label, icon, color }) => {
                            const pos = positionen.filter((p) => p.kategorie === value);
                            if (!pos.length) return null;
                            const summe = pos.reduce((s, p) => s + (p.geschaetzter_wert ?? 0), 0);
                            return (
                                <div key={value}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>{icon}{label}</span>
                                        <span className="text-xs text-neutral-400">{pos.length} Positionen</span>
                                        {summe > 0 && <span className="ml-auto text-sm font-mono font-semibold text-neutral-700">ca. {EUR(summe)}</span>}
                                    </div>
                                    <div className="space-y-2">
                                        {pos.map((p) => (
                                            <div key={p.id} className="bg-white border border-neutral-200 rounded-xl px-4 py-3 flex items-center gap-3 group">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-sm">{p.bezeichnung}</span>
                                                        {p.geschaetzter_wert && <span className="ml-auto font-mono text-sm text-neutral-700">{EUR(p.geschaetzter_wert)}</span>}
                                                    </div>
                                                    <div className="text-xs text-neutral-400 mt-0.5 space-x-2">
                                                        {p.bank_name && <span>{p.bank_name}</span>}
                                                        {p.iban && <span>IBAN: {p.iban}</span>}
                                                        {p.adresse && <span>{p.adresse}</span>}
                                                        {p.gesellschaft_name && <span>{p.gesellschaft_name}{p.rechtsform ? ` (${p.rechtsform})` : ""}</span>}
                                                        {p.versicherung_anbieter && <span>{p.versicherung_anbieter}</span>}
                                                        {p.versicherung_art && <span>{p.versicherung_art}</span>}
                                                        {p.gegenstand_typ && <span>{p.gegenstand_typ}</span>}
                                                        {p.notizen && <span className="italic">{p.notizen}</span>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button onClick={() => { setShowNeuePosition(false); setEditPos(p); }}
                                                        title="Bearbeiten"
                                                        className="text-neutral-300 hover:text-neutral-700">
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button onClick={() => void deletePosition(p.id)}
                                                        title="Löschen"
                                                        className="text-neutral-300 hover:text-red-500">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── TAB: KONTOAUSZUG-ANALYSE ─────────────────────────────── */}
                {activeTab === "kontoauszug" && (
                    <div className="max-w-3xl mx-auto space-y-6">

                        {/* Dokument-Typ-Auswahl */}
                        <div className="flex flex-wrap gap-2">
                            {([
                                { key: "kontoauszug",      label: "Konto- / Depotauszug",  icon: <CreditCard className="w-3.5 h-3.5" /> },
                                { key: "grundbuch",        label: "Grundbuchauszug",        icon: <Home className="w-3.5 h-3.5" /> },
                                { key: "handelsregister",  label: "HR-Auszug",              icon: <Building2 className="w-3.5 h-3.5" /> },
                            ] as const).map((t) => (
                                <button key={t.key} onClick={() => setDokTyp(t.key)}
                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 text-sm font-medium transition-colors ${dokTyp === t.key ? "border-neutral-900 bg-neutral-900 text-white" : "border-neutral-200 text-neutral-500 hover:border-neutral-400"}`}>
                                    {t.icon}{t.label}
                                </button>
                            ))}
                        </div>

                        {/* ── GRUNDBUCH ────────────────────────────────────── */}
                        {dokTyp === "grundbuch" && (
                            <div className="space-y-5">
                                <div>
                                    <h2 className="font-semibold mb-1">Grundbuchauszug analysieren</h2>
                                    <p className="text-xs text-neutral-500 mb-4">
                                        KI liest Grundbuchamt, Blatt, Flurstück, Eigentümer, Lasten (Abt. II) und Grundschulden (Abt. III) aus dem Auszug.
                                    </p>
                                    <div className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center cursor-pointer hover:border-neutral-400 transition-colors"
                                        onClick={() => gbFileRef.current?.click()}>
                                        <Home className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
                                        <p className="text-sm text-neutral-500">PDF-Grundbuchauszug hochladen</p>
                                        <p className="text-xs text-neutral-400 mt-1">Bitte als Text-PDF (kein Scan), bis zu 3 Dateien</p>
                                        <input ref={gbFileRef} type="file" multiple accept=".pdf,.docx,.doc" className="hidden"
                                            onChange={(e) => setGbDateien(Array.from(e.target.files ?? []).slice(0, 3))} />
                                    </div>
                                    {gbDateien.length > 0 && (
                                        <div className="mt-3 space-y-1">
                                            {gbDateien.map((f, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                                                    <FileText className="w-3.5 h-3.5 text-neutral-400" />
                                                    <span className="flex-1 truncate">{f.name}</span>
                                                    <button onClick={() => setGbDateien((d) => d.filter((_, j) => j !== i))}>×</button>
                                                </div>
                                            ))}
                                            <button onClick={() => void uploadGrundbuch()} disabled={gbLoading}
                                                className="mt-2 w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center justify-center gap-2">
                                                {gbLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird analysiert…</> : <><Home className="w-4 h-4" /> Grundbuch analysieren</>}
                                            </button>
                                        </div>
                                    )}
                                    {gbError && <p className="mt-2 text-sm text-red-600">{gbError}</p>}
                                </div>

                                {/* Ergebnis-Karte */}
                                {gbErgebnis && (
                                    <div className="space-y-4">
                                        {/* Immobilien-Vorschlag */}
                                        {gbVorschlag && (
                                            <div className="bg-green-50 border border-green-200 rounded-2xl p-5 space-y-3">
                                                <div>
                                                    <p className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-1">Erkannte Immobilie</p>
                                                    <p className="font-semibold text-neutral-900">{gbErgebnis.nutzungsart ?? "Grundstück / Immobilie"}</p>
                                                    {gbErgebnis.lage_adresse && <p className="text-sm text-neutral-600 mt-0.5">{gbErgebnis.lage_adresse}</p>}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    {gbErgebnis.grundbuchamt && <div><span className="text-neutral-400">Grundbuchamt</span><p className="font-medium">{gbErgebnis.grundbuchamt}</p></div>}
                                                    {gbErgebnis.grundbuch_blatt && <div><span className="text-neutral-400">Blatt</span><p className="font-medium">{gbErgebnis.grundbuch_blatt}</p></div>}
                                                    {gbErgebnis.gemarkung && <div><span className="text-neutral-400">Gemarkung</span><p className="font-medium">{gbErgebnis.gemarkung}</p></div>}
                                                    {gbErgebnis.flur_flurstueck && <div><span className="text-neutral-400">Flur / Flurstück</span><p className="font-medium">{gbErgebnis.flur_flurstueck}</p></div>}
                                                    {gbErgebnis.grundstuecksgroesse_qm != null && <div><span className="text-neutral-400">Fläche</span><p className="font-medium">{gbErgebnis.grundstuecksgroesse_qm.toLocaleString("de-DE")} m²</p></div>}
                                                </div>
                                                {/* Abt. III — Grundschulden */}
                                                {(gbErgebnis.abteilung_iii?.gesamtbelastung_eur ?? 0) > 0 && (
                                                    <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-2 text-xs">
                                                        <span className="font-semibold text-red-700">Grundschulden / Hypotheken (Abt. III): </span>
                                                        <span className="font-mono text-red-700">
                                                            {gbErgebnis.abteilung_iii!.gesamtbelastung_eur!.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                                                        </span>
                                                        {gbErgebnis.abteilung_iii?.grundschulden?.map((g, i) => (
                                                            <div key={i} className="mt-1 text-neutral-500">{g.glaeubiger ?? "Unbekannt"}: {g.betrag_eur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}{g.status === "gelöscht" ? " (gelöscht)" : ""}</div>
                                                        ))}
                                                    </div>
                                                )}
                                                {/* Abt. II — Lasten */}
                                                {(gbErgebnis.abteilung_ii?.lasten?.length ?? 0) > 0 && (
                                                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs">
                                                        <span className="font-semibold text-amber-700">Lasten & Beschränkungen (Abt. II): </span>
                                                        {gbErgebnis.abteilung_ii!.lasten!.map((l, i) => (
                                                            <span key={i} className="text-neutral-600"> {l.bezeichnung}{l.berechtigter ? ` (${l.berechtigter})` : ""}{i < gbErgebnis.abteilung_ii!.lasten!.length - 1 ? " · " : ""}</span>
                                                        ))}
                                                    </div>
                                                )}
                                                {gbErgebnis.besonderheiten && (
                                                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 text-xs text-indigo-800">
                                                        <span className="font-semibold">Besonderheiten: </span>{gbErgebnis.besonderheiten}
                                                    </div>
                                                )}
                                                {gbErgebnis.zusammenfassung && <p className="text-sm text-neutral-600 bg-neutral-50 rounded-xl px-3 py-2">{gbErgebnis.zusammenfassung}</p>}
                                                <div>
                                                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                                                        Geschätzter Verkehrswert (€) <span className="text-neutral-400 font-normal">— optional, noch zu ermitteln</span>
                                                    </label>
                                                    <input type="number" value={gbWert} onChange={(e) => setGbWert(e.target.value)}
                                                        placeholder="z.B. 450000"
                                                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                                                </div>
                                                <button
                                                    onClick={() => void grundbuchVorschlagUebernehmen()}
                                                    disabled={gbVorschlagSaving || gbVorschlagSaved}
                                                    className="w-full flex items-center justify-center gap-2 bg-green-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                                                    {gbVorschlagSaved
                                                        ? <><CheckCircle2 className="w-4 h-4" /> Als Position gespeichert</>
                                                        : gbVorschlagSaving
                                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird gespeichert…</>
                                                        : <><Plus className="w-4 h-4" /> Als Immobilien-Position übernehmen</>}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── HANDELSREGISTER ──────────────────────────────── */}
                        {dokTyp === "handelsregister" && (
                            <div className="space-y-5">
                                <div>
                                    <h2 className="font-semibold mb-1">Handelsregisterauszug analysieren</h2>
                                    <p className="text-xs text-neutral-500 mb-4">
                                        KI liest Firma, Rechtsform, Registernummer, Stammkapital, Gesellschafterstruktur und Beteiligungsquote des Erblassers aus dem Auszug.
                                    </p>
                                    <div className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center cursor-pointer hover:border-neutral-400 transition-colors"
                                        onClick={() => hrFileRef.current?.click()}>
                                        <Building2 className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
                                        <p className="text-sm text-neutral-500">PDF-HR-Auszug hochladen</p>
                                        <p className="text-xs text-neutral-400 mt-1">Aus dem Unternehmensregister oder handelsregister.de, bis zu 3 Dateien</p>
                                        <input ref={hrFileRef} type="file" multiple accept=".pdf,.docx,.doc" className="hidden"
                                            onChange={(e) => setHrDateien(Array.from(e.target.files ?? []).slice(0, 3))} />
                                    </div>
                                    {hrDateien.length > 0 && (
                                        <div className="mt-3 space-y-1">
                                            {hrDateien.map((f, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                                                    <FileText className="w-3.5 h-3.5 text-neutral-400" />
                                                    <span className="flex-1 truncate">{f.name}</span>
                                                    <button onClick={() => setHrDateien((d) => d.filter((_, j) => j !== i))}>×</button>
                                                </div>
                                            ))}
                                            <button onClick={() => void uploadHandelsregister()} disabled={hrLoading}
                                                className="mt-2 w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center justify-center gap-2">
                                                {hrLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird analysiert…</> : <><Building2 className="w-4 h-4" /> HR-Auszug analysieren</>}
                                            </button>
                                        </div>
                                    )}
                                    {hrError && <p className="mt-2 text-sm text-red-600">{hrError}</p>}
                                </div>

                                {hrErgebnis && (
                                    <div className="space-y-4">
                                        {hrVorschlag && (
                                            <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 space-y-3">
                                                <div>
                                                    <p className="text-xs font-semibold text-purple-700 uppercase tracking-wide mb-1">Erkannte Beteiligung</p>
                                                    <p className="font-semibold text-neutral-900">{hrErgebnis.firma ?? "Gesellschaft"} {hrErgebnis.rechtsform ? `(${hrErgebnis.rechtsform})` : ""}</p>
                                                    {hrErgebnis.geschaeftsanschrift && <p className="text-sm text-neutral-500 mt-0.5">{hrErgebnis.geschaeftsanschrift}</p>}
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    {hrErgebnis.registergericht && <div><span className="text-neutral-400">Registergericht</span><p className="font-medium">{hrErgebnis.registergericht}</p></div>}
                                                    {hrErgebnis.registernummer && <div><span className="text-neutral-400">Registernummer</span><p className="font-medium font-mono">{hrErgebnis.registernummer}</p></div>}
                                                    {hrErgebnis.stammkapital_eur != null && <div><span className="text-neutral-400">Stammkapital</span><p className="font-medium">{hrErgebnis.stammkapital_eur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p></div>}
                                                    {hrErgebnis.status && <div><span className="text-neutral-400">Status</span><p className={`font-medium ${hrErgebnis.status !== "aktiv" ? "text-red-600" : "text-green-700"}`}>{hrErgebnis.status}</p></div>}
                                                </div>

                                                {/* Beteiligung des Erblassers */}
                                                {hrErgebnis.beteiligung_erblasser ? (
                                                    <div className="bg-purple-100 rounded-xl px-3 py-2.5 text-sm">
                                                        <p className="font-semibold text-purple-800 mb-0.5">Anteil des Erblassers</p>
                                                        <p className="text-purple-700">
                                                            {hrErgebnis.beteiligung_erblasser.anteil_pct != null && <span className="font-mono font-bold">{hrErgebnis.beteiligung_erblasser.anteil_pct} % </span>}
                                                            {hrErgebnis.beteiligung_erblasser.anteil_beschreibung && <span className="text-xs">· {hrErgebnis.beteiligung_erblasser.anteil_beschreibung}</span>}
                                                        </p>
                                                        {hrErgebnis.beteiligung_erblasser.nennwert_eur != null && (
                                                            <p className="text-xs text-purple-600 mt-0.5">Nennwert: {hrErgebnis.beteiligung_erblasser.nennwert_eur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 text-xs text-amber-700">
                                                        Beteiligung des Erblassers nicht eindeutig erkennbar — bitte manuell prüfen.
                                                    </div>
                                                )}

                                                {/* Geschäftsführer */}
                                                {(hrErgebnis.geschaeftsfuehrer_vorstand?.length ?? 0) > 0 && (
                                                    <div className="text-xs text-neutral-500">
                                                        <span className="font-medium text-neutral-600">Geschäftsführung: </span>
                                                        {hrErgebnis.geschaeftsfuehrer_vorstand!.map((g, i) => (
                                                            <span key={i}>{g.name}{g.funktion ? ` (${g.funktion})` : ""}{i < hrErgebnis.geschaeftsfuehrer_vorstand!.length - 1 ? " · " : ""}</span>
                                                        ))}
                                                    </div>
                                                )}

                                                {hrErgebnis.besonderheiten && (
                                                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-3 py-2 text-xs text-indigo-800">
                                                        <span className="font-semibold">Besonderheiten: </span>{hrErgebnis.besonderheiten}
                                                    </div>
                                                )}
                                                {hrErgebnis.zusammenfassung && <p className="text-sm text-neutral-600 bg-neutral-50 rounded-xl px-3 py-2">{hrErgebnis.zusammenfassung}</p>}

                                                <button
                                                    onClick={() => void hrVorschlagUebernehmen()}
                                                    disabled={hrVorschlagSaving || hrVorschlagSaved}
                                                    className="w-full flex items-center justify-center gap-2 bg-purple-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-purple-700 disabled:opacity-50">
                                                    {hrVorschlagSaved
                                                        ? <><CheckCircle2 className="w-4 h-4" /> Als Position gespeichert</>
                                                        : hrVorschlagSaving
                                                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird gespeichert…</>
                                                        : <><Plus className="w-4 h-4" /> Als Beteiligungsposition übernehmen</>}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── KONTOAUSZUG ──────────────────────────────────── */}
                        {dokTyp === "kontoauszug" && <div className="space-y-5">
                            <div>
                            <h2 className="font-semibold mb-1">Kontoauszug zum Todestag hochladen</h2>
                            <p className="text-xs text-neutral-500 mb-4">
                                KI ermittelt den Kontostand zum Todestag, erkennt Konto/Depot automatisch und identifiziert regelmäßige Buchungen und weitere Vermögenswerte.
                            </p>

                            {/* Todestag */}
                            <div className="mb-4">
                                <label className="block text-xs font-medium text-neutral-600 mb-1">
                                    Todestag <span className="text-neutral-400 font-normal">(empfohlen — für Kontostand-Ermittlung)</span>
                                </label>
                                <input
                                    type="date"
                                    value={kTodestag}
                                    onChange={(e) => setKTodestag(e.target.value)}
                                    className="border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                />
                            </div>

                            <div className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center cursor-pointer hover:border-neutral-400 transition-colors"
                                onClick={() => kFileRef.current?.click()}>
                                <Upload className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
                                <p className="text-sm text-neutral-500">PDF oder CSV, bis zu 5 Dateien</p>
                                <p className="text-xs text-neutral-400 mt-1">Kontoauszug möglichst nah am Todestag</p>
                                <input ref={kFileRef} type="file" multiple accept=".pdf,.csv" className="hidden"
                                    onChange={(e) => setKDateien(Array.from(e.target.files ?? []).slice(0, 5))} />
                            </div>
                            {kDateien.length > 0 && (
                                <div className="mt-3 space-y-1">
                                    {kDateien.map((f, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                                            <FileText className="w-3.5 h-3.5 text-neutral-400" />
                                            <span className="flex-1 truncate">{f.name}</span>
                                            <button onClick={() => setKDateien((d) => d.filter((_, j) => j !== i))}>×</button>
                                        </div>
                                    ))}
                                    <button onClick={uploadKontoauszug} disabled={kLoading}
                                        className="mt-2 w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center justify-center gap-2">
                                        {kLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird analysiert…</> : <><TrendingUp className="w-4 h-4" /> Analysieren</>}
                                    </button>
                                </div>
                            )}
                            {kError && <p className="mt-2 text-sm text-red-600">{kError}</p>}
                            </div>

                        {/* Kontostand-Karte + Als Position übernehmen */}
                        {kVorschlag && (() => {
                            const ki = kResult?.ki_ergebnis;
                            const ks = ki?.kontostand_todestag;
                            const kid = ki?.konto_identifikation;
                            return (
                                <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3">
                                    <div className="flex items-start justify-between gap-4">
                                        <div>
                                            <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Erkanntes Konto / Depot</p>
                                            <p className="font-semibold text-neutral-900">{kid?.konto_typ ?? "Konto"} · {kid?.bank ?? "Bank unbekannt"}</p>
                                            {kid?.iban_gekuerzt && <p className="text-xs text-neutral-500 mt-0.5">IBAN: {kid.iban_gekuerzt}</p>}
                                            {kid?.kontoinhaber && <p className="text-xs text-neutral-500">Inhaber: {kid.kontoinhaber}</p>}
                                        </div>
                                        {ks?.betrag_eur != null && (
                                            <div className="text-right shrink-0">
                                                <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Kontostand zum Todestag</p>
                                                <p className="text-2xl font-mono font-bold text-neutral-900">
                                                    {ks.betrag_eur.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                                                </p>
                                                {ks.datum && <p className="text-xs text-neutral-400 mt-0.5">Stand: {new Date(ks.datum).toLocaleDateString("de-DE")}</p>}
                                            </div>
                                        )}
                                    </div>
                                    {ks?.hinweis && <p className="text-xs text-blue-700 bg-blue-100 rounded-lg px-3 py-2">{ks.hinweis}</p>}
                                    <button
                                        onClick={() => void kontoVorschlagUebernehmen()}
                                        disabled={kVorschlagSaving || kVorschlagSaved}
                                        className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                                    >
                                        {kVorschlagSaved
                                            ? <><CheckCircle2 className="w-4 h-4" /> Als Position gespeichert</>
                                            : kVorschlagSaving
                                            ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird gespeichert…</>
                                            : <><Plus className="w-4 h-4" /> Als Vermögensposition übernehmen</>}
                                    </button>
                                </div>
                            );
                        })()}

                        {/* Ergebnis der letzten Analyse */}
                        {(kResult ?? analysen[0]) && (() => {
                            const a = kResult ?? analysen[0];
                            const ki = a.ki_ergebnis;
                            if (!ki) return (
                                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-4 flex gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                                    <div>
                                        <p className="text-sm font-medium text-amber-800">Analyse gespeichert — Ergebnis konnte nicht ausgelesen werden</p>
                                        <p className="text-xs text-amber-700 mt-1">
                                            Die KI-Antwort konnte nicht als strukturiertes Ergebnis verarbeitet werden.
                                            Mögliche Ursachen: Datei enthält keinen lesbaren Text, oder die KI-Antwort war unvollständig.
                                            Bitte laden Sie den Kontoauszug als Text-PDF hoch (kein Scan).
                                        </p>
                                    </div>
                                </div>
                            );
                            return (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-sm">Analyse: {a.dateiname}</h3>
                                        {ki.zeitraum && <span className="text-xs text-neutral-400">{ki.zeitraum.von} — {ki.zeitraum.bis}</span>}
                                    </div>
                                    {/* Konto-Identifikation */}
                                    {ki.konto_identifikation && (
                                        <div className="flex flex-wrap gap-3 text-xs bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3">
                                            {ki.konto_identifikation.konto_typ && <span className="font-semibold">{ki.konto_identifikation.konto_typ}</span>}
                                            {ki.konto_identifikation.bank && <span>· {ki.konto_identifikation.bank}</span>}
                                            {ki.konto_identifikation.iban_gekuerzt && <span className="font-mono text-neutral-500">IBAN: {ki.konto_identifikation.iban_gekuerzt}</span>}
                                            {ki.konto_identifikation.kontoinhaber && <span className="text-neutral-500">Inhaber: {ki.konto_identifikation.kontoinhaber}</span>}
                                        </div>
                                    )}
                                    {ki.zusammenfassung && <p className="text-sm text-neutral-600 bg-neutral-50 rounded-xl px-4 py-3">{ki.zusammenfassung}</p>}

                                    {(ki.regelmaessige_eingaenge?.length ?? 0) > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide mb-2">Regelmäßige Eingänge</h4>
                                            <div className="space-y-1">
                                                {ki.regelmaessige_eingaenge!.map((e, i) => (
                                                    <div key={i} className="flex items-center gap-3 bg-green-50 border border-green-100 rounded-lg px-3 py-2 text-sm">
                                                        <span className="flex-1">{e.bezeichnung}{e.absender ? ` · ${e.absender}` : ""}</span>
                                                        <span className="font-mono text-green-700 font-semibold">+{EUR(e.betrag_monatlich)}/Monat</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(ki.regelmaessige_ausgaenge?.length ?? 0) > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-2">Regelmäßige Ausgänge</h4>
                                            <div className="space-y-1">
                                                {ki.regelmaessige_ausgaenge!.map((e, i) => (
                                                    <div key={i} className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm">
                                                        <div className="flex-1">
                                                            <span>{e.bezeichnung}</span>
                                                            {e.empfaenger && <span className="text-neutral-400"> · {e.empfaenger}</span>}
                                                            {e.typ && e.typ !== "sonstiges" && <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full ${e.typ === "versicherung" ? "bg-orange-100 text-orange-700" : "bg-neutral-100 text-neutral-500"}`}>{e.typ}</span>}
                                                        </div>
                                                        <span className="font-mono text-red-600 font-semibold">{EUR(e.betrag)}/Monat</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(ki.auffaellige_transaktionen?.length ?? 0) > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">Auffällige Transaktionen</h4>
                                            <div className="space-y-1">
                                                {ki.auffaellige_transaktionen!.map((t, i) => (
                                                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-neutral-500 text-xs">{t.datum}</span>
                                                            <span className="flex-1">{t.empfaenger ?? "Unbekannt"}</span>
                                                            <span className="font-mono font-semibold">{EUR(t.betrag)}</span>
                                                        </div>
                                                        {t.auffaelligkeitsgrund && <p className="text-xs text-amber-700 mt-0.5">{t.auffaelligkeitsgrund}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {(ki.erkannte_vermoegenswerte?.length ?? 0) > 0 && (
                                        <div>
                                            <h4 className="text-xs font-semibold text-indigo-700 uppercase tracking-wide mb-2">Hinweise auf weitere Vermögenswerte</h4>
                                            <div className="space-y-1">
                                                {ki.erkannte_vermoegenswerte!.map((v, i) => (
                                                    <div key={i} className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 text-sm">
                                                        <span className="font-medium">{v.anbieter ?? v.typ}</span>
                                                        {v.hinweis && <p className="text-xs text-indigo-700 mt-0.5">{v.hinweis}</p>}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                        </div>}
                    </div>
                )}

                {/* ── TAB: ERMITTLUNGSSCHREIBEN ────────────────────────────── */}
                {activeTab === "ermittlung" && (
                    <div className="max-w-4xl mx-auto grid grid-cols-5 gap-6">
                        <div className="col-span-2 space-y-4">
                            <h2 className="font-semibold text-sm">Neues Ermittlungsschreiben</h2>
                            <div>
                                <label className="block text-xs font-medium text-neutral-600 mb-1">Typ</label>
                                <select value={eTyp} onChange={(e) => setETyp(e.target.value)}
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400">
                                    <option value="ermittlung_bank">Bank — Konten & Schließfach</option>
                                    <option value="ermittlung_depot">Depot — Wertpapiere</option>
                                    <option value="ermittlung_versicherung">Versicherung</option>
                                    <option value="ermittlung_grundbuch">Grundbuchamt</option>
                                </select>
                            </div>
                            {[["Empfänger *", eEmpfaenger, setEEmpfaenger, "z.B. Sparkasse München"], ["Adresse", eAdresse, setEAdresse, "Straße, PLZ Ort"], ["Sterbetag", eSterbetag, setESterbetag, ""]].map(([label, val, setter, ph]) => (
                                <div key={label as string}>
                                    <label className="block text-xs font-medium text-neutral-600 mb-1">{label as string}</label>
                                    <input type={label === "Sterbetag" ? "date" : "text"} value={val as string}
                                        onChange={(e) => (setter as (v: string) => void)(e.target.value)} placeholder={ph as string}
                                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                                </div>
                            ))}
                            {eError && <p className="text-sm text-red-600">{eError}</p>}
                            <button onClick={createErmittlung} disabled={eLoading}
                                className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center justify-center gap-2">
                                {eLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Schreiben erstellen
                            </button>
                        </div>

                        <div className="col-span-3">
                            {selectedSchreiben && selectedSchreiben.schreiben_typ.startsWith("ermittlung") ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-sm">{selectedSchreiben.betreff}</h3>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selectedSchreiben.status]}`}>{selectedSchreiben.status}</span>
                                    </div>
                                    <pre className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-xs whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">{selectedSchreiben.entwurf_text}</pre>
                                    <div className="flex gap-2">
                                        {selectedSchreiben.status === "ENTWURF" && (
                                            <button onClick={() => void freigeben(selectedSchreiben.id)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Freigeben
                                            </button>
                                        )}
                                        {selectedSchreiben.status === "FREIGEGEBEN" && (
                                            <button onClick={() => void alsVersandtMarkieren(selectedSchreiben.id)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                                                <Truck className="w-3.5 h-3.5" /> Als versandt markieren
                                            </button>
                                        )}
                                        <button onClick={() => void downloadDocx(selectedSchreiben.betreff ?? "Schreiben", selectedSchreiben.entwurf_text)}
                                            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 rounded-lg text-xs font-medium hover:bg-neutral-50">
                                            <FileDown className="w-3.5 h-3.5" /> Word
                                        </button>
                                        <button onClick={() => { void navigator.clipboard.writeText(selectedSchreiben.entwurf_text); }}
                                            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 rounded-lg text-xs font-medium hover:bg-neutral-50">
                                            <Download className="w-3.5 h-3.5" /> Kopieren
                                        </button>
                                        <button onClick={() => setSelectedSchreiben(null)} className="ml-auto text-xs text-neutral-400 hover:text-neutral-700">Schließen</button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <h3 className="font-semibold text-sm mb-3">Vorhandene Schreiben ({schreiben.filter((s) => s.schreiben_typ.startsWith("ermittlung")).length})</h3>
                                    <div className="space-y-2">
                                        {schreiben.filter((s) => s.schreiben_typ.startsWith("ermittlung")).map((s) => (
                                            <button key={s.id} onClick={() => setSelectedSchreiben(s)}
                                                className="w-full text-left border border-neutral-200 rounded-xl px-4 py-3 hover:bg-neutral-50 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <Mail className="w-3.5 h-3.5 text-neutral-400" />
                                                    <span className="text-sm font-medium flex-1 truncate">{s.empfaenger_name}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                                                </div>
                                                {s.betreff && <p className="text-xs text-neutral-400 mt-0.5 truncate">{s.betreff}</p>}
                                            </button>
                                        ))}
                                        {!schreiben.filter((s) => s.schreiben_typ.startsWith("ermittlung")).length && (
                                            <p className="text-sm text-neutral-400 text-center py-8">Noch keine Ermittlungsschreiben erstellt.</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TAB: KÜNDIGUNGEN ─────────────────────────────────────── */}
                {activeTab === "kündigung" && (
                    <div className="max-w-4xl mx-auto grid grid-cols-5 gap-6">
                        <div className="col-span-2 space-y-4">
                            <h2 className="font-semibold text-sm">Neues Kündigungsschreiben</h2>
                            {[
                                ["Empfänger / Vertragspartner *", kuEmpfaenger, setKuEmpfaenger, "z.B. Allianz Lebensversicherung", "text"],
                                ["Vertragsart *", kuArt, setKuArt, "z.B. Lebensversicherung, Netflix-Abo, KFZ-Versicherung", "text"],
                                ["Vertragsnummer", kuNr, setKuNr, "z.B. VSN-12345", "text"],
                                ["Sterbetag", kuSterbetag, setKuSterbetag, "", "date"],
                            ].map(([label, val, setter, ph, type]) => (
                                <div key={label as string}>
                                    <label className="block text-xs font-medium text-neutral-600 mb-1">{label as string}</label>
                                    <input type={type as string} value={val as string}
                                        onChange={(e) => (setter as (v: string) => void)(e.target.value)} placeholder={ph as string}
                                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                                </div>
                            ))}
                            {kuError && <p className="text-sm text-red-600">{kuError}</p>}
                            <button onClick={createKuendigung} disabled={kuLoading}
                                className="w-full bg-neutral-900 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center justify-center gap-2">
                                {kuLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />} Kündigung erstellen
                            </button>
                        </div>

                        <div className="col-span-3">
                            {selectedSchreiben && selectedSchreiben.schreiben_typ.startsWith("kuendigung") ? (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold text-sm">{selectedSchreiben.betreff}</h3>
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[selectedSchreiben.status]}`}>{selectedSchreiben.status}</span>
                                    </div>
                                    <pre className="bg-neutral-50 border border-neutral-200 rounded-xl p-4 text-xs whitespace-pre-wrap leading-relaxed max-h-[50vh] overflow-y-auto">{selectedSchreiben.entwurf_text}</pre>
                                    <div className="flex gap-2">
                                        {selectedSchreiben.status === "ENTWURF" && (
                                            <button onClick={() => void freigeben(selectedSchreiben.id)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700">
                                                <CheckCircle2 className="w-3.5 h-3.5" /> Freigeben
                                            </button>
                                        )}
                                        {selectedSchreiben.status === "FREIGEGEBEN" && (
                                            <button onClick={() => void alsVersandtMarkieren(selectedSchreiben.id)}
                                                className="flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
                                                <Truck className="w-3.5 h-3.5" /> Als versandt markieren
                                            </button>
                                        )}
                                        <button onClick={() => void downloadDocx(selectedSchreiben.betreff ?? "Schreiben", selectedSchreiben.entwurf_text)}
                                            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 rounded-lg text-xs font-medium hover:bg-neutral-50">
                                            <FileDown className="w-3.5 h-3.5" /> Word
                                        </button>
                                        <button onClick={() => { void navigator.clipboard.writeText(selectedSchreiben.entwurf_text); }}
                                            className="flex items-center gap-1.5 px-3 py-2 border border-neutral-300 rounded-lg text-xs font-medium hover:bg-neutral-50">
                                            <Download className="w-3.5 h-3.5" /> Kopieren
                                        </button>
                                        <button onClick={() => setSelectedSchreiben(null)} className="ml-auto text-xs text-neutral-400 hover:text-neutral-700">Schließen</button>
                                    </div>
                                </div>
                            ) : (
                                <div>
                                    <h3 className="font-semibold text-sm mb-3">Vorhandene Kündigungen ({schreiben.filter((s) => s.schreiben_typ.startsWith("kuendigung")).length})</h3>
                                    <div className="space-y-2">
                                        {schreiben.filter((s) => s.schreiben_typ.startsWith("kuendigung")).map((s) => (
                                            <button key={s.id} onClick={() => setSelectedSchreiben(s)}
                                                className="w-full text-left border border-neutral-200 rounded-xl px-4 py-3 hover:bg-neutral-50 transition-colors">
                                                <div className="flex items-center gap-2">
                                                    <X className="w-3.5 h-3.5 text-neutral-400" />
                                                    <span className="text-sm font-medium flex-1 truncate">{s.empfaenger_name}</span>
                                                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[s.status]}`}>{s.status}</span>
                                                </div>
                                                {s.betreff && <p className="text-xs text-neutral-400 mt-0.5 truncate">{s.betreff}</p>}
                                            </button>
                                        ))}
                                        {!schreiben.filter((s) => s.schreiben_typ.startsWith("kuendigung")).length && (
                                            <p className="text-sm text-neutral-400 text-center py-8">Noch keine Kündigungen erstellt.</p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── TAB: GESAMTENTWURF ───────────────────────────────────── */}
                {activeTab === "entwurf" && (
                    <div className="max-w-3xl mx-auto space-y-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <h2 className="font-semibold">Nachlassverzeichnis-Entwurf</h2>
                                <p className="text-xs text-neutral-500 mt-0.5">KI-generierte Gesamtübersicht · {positionen.length} Positionen · ca. {EUR(gesamtwert)}</p>
                            </div>
                            <button onClick={loadEntwurf} disabled={entwurfLoading || positionen.length === 0}
                                className="flex items-center gap-2 bg-neutral-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-neutral-700 disabled:opacity-40">
                                {entwurfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                                {entwurfLoading ? "Wird erstellt…" : "Entwurf generieren"}
                            </button>
                        </div>

                        {positionen.length === 0 && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2 text-sm text-amber-800">
                                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                Bitte zuerst Vermögenspositionen erfassen, bevor ein Entwurf erstellt werden kann.
                            </div>
                        )}

                        {entwurf && (
                            <div className="space-y-3">
                                <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                                        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">Entwurf</span>
                                        <div className="flex items-center gap-3">
                                            <button onClick={() => void downloadDocx(`Nachlassverzeichnis ${data?.erblasser ?? ""}`.trim(), entwurf.entwurf)}
                                                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-700">
                                                <FileDown className="w-3.5 h-3.5" /> Word
                                            </button>
                                            <button onClick={() => { void navigator.clipboard.writeText(entwurf.entwurf); }}
                                                className="text-xs text-neutral-400 hover:text-neutral-700">Kopieren</button>
                                        </div>
                                    </div>
                                    <pre className="p-4 text-xs whitespace-pre-wrap text-neutral-800 leading-relaxed max-h-[65vh] overflow-y-auto">{entwurf.entwurf}</pre>
                                </div>
                                <div className="text-xs text-neutral-400 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 flex gap-2">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                                    Entwurf — Werte sind Schätzwerte. Anwaltliche Prüfung, Sachverständige und behördliche Auskünfte vor Einreichung erforderlich.
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
