"use client";

import { useState, useRef, useEffect } from "react";
import {
    Send, Loader2, Bot, User, RotateCcw, Upload, FileText,
    MessageSquare, Scale, ChevronDown, ChevronUp, AlertTriangle,
    Gavel, Search, ClipboardList,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

type Message = { id: string; role: "user" | "assistant"; content: string; adversarial?: { entwurf: string; kritik: string } };
type Aufgabe = "sachstand" | "relation" | "schriftsatz";

async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

const AUFGABEN: { value: Aufgabe; label: string; icon: React.ReactNode; beschreibung: string }[] = [
    { value: "sachstand", label: "Sachstandsanalyse", icon: <Search className="w-4 h-4" />, beschreibung: "Systematische Aufbereitung von Schriftsätzen und Dokumenten aus Mandantensicht" },
    { value: "relation", label: "Relation", icon: <ClipboardList className="w-4 h-4" />, beschreibung: "Vollständige Relation vor mündlicher Verhandlung (Tatbestand, Beweis, Entscheidungsvorschlag)" },
    { value: "schriftsatz", label: "Schriftsatzentwurf", icon: <FileText className="w-4 h-4" />, beschreibung: "Adversarial: Builder → Attacker → Synthesizer (3 Calls, robusteres Ergebnis)" },
];

const THEMEN = [
    { icon: <Scale className="w-5 h-5" />, titel: "PRE9 Sachstand", frage: "Erstelle eine strukturierte Sachstandsanalyse für ein PRE9-Mandat: Prospekthaftung nach § 20 VermAnlG, Beklagte Steurer und Thies, Verjährungsfrist 31.12.2026." },
    { icon: <Gavel className="w-5 h-5" />, titel: "Klageerwiderung analysieren", frage: "Analysiere eine typische Klageerwiderung der Gegenseite in einem Prospekthaftungsfall: Verjährungseinrede, fehlende Kausalität, Mitverschulden — wie argumentieren wir dagegen?" },
    { icon: <ClipboardList className="w-5 h-5" />, titel: "Relation vorbereiten", frage: "Welche Punkte sind vor einer mündlichen Verhandlung in einem Kapitalmarkt-Schadensersatzprozess besonders zu beachten und wie strukturiere ich eine Relation?" },
    { icon: <FileText className="w-5 h-5" />, titel: "Replik entwerfen", frage: "Entwirf eine Replik auf eine Klageerwiderung in einem VermAnlG-Schadensersatzfall — konzentriert auf die Widerlegung der Verjährungseinrede und Kausalitätsargumente." },
];

function AdversarialPanel({ adversarial }: { adversarial: { entwurf: string; kritik: string } }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="mt-3 border border-amber-200 rounded-xl overflow-hidden">
            <button
                onClick={() => setOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-amber-50 text-amber-800 text-xs font-medium hover:bg-amber-100 transition-colors"
            >
                <span className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Adversarial-Protokoll (Builder → Gegner-Kritik → überarbeiteter Entwurf)
                </span>
                {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
            {open && (
                <div className="p-4 space-y-4 text-xs bg-white">
                    <div>
                        <div className="font-semibold text-neutral-500 mb-1 uppercase tracking-wide text-[10px]">Roh-Entwurf (Builder)</div>
                        <pre className="whitespace-pre-wrap text-neutral-700 bg-neutral-50 rounded-lg p-3 text-xs leading-relaxed max-h-48 overflow-y-auto">{adversarial.entwurf}</pre>
                    </div>
                    <div>
                        <div className="font-semibold text-red-500 mb-1 uppercase tracking-wide text-[10px]">Gegner-Kritik (Attacker)</div>
                        <pre className="whitespace-pre-wrap text-red-800 bg-red-50 rounded-lg p-3 text-xs leading-relaxed max-h-48 overflow-y-auto">{adversarial.kritik}</pre>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function LitigationPage() {
    const [tab, setTab] = useState<"chat" | "analyse">("chat");

    // Chat State
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Analyse State
    const [aufgabe, setAufgabe] = useState<Aufgabe>("sachstand");
    const [frage, setFrage] = useState("");
    const [dateien, setDateien] = useState<File[]>([]);
    const [analyseLoading, setAnalyseLoading] = useState(false);
    const [analyseResult, setAnalyseResult] = useState<{ response: string; adversarial?: { entwurf: string; kritik: string } } | null>(null);
    const [analyseError, setAnalyseError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    async function sendChat(text: string) {
        if (!text.trim() || loading) return;
        const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setLoading(true);
        setError(null);
        try {
            const headers = await authHeaders();
            const res = await fetch(`${API_BASE}/litigation/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })) }),
            });
            if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? `Fehler ${res.status}`);
            const data = await res.json() as { response: string };
            setMessages((prev) => [...prev, { id: Date.now() + "a", role: "assistant", content: data.response }]);
        } catch (e) { setError(e instanceof Error ? e.message : "Fehler"); }
        finally { setLoading(false); }
    }

    async function runAnalyse() {
        if (!frage.trim()) return;
        setAnalyseLoading(true);
        setAnalyseError(null);
        setAnalyseResult(null);
        try {
            const headers = await authHeaders();
            const form = new FormData();
            form.append("frage", frage.trim());
            form.append("aufgabe", aufgabe);
            for (const f of dateien) form.append("datei", f);
            const res = await fetch(`${API_BASE}/litigation/analysieren`, { method: "POST", headers, body: form });
            if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { detail?: string }).detail ?? `Fehler ${res.status}`);
            const data = await res.json() as { response: string; adversarial?: { entwurf: string; kritik: string } };
            setAnalyseResult(data);
        } catch (e) { setAnalyseError(e instanceof Error ? e.message : "Fehler"); }
        finally { setAnalyseLoading(false); }
    }

    return (
        <div className="flex flex-col h-full max-h-[calc(100dvh-0px)]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-white shrink-0">
                <div>
                    <h1 className="text-xl font-semibold">Litigation Lawyer</h1>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        Sachstand · Relation · Schriftsatz · Hengeler-Müller-Niveau · BKL intern
                    </p>
                </div>
                <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
                    {(["chat", "analyse"] as const).map((t) => (
                        <button key={t} onClick={() => setTab(t)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === t ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}>
                            {t === "chat" ? <MessageSquare className="w-3.5 h-3.5" /> : <Upload className="w-3.5 h-3.5" />}
                            {t === "chat" ? "Chat" : "Analyse"}
                        </button>
                    ))}
                </div>
            </div>

            {tab === "chat" ? (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="max-w-2xl mx-auto">
                                <p className="text-center text-neutral-400 text-sm mb-6">Frage stellen oder Thema wählen:</p>
                                <div className="grid grid-cols-2 gap-3">
                                    {THEMEN.map((t) => (
                                        <button key={t.titel} onClick={() => void sendChat(t.frage)}
                                            className="text-left border border-neutral-200 rounded-xl p-4 hover:bg-neutral-50 hover:border-neutral-300 transition-colors">
                                            <div className="flex items-center gap-2 mb-1 text-neutral-700">
                                                {t.icon}<span className="font-medium text-sm">{t.titel}</span>
                                            </div>
                                            <p className="text-xs text-neutral-400 line-clamp-2">{t.frage}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                        {messages.map((m) => (
                            <div key={m.id} className={`flex gap-3 max-w-3xl ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${m.role === "user" ? "bg-neutral-800" : "bg-indigo-100 border border-indigo-200"}`}>
                                    {m.role === "user" ? <User className="w-3.5 h-3.5 text-white" /> : <Gavel className="w-3.5 h-3.5 text-indigo-600" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-neutral-800 text-white rounded-tr-sm" : "bg-neutral-100 text-neutral-900 rounded-tl-sm"}`}>
                                        {m.content}
                                    </div>
                                    {m.adversarial && <AdversarialPanel adversarial={m.adversarial} />}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex gap-3 max-w-3xl mr-auto">
                                <div className="w-7 h-7 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center flex-shrink-0"><Gavel className="w-3.5 h-3.5 text-indigo-600" /></div>
                                <div className="bg-neutral-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500" />
                                    <span className="text-sm text-neutral-500">Analyse läuft…</span>
                                </div>
                            </div>
                        )}
                        {error && <div className="max-w-3xl mr-auto bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}
                        <div ref={bottomRef} />
                    </div>
                    <div className="border-t border-neutral-200 bg-white px-4 py-3 shrink-0">
                        {messages.length > 0 && (
                            <button onClick={() => { setMessages([]); setError(null); }} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 mb-2">
                                <RotateCcw className="w-3 h-3" /> Neues Gespräch
                            </button>
                        )}
                        <div className="flex gap-2 items-end max-w-3xl mx-auto">
                            <textarea value={input} onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendChat(input); } }}
                                placeholder="Rechtsfrage, Fallkonstellation oder Strategiefrage… (Enter senden)"
                                rows={2} className="flex-1 border border-neutral-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                            <button onClick={() => void sendChat(input)} disabled={!input.trim() || loading}
                                className="bkl-btn-primary h-[44px] disabled:!opacity-40">
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-center text-[10px] text-neutral-300 mt-2">Nur für interne Nutzung · KI ersetzt keine anwaltliche Prüfung · Hinweise für Senior-Review beachten</p>
                    </div>
                </div>
            ) : (
                /* ANALYSE-TAB */
                <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="max-w-3xl mx-auto space-y-6">
                        {/* Aufgabentyp */}
                        <div>
                            <label className="block text-sm font-medium mb-3">Aufgabentyp</label>
                            <div className="grid grid-cols-3 gap-3">
                                {AUFGABEN.map((a) => (
                                    <button key={a.value} onClick={() => setAufgabe(a.value)}
                                        className={`text-left p-3 rounded-xl border-2 transition-colors ${aufgabe === a.value ? "border-neutral-900 bg-neutral-50" : "border-neutral-200 hover:border-neutral-300"}`}>
                                        <div className="flex items-center gap-2 font-medium text-sm mb-1">{a.icon} {a.label}</div>
                                        <p className="text-xs text-neutral-500 leading-snug">{a.beschreibung}</p>
                                        {a.value === "schriftsatz" && aufgabe === "schriftsatz" && (
                                            <span className="mt-2 inline-block text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Adversarial aktiv</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Dokumente */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Dokumente hochladen (optional)</label>
                            <div
                                className="border-2 border-dashed border-neutral-300 rounded-xl p-6 text-center cursor-pointer hover:border-neutral-400 transition-colors"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Upload className="w-6 h-6 text-neutral-400 mx-auto mb-2" />
                                <p className="text-sm text-neutral-500">Schriftsätze, Urteile, Verträge (PDF/DOCX, max. 5)</p>
                                <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.doc" className="hidden"
                                    onChange={(e) => setDateien(Array.from(e.target.files ?? []).slice(0, 5))} />
                            </div>
                            {dateien.length > 0 && (
                                <div className="mt-2 space-y-1">
                                    {dateien.map((f, i) => (
                                        <div key={i} className="flex items-center gap-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-3 py-2">
                                            <FileText className="w-3.5 h-3.5 text-neutral-400 flex-shrink-0" />
                                            <span className="flex-1 truncate">{f.name}</span>
                                            <button onClick={() => setDateien((d) => d.filter((_, j) => j !== i))} className="text-neutral-400 hover:text-red-500">×</button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Arbeitsauftrag */}
                        <div>
                            <label className="block text-sm font-medium mb-2">Arbeitsauftrag *</label>
                            <textarea value={frage} onChange={(e) => setFrage(e.target.value)}
                                placeholder={aufgabe === "schriftsatz"
                                    ? "z.B. Entwirf eine Replik auf die Klageerwiderung der Beklagten — widerlege die Verjährungseinrede und fehlende Kausalität"
                                    : aufgabe === "relation"
                                    ? "z.B. Erstelle eine vollständige Relation vor der mündlichen Verhandlung am [DATUM] im Verfahren [AZ]"
                                    : "z.B. Fasse die Sach- und Rechtslage aus Mandantensicht zusammen — Beklagter Steurer, Mandat PRE9"}
                                rows={4} className="w-full border border-neutral-300 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-400" />
                        </div>

                        <button onClick={runAnalyse} disabled={!frage.trim() || analyseLoading}
                            className="w-full bg-neutral-900 text-white rounded-xl py-3 font-medium text-sm hover:bg-neutral-700 disabled:opacity-40 flex items-center justify-center gap-2">
                            {analyseLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyse läuft{aufgabe === "schriftsatz" ? " (3 Calls)…" : "…"}</> : <><Gavel className="w-4 h-4" /> Analyse starten</>}
                        </button>

                        {analyseError && (
                            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{analyseError}</div>
                        )}

                        {analyseResult && (
                            <div className="space-y-4">
                                <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
                                    <div className="px-4 py-2.5 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between">
                                        <span className="text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                                            {aufgabe === "schriftsatz" ? "Überarbeiteter Entwurf (nach Adversarial)" : "Ergebnis"}
                                        </span>
                                        <button onClick={() => { void navigator.clipboard.writeText(analyseResult.response); }}
                                            className="text-xs text-neutral-400 hover:text-neutral-700">Kopieren</button>
                                    </div>
                                    <pre className="p-4 text-sm whitespace-pre-wrap text-neutral-800 leading-relaxed max-h-[60vh] overflow-y-auto">{analyseResult.response}</pre>
                                </div>
                                {analyseResult.adversarial && <AdversarialPanel adversarial={analyseResult.adversarial} />}
                                <button onClick={() => { setAnalyseResult(null); setFrage(""); setDateien([]); }}
                                    className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600">
                                    <RotateCcw className="w-3 h-3" /> Neue Analyse
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}


