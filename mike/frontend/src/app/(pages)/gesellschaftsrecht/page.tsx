"use client";

import { useState, useRef, useEffect } from "react";
import {
    Send, Loader2, Bot, User, RotateCcw, FileSearch,
    MessageSquare, Upload, X, CheckCircle2, AlertTriangle,
    Building2, Users, GitBranch, FileText, Wrench, Shield,
} from "lucide-react";
import { supabase } from "@/lib/supabase";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

type Message = { id: string; role: "user" | "assistant"; content: string };

type Vertragstyp = "GmbH-Gesellschaftsvertrag" | "GmbH & Co. KG" | "Familiengesellschaft (GmbH & Co. KG)";

const VERTRAGSTYPEN: Vertragstyp[] = [
    "GmbH-Gesellschaftsvertrag",
    "GmbH & Co. KG",
    "Familiengesellschaft (GmbH & Co. KG)",
];

// ---------------------------------------------------------------------------
// Vertragsprüfer
// ---------------------------------------------------------------------------

function VertragsPruefer() {
    const [file, setFile] = useState<File | null>(null);
    const [direktText, setDirektText] = useState("");
    const [vertragstyp, setVertragstyp] = useState<Vertragstyp>("GmbH-Gesellschaftsvertrag");
    const [pruefung, setPruefung] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [modus, setModus] = useState<"upload" | "text">("upload");

    async function handlePruefen() {
        if (modus === "upload" && !file) return;
        if (modus === "text" && !direktText.trim()) return;

        setLoading(true);
        setError(null);
        setPruefung("");

        try {
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {};
            if (session?.access_token) headers["Authorization"] = `Bearer ${session.access_token}`;

            const form = new FormData();
            form.append("vertragstyp", vertragstyp);
            if (modus === "upload" && file) {
                form.append("datei", file);
            } else {
                form.append("vertragstext", direktText);
            }

            const res = await fetch(`${API_BASE}/gesellschaftsrecht/vertrag-pruefen`, {
                method: "POST",
                headers,
                body: form,
            });

            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(d.detail ?? `Fehler ${res.status}`);
            }
            const data = await res.json() as { review: string };
            setPruefung(data.review);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setLoading(false);
        }
    }

    function renderReview(text: string) {
        return text.split("\n").map((line, i) => {
            const isOk = line.includes("✅");
            const isWarn = line.includes("⚠️");
            const isErr = line.includes("❌");
            const isTip = line.includes("🔧");
            const isMissing = line.includes("⬜");
            const isH = /^#+\s/.test(line) || /^\d+\.\s[A-ZÄÖÜ]/.test(line);

            let cls = "text-neutral-800";
            if (isOk) cls = "text-green-800";
            if (isWarn) cls = "text-amber-800";
            if (isErr) cls = "text-red-800";
            if (isTip) cls = "text-blue-800";
            if (isMissing) cls = "text-neutral-500 italic";
            if (isH) cls = "font-semibold text-neutral-900 mt-4 mb-1";

            return <p key={i} className={`text-sm leading-relaxed ${cls} ${line.trim() === "" ? "mb-2" : ""}`}>{line || <br />}</p>;
        });
    }

    return (
        <div className="space-y-5 max-w-3xl mx-auto">
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                <strong>Wie es funktioniert:</strong> Vertragstyp wählen, Vertrag hochladen oder einfügen —
                die KI prüft alle Klauseln nach dem passenden Prüfungsraster und schlägt Formulierungen vor.
            </div>

            {/* Vertragstyp */}
            <div>
                <label className="block text-xs font-medium mb-2">Vertragstyp</label>
                <div className="flex flex-wrap gap-2">
                    {VERTRAGSTYPEN.map((t) => (
                        <button
                            key={t}
                            onClick={() => setVertragstyp(t)}
                            className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                                vertragstyp === t
                                    ? "bg-neutral-900 text-white border-neutral-900"
                                    : "border-neutral-300 hover:bg-neutral-50"
                            }`}
                        >
                            {t}
                        </button>
                    ))}
                </div>
            </div>

            {/* Upload / Text */}
            <div className="flex gap-1 bg-neutral-100 rounded-lg p-1 w-fit">
                <button
                    onClick={() => setModus("upload")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${modus === "upload" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                >
                    <Upload className="w-3.5 h-3.5" /> Datei
                </button>
                <button
                    onClick={() => setModus("text")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${modus === "text" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                >
                    <FileText className="w-3.5 h-3.5" /> Text
                </button>
            </div>

            {modus === "upload" ? (
                !file ? (
                    <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-neutral-300 rounded-xl px-6 py-10 cursor-pointer hover:bg-neutral-50 hover:border-neutral-400 transition-colors">
                        <Upload className="w-8 h-8 text-neutral-400" />
                        <span className="text-sm font-medium text-neutral-600">Gesellschaftsvertrag hochladen</span>
                        <span className="text-xs text-neutral-400">PDF oder Word · max. 20 MB</span>
                        <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    </label>
                ) : (
                    <div className="flex items-center justify-between border border-neutral-200 rounded-xl px-4 py-3 bg-neutral-50">
                        <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-neutral-500" />
                            <span className="text-sm font-medium">{file.name}</span>
                            <span className="text-xs text-neutral-400">({(file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                        <button onClick={() => setFile(null)} className="text-neutral-400 hover:text-red-500"><X className="w-4 h-4" /></button>
                    </div>
                )
            ) : (
                <textarea
                    rows={10}
                    value={direktText}
                    onChange={(e) => setDirektText(e.target.value)}
                    placeholder="Gesellschaftsvertrag hier einfügen…"
                    className="w-full border border-neutral-300 rounded-xl px-4 py-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-none"
                />
            )}

            <button
                onClick={() => void handlePruefen()}
                disabled={loading || (modus === "upload" ? !file : !direktText.trim())}
                className="bg-neutral-900 text-white rounded-xl px-6 py-2.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center gap-2"
            >
                {loading
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Wird analysiert…</>
                    : <><FileSearch className="w-4 h-4" /> Vertrag prüfen</>
                }
            </button>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {error}
                </div>
            )}

            {pruefung && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                    <div className="flex items-center justify-between bg-neutral-50 border-b border-neutral-200 px-5 py-3">
                        <div className="flex items-center gap-2">
                            <CheckCircle2 className="w-4 h-4 text-green-600" />
                            <span className="font-semibold text-sm">Prüfungsergebnis — {vertragstyp}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-neutral-500">
                            <span>✅ OK</span>
                            <span>⚠️ Risiko</span>
                            <span>❌ Unwirksam</span>
                            <span>🔧 Ergänzen</span>
                            <span>⬜ Fehlt</span>
                        </div>
                    </div>
                    <div className="px-5 py-5 space-y-0.5">
                        {renderReview(pruefung)}
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

const THEMEN = [
    {
        icon: <Building2 className="w-5 h-5" />,
        titel: "GmbH-Satzung Grundstruktur",
        frage: "Welche Pflichtbestandteile muss eine GmbH-Satzung nach § 3 GmbHG enthalten, und was sind typische Zusatzregelungen für eine gut gestaltete Satzung?",
    },
    {
        icon: <GitBranch className="w-5 h-5" />,
        titel: "GmbH & Co. KG Struktur",
        frage: "Erkläre mir die rechtliche Struktur einer GmbH & Co. KG — welche Verträge werden benötigt, wie werden Kapitalkonten gestaltet (3-Konten-Modell)?",
    },
    {
        icon: <Users className="w-5 h-5" />,
        titel: "Nachfolge in Familiengesellschaft",
        frage: "Welche Nachfolgeklauseln gibt es für eine Familiengesellschaft (GmbH & Co. KG) und welche sind für die Nachfolgeplanung am besten geeignet?",
    },
    {
        icon: <Shield className="w-5 h-5" />,
        titel: "Abfindung & Vinkulierung",
        frage: "Wie gestaltet man Abfindungsklauseln und Vinkulierungsklauseln in einer Familiengesellschaft — was sind die pflichtteilsrechtlichen und steuerlichen Risiken?",
    },
];

async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return {};
    return { Authorization: `Bearer ${session.access_token}` };
}

export default function GesellschaftsrechtPage() {
    const [tab, setTab] = useState<"chat" | "pruefer">("chat");
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

    async function sendMessage(text: string) {
        if (!text.trim() || loading) return;
        const userMsg: Message = { id: Date.now().toString(), role: "user", content: text.trim() };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setLoading(true);
        setError(null);
        try {
            const headers = await authHeaders();
            const res = await fetch(`${API_BASE}/gesellschaftsrecht/chat`, {
                method: "POST",
                headers: { "Content-Type": "application/json", ...headers },
                body: JSON.stringify({ messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })) }),
            });
            if (!res.ok) {
                const d = await res.json().catch(() => ({})) as { detail?: string };
                throw new Error(d.detail ?? `Fehler ${res.status}`);
            }
            const data = await res.json() as { response: string };
            setMessages((prev) => [...prev, { id: Date.now().toString() + "a", role: "assistant", content: data.response }]);
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-200 bg-white shrink-0">
                <div>
                    <h1 className="text-xl font-semibold">Gesellschaftsrecht-Assistent</h1>
                    <p className="text-xs text-neutral-500 mt-0.5">
                        GmbH · GmbH & Co. KG · Familiengesellschaften · Prüfung & Gestaltung · BKL intern
                    </p>
                </div>
                <div className="flex gap-1 bg-neutral-100 rounded-lg p-1">
                    <button
                        onClick={() => setTab("chat")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "chat" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                    >
                        <MessageSquare className="w-3.5 h-3.5" /> Assistent
                    </button>
                    <button
                        onClick={() => setTab("pruefer")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "pruefer" ? "bg-white shadow-sm text-neutral-900" : "text-neutral-500 hover:text-neutral-700"}`}
                    >
                        <FileSearch className="w-3.5 h-3.5" /> Vertragsprüfer
                    </button>
                </div>
            </div>

            {tab === "pruefer" ? (
                <div className="flex-1 overflow-y-auto px-6 py-6">
                    <div className="flex items-center gap-2 mb-5">
                        <Wrench className="w-5 h-5 text-neutral-600" />
                        <h2 className="font-semibold">Gesellschaftsvertrag prüfen</h2>
                    </div>
                    <VertragsPruefer />
                </div>
            ) : (
                <div className="flex flex-col flex-1 min-h-0">
                    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                        {messages.length === 0 && (
                            <div className="max-w-2xl mx-auto">
                                <p className="text-center text-neutral-400 text-sm mb-6">
                                    Stellen Sie eine gesellschaftsrechtliche Frage oder wählen Sie ein Thema:
                                </p>
                                <div className="grid grid-cols-2 gap-3 mb-4">
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
                                <div className="bg-neutral-50 border border-neutral-200 rounded-xl px-4 py-3 text-xs text-neutral-600">
                                    <strong>Tipp:</strong> Nutzen Sie den <button onClick={() => setTab("pruefer")} className="font-medium underline text-neutral-900">Vertragsprüfer</button> für die strukturierte Analyse eines bestehenden Gesellschaftsvertrags — wählen Sie dabei den passenden Vertragstyp (GmbH, GmbH & Co. KG oder Familiengesellschaft).
                                </div>
                            </div>
                        )}

                        {messages.map((m) => (
                            <div key={m.id} className={`flex gap-3 max-w-3xl ${m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto"}`}>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${m.role === "user" ? "bg-neutral-800" : "bg-neutral-100 border border-neutral-200"}`}>
                                    {m.role === "user" ? <User className="w-3.5 h-3.5 text-white" /> : <Bot className="w-3.5 h-3.5 text-neutral-600" />}
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
                            <textarea
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                placeholder="Gesellschaftsrechtliche Frage… (Enter senden, Shift+Enter neue Zeile)"
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




