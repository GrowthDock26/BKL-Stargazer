/**
 * Mandats-Zustandsmaschine (Matter Workflow State Machine).
 *
 * Modelliert den Lebensweg eines Mandats von der Aufnahme bis zur
 * Klageeinreichung. Jeder Übergang ist protokolliert (Audit-Event).
 *
 * Rollen-Gates werden hier definiert und in den Routes durchgesetzt.
 * Der Scheduler nutzt diese Definitionen für automatische Übergänge.
 */

export type MatterState =
    | "NEU"
    | "GWG_ANSCHREIBEN_ERZEUGT"
    | "GWG_ANSCHREIBEN_VERSANDT"
    | "GWG_GEPRUEFT"
    | "AUFNAHME_ERFASST"
    | "ONBOARDING_ERZEUGT"
    | "ONBOARDING_VERSANDT"
    | "RUECKLAUF_BESTAETIGT"
    | "ANSPRUCH_ENTWURF"
    | "ANSPRUCH_FREIGEGEBEN"
    | "ANSPRUCH_VERSANDT"
    | "FRIST_LAEUFT"
    | "FRIST_ABGELAUFEN"
    | "KLAGE_ENTWURF"
    | "KLAGE_GEPRUEFT"
    | "KLAGE_EINGEREICHT";

export type OrgRole = "Admin" | "Anwalt" | "Referendar" | "ReFa";

type TransitionDef = {
    from: MatterState;
    to: MatterState;
    /** Roles that may trigger this transition. */
    allowedRoles: OrgRole[];
    /** If true, the transition is triggered by the scheduler, not a user. */
    automated?: boolean;
    description: string;
};

const TRANSITIONS: TransitionDef[] = [
    {
        from: "NEU",
        to: "AUFNAHME_ERFASST",
        allowedRoles: ["Admin", "Anwalt", "Referendar", "ReFa"],
        description: "Aufnahmebogen ausgefüllt und gespeichert",
    },
    // GwG-Ablauf (nur für Kategorien kapitalmarktrecht, pro_real,
    // gesellschaftsrecht — siehe matters.ts). Andere Kategorien nutzen den
    // obigen direkten Übergang NEU → AUFNAHME_ERFASST unverändert.
    {
        from: "NEU",
        to: "GWG_ANSCHREIBEN_ERZEUGT",
        allowedRoles: ["Admin", "Anwalt", "Referendar", "ReFa"],
        description: "GwG-Hinweisschreiben mit Bitte um Personalausweis-Kopie erzeugt",
    },
    {
        from: "GWG_ANSCHREIBEN_ERZEUGT",
        to: "GWG_ANSCHREIBEN_VERSANDT",
        allowedRoles: ["Admin", "Anwalt", "ReFa"],
        description: "GwG-Hinweisschreiben an Mandanten versandt",
    },
    {
        from: "GWG_ANSCHREIBEN_VERSANDT",
        to: "GWG_GEPRUEFT",
        allowedRoles: ["Admin", "Anwalt"],
        description: "GwG-Risikoeinstufung durch Anwalt bestätigt (§ 10 Abs. 2 GwG)",
    },
    // Abwahl der Identifizierungsstrecke durch den Anwalt — etwa wenn die
    // Legitimierung bereits aus einem anderen Mandat vorliegt. Aus jedem
    // offenen Zustand heraus möglich, ausschließlich Anwalt/Admin, immer mit
    // protokollierter Begründung (routes/gwg.ts, POST /uebergehen).
    {
        from: "NEU",
        to: "GWG_GEPRUEFT",
        allowedRoles: ["Admin", "Anwalt"],
        description: "GwG-Prüfung durch Anwalt mit Begründung übergangen",
    },
    {
        from: "GWG_ANSCHREIBEN_ERZEUGT",
        to: "GWG_GEPRUEFT",
        allowedRoles: ["Admin", "Anwalt"],
        description: "GwG-Prüfung durch Anwalt mit Begründung übergangen",
    },
    {
        from: "GWG_GEPRUEFT",
        to: "AUFNAHME_ERFASST",
        allowedRoles: ["Admin", "Anwalt", "Referendar", "ReFa"],
        description: "Aufnahmebogen ausgefüllt und gespeichert (nach abgeschlossener GwG-Prüfung)",
    },
    {
        from: "AUFNAHME_ERFASST",
        to: "ONBOARDING_ERZEUGT",
        allowedRoles: ["Admin", "Anwalt", "Referendar"],
        description: "Onboarding-Dokumente (Anschreiben, Honorarvereinbarung, Vollmacht) erzeugt",
    },
    // Alternativweg, wenn die Mandatsunterlagen bereits vor der Aktenanlage
    // verschickt wurden (z.B. Pro-Real-Mandate über den Interessenten-Workflow,
    // siehe lib/interessent/unterlagen.ts) — es gibt dann nichts mehr zu
    // erzeugen oder zu versenden, nur die Akte auf den erreichten Stand zu
    // bringen. Kategorieunabhängig modelliert, damit die Zustandsmaschine
    // generisch bleibt; welche Kategorien diesen Weg tatsächlich nutzen,
    // entscheidet die aufrufende Route/UI.
    {
        from: "AUFNAHME_ERFASST",
        to: "ONBOARDING_VERSANDT",
        allowedRoles: ["Admin", "Anwalt"],
        description: "Mandatsunterlagen bereits vor der Aktenanlage verschickt — Onboarding-Erzeugung übersprungen",
    },
    {
        from: "ONBOARDING_ERZEUGT",
        to: "ONBOARDING_VERSANDT",
        allowedRoles: ["Admin", "Anwalt"],
        description: "Onboarding-PDFs per E-Mail an Mandanten versandt",
    },
    {
        from: "ONBOARDING_VERSANDT",
        to: "RUECKLAUF_BESTAETIGT",
        allowedRoles: ["Admin", "Anwalt", "ReFa"],
        description: "Unterzeichnete Vollmacht und Honorarvereinbarung eingegangen",
    },
    {
        from: "RUECKLAUF_BESTAETIGT",
        to: "ANSPRUCH_ENTWURF",
        allowedRoles: ["Anwalt"],
        description: "Anspruchsschreiben-Entwurf durch LLM erzeugt (Anwaltsprüfung ausstehend)",
    },
    {
        from: "ANSPRUCH_ENTWURF",
        to: "ANSPRUCH_FREIGEGEBEN",
        allowedRoles: ["Anwalt"],
        description: "Anspruchsschreiben durch Anwalt geprüft und freigegeben",
    },
    {
        from: "ANSPRUCH_FREIGEGEBEN",
        to: "ANSPRUCH_VERSANDT",
        allowedRoles: ["Anwalt", "Admin"],
        description: "Anspruchsschreiben versandt; Erwiderungsfrist gesetzt",
    },
    {
        from: "ANSPRUCH_VERSANDT",
        to: "FRIST_LAEUFT",
        allowedRoles: ["Admin", "Anwalt"],
        automated: true,
        description: "Erwiderungsfrist gesetzt und läuft",
    },
    {
        from: "FRIST_LAEUFT",
        to: "FRIST_ABGELAUFEN",
        allowedRoles: [],
        automated: true,
        description: "Erwiderungsfrist abgelaufen (Scheduler)",
    },
    {
        from: "FRIST_ABGELAUFEN",
        to: "KLAGE_ENTWURF",
        allowedRoles: [],
        automated: true,
        // Es wird KEIN Dokument erzeugt und NIEMAND benachrichtigt — der Zustand
        // markiert die Akte lediglich zur Klagevorbereitung. Eine Generierung
        // aus der Vorlage KLAGE_SCHRIFT existiert derzeit nicht.
        description: "Frist abgelaufen — Akte zur Klagevorbereitung markiert",
    },
    {
        from: "KLAGE_ENTWURF",
        to: "KLAGE_GEPRUEFT",
        allowedRoles: ["Anwalt"],
        description: "Klageschrift durch Anwalt geprüft",
    },
    {
        from: "KLAGE_GEPRUEFT",
        to: "KLAGE_EINGEREICHT",
        allowedRoles: ["Anwalt"],
        description: "Anwalt hat Klageschrift über beA eingereicht (§ 130d ZPO)",
    },
];

