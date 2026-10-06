"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, AlertTriangle } from "lucide-react";

// ---------------------------------------------------------------------------
// RVG-Tabellen (§ 13 RVG, Stand 2023) — identisch mit backend/src/lib/tools/rvg.ts
// ---------------------------------------------------------------------------

type GebührenStufe = { bis: number; gebuehr: number };

const RVG_TABELLE: GebührenStufe[] = [
    { bis: 500, gebuehr: 49 }, { bis: 1000, gebuehr: 88 }, { bis: 1500, gebuehr: 127 },
    { bis: 2000, gebuehr: 166 }, { bis: 3000, gebuehr: 222 }, { bis: 4000, gebuehr: 278 },
    { bis: 5000, gebuehr: 334 }, { bis: 6000, gebuehr: 390 }, { bis: 7000, gebuehr: 446 },
    { bis: 8000, gebuehr: 502 }, { bis: 9000, gebuehr: 558 }, { bis: 10000, gebuehr: 614 },
    { bis: 13000, gebuehr: 714 }, { bis: 16000, gebuehr: 814 }, { bis: 19000, gebuehr: 914 },
    { bis: 22000, gebuehr: 1014 }, { bis: 25000, gebuehr: 1114 }, { bis: 30000, gebuehr: 1264 },
    { bis: 35000, gebuehr: 1414 }, { bis: 40000, gebuehr: 1564 }, { bis: 45000, gebuehr: 1714 },
    { bis: 50000, gebuehr: 1864 }, { bis: 65000, gebuehr: 2214 }, { bis: 80000, gebuehr: 2564 },
    { bis: 95000, gebuehr: 2914 }, { bis: 110000, gebuehr: 3264 }, { bis: 125000, gebuehr: 3614 },
    { bis: 140000, gebuehr: 3964 }, { bis: 155000, gebuehr: 4314 }, { bis: 170000, gebuehr: 4664 },
    { bis: 185000, gebuehr: 5014 }, { bis: 200000, gebuehr: 5364 }, { bis: 230000, gebuehr: 6014 },
    { bis: 260000, gebuehr: 6664 }, { bis: 290000, gebuehr: 7314 }, { bis: 320000, gebuehr: 7964 },
    { bis: 350000, gebuehr: 8614 }, { bis: 380000, gebuehr: 9264 }, { bis: 410000, gebuehr: 9914 },
    { bis: 440000, gebuehr: 10564 }, { bis: 470000, gebuehr: 11214 }, { bis: 500000, gebuehr: 11864 },
];

const GKG_TABELLE: GebührenStufe[] = [
    { bis: 500, gebuehr: 38 }, { bis: 1000, gebuehr: 58 }, { bis: 1500, gebuehr: 78 },
    { bis: 2000, gebuehr: 98 }, { bis: 3000, gebuehr: 118 }, { bis: 4000, gebuehr: 138 },
    { bis: 5000, gebuehr: 158 }, { bis: 6000, gebuehr: 178 }, { bis: 7000, gebuehr: 198 },
    { bis: 8000, gebuehr: 218 }, { bis: 9000, gebuehr: 238 }, { bis: 10000, gebuehr: 258 },
    { bis: 13000, gebuehr: 298 }, { bis: 16000, gebuehr: 338 }, { bis: 19000, gebuehr: 378 },
    { bis: 22000, gebuehr: 418 }, { bis: 25000, gebuehr: 458 }, { bis: 30000, gebuehr: 498 },
    { bis: 35000, gebuehr: 548 }, { bis: 40000, gebuehr: 598 }, { bis: 45000, gebuehr: 648 },
    { bis: 50000, gebuehr: 698 }, { bis: 65000, gebuehr: 798 }, { bis: 80000, gebuehr: 898 },
    { bis: 95000, gebuehr: 998 }, { bis: 110000, gebuehr: 1098 }, { bis: 125000, gebuehr: 1198 },
    { bis: 140000, gebuehr: 1298 }, { bis: 155000, gebuehr: 1398 }, { bis: 170000, gebuehr: 1498 },
    { bis: 185000, gebuehr: 1598 }, { bis: 200000, gebuehr: 1698 }, { bis: 230000, gebuehr: 1898 },
    { bis: 260000, gebuehr: 2098 }, { bis: 290000, gebuehr: 2298 }, { bis: 320000, gebuehr: 2498 },
    { bis: 350000, gebuehr: 2698 }, { bis: 500000, gebuehr: 3298 },
];

