"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, FileText, Upload, Download, Trash2, ShieldAlert } from "lucide-react";
import {
    listOrgs,
    listTemplates,
    uploadTemplate,
    deactivateTemplate,
    downloadTemplate,
    TEMPLATE_TYPES,
} from "@/app/lib/mandateApi";
import type { Org, MatterTemplate, MatterTemplateType } from "@/app/lib/mandateApi";

export default function VorlagenPage() {
    const router = useRouter();
    const [org, setOrg] = useState<Org | null>(null);
    const [templates, setTemplates] = useState<MatterTemplate[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [templateType, setTemplateType] = useState<MatterTemplateType>(TEMPLATE_TYPES[0].value);
    const [name, setName] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const isAdmin = org?.role === "Admin";

    const load = useCallback(async (currentOrg: Org) => {
        try {
            const data = await listTemplates(currentOrg.id);
            setTemplates(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler beim Laden");
        }
    }, []);

    useEffect(() => {
        listOrgs()
            .then((orgs) => {
                if (orgs.length === 0) {
                    router.push("/mandate");
                    return;
                }
                setOrg(orgs[0]);
                return load(orgs[0]);
            })
            .catch((e) => setError(e instanceof Error ? e.message : "Fehler"))
            .finally(() => setLoading(false));
    }, [load, router]);

    async function handleUpload(e: React.FormEvent) {
        e.preventDefault();
        if (!org || !file) return;
        setUploading(true);
        setError(null);
        try {
            await uploadTemplate(org.id, {
                templateType,
                name: name.trim() || file.name,
                file,
            });
            setName("");
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
            await load(org);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Upload fehlgeschlagen");
        } finally {
            setUploading(false);
        }
    }

    async function handleDeactivate(t: MatterTemplate) {
        if (!org) return;
        if (!confirm(`„${t.name}" (v${t.version_number}) deaktivieren?`)) return;
        setBusyId(t.id);
        try {
            await deactivateTemplate(org.id, t.id);
            await load(org);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setBusyId(null);
        }
    }

    async function handleDownload(t: MatterTemplate) {
        if (!org) return;
        setBusyId(t.id);
        try {
            await downloadTemplate(org.id, t);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setBusyId(null);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
            </div>
        );
    }

    const grouped = TEMPLATE_TYPES.map((tt) => ({
        ...tt,
        versions: templates
            .filter((t) => t.template_type === tt.value)
            .sort((a, b) => b.version_number - a.version_number),
    }));

    return (
        <div className="max-w-4xl mx-auto px-4 py-8">
            <div className="mb-6">
                <h1 className="text-2xl font-semibold">Vorlagenverwaltung</h1>
                {org && <p className="text-sm text-neutral-500 mt-0.5">{org.name}</p>}
                <p className="text-sm text-neutral-500 mt-2">
                    DOCX-Vorlagen mit <code className="bg-neutral-100 px-1 rounded text-xs">{"{{PLATZHALTER}}"}</code>-Syntax
                    (z. B. <code className="bg-neutral-100 px-1 rounded text-xs">{"{{MANDANT_NAME}}"}</code>) für die
                    automatische Dokumenterzeugung. Ohne aktive Vorlage kann das jeweilige Dokument nicht erzeugt werden.
                </p>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {!isAdmin && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-6 text-sm">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    Nur Admins können Vorlagen hochladen oder deaktivieren. Sie sehen die aktuelle Übersicht.
                </div>
            )}

            {isAdmin && (
                <div className="border-2 border-neutral-900 rounded-xl p-6 mb-8 bg-white shadow-sm">
                    <h2 className="text-base font-semibold mb-4">Neue Vorlagenversion hochladen</h2>
                    <form onSubmit={(e) => void handleUpload(e)} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium mb-1">Dokumenttyp</label>
                            <select
                                value={templateType}
                                onChange={(e) => setTemplateType(e.target.value as MatterTemplateType)}
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-white"
                            >
                                {TEMPLATE_TYPES.map((tt) => (
                                    <option key={tt.value} value={tt.value}>{tt.label}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">Bezeichnung (optional)</label>
                            <input
                                className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                                placeholder="z.B. Mandatsvereinbarung Standard 2026"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-1">
                                DOCX-Datei <span className="text-red-500 ml-0.5">*</span>
                            </label>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".docx"
                                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                                className="block w-full text-sm text-neutral-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border file:border-neutral-300 file:text-sm file:bg-white file:hover:bg-neutral-50"
                                required
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={uploading || !file}
                            className="bg-neutral-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-neutral-700 disabled:opacity-40 flex items-center gap-2"
                        >
                            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            Hochladen &amp; aktivieren
                        </button>
                    </form>
                </div>
            )}

            <div className="space-y-6">
                {grouped.map((g) => (
                    <div key={g.value} className="border border-neutral-200 rounded-xl overflow-hidden">
                        <div className="bg-neutral-50 border-b border-neutral-200 px-4 py-3 flex items-center gap-2">
                            <FileText className="w-4 h-4 text-neutral-500" />
                            <span className="font-medium text-sm">{g.label}</span>
                            <code className="text-[10px] text-neutral-400 ml-1">{g.value}</code>
                        </div>
                        {g.versions.length === 0 ? (
                            <div className="px-4 py-4 text-sm text-neutral-400">
                                Keine Vorlage hinterlegt — Dokumenterzeugung für diesen Typ ist derzeit nicht möglich.
                            </div>
                        ) : (
                            <ul>
                                {g.versions.map((t, i) => (
                                    <li
                                        key={t.id}
                                        className={`flex items-center justify-between px-4 py-3 text-sm ${i > 0 ? "border-t border-neutral-100" : ""} ${!t.is_active ? "opacity-50" : ""}`}
                                    >
                                        <div>
                                            <span className="font-medium">{t.name}</span>
                                            <span className="text-neutral-400 ml-2">v{t.version_number}</span>
                                            {t.is_active && (
                                                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 align-middle">
                                                    aktiv
                                                </span>
                                            )}
                                            <div className="text-xs text-neutral-400 mt-0.5">
                                                {new Date(t.created_at).toLocaleDateString("de-DE")}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => void handleDownload(t)}
                                                disabled={busyId === t.id}
                                                className="border border-neutral-200 rounded-lg p-2 text-neutral-500 hover:bg-neutral-50 disabled:opacity-40"
                                                title="Herunterladen"
                                            >
                                                <Download className="w-3.5 h-3.5" />
                                            </button>
                                            {isAdmin && t.is_active && (
                                                <button
                                                    onClick={() => void handleDeactivate(t)}
                                                    disabled={busyId === t.id}
                                                    className="border border-neutral-200 rounded-lg p-2 text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                                                    title="Deaktivieren"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
