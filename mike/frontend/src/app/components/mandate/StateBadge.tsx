const STATE_LABELS: Record<string, string> = {
    NEU: "Neu",
    GWG_ANSCHREIBEN_ERZEUGT: "GwG-Anschreiben erzeugt",
    GWG_ANSCHREIBEN_VERSANDT: "GwG-Anschreiben versandt",
    GWG_GEPRUEFT: "GwG geprüft",
    AUFNAHME_ERFASST: "Aufnahme erfasst",
    ONBOARDING_ERZEUGT: "Onboarding erzeugt",
    ONBOARDING_VERSANDT: "Onboarding versandt",
    RUECKLAUF_BESTAETIGT: "Rücklauf bestätigt",
    ANSPRUCH_ENTWURF: "Anspruch (Entwurf)",
    ANSPRUCH_FREIGEGEBEN: "Anspruch freigegeben",
    ANSPRUCH_VERSANDT: "Anspruch versandt",
    FRIST_LAEUFT: "Frist läuft",
    FRIST_ABGELAUFEN: "Frist abgelaufen",
    KLAGE_ENTWURF: "Klage (Entwurf)",
    KLAGE_GEPRUEFT: "Klage geprüft",
    KLAGE_EINGEREICHT: "Klage eingereicht",
};

const STATE_COLORS: Record<string, string> = {
    NEU: "bg-neutral-100 text-neutral-600",
    GWG_ANSCHREIBEN_ERZEUGT: "bg-teal-100 text-teal-700",
    GWG_ANSCHREIBEN_VERSANDT: "bg-teal-100 text-teal-700",
    GWG_GEPRUEFT: "bg-teal-200 text-teal-800",
    AUFNAHME_ERFASST: "bg-blue-100 text-blue-700",
    ONBOARDING_ERZEUGT: "bg-yellow-100 text-yellow-700",
    ONBOARDING_VERSANDT: "bg-yellow-100 text-yellow-700",
    RUECKLAUF_BESTAETIGT: "bg-green-100 text-green-700",
    ANSPRUCH_ENTWURF: "bg-orange-100 text-orange-700",
    ANSPRUCH_FREIGEGEBEN: "bg-orange-100 text-orange-700",
    ANSPRUCH_VERSANDT: "bg-orange-200 text-orange-800",
    FRIST_LAEUFT: "bg-red-100 text-red-700",
    FRIST_ABGELAUFEN: "bg-red-200 text-red-800",
    KLAGE_ENTWURF: "bg-purple-100 text-purple-700",
    KLAGE_GEPRUEFT: "bg-purple-100 text-purple-700",
    KLAGE_EINGEREICHT: "bg-green-200 text-green-800",
};

export function StateBadge({ state }: { state: string }) {
    const label = STATE_LABELS[state] ?? state;
    const color = STATE_COLORS[state] ?? "bg-neutral-100 text-neutral-600";
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}>
            {label}
        </span>
    );
}
