"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
    ArrowLeft, AlertCircle, FileText, Loader2, ExternalLink, Upload, Landmark, X,
} from "lucide-react";
import {
    listDocuments, openMatterDocument, downloadMatterDocumentDocx, getMatter,
    listMatterWissensbasis, uploadMatterWissensbasis, WISSENSBASIS_QUELLEN,
} from "@/app/lib/mandateApi";
import type {
    MatterDocument, MatterDetail, MatterWissensDokument, WissensbasisQuelle,
} from "@/app/lib/mandateApi";
import { DOC_TYPE_LABELS } from "@/app/lib/docTypeLabels";

/** Grobe Zuordnung der Aktenkategorie auf die Rechtsgebiete der Wissensdatenbank. */
const RECHTSGEBIET_FUER_KATEGORIE: Record<string, string> = {
    erbrecht: "erbrecht",
    gesellschaftsrecht: "gesellschaftsrecht",
    kapitalmarktrecht: "kapitalmarkt",
    pro_real: "kapitalmarkt",
    steuerrecht: "allgemein",
    sonstiges: "allgemein",
};

const GRUPPEN: { titel: string; typen: string[] }[] = [
    {
        titel: "Onboarding",
        typen: [
            "ONBOARDING_ANSCHREIBEN", "ONBOARDING_HONORARVEREINBARUNG",
            "ONBOARDING_VOLLMACHT", "ONBOARDING_WIDERRUFSBELEHRUNG",
        ],
    },
    {
        titel: "Rücklauf (unterzeichnet)",
        typen: ["RUECKLAUF_VOLLMACHT", "RUECKLAUF_HONORARVEREINBARUNG"],
    },
    {
        titel: "Anspruch",
        typen: ["ANSPRUCH_SCHREIBEN"],
    },
    {
        titel: "Klage",
        typen: ["KLAGE_SCHRIFT", "KLAGE_ANLAGE"],
    },
    {
        titel: "Sonstige Unterlagen",
        typen: ["ANFRAGE_UPLOAD", "INTAKE_UPLOAD", "SONSTIGES"],
    },
];