/** Lookup: from → list of valid transitions */
const TRANSITION_MAP = new Map<MatterState, TransitionDef[]>();
for (const t of TRANSITIONS) {
    const list = TRANSITION_MAP.get(t.from) ?? [];
    list.push(t);
    TRANSITION_MAP.set(t.from, list);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type TransitionResult =
    | { ok: true; from: MatterState; to: MatterState; description: string }
    | { ok: false; reason: string };

/**
 * Validates whether a transition from → to is allowed for the given role.
 * Does NOT persist anything — call this before writing to the DB.
 */
export function validateTransition(
    from: MatterState,
    to: MatterState,
    role: OrgRole | "scheduler",
): TransitionResult {
    const allowed = TRANSITION_MAP.get(from) ?? [];
    const def = allowed.find((t) => t.to === to);

    if (!def) {
        return {
            ok: false,
            reason: `Übergang ${from} → ${to} ist nicht definiert.`,
        };
    }

    if (role === "scheduler") {
        if (!def.automated) {
            return {
                ok: false,
                reason: `Übergang ${from} → ${to} ist nicht automatisch und erfordert eine Benutzeraktion.`,
            };
        }
        return { ok: true, from, to, description: def.description };
    }

    if (!def.allowedRoles.includes(role)) {
        return {
            ok: false,
            reason: `Rolle "${role}" darf den Übergang ${from} → ${to} nicht durchführen. ` +
                `Erlaubt: ${def.allowedRoles.join(", ") || "nur Scheduler"}.`,
        };
    }

    return { ok: true, from, to, description: def.description };
}

/** Returns all valid next states from a given current state. */
export function nextStates(current: MatterState): MatterState[] {
    return (TRANSITION_MAP.get(current) ?? []).map((t) => t.to);
}

/** Returns all automated transitions (used by the scheduler). */
export function automatedTransitions(): TransitionDef[] {
    return TRANSITIONS.filter((t) => t.automated);
}

export const ALL_STATES: MatterState[] = [
    "NEU",
    "GWG_ANSCHREIBEN_ERZEUGT",
    "GWG_ANSCHREIBEN_VERSANDT",
    "GWG_GEPRUEFT",
    "AUFNAHME_ERFASST",
    "ONBOARDING_ERZEUGT",
    "ONBOARDING_VERSANDT",
    "RUECKLAUF_BESTAETIGT",
    "ANSPRUCH_ENTWURF",
    "ANSPRUCH_FREIGEGEBEN",
    "ANSPRUCH_VERSANDT",
    "FRIST_LAEUFT",
    "FRIST_ABGELAUFEN",
    "KLAGE_ENTWURF",
    "KLAGE_GEPRUEFT",
    "KLAGE_EINGEREICHT",
];

export function isValidState(s: string): s is MatterState {
    return (ALL_STATES as string[]).includes(s);
}
