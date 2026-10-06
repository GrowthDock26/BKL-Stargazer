"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen, Loader2, AlertCircle, Building2, Search, Calendar, Paperclip, X, FileText, Users } from "lucide-react";
import { listOrgs, createOrg, listMatters, createMatter, MATTER_KATEGORIEN, unterliegtGwgAblauf } from "@/app/lib/mandateApi";
import type { Org, Matter, MatterKategorie } from "@/app/lib/mandateApi";
import { StateBadge } from "@/app/components/mandate/StateBadge";
import { KategorieBadge } from "@/app/components/mandate/KategorieBadge";

export default function MandatePage() {
    const router = useRouter();
    const [org, setOrg] = useState<Org | null>(null);
    const [matters, setMatters] = useState<Matter[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [suche, setSuche] = useState("");
    const [mitArchivierten, setMitArchivierten] = useState(false);

    // Kanzlei-Setup
    const [showOrgForm, setShowOrgForm] = useState(false);
    const [orgName, setOrgName] = useState("");
    const [orgLoading, setOrgLoading] = useState(false);

    // Neue Akte
    const [showAkteForm, setShowAkteForm] = useState(false);
    const [bezeichnung, setBezeichnung] = useState("");
    const [ramicroNr, setRamicroNr] = useState("");
    const [kategorie, setKategorie] = useState<MatterKategorie>("sonstiges");
    const [unternehmensmandat, setUnternehmensmandat] = useState(false);
    const [mandantName, setMandantName] = useState("");
    const [mandantEmail, setMandantEmail] = useState("");
    const [anfrage, setAnfrage] = useState("");
    const [dateien, setDateien] = useState<File[]>([]);
    const [akteLoading, setAkteLoading] = useState(false);
    const ersteFeldRef = useRef<HTMLInputElement>(null);
    const dateiInputRef = useRef<HTMLInputElement>(null);

    const loadData = useCallback(async (currentOrg: Org, mitArchiv: boolean) => {
        try {
            const data = await listMatters(currentOrg.id, { mitArchivierten: mitArchiv });
            setMatters(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Laden");
        }
    }, []);

    useEffect(() => {
        listOrgs()
            .then((orgs) => {
                if (orgs.length === 0) {
                    setShowOrgForm(true);
                } else {
                    setOrg(orgs[0]);
                    return loadData(orgs[0], mitArchivierten);
                }
            })
            .catch((e) => setError(e instanceof Error ? e.message : "Fehler"))
            .finally(() => setLoading(false));
        // Nur beim ersten Laden — der Toggle löst separat neu.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadData]);

    // Archivierte Akten neu laden, wenn der Filter umgeschaltet wird.
    useEffect(() => {
        if (org) void loadData(org, mitArchivierten);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mitArchivierten]);

    // Fokus auf RA-Micro Feld wenn Formular öffnet
    useEffect(() => {
        if (showAkteForm) setTimeout(() => ersteFeldRef.current?.focus(), 50);
    }, [showAkteForm]);

    async function handleCreateOrg(e: React.FormEvent) {
        e.preventDefault();
        if (!orgName.trim()) return;
        setOrgLoading(true);
        try {
            const newOrg = await createOrg(orgName.trim());
            setOrg(newOrg);
            setShowOrgForm(false);
            setMatters([]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setOrgLoading(false);
        }
    }

    const gwgPflichtig = unterliegtGwgAblauf(kategorie);

    async function handleCreateMatter(e: React.FormEvent) {
        e.preventDefault();
        if (!bezeichnung.trim() || !org) return;
        setAkteLoading(true);
        try {
            const m = await createMatter({
                org_id: org.id,
                bezeichnung: bezeichnung.trim(),
                aktenzeichen: ramicroNr.trim() || undefined,
                kategorie,
                unternehmensmandat,
                anfrage: anfrage.trim() || undefined,
                mandant_name: mandantName.trim() || undefined,
                mandant_email: mandantEmail.trim() || undefined,
                dateien: dateien.length ? dateien : undefined,
            });
            setShowAkteForm(false);
            setBezeichnung("");
            setRamicroNr("");
            setKategorie("sonstiges");
            setUnternehmensmandat(false);
            setMandantName("");
            setMandantEmail("");
            setAnfrage("");
            setDateien([]);
            router.push(`/mandate/${m.id}`);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setAkteLoading(false);
        }
    }

    const gefiltert = matters.filter(
        (m) =>
            !suche ||
            m.bezeichnung.toLowerCase().includes(suche.toLowerCase()) ||
            (m.aktenzeichen ?? "").toLowerCase().includes(suche.toLowerCase()),
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
        );
    }

    if (showOrgForm) {
        return (
            <div className="max-w-md mx-auto mt-24 p-8 border border-neutral-200 rounded-xl bg-white">
                <div className="flex items-center gap-3 mb-6">
                    <Building2 className="w-6 h-6 text-neutral-600" />
                    <h1 className="text-xl font-semibold">Kanzlei einrichten</h1>
                </div>
                <p className="text-sm text-neutral-500 mb-6">
                    Geben Sie den Namen Ihrer Kanzlei ein. Dies ist ein einmaliger Schritt.
                </p>
                <form onSubmit={(e) => void handleCreateOrg(e)} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">Kanzleiname</label>
                        <input
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                            placeholder="z.B. BKL Rechtsanwälte"
                            value={orgName}
                            onChange={(e) => setOrgName(e.target.value)}
                            required
                        />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <button
                        type="submit"
                        disabled={orgLoading}
                        className="w-full bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {orgLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                        Kanzlei anlegen
                    </button>
                </form>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">

            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-semibold">Mandate</h1>
                    {org && <p className="text-sm text-neutral-500 mt-0.5">{org.name}</p>}
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => router.push("/mandate/interessenten")}
                        className="border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 flex items-center gap-2"
                        title="PRE9/PRE10 — Interessentenvorgänge vor der Aktenanlage"
                    >
                        <Users className="w-4 h-4" />
                        PRE-Kampagne
                    </button>
                    <button
                        onClick={() => router.push("/mandate/vorlagen")}
                        className="border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 flex items-center gap-2"
                    >
                        <FileText className="w-4 h-4" />
                        Vorlagen
                    </button>
                    <button
                        onClick={() => router.push("/mandate/fristen")}
                        className="border border-neutral-200 rounded-lg px-3 py-2 text-sm text-neutral-600 hover:bg-neutral-50 flex items-center gap-2"
                    >
                        <Calendar className="w-4 h-4" />
                        Fristen
                    </button>
                    <button
                        onClick={() => setShowAkteForm((v) => !v)}
                        className="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-neutral-700 flex items-center gap-2"
                    >
                        <Plus className="w-4 h-4" />
                        Neue Akte
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {/* Neue Akte — Formular */}
            {showAkteForm && (
                <div className="border-2 border-neutral-900 rounded-xl p-6 mb-6 bg-white shadow-sm">
                    <h2 className="text-base font-semibold mb-1">Neue Akte anlegen</h2>
                    <p className="text-xs text-neutral-500 mb-5">
                        Aktennummer und GwG-Prüfung folgen erst, wenn die unterzeichnete Vollmacht
                        vorliegt und die Akte in RA-Micro geführt wird.
                    </p>
                    <form onSubmit={(e) => void handleCreateMatter(e)} className="space-y-5">

                        {/* Bezeichnung */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Kurzbezeichnung
                                <span className="text-red-500 ml-0.5">*</span>
                            </label>
                            <input
                                ref={ersteFeldRef}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                placeholder="z.B. Müller / Kündigung oder Schmidt ./ GmbH"
                                value={bezeichnung}
                                onChange={(e) => setBezeichnung(e.target.value)}
                                required
                            />
                        </div>

                        {/* RA-Micro Aktennummer — optional.
                            Sie entsteht erst, wenn die Akte nach Rücklauf der Vollmacht in
                            RA-Micro geführt wird. Wer sie schon hat, trägt sie hier ein;
                            sonst wird sie später auf der Akte nachgetragen. */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                RA-Micro Aktennummer (optional)
                            </label>
                            <input
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                placeholder="z.B. 123/24 — kann später nachgetragen werden"
                                value={ramicroNr}
                                onChange={(e) => setRamicroNr(e.target.value)}
                            />
                            <p className="text-xs text-neutral-400 mt-1">
                                Leer lassen, solange die Akte noch nicht in RA-Micro angelegt ist.
                            </p>
                        </div>

                        {/* Kategorie */}
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                Kategorie
                                <span className="text-red-500 ml-0.5">*</span>
                            </label>
                            <select
                                value={kategorie}
                                onChange={(e) => setKategorie(e.target.value as MatterKategorie)}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-white"
                            >
                                {MATTER_KATEGORIEN.map((k) => (
                                    <option key={k.value} value={k.value}>{k.label}</option>
                                ))}
                            </select>
                            <p className="text-xs text-neutral-400 mt-1">
                                Es werden automatisch Anschreiben, Honorarvereinbarung, Vollmacht
                                {unternehmensmandat ? "" : " und Widerrufsbelehrung"} erzeugt — jeweils als
                                Word-Datei zum Bearbeiten — und ein Begleitmail-Entwurf verfasst.
                                {kategorie === "pro_real" && " Danach beginnt zusätzlich der gesonderte Kapitalmarktrecht-Workflow (PRE9/PRE10)."}
                                {gwgPflichtig && " Die GwG-Prüfung (Hinweisschreiben, Ausweiskopie, Risikoeinstufung) startet erst mit dem Rücklauf der Vollmacht — auf der Akte über „GwG-Prüfung starten“. Bis dahin bleibt der Aufnahmebogen gesperrt."}
                            </p>
                        </div>

                        {/* Unternehmensmandat — steuert die Widerrufsbelehrung.
                            Das Widerrufsrecht der §§ 312 ff., 355 BGB steht nur
                            Verbrauchern (§ 13 BGB) zu. */}
                        <div>
                            <label className="flex items-start gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={unternehmensmandat}
                                    onChange={(e) => setUnternehmensmandat(e.target.checked)}
                                    className="mt-0.5 h-4 w-4 rounded border-neutral-300 accent-neutral-900"
                                />
                                <span>
                                    <span className="block text-sm font-medium">Unternehmensmandat</span>
                                    <span className="block text-xs text-neutral-400 mt-0.5">
                                        Der Mandant handelt als Unternehmer (§ 14 BGB), nicht als
                                        Verbraucher. Dann besteht kein Widerrufsrecht (§§ 312 ff.,
                                        355 BGB) und es wird keine Widerrufsbelehrung erzeugt.
                                    </span>
                                </span>
                            </label>
                        </div>

                        {/* Mandant (optional, für Honorarvereinbarung/Begleitmail) */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Mandant (optional)</label>
                            <input
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                placeholder="Name, sofern bereits bekannt"
                                value={mandantName}
                                onChange={(e) => setMandantName(e.target.value)}
                            />
                        </div>

                        {/* E-Mail — optional. Mit Adresse wird das GwG-Hinweisschreiben
                            sofort erzeugt, ohne bleibt die Akte in "Neu" und die Adresse
                            wird beim Start der GwG-Prüfung nachgereicht. */}
                        {gwgPflichtig && (
                            <div>
                                <label className="block text-sm font-medium mb-1">
                                    E-Mail-Adresse des Mandanten (optional)
                                </label>
                                <input
                                    type="email"
                                    className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                    placeholder="mandant@beispiel.de"
                                    value={mandantEmail}
                                    onChange={(e) => setMandantEmail(e.target.value)}
                                />
                                <p className="text-xs text-neutral-400 mt-1">
                                    Wird für den Versand der Mandatsunterlagen und später für das
                                    GwG-Hinweisschreiben gebraucht. Lässt sich jederzeit nachtragen.
                                </p>
                            </div>
                        )}

                        {/* Anfrage */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Anfrage (optional)</label>
                            <textarea
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 min-h-20"
                                placeholder="Kurze Beschreibung des Anliegens / Kontext für die Begleitmail"
                                value={anfrage}
                                onChange={(e) => setAnfrage(e.target.value)}
                            />
                        </div>

                        {/* Datei-Upload */}
                        <div>
                            <label className="block text-sm font-medium mb-1">Unterlagen (optional)</label>
                            <input
                                ref={dateiInputRef}
                                type="file"
                                multiple
                                className="hidden"
                                onChange={(e) => setDateien((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
                            />
                            <button
                                type="button"
                                onClick={() => dateiInputRef.current?.click()}
                                className="border border-neutral-300 rounded-lg px-3 py-2 text-sm hover:bg-neutral-50 flex items-center gap-2 text-neutral-600"
                            >
                                <Paperclip className="w-3.5 h-3.5" /> Dateien auswählen
                            </button>
                            {dateien.length > 0 && (
                                <ul className="mt-2 space-y-1">
                                    {dateien.map((f, i) => (
                                        <li key={i} className="flex items-center justify-between text-xs text-neutral-600 bg-neutral-50 rounded px-2 py-1">
                                            <span className="truncate">{f.name}</span>
                                            <button
                                                type="button"
                                                onClick={() => setDateien((prev) => prev.filter((_, j) => j !== i))}
                                                className="text-neutral-400 hover:text-red-600 ml-2 shrink-0"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>

                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={akteLoading || !bezeichnung.trim()}
                                className="bg-neutral-900 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center gap-2"
                            >
                                {akteLoading && <Loader2 className="w-4 h-4 animate-spin" />}
                                Akte anlegen
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setShowAkteForm(false);
                                    setBezeichnung("");
                                    setRamicroNr("");
                                    setKategorie("sonstiges");
                                    setMandantName("");
                                    setMandantEmail("");
                                    setAnfrage("");
                                    setDateien([]);
                                }}
                                className="border border-neutral-300 rounded-lg px-4 py-2 text-sm hover:bg-neutral-100"
                            >
                                Abbrechen
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Suche */}
            {(matters.length > 0 || mitArchivierten) && (
                <div className="flex items-center gap-3 mb-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                        <input
                            type="text"
                            placeholder="Suchen nach Bezeichnung oder Aktennummer…"
                            value={suche}
                            onChange={(e) => setSuche(e.target.value)}
                            className="w-full border border-neutral-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                        />
                    </div>
                    {org?.role === "Admin" && (
                        <label className="flex items-center gap-1.5 text-xs text-neutral-500 whitespace-nowrap cursor-pointer">
                            <input
                                type="checkbox"
                                checked={mitArchivierten}
                                onChange={(e) => setMitArchivierten(e.target.checked)}
                                className="h-3.5 w-3.5 rounded border-neutral-300 accent-neutral-900"
                            />
                            Archivierte anzeigen
                        </label>
                    )}
                </div>
            )}

            {/* Mandatsliste */}
            {matters.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
                    <FolderOpen className="w-12 h-12 mb-4" />
                    <p className="text-base font-medium">Noch keine Mandate vorhanden</p>
                    <p className="text-sm mt-1">Klicken Sie oben auf „Neue Akte", um zu beginnen.</p>
                    <p className="text-xs mt-3 text-neutral-300">
                        Tipp: Aktennummer zuerst in RA-Micro anlegen, dann hier eintragen.
                    </p>
                </div>
            ) : gefiltert.length === 0 ? (
                <div className="text-center py-12 text-neutral-400 text-sm">
                    Kein Ergebnis für „{suche}"
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-4 py-3 font-medium text-neutral-600">
                                    RA-Micro Nr.
                                </th>
                                <th className="text-left px-4 py-3 font-medium text-neutral-600">Bezeichnung</th>
                                <th className="text-left px-4 py-3 font-medium text-neutral-600">Kategorie</th>
                                <th className="text-left px-4 py-3 font-medium text-neutral-600">Status</th>
                                <th className="text-left px-4 py-3 font-medium text-neutral-600">Geändert</th>
                            </tr>
                        </thead>
                        <tbody>
                            {gefiltert.map((m, i) => (
                                <tr
                                    key={m.id}
                                    onClick={() => router.push(`/mandate/${m.id}`)}
                                    className={`cursor-pointer hover:bg-blue-50/40 transition-colors ${i > 0 ? "border-t border-neutral-100" : ""} ${m.archiviert_am ? "opacity-50" : ""}`}
                                >
                                    <td className="px-4 py-3 font-mono text-neutral-600 font-medium">
                                        {m.aktenzeichen ?? <span className="text-neutral-300 font-normal">—</span>}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-neutral-900">
                                        {m.bezeichnung}
                                        {m.archiviert_am && (
                                            <span className="ml-2 text-[10px] font-normal uppercase tracking-wide text-neutral-400 border border-neutral-200 rounded px-1.5 py-0.5">
                                                Archiviert
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <KategorieBadge kategorie={m.kategorie} />
                                    </td>
                                    <td className="px-4 py-3">
                                        <StateBadge state={m.state} />
                                    </td>
                                    <td className="px-4 py-3 text-neutral-400 text-xs">
                                        {new Date(m.updated_at).toLocaleDateString("de-DE")}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
