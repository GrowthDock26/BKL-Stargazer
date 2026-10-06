"use client";

import { useState, useRef, useEffect } from "react";
import {
    Send, Loader2, Bot, User, RotateCcw, Calculator,
    MessageSquare, AlertTriangle, Scale, TrendingDown,
    FileWarning, Clock, Users,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

type Message = { id: string; role: "user" | "assistant"; content: string };

// ---------------------------------------------------------------------------
// Schadensersatz-Rechner (Prospekthaftung)
// Formel: Zeichnungssumme + Agio − Ausschüttungen + Zinsen
// ---------------------------------------------------------------------------

function SchadensersatzRechner() {
    const [zeichnung, setZeichnung] = useState("");
    const [agio, setAgio] = useState("");
    const [ausschuettungen, setAusschuettungen] = useState("");
    const [zeichnungsdatum, setZeichnungsdatum] = useState("");
    const [mitZinsen, setMitZinsen] = useState(true);

    const parse = (s: string) => parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
    const EUR = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

    const z = parse(zeichnung);
    const a = parse(agio);
    const au = parse(ausschuettungen);
    const basis = z + a - au;

    // Zinsen: 5 % über Basiszins seit Zeichnung (vereinfacht: aktuell ca. 7,62 % p.a.)
    const ZINSSATZ = 0.0762;
    let zinsen = 0;
    if (mitZinsen && zeichnungsdatum && basis > 0) {
        const von = new Date(zeichnungsdatum);
        const heute = new Date();
        const jahre = (heute.getTime() - von.getTime()) / (365.25 * 24 * 3600 * 1000);
        zinsen = Math.max(0, basis * ZINSSATZ * jahre);
    }

    const gesamt = basis + zinsen;
    const jahre = zeichnungsdatum
        ? ((new Date().getTime() - new Date(zeichnungsdatum).getTime()) / (365.25 * 24 * 3600 * 1000)).toFixed(1)
        : null;

    return (
        <div className="space-y-5">
            <p className="text-sm text-neutral-600">
                Berechnung nach Prospekthaftung: <strong>Zeichnungssumme + Agio − Ausschüttungen + Zinsen</strong>
                <br />
                <span className="text-xs text-neutral-400">Zug-um-Zug gegen Rückgabe der Beteiligung</span>
            </p>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-medium mb-1">Zeichnungssumme (€) *</label>
                    <input
                        type="text"
                        value={zeichnung}
                        onChange={(e) => setZeichnung(e.target.value)}
                        placeholder="z.B. 20000"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium mb-1">Agio (€)</label>
                    <input
                        type="text"
                        value={agio}
                        onChange={(e) => setAgio(e.target.value)}
                        placeholder="z.B. 300 (5 %)"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium mb-1">Erhaltene Ausschüttungen (€)</label>
                    <input
                        type="text"
                        value={ausschuettungen}
                        onChange={(e) => setAusschuettungen(e.target.value)}
                        placeholder="z.B. 1200"
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    />
                </div>
                <div>
                    <label className="block text-xs font-medium mb-1">Zeichnungsdatum</label>
                    <input
                        type="date"
                        value={zeichnungsdatum}
                        onChange={(e) => setZeichnungsdatum(e.target.value)}
                        className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                    />
                </div>
            </div>

            <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                    type="checkbox"
                    checked={mitZinsen}
                    onChange={(e) => setMitZinsen(e.target.checked)}
                    className="rounded"
                />
                Zinsen einrechnen (5 % über Basiszins, § 291 BGB analog, aktuell ca. 7,62 % p.a.)
            </label>

            {z > 0 && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                    <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-2">
                        <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider">Schadensersatzberechnung</span>
                    </div>
                    <table className="w-full text-sm">
                        <tbody>
                            <tr className="border-b border-neutral-100">
                                <td className="px-4 py-2.5 text-neutral-600">Zeichnungssumme</td>
                                <td className="px-4 py-2.5 text-right font-mono">+ {EUR(z)}</td>
                            </tr>
                            {a > 0 && (
                                <tr className="border-b border-neutral-100">
                                    <td className="px-4 py-2.5 text-neutral-600">Agio</td>
                                    <td className="px-4 py-2.5 text-right font-mono">+ {EUR(a)}</td>
                                </tr>
                            )}
                            {au > 0 && (
                                <tr className="border-b border-neutral-100">
                                    <td className="px-4 py-2.5 text-neutral-600">Erhaltene Ausschüttungen</td>
                                    <td className="px-4 py-2.5 text-right font-mono text-green-600">− {EUR(au)}</td>
                                </tr>
                            )}
                            <tr className="border-b border-neutral-200 bg-neutral-50">
                                <td className="px-4 py-2.5 font-medium">Kapitalschaden (Streitwert)</td>
                                <td className="px-4 py-2.5 text-right font-mono font-semibold">{EUR(basis)}</td>
                            </tr>
                            {mitZinsen && zeichnungsdatum && zinsen > 0 && (
                                <tr className="border-b border-neutral-100">
                                    <td className="px-4 py-2.5 text-neutral-600">
                                        Zinsen ({jahre} Jahre × {(ZINSSATZ * 100).toFixed(2)} %)
                                    </td>
                                    <td className="px-4 py-2.5 text-right font-mono">+ {EUR(zinsen)}</td>
                                </tr>
                            )}
                            <tr className="bg-neutral-900 text-white">
                                <td className="px-4 py-3 font-bold">Gesamtforderung</td>
                                <td className="px-4 py-3 text-right font-mono font-bold text-lg">{EUR(gesamt)}</td>
                            </tr>
                        </tbody>
                    </table>
                    <div className="px-4 py-2 bg-neutral-50 text-xs text-neutral-500 border-t border-neutral-200">
                        Zug um Zug gegen Rückgabe und Abtretung der Beteiligung (§ 249 BGB)
                    </div>
                </div>
            )}

            <div className="flex gap-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-800">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                Vereinfachte Berechnung. Steuerliche Vorteile, Sonderausschüttungen und individuelle Schadensposten
                sind separat zu berücksichtigen. Streitwert für RA-Micro-Stammdaten = Kapitalschaden ohne Zinsen.
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const THEMEN = [
    {
        icon: <FileWarning className="w-5 h-5" />,
        titel: "Prospekthaftung Grundlagen",
        frage: "Erkläre die Voraussetzungen der Prospekthaftung nach § 20 VermAnlG und § 21 WpPG — wer haftet, wann und wie?",
    },
    {
        icon: <Clock className="w-5 h-5" />,
        titel: "Verjährung",
        frage: "Welche Verjährungsfristen gelten bei der Prospekthaftung nach VermAnlG und WpPG, und wann beginnen sie zu laufen?",
    },
    {
        icon: <TrendingDown className="w-5 h-5" />,
        titel: "Schadensberechnung",
        frage: "Wie wird der Schadensersatzanspruch bei fehlerhaftem Prospekt berechnet — was ist die Berechnungsformel und welche Posten sind zu berücksichtigen?",
    },
    {
        icon: <Users className="w-5 h-5" />,
        titel: "Beklagte & Haftungsschuldner",
        frage: "Welche Personen haften bei Prospekthaftung — Initiator, Geschäftsführer, Prospektprüfer, Vertrieb? Was sind die jeweiligen Rechtsgrundlagen?",
    },
];

async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

export default function KapitalmarktPage() {
    const [tab, setTab] = useState<"chat" | "rechner">("chat");
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

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
            const res = await fetch(`${API_BASE}/kapitalmarkt/chat`, {
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
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(input); }
    }

    return (
        <div className="flex flex-col h-full max-h-[calc(100dvh-0px)]">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-white shrink-0">
                <div>
                    <h1 className="text-xl font-semibold">Kapitalmarktrecht-Assistent</h1>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        Prospekthaftung · VermAnlG · WpPG · PRE9/PRE10 · BKL intern
                    </p>
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
                        <Calculator className="w-3.5 h-3.5" /> Schadensersatz
                    </button>
                </div>
            </div>

            {/* Verjährungs-Banner */}
            <div className="px-6 py-2 flex items-center gap-2 shrink-0 border-b" style={{backgroundColor:"#A02319"}}>
                <Clock className="w-3.5 h-3.5 text-white flex-shrink-0" />
                <span className="text-xs text-white font-medium">
                    PRE9/PRE10 Verjährung: 31.12.2026 · Vorfrist: 15.09.2026 — bei jeder Akte sofort prüfen
                </span>
            </div>

            {tab === "rechner" ? (
                <div className="flex-1 overflow-y-auto px-6 py-6 max-w-2xl mx-auto w-full">
                    <h2 className="font-semibold mb-1">Schadensersatz-Rechner (Prospekthaftung)</h2>
                    <p className="text-xs text-neutral-500 mb-5">
                        Für PRE9/PRE10: Streitwert = Zeichnungssumme + Agio − Ausschüttungen (in RA-Micro Stammdaten eintragen)
                    </p>
                    <SchadensersatzRechner />
                </div>
            ) : (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="max-w-2xl mx-auto">
                                <p className="text-center text-neutral-400 text-sm mb-6">
                                    Stellen Sie eine kapitalmarktrechtliche Frage oder wählen Sie ein Thema:
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
                                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
                                    <strong>PRE9/PRE10-Kontext:</strong> Der Assistent kennt den aktuellen Verfahrensstand,
                                    die Beklagten (Steurer, Thies), die Verjährungsfristen und die Schadensformel für diese Mandate.
                                </div>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m.id} className={`flex gap-3 max-w-3xl ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${m.role === "user" ? "bg-neutral-800" : "bg-blue-100 border border-blue-200"}`}>
                                    {m.role === "user"
                                        ? <User className="w-3.5 h-3.5 text-white" />
                                        : <Scale className="w-3.5 h-3.5 text-blue-600" />
                                    }
                                </div>
                                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap max-w-prose ${m.role === "user" ? "bg-neutral-800 text-white rounded-tr-sm" : "bg-neutral-100 text-neutral-900 rounded-tl-sm"}`}>
                                    {m.content}
                                </div>
                            </div>
                        ))}

                        {loading && (
                            <div className="flex gap-3 max-w-3xl mr-auto">
                                <div className="w-7 h-7 rounded-full bg-blue-100 border border-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <Scale className="w-3.5 h-3.5 text-blue-600" />
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

                    <div className="border-t border-neutral-200 bg-white px-4 py-3 shrink-0">
                        {messages.length > 0 && (
                            <button onClick={() => { setMessages([]); setError(null); }} className="flex items-center gap-1 text-xs text-neutral-400 hover:text-neutral-600 mb-2">
                                <RotateCcw className="w-3 h-3" /> Neues Gespräch
                            </button>
                        )}
                        <div className="flex gap-2 items-end max-w-3xl mx-auto">
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Kapitalmarktrechtliche Frage… (Enter senden, Shift+Enter neue Zeile)"
                                rows={2}
                                className="flex-1 border border-neutral-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-neutral-400"
                            />
                            <button
                                onClick={() => void sendMessage(input)}
                                disabled={!input.trim() || loading}
                                className="bkl-btn-primary h-[44px] disabled:!opacity-40"
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