function einfacheGebuehr(streitwert: number): number {
    if (streitwert <= 0) return 0;
    for (const s of RVG_TABELLE) if (streitwert <= s.bis) return s.gebuehr;
    const basis = RVG_TABELLE[RVG_TABELLE.length - 1].gebuehr;
    return basis + Math.ceil((streitwert - 500000) / 50000) * 400;
}

function gerichtsGebuehr(streitwert: number): number {
    if (streitwert <= 0) return 0;
    for (const s of GKG_TABELLE) if (streitwert <= s.bis) return s.gebuehr;
    const basis = GKG_TABELLE[GKG_TABELLE.length - 1].gebuehr;
    return basis + Math.ceil((streitwert - 500000) / 50000) * 150;
}

type Art = "beratung" | "außergerichtlich" | "klage";

type Posten = { label: string; faktor: string; netto: number };

function berechne(streitwert: number, art: Art, ust: number): {
    eg: number;
    posten: Posten[];
    netto: number;
    ustBetrag: number;
    brutto: number;
    gerichtsgebuehren: number | null;
} {
    const eg = einfacheGebuehr(streitwert);
    const posten: Posten[] = [];
    let netto = 0;

    if (art === "beratung") {
        const b = Math.min(eg, 250);
        posten.push({ label: "Beratungsgebühr (VV 2100)", faktor: "1,0 (max. 250 €)", netto: b });
        netto = b;
    } else if (art === "außergerichtlich") {
        const b = eg * 1.3;
        const auslagen = Math.min(b * 0.2, 20);
        posten.push({ label: "Geschäftsgebühr (VV 2300)", faktor: "1,3", netto: b });
        posten.push({ label: "Auslagenpauschale (VV 7002)", faktor: "20 % (max. 20 €)", netto: auslagen });
        netto = b + auslagen;
    } else {
        const vg = eg * 1.3;
        const tg = eg * 1.2;
        const auslagen = Math.min((vg + tg) * 0.2, 20);
        posten.push({ label: "Verfahrensgebühr (VV 3100)", faktor: "1,3", netto: vg });
        posten.push({ label: "Terminsgebühr (VV 3104)", faktor: "1,2", netto: tg });
        posten.push({ label: "Auslagenpauschale (VV 7002)", faktor: "20 % (max. 20 €)", netto: auslagen });
        netto = vg + tg + auslagen;
    }

    const ustBetrag = netto * ust;
    const brutto = netto + ustBetrag;
    const gerichtsgebuehren = art === "klage" ? gerichtsGebuehr(streitwert) * 3 : null;

    return { eg, posten, netto, ustBetrag, brutto, gerichtsgebuehren };
}

const EUR = (n: number) =>
    n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const ART_LABELS: Record<Art, string> = {
    beratung: "Beratung",
    außergerichtlich: "Außergerichtlich",
    klage: "Klage (1. Instanz)",
};

