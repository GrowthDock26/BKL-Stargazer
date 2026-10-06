"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Calendar, CheckCircle2, ChevronRight, BellRing, BellOff } from "lucide-react";
import { listOrgs, listAllFristen, markFristDone } from "@/app/lib/mandateApi";
import type { FristOverview } from "@/app/lib/mandateApi";
import { StateBadge } from "@/app/components/mandate/StateBadge";

type FilterMode = "offen" | "abgelaufen" | "alle";

export default function FristenPage() {
    const router = useRouter();
    const [fristen, setFristen] = useState<FristOverview[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [orgId, setOrgId] = useState<string | null>(null);
    const [filter, setFilter] = useState<FilterMode>("offen");
    const [markingId, setMarkingId] = useState<string | null>(null);

    const load = useCallback(async (oId?: string) => {
        const id = oId ?? orgId;
        if (!id) return;
        try {
            const data = await listAllFristen(id, { erledigt: filter === "alle" ? undefined : false });
            setFristen(data);
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setLoading(false);
        }
    }, [orgId, filter]);

    useEffect(() => {
        listOrgs()
            .then((orgs) => {
                if (orgs.length > 0) {
                    setOrgId(orgs[0].id);
                    return load(orgs[0].id);
                }
            })
            .catch((e) => setError(e instanceof Error ? e.message : "Fehler"))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (orgId) void load();
    }, [filter, orgId]);

    async function handleMarkDone(frist: FristOverview) {
        if (!frist.matters) return;
        setMarkingId(frist.id);
        try {
            await markFristDone(frist.matters.id, frist.id);
            await load();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Fehler");
        } finally {
            setMarkingId(null);
        }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const visible = fristen.filter((f) => {
        if (filter === "abgelaufen") return !f.erledigt && new Date(f.fristende) < today;
        if (filter === "offen") return !f.erledigt;
        return true;
    });

    // Group by week
    const urgent = visible.filter(
        (f) => !f.erledigt && new Date(f.fristende) <= new Date(today.getTime() + 7 * 86400000),
    );
    const later = visible.filter(
        (f) => f.erledigt || new Date(f.fristende) > new Date(today.getTime() + 7 * 86400000),
    );

    function FristRow({ f }: { f: FristOverview }) {
        const isOverdue = !f.erledigt && new Date(f.fristende) < today;
        const isDueThisWeek = !f.erledigt && new Date(f.fristende) >= today &&
            new Date(f.fristende) <= new Date(today.getTime() + 7 * 86400000);

        return (
            <tr className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50/50 transition-colors">
                <td className="px-4 py-3">
                    <button
                        onClick={() => void handleMarkDone(f)}
                        disabled={f.erledigt || markingId === f.id}
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            f.erledigt
                                ? "bg-green-500 border-green-500 text-white cursor-default"
                                : "border-neutral-300 hover:border-neutral-500"
                        }`}
                        title={f.erledigt ? "Erledigt" : "Als erledigt markieren"}
                    >
                        {f.erledigt && <CheckCircle2 className="w-2.5 h-2.5" />}
                        {markingId === f.id && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                    </button>
                </td>
                <td className="px-4 py-3">
                    <span className={`text-sm ${f.erledigt ? "line-through text-neutral-400" : "font-medium"}`}>
                        {f.typ}
                    </span>
                    {f.notiz && <p className="text-xs text-neutral-400 mt-0.5">{f.notiz}</p>}
                    {/* Benachrichtigungsstatus: macht sichtbar, ob überhaupt jemand
                        informiert wurde. Eine überfällige Frist ohne Benachrichtigung
                        ist der Fall, den man sofort sehen muss. */}
                    {!f.erledigt && (
                        f.ablauf_benachrichtigt_at || f.reminder_gesendet_at ? (
                            <p
                                className="text-[10px] text-neutral-400 mt-0.5 flex items-center gap-1"
                                title={
                                    f.ablauf_benachrichtigt_at
                                        ? `Ablauf-Benachrichtigung versandt am ${new Date(f.ablauf_benachrichtigt_at).toLocaleString("de-DE")}`
                                        : `Erinnerung versandt am ${new Date(f.reminder_gesendet_at!).toLocaleString("de-DE")}`
                                }
                            >
                                <BellRing className="w-3 h-3" />
                                {f.ablauf_benachrichtigt_at ? "Ablauf gemeldet" : "Erinnerung versandt"}
                            </p>
                        ) : isOverdue ? (
                            <p
                                className="text-[10px] text-red-500 mt-0.5 flex items-center gap-1 font-medium"
                                title="Diese Frist ist abgelaufen, es wurde aber noch keine Benachrichtigung versandt. SMTP-Konfiguration und FRISTEN_NOTIFY_EMAIL prüfen."
                            >
                                <BellOff className="w-3 h-3" />
                                keine Benachrichtigung
                            </p>
                        ) : null
                    )}
                </td>
                <td className="px-4 py-3">
                    {f.matters ? (
                        <button
                            onClick={() => router.push(`/mandate/${f.matters!.id}`)}
                            className="text-sm text-neutral-700 hover:text-neutral-900 flex items-center gap-1"
                        >
                            <span className="truncate max-w-[160px]">
                                {f.matters.aktenzeichen
                                    ? <span className="font-mono text-xs text-neutral-500 mr-1">{f.matters.aktenzeichen}</span>
                                    : null}
                                {f.matters.bezeichnung}
                            </span>
                            <ChevronRight className="w-3 h-3 flex-shrink-0" />
                        </button>
                    ) : (
                        <span className="text-sm text-neutral-400">—</span>
                    )}
                    {f.matters && (
                        <div className="mt-0.5">
                            <StateBadge state={f.matters.state} />
                        </div>
                    )}
                </td>
                <td className="px-4 py-3 text-right">
                    <span className={`font-mono text-sm ${
                        isOverdue
                            ? "text-red-600 font-semibold"
                            : isDueThisWeek
                            ? "text-orange-600 font-medium"
                            : f.erledigt
                            ? "text-neutral-400"
                            : "text-neutral-600"
                    }`}>
                        {new Date(f.fristende).toLocaleDateString("de-DE")}
                    </span>
                    {isOverdue && <p className="text-xs text-red-500 font-medium">Abgelaufen</p>}
                    {isDueThisWeek && !isOverdue && (
                        <p className="text-xs text-orange-500">Diese Woche</p>
                    )}
                </td>
            </tr>
        );
    }

    return (
        <div className="max-w-5xl mx-auto px-4 py-8">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-semibold flex items-center gap-2">
                        <Calendar className="w-6 h-6" /> Fristen-Übersicht
                    </h1>
                    <p className="text-sm text-neutral-500 mt-1">Alle offenen Fristen in der Kanzlei</p>
                </div>
                <button
                    onClick={() => router.push("/mandate")}
                    className="text-sm text-neutral-500 hover:text-neutral-800"
                >
                    ← Alle Mandate
                </button>
            </div>

            {/* Filter-Tabs */}
            <div className="flex gap-1 mb-6 border-b border-neutral-200">
                {(["offen", "abgelaufen", "alle"] as FilterMode[]).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-4 py-2 text-sm font-medium capitalize -mb-px transition-colors ${
                            filter === f
                                ? "border-b-2 border-neutral-900 text-neutral-900"
                                : "text-neutral-500 hover:text-neutral-700"
                        }`}
                    >
                        {f === "offen" ? "Offen" : f === "abgelaufen" ? "Abgelaufen" : "Alle"}
                    </button>
                ))}
            </div>

            {loading && (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="w-6 h-6 animate-spin text-neutral-400" />
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {error}
                </div>
            )}

            {!loading && visible.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
                    <Calendar className="w-10 h-10 mb-3" />
                    <p className="text-base">Keine Fristen vorhanden</p>
                    <p className="text-sm mt-1">
                        {filter === "offen" ? "Alle Fristen erledigt — gut gemacht!" : "Keine Fristen in dieser Ansicht"}
                    </p>
                </div>
            )}

            {!loading && visible.length > 0 && (
                <div className="space-y-6">
                    {/* Dringend (diese Woche + überfällig) */}
                    {urgent.length > 0 && (
                        <div>
                            <h2 className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-2 px-1">
                                Dringend ({urgent.length})
                            </h2>
                            <div className="border border-red-200 rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    <thead className="bg-red-50 border-b border-red-100">
                                        <tr>
                                            <th className="w-10 px-4 py-2.5" />
                                            <th className="text-left px-4 py-2.5 font-medium text-neutral-600">Frist</th>
                                            <th className="text-left px-4 py-2.5 font-medium text-neutral-600">Mandat</th>
                                            <th className="text-right px-4 py-2.5 font-medium text-neutral-600">Fristende</th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white">
                                        {urgent.map((f) => <FristRow key={f.id} f={f} />)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Später */}
                    {later.length > 0 && (
                        <div>
                            {urgent.length > 0 && (
                                <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-2 px-1">
                                    Weitere ({later.length})
                                </h2>
                            )}
                            <div className="border border-neutral-200 rounded-xl overflow-hidden">
                                <table className="w-full text-sm">
                                    {urgent.length === 0 && (
                                        <thead className="bg-neutral-50 border-b border-neutral-200">
                                            <tr>
                                                <th className="w-10 px-4 py-2.5" />
                                                <th className="text-left px-4 py-2.5 font-medium text-neutral-600">Frist</th>
                                                <th className="text-left px-4 py-2.5 font-medium text-neutral-600">Mandat</th>
                                                <th className="text-right px-4 py-2.5 font-medium text-neutral-600">Fristende</th>
                                            </tr>
                                        </thead>
                                    )}
                                    <tbody className="bg-white">
                                        {later.map((f) => <FristRow key={f.id} f={f} />)}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
