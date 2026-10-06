const KATEGORIE_LABELS: Record<string, string> = {
    erbrecht: "Erbrecht",
    gesellschaftsrecht: "Gesellschaftsrecht",
    kapitalmarktrecht: "Kapitalmarktrecht",
    pro_real: "Pro Real Mandat",
    steuerrecht: "Steuerrecht",
    sonstiges: "sonstiges Beratungsmandat",
};

const KATEGORIE_COLORS: Record<string, string> = {
    erbrecht: "bg-indigo-100 text-indigo-700",
    gesellschaftsrecht: "bg-teal-100 text-teal-700",
    kapitalmarktrecht: "bg-amber-100 text-amber-700",
    pro_real: "bg-pink-100 text-pink-700",
    steuerrecht: "bg-cyan-100 text-cyan-700",
    sonstiges: "bg-neutral-100 text-neutral-600",
};

export function KategorieBadge({ kategorie }: { kategorie: string }) {
    const label = KATEGORIE_LABELS[kategorie] ?? kategorie;
    const color = KATEGORIE_COLORS[kategorie] ?? "bg-neutral-100 text-neutral-600";
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
            {label}
        </span>
    );
}