export default function RvgPage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();

    const [streitwertRaw, setStreitwertRaw] = useState("");
    const [art, setArt] = useState<Art>("außergerichtlich");
    const [ustSatz, setUstSatz] = useState(0.19);

    const streitwert = useMemo(() => {
        const n = parseFloat(streitwertRaw.replace(",", ".").replace(/[^0-9.]/g, ""));
        return isNaN(n) ? 0 : n;
    }, [streitwertRaw]);

    const result = useMemo(
        () => (streitwert > 0 ? berechne(streitwert, art, ustSatz) : null),
        [streitwert, art, ustSatz],
    );

    return (
        <div className="max-w-2xl mx-auto px-4 py-8">
            <button
                onClick={() => router.push(`/mandate/${id}`)}
                className="flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-800 mb-6"
            >
                <ArrowLeft className="w-4 h-4" /> Zurück zur Akte
            </button>

            <h1 className="text-2xl font-semibold mb-1">RVG-Gebührenrechner</h1>
            <p className="text-sm text-neutral-500 mb-6">
                Vereinfachte Berechnung nach RVG 2023 (§ 13 RVG). Keine Honorarvereinbarungen oder Sondertatbestände.
            </p>

            {/* Eingabe */}
            <div className="border border-neutral-200 rounded-xl p-5 space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Streitwert (€) <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            inputMode="decimal"
                            value={streitwertRaw}
                            onChange={(e) => setStreitwertRaw(e.target.value)}
                            placeholder="z.B. 15000"
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-1">Tätigkeitsart</label>
                        <select
                            value={art}
                            onChange={(e) => setArt(e.target.value as Art)}
                            className="w-full border border-neutral-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-white"
                        >
                            {(Object.entries(ART_LABELS) as [Art, string][]).map(([v, l]) => (
                                <option key={v} value={v}>{l}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">Umsatzsteuersatz</label>
                    <div className="flex gap-2">
                        {[0.19, 0.07, 0].map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => setUstSatz(v)}
                                className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                                    ustSatz === v
                                        ? "bg-neutral-900 text-white border-neutral-900"
                                        : "border-neutral-300 hover:bg-neutral-50"
                                }`}
                            >
                                {v === 0 ? "0 % (befreit)" : `${(v * 100).toFixed(0)} %`}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Ergebnis */}
            {result && (
                <div className="border border-neutral-200 rounded-xl overflow-hidden mb-6">
                    <div className="bg-neutral-50 px-5 py-3 border-b border-neutral-200">
                        <span className="text-xs text-neutral-500">Einfache Gebühr (1,0) nach § 13 RVG</span>
                        <span className="ml-3 font-mono font-semibold">{EUR(result.eg)}</span>
                    </div>

                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-100">
                                <th className="text-left px-5 py-2.5 font-medium text-neutral-600">Position</th>
                                <th className="text-right px-5 py-2.5 font-medium text-neutral-600">Faktor</th>
                                <th className="text-right px-5 py-2.5 font-medium text-neutral-600">Netto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {result.posten.map((p, i) => (
                                <tr key={i} className="border-b border-neutral-100 last:border-0">
                                    <td className="px-5 py-2.5">{p.label}</td>
                                    <td className="px-5 py-2.5 text-right text-neutral-500">{p.faktor}</td>
                                    <td className="px-5 py-2.5 text-right font-mono">{EUR(p.netto)}</td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot className="bg-neutral-50">
                            <tr className="border-t border-neutral-200">
                                <td colSpan={2} className="px-5 py-2.5 text-neutral-600">Netto</td>
                                <td className="px-5 py-2.5 text-right font-mono">{EUR(result.netto)}</td>
                            </tr>
                            {ustSatz > 0 && (
                                <tr>
                                    <td colSpan={2} className="px-5 py-1.5 text-neutral-500 text-xs">
                                        zzgl. {(ustSatz * 100).toFixed(0)} % USt.
                                    </td>
                                    <td className="px-5 py-1.5 text-right font-mono text-xs text-neutral-500">
                                        {EUR(result.ustBetrag)}
                                    </td>
                                </tr>
                            )}
                            <tr className="border-t border-neutral-200">
                                <td colSpan={2} className="px-5 py-2.5 font-semibold">Gesamt (brutto)</td>
                                <td className="px-5 py-2.5 text-right font-mono font-semibold text-lg">
                                    {EUR(result.brutto)}
                                </td>
                            </tr>
                            {result.gerichtsgebuehren !== null && (
                                <tr className="border-t border-neutral-200">
                                    <td colSpan={2} className="px-5 py-2.5 text-neutral-600">
                                        Gerichtsgebühren (GKG, 3-fach)
                                    </td>
                                    <td className="px-5 py-2.5 text-right font-mono">
                                        {EUR(result.gerichtsgebuehren)}
                                    </td>
                                </tr>
                            )}
                        </tfoot>
                    </table>
                </div>
            )}

            {/* Disclaimer */}
            <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>
                    <strong>Keine Rechtsberatung.</strong> Berechnung nach RVG 2023 (§ 13 Abs. 1) ohne
                    Berücksichtigung von Rahmengebühren, Einigungsgebühr, Sondertatbeständen und
                    Auslagen über VV 7002 hinaus. Honorarvereinbarungen (§ 3a RVG) gehen vor und
                    sind stets in Textform zu schließen. Anwaltliche Überprüfung erforderlich.
                </p>
            </div>
        </div>
    );
}
