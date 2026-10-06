const RISIKO_LABELS: Record<string, string> = {
    niedrig: "Niedriges Risiko",
    mittel: "Mittleres Risiko",
    hoch: "Hohes Risiko",
    unvollstaendig: "Unvollständig",
    nicht_verpflichtet: "Nicht GwG-verpflichtet",
};

const RISIKO_COLORS: Record<string, string> = {
    niedrig: "bg-green-100 text-green-700",
    mittel: "bg-amber-100 text-amber-700",
    hoch: "bg-red-100 text-red-700",
    unvollstaendig: "bg-neutral-100 text-neutral-600",
    nicht_verpflichtet: "bg-neutral-100 text-neutral-500",
};

export function GwgRisikoBadge({ risikoklasse }: { risikoklasse: string }) {
    const label = RISIKO_LABELS[risikoklasse] ?? risikoklasse;
    const color = RISIKO_COLORS[risikoklasse] ?? "bg-neutral-100 text-neutral-600";
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
            {label}
        </span>
    );
}