export default function DokumentePage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const [matter, setMatter] = useState<MatterDetail | null>(null);
    const [docs, setDocs] = useState<MatterDocument[]>([]);
    const [fundstellen, setFundstellen] = useState<MatterWissensDokument[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [openingId, setOpeningId] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const [m, d, f] = await Promise.all([getMatter(id), listDocuments(id), listMatterWissensbasis(id)]);
            setMatter(m);
            setDocs(d);
            setFundstellen(f);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Laden");
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    async function handleOpen(doc: MatterDocument) {
        setOpeningId(doc.id);
        setError(null);
        try {
            await openMatterDocument(id, doc);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Dokument konnte nicht geöffnet werden");
        } finally {
            setOpeningId(null);
        }
    }

    async function handleWord(doc: MatterDocument) {
        setError(null);
        try {
            await downloadMatterDocumentDocx(id, doc);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Word-Fassung konnte nicht geladen werden");
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
        );
    }

    const bekannteTypen = GRUPPEN.flatMap((g) => g.typen);
    const unbekannt = docs.filter((d) => !bekannteTypen.includes(d.doc_type));

    return (
        <div className="max-w-3xl mx-auto px-4 py-8">
            <button
                onClick={() => router.push(`/mandate/${id}`)}
                className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-6"
            >
                <ArrowLeft className="w-4 h-4" /> Zurück zur Akte
            </button>

            <h1 className="text-2xl font-semibold mb-1">Dokumente</h1>
            <p className="text-sm text-neutral-500 mb-6">
                {matter?.bezeichnung}
                {matter?.aktenzeichen ? ` · RA-Micro ${matter.aktenzeichen}` : ""}
            </p>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {docs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
                    <FileText className="w-12 h-12 mb-4" />
                    <p className="text-base font-medium">Noch keine Dokumente vorhanden</p>
                </div>
            ) : (
                <div className="space-y-6">
                    {GRUPPEN.map((gruppe) => {
                        const items = docs.filter((d) => gruppe.typen.includes(d.doc_type));
                        if (items.length === 0) return null;
                        return (
                            <div key={gruppe.titel}>
                                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                                    {gruppe.titel}
                                </h2>
                                <div className="border border-neutral-200 rounded-xl overflow-hidden divide-y divide-neutral-100">
                                    {items.map((d) => (
                                        <DocRow
                                            key={d.id}
                                            doc={d}
                                            opening={openingId === d.id}
                                            onOpen={() => void handleOpen(d)}
                                            onWord={() => void handleWord(d)}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })}

                    {unbekannt.length > 0 && (
                        <div>
                            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-2">
                                Weitere
                            </h2>
                            <div className="border border-neutral-200 rounded-xl overflow-hidden divide-y divide-neutral-100">
                                {unbekannt.map((d) => (
                                    <DocRow
                                        key={d.id}
                                        doc={d}
                                        opening={openingId === d.id}
                                        onOpen={() => void handleOpen(d)}
                                        onWord={() => void handleWord(d)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            <FundstellenAbschnitt
                matterId={id}
                kategorie={matter?.kategorie}
                fundstellen={fundstellen}
                onError={setError}
                onHochgeladen={(neu) => setFundstellen((f) => [neu, ...f])}
            />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Fundstellen aus Datenbanken (z.B. beck-online) — Weg 1: manueller Download,
// Aufnahme hier. Das System ruft bei keiner Datenbank selbst etwas ab; es
// nimmt entgegen, was der Anwalt in seinem eigenen, lizenzierten Zugang
// gefunden und heruntergeladen hat.
// ---------------------------------------------------------------------------

function FundstellenAbschnitt({
    matterId,
    kategorie,
    fundstellen,
    onError,
    onHochgeladen,
}: {
    matterId: string;
    kategorie: string | undefined;
    fundstellen: MatterWissensDokument[];
    onError: (msg: string) => void;
    onHochgeladen: (dok: MatterWissensDokument) => void;
}) {
    const [showForm, setShowForm] = useState(false);
    const [datei, setDatei] = useState<File | null>(null);
    const [titel, setTitel] = useState("");
    const [dokumenttyp, setDokumenttyp] = useState("kommentar");
    const [quelle, setQuelle] = useState<WissensbasisQuelle>("beck-online");
    const [fundstelle, setFundstelle] = useState("");
    const [uploading, setUploading] = useState(false);

    const rechtsgebiet = RECHTSGEBIET_FUER_KATEGORIE[kategorie ?? "sonstiges"] ?? "allgemein";
    const brauchtFundstelle = quelle !== "eigenes";

    async function handleUpload(e: React.FormEvent) {
        e.preventDefault();
        if (!datei || !titel.trim() || (brauchtFundstelle && !fundstelle.trim())) return;
        setUploading(true);
        onError("");
        try {
            const neu = await uploadMatterWissensbasis({
                matterId, datei, titel: titel.trim(), rechtsgebiet, dokumenttyp, quelle,
                fundstelle: fundstelle.trim() || undefined,
            });
            onHochgeladen(neu);
            setShowForm(false);
            setDatei(null); setTitel(""); setFundstelle("");
        } catch (e) {
            onError(e instanceof Error ? e.message : "Hochladen fehlgeschlagen");
        } finally {
            setUploading(false);
        }
    }

    return (
        <div className="mt-8">
            <div className="flex items-center justify-between mb-2">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Fundstellen aus Datenbanken
                </h2>
                <button
                    onClick={() => setShowForm((v) => !v)}
                    className="text-xs text-blue-700 hover:underline flex items-center gap-1"
                >
                    <Upload className="w-3.5 h-3.5" /> Fundstelle hochladen
                </button>
            </div>
            <p className="text-xs text-neutral-400 mb-3">
                Für selbst heruntergeladene Dokumente aus beck-online oder anderen lizenzierten
                Datenbanken. Das System ruft dort nichts automatisch ab — hier wird nur abgelegt,
                was Sie bereits in Ihrem eigenen Zugang gefunden und heruntergeladen haben.
            </p>

            {showForm && (
                <form
                    onSubmit={(e) => void handleUpload(e)}
                    className="border border-neutral-200 rounded-xl p-4 mb-3 space-y-3 bg-neutral-50/50"
                >
                    {!datei ? (
                        <label className="flex flex-col items-center justify-center gap-1.5 border-2 border-dashed border-neutral-300 rounded-lg px-4 py-6 cursor-pointer hover:bg-white hover:border-neutral-400 transition-colors">
                            <Upload className="w-5 h-5 text-neutral-400" />
                            <span className="text-xs font-medium text-neutral-600">PDF oder Word auswählen</span>
                            <input
                                type="file" accept=".pdf,.doc,.docx" className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) { setDatei(f); if (!titel) setTitel(f.name.replace(/\.[^.]+$/, "")); }
                                }}
                            />
                        </label>
                    ) : (
                        <div className="flex items-center justify-between border border-neutral-200 rounded-lg px-3 py-2 bg-white">
                            <div className="flex items-center gap-2 min-w-0">
                                <FileText className="w-4 h-4 text-neutral-500 shrink-0" />
                                <span className="text-sm truncate">{datei.name}</span>
                            </div>
                            <button type="button" onClick={() => setDatei(null)} className="text-neutral-400 hover:text-red-500 shrink-0">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}

                    <div>
                        <label className="block text-xs font-medium mb-1">
                            Titel <span className="text-red-500">*</span>
                        </label>
                        <input
                            required value={titel} onChange={(e) => setTitel(e.target.value)}
                            placeholder="z.B. BeckOK BGB/Müller, § 823 — Verkehrssicherungspflicht"
                            className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium mb-1">Quelle</label>
                            <select
                                value={quelle} onChange={(e) => setQuelle(e.target.value as WissensbasisQuelle)}
                                className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                            >
                                {WISSENSBASIS_QUELLEN.map((q) => (
                                    <option key={q.value} value={q.value}>{q.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-medium mb-1">Dokumenttyp</label>
                            <select
                                value={dokumenttyp} onChange={(e) => setDokumenttyp(e.target.value)}
                                className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm bg-white"
                            >
                                <option value="kommentar">Kommentierung</option>
                                <option value="aufsatz">Aufsatz</option>
                                <option value="urteil">Urteil</option>
                                <option value="gesetze">Gesetzestext</option>
                                <option value="sonstiges">Sonstiges</option>
                            </select>
                        </div>
                    </div>

                    {brauchtFundstelle && (
                        <div>
                            <label className="block text-xs font-medium mb-1">
                                Fundstelle <span className="text-red-500">*</span>
                            </label>
                            <input
                                required={brauchtFundstelle} value={fundstelle}
                                onChange={(e) => setFundstelle(e.target.value)}
                                placeholder="z.B. BeckOK BGB/Müller, § 823 Rn. 12, Stand: 1.5.2026"
                                className="w-full border border-neutral-300 rounded-lg px-2.5 py-1.5 text-sm"
                            />
                            <p className="text-[10px] text-neutral-400 mt-1">
                                Pflicht bei lizenziertem Fremdmaterial — der Assistent zeigt sie an, sobald
                                er dieses Dokument als Grundlage nutzt.
                            </p>
                        </div>
                    )}

                    <div className="flex gap-2">
                        <button
                            type="submit"
                            disabled={uploading || !datei || !titel.trim() || (brauchtFundstelle && !fundstelle.trim())}
                            className="bg-neutral-900 text-white rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center gap-2"
                        >
                            {uploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Hochladen
                        </button>
                        <button
                            type="button" onClick={() => setShowForm(false)}
                            className="border border-neutral-300 rounded-lg px-3 py-1.5 text-sm hover:bg-white"
                        >
                            Abbrechen
                        </button>
                    </div>
                </form>
            )}

            {fundstellen.length === 0 ? (
                !showForm && <p className="text-xs text-neutral-400">Noch keine Fundstellen hinterlegt.</p>
            ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden divide-y divide-neutral-100">
                    {fundstellen.map((f) => (
                        <div key={f.id} className="px-4 py-3">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <Landmark className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                                <span className="text-sm font-medium text-neutral-900">{f.titel}</span>
                                {f.quelle !== "eigenes" && (
                                    <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                        {WISSENSBASIS_QUELLEN.find((q) => q.value === f.quelle)?.label ?? f.quelle}
                                    </span>
                                )}
                            </div>
                            {f.fundstelle && (
                                <p className="text-xs text-neutral-500 ml-5">{f.fundstelle}</p>
                            )}
                            {f.ki_zusammenfassung && (
                                <p className="text-xs text-neutral-400 ml-5 mt-0.5">{f.ki_zusammenfassung}</p>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function DocRow({
    doc,
    opening,
    onOpen,
    onWord,
}: {
    doc: MatterDocument;
    opening: boolean;
    onOpen: () => void;
    onWord: () => void;
}) {
    // Zeile statt Schaltfläche: der Word-Download ist eine eigene Aktion, und
    // eine Schaltfläche in einer Schaltfläche ist ungültiges HTML.
    return (
        <div className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-50">
            <button
                type="button"
                onClick={onOpen}
                disabled={opening}
                className="min-w-0 text-left disabled:opacity-60"
            >
                <p className="text-sm font-medium text-neutral-900 truncate">
                    {DOC_TYPE_LABELS[doc.doc_type] ?? doc.doc_type}
                </p>
                <p className="text-xs text-neutral-400 truncate">{doc.filename}</p>
            </button>
            <div className="flex items-center gap-3 shrink-0 text-xs text-neutral-400">
                {doc.download_docx_url && (
                    <button
                        type="button"
                        onClick={onWord}
                        className="text-xs text-neutral-500 hover:underline"
                        title="Als bearbeitbares Word-Dokument herunterladen"
                    >
                        Word
                    </button>
                )}
                <span>{new Date(doc.created_at).toLocaleDateString("de-DE")}</span>
                {opening ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                    <ExternalLink className="w-3.5 h-3.5 text-blue-600" />
                )}
            </div>
        </div>
    );
}
