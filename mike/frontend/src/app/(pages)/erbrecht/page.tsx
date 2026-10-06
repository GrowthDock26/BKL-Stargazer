"use client";

import { useState, useRef, useEffect } from "react";
import {
    Send, Loader2, Bot, User, RotateCcw, Calculator,
    MessageSquare, FileText, Users, BookOpen, AlertTriangle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

type Message = {
    id: string;
    role: "user" | "assistant";
    content: string;
};

// ---------------------------------------------------------------------------
// Erbschaftsteuer-Rechner (portiert aus ProbeesterbenCalculator)
// ---------------------------------------------------------------------------

const FREIBETRAEGE: Record<string, number> = {
    spouse: 500000, child: 400000, grandchild: 200000,
    parent: 100000, other: 20000,
};

const KLASSE1_STAFFEL = [
    { max: 75000, rate: 7 }, { max: 300000, rate: 11 },
    { max: 600000, rate: 15 }, { max: 6000000, rate: 19 },
    { max: 13000000, rate: 23 }, { max: 26000000, rate: 27 },
    { max: Infinity, rate: 30 },
];

function berechneErbschaftsteuer(betrag: number, freibetrag: number): { zu: number; steuer: number; satz: number } {
    const zu = Math.max(0, betrag - freibetrag);
    if (zu === 0) return { zu: 0, steuer: 0, satz: 0 };
    const stufe = KLASSE1_STAFFEL.find((s) => zu <= s.max) ?? KLASSE1_STAFFEL[KLASSE1_STAFFEL.length - 1];
    return { zu, steuer: Math.round(zu * stufe.rate / 100), satz: stufe.rate };
}

const EUR = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

function ErbschaftsteuerRechner() {
    const [vermoegen, setVermoegen] = useState("");
    const [gueterstand, setGueterstand] = useState("zugewinn");
    const [kinder, setKinder] = useState("0");
    const [elternLeben, setElternLeben] = useState(false);

    const v = parseFloat(vermoegen.replace(/\./g, "").replace(",", ".")) || 0;
    const nKinder = parseInt(kinder) || 0;

    type Erbe = { name: string; quote: number; freibetrag: number };
    const erben: Erbe[] = [];

    if (v > 0) {
        const ehegatteQuote = gueterstand === "zugewinn" ? 0.5 : (nKinder > 0 ? 0.25 : (elternLeben ? 0.5 : 1));
        if (ehegatteQuote > 0) erben.push({ name: "Ehegatte/in", quote: ehegatteQuote, freibetrag: FREIBETRAEGE.spouse });

        const rest = 1 - ehegatteQuote;
        if (nKinder > 0) {
            for (let i = 1; i <= nKinder; i++) {
                erben.push({ name: `Kind ${i}`, quote: rest / nKinder, freibetrag: FREIBETRAEGE.child });
            }
        } else if (elternLeben) {
            erben.push({ name: "Elternteil", quote: rest / 2, freibetrag: FREIBETRAEGE.parent });
            erben.push({ name: "Elternteil", quote: rest / 2, freibetrag: FREIBETRAEGE.parent });
        }
    }

    const gesamtSteuer = erben.reduce((s, e) => {
        const { steuer } = berechneErbschaftsteuer(v * e.quote, e.freibetrag);
        return s + steuer;
    }, 0);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <label className="block text-xs font-medium mb-1">Nachlasswert (€)</label>
                    <input
                        type="text"
                        value={vermoegen}
                        onChange={(e) => setVermoegen(e.target.value)}
                        placeholder="z.B. 500000"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium mb-1">Güterstand</label>
                    <select
                        value={gueterstand}
                        onChange={(e) => setGueterstand(e.target.value)}
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    >
                        <option value="zugewinn">Zugewinngemeinschaft (§ 1371 BGB)</option>
                        <option value="trennung">Gütertrennung</option>
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-medium mb-1">Anzahl Kinder</label>
                    <select
                        value={kinder}
                        onChange={(e) => setKinder(e.target.value)}
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    >
                        {[0,1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                </div>
                <div className="flex items-end pb-2">
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={elternLeben} onChange={(e) => setElternLeben(e.target.checked)} className="rounded" />
                        Eltern noch lebend
                    </label>
                </div>
            </div>

            {v > 0 && erben.length > 0 && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-3 py-2 text-xs font-medium text-neutral-600">Erbe</th>
                                <th className="text-right px-3 py-2 text-xs font-medium text-neutral-600">Quote</th>
                                <th className="text-right px-3 py-2 text-xs font-medium text-neutral-600">Erbteil</th>
                                <th className="text-right px-3 py-2 text-xs font-medium text-neutral-600">Freibetrag</th>
                                <th className="text-right px-3 py-2 text-xs font-medium text-neutral-600">Steuer</th>
                            </tr>
                        </thead>
                        <tbody>
                            {erben.map((e, i) => {
                                const erbteil = v * e.quote;
                                const { steuer, satz } = berechneErbschaftsteuer(erbteil, e.freibetrag);
                                return (
                                    <tr key={i} className="border-b border-neutral-100 last:border-0">
                                        <td className="px-3 py-2">{e.name}</td>
                                        <td className="px-3 py-2 text-right">{(e.quote * 100).toFixed(0)} %</td>
                                        <td className="px-3 py-2 text-right font-mono">{EUR(erbteil)}</td>
                                        <td className="px-3 py-2 text-right font-mono text-neutral-500">{EUR(e.freibetrag)}</td>
                                        <td className="px-3 py-2 text-right font-mono font-medium">
                                            {steuer > 0 ? <span className="text-red-600">{EUR(steuer)} ({satz} %)</span> : <span className="text-green-600">0 €</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot className="bg-neutral-50 border-t border-neutral-200">
                            <tr>
                                <td colSpan={4} className="px-3 py-2 font-semibold text-sm">Gesamte Erbschaftsteuer</td>
                                <td className="px-3 py-2 text-right font-mono font-bold text-lg">
                                    {gesamtSteuer > 0 ? <span className="text-red-600">{EUR(gesamtSteuer)}</span> : <span className="text-green-600">0 €</span>}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            )}

            <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Vereinfachte Berechnung (ErbStG 2024). Keine Schenkungen, keine Betriebsvermögen. Für verbindliche Aussagen ist eine steuerliche Beratung erforderlich.
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Erbrecht-Chat
// ---------------------------------------------------------------------------

const THEMEN = [
    { icon: <FileText className="w-5 h-5" />, titel: "Testament & Erbfolge", frage: "Erkläre mir die gesetzliche Erbfolge und die Möglichkeiten der testamentarischen Gestaltung." },
    { icon: <Users className="w-5 h-5" />, titel: "Pflichtteil", frage: "Wann besteht ein Pflichtteilsanspruch, wie wird er berechnet und kann er entzogen werden?" },
    { icon: <Calculator className="w-5 h-5" />, titel: "Erbschaftsteuer", frage: "Erkläre die Erbschaftsteuer-Freibeträge und Steuerklassen nach ErbStG." },
    { icon: <BookOpen className="w-5 h-5" />, titel: "Vorsorgevollmacht", frage: "Was muss bei einer Vorsorgevollmacht und Patientenverfügung beachtet werden?" },
];

async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

export default function ErbrechtPage() {
    const [tab, setTab] = useState<"chat" | "rechner">("chat");
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    async function sendMessage(text: string) {
        if (!text.trim() || loading) return;
        const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setLoading(true);
        setError(null);

        try {
            const headers = await authHeaders();
            const res = await fetch(`${API_BASE}/erbrecht/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({
                    messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(data.detail ?? `Fehler ${res.status}`);
            }
            const data = await res.json() as { response: string };
            setMessages((prev) => [
                ...prev,
                { id: Date.now().toString() + "a", role: "assistant", content: data.response },
            ]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setLoading(false);
        }
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void sendMessage(input);
        }
    }

    return (
        <div className="flex flex-col h-full max-h-[calc(100dvh-0px)]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-white shrink-0">
                <div>
                    <h1 className="text-xl font-semibold">Erbrecht-Assistent</h1>
                    <p className="text-xs text-neutral-500 mt-0.5">KI-gestützte Unterstützung für Erbrechtsmandate · BKL intern</p>
                </div>
                <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
                    <button
                        onClick={() => setTab("chat")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "chat" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                    >
                        <MessageSquare className="w-3.5 h-3.5" /> Chat
                    </button>
                    <button
                        onClick={() => setTab("rechner")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "rechner" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                    >
                        <Calculator className="w-3.5 h-3.5" /> ErbSt-Rechner
                    </button>
                </div>
            </div>

            {tab === "rechner" ? (
                <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
                    <h2 className="font-semibold mb-4">Erbschaftsteuer-Schnellrechner</h2>
                    <ErbschaftsteuerRechner />
                </div>
            ) : (
                <div className="flex flex-col flex-1 min-h-0">
                    {/* Nachrichten */}
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="max-w-2xl mx-auto">
                                <p className="text-center text-neutral-400 text-sm mb-6">
                                    Stellen Sie eine erbrechtliche Frage oder wählen Sie ein Thema:
                                </p>
                                <div className="grid grid-cols-2 gap-3">
                                    {THEMEN.map((t) => (
                                        <button
                                            key={t.titel}
                                            onClick={() => void sendMessage(t.frage)}
                                            className="text-left border border-neutral-200 rounded-xl p-4 hover:bg-neutral-50 hover:border-neutral-300 transition-colors"
                                        >
                                            <div className="flex items-center gap-2 mb-1 text-neutral-700">
                                                {t.icon}
                                                <span className="font-medium text-sm">{t.titel}</span>
                                            </div>
                                            <p className="text-xs text-neutral-400 line-clamp-2">{t.frage}</p>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div
                                key={m.id}
                                className={`flex gap-3 max-w-3xl ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                            >
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${m.role === "user" ? "bg-neutral-800" : "bg-neutral-100 border border-neutral-200"}`}>
                                    {m.role === "user"
                                        ? <User className="w-3.5 h-3.5 text-white" />
                                        : <Bot className="w-3.5 h-3.5 text-neutral-600" />
                                    }
                                </div>
                                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-prose ${m.role === "user" ? "bg-neutral-800 text-white rounded-tr-sm" : "bg-neutral-100 text-neutral-900 rounded-tl-sm"}`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex gap-3 max-w-3xl mr-auto">
                                <div className="w-7 h-7 rounded-full bg-neutral-100 border border-neutral-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Bot className="w-3.5 h-3.5 text-neutral-600" />
                                </div>
                                <div className="bg-neutral-100 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-neutral-500" />
                                    <span className="text-sm text-neutral-500">Antwort wird erstellt…</span>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="max-w-3xl mr-auto bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <div ref={bottomRef} />
                    </div>

                    {/* Eingabe */}
                    <div className="border-t border-neutral-200 bg-white px-4 py-3 shrink-0">
                        {messages.length > 0 && (
                            <button
                                onClick={() => { setMessages([]); setError(null); }}
                                className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 mb-2"
                            >
                                <RotateCcw className="w-3 h-3" /> Neues Gespräch
                            </button>
                        )}
                        <div className="flex gap-2 items-end max-w-3xl mx-auto">
                            <textarea
                                ref={textareaRef}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Erbrechtliche Frage stellen… (Enter zum Senden, Shift+Enter für neue Zeile)"
                                rows={2}
                                className="flex-1 border border-neutral-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-400"
                            />
                            <button
                                onClick={() => void sendMessage(input)}
                                disabled={!input.trim() || loading}
                                className="bkl-btn-primary gap-1.5 h-[44px] disabled:!opacity-40"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-center text-[10px] text-neutral-300 mt-2">
                            Nur für interne Nutzung · KI-Antworten ersetzen keine anwaltliche Prüfung
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}



