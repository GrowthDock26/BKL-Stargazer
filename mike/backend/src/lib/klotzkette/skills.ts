/**
 * Klotzkette skill catalog.
 *
 * Skills are loaded at startup from vendor/klotzkette by scanning SKILL.md
 * files. Each skill is a selectable workflow that injects a domain-specific
 * prompt block alongside the global zitierweise/methodik injection.
 *
 * The catalog is read-only — vendor/klotzkette is treated as an external
 * dependency and never written to.
 *
 * ERBRECHT: No erbrecht plugin exists in klotzkette (2026-05). A skeleton
 * is registered here and marked as "selbst zu befüllen".
 */

import fs from "fs";
import path from "path";

export type Skill = {
    id: string;           // slugified path: "arbeitsrecht/kuendigung-kschg"
    name: string;         // from SKILL.md frontmatter
    description: string;  // from SKILL.md frontmatter
    plugin: string;       // top-level plugin folder name
    promptBlock: string;  // full SKILL.md body (injected into system prompt)
    selfFill: boolean;    // true → stub, not yet fully authored
};

// ---------------------------------------------------------------------------
// SKILL.md parser
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^---\s*\n([\s\S]*?)\n---/;

function parseFrontmatter(raw: string): { name?: string; description?: string } {
    const match = FRONTMATTER_RE.exec(raw);
    if (!match) return {};
    const result: Record<string, string> = {};
    for (const line of match[1].split("\n")) {
        const colon = line.indexOf(":");
        if (colon < 1) continue;
        const key = line.slice(0, colon).trim();
        const value = line.slice(colon + 1).trim().replace(/^["']|["']$/g, "");
        result[key] = value;
    }
    return result;
}

function slugify(str: string): string {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}

// ---------------------------------------------------------------------------
// Catalog loading
// ---------------------------------------------------------------------------

const VENDOR_ROOT = path.resolve(__dirname, "../../../../../vendor/klotzkette");

function loadSkillsFromDisk(): Skill[] {
    const skills: Skill[] = [];

    if (!fs.existsSync(VENDOR_ROOT)) {
        console.warn("[skills] vendor/klotzkette not found — skipping skill load");
        return builtinStubs();
    }

    const topDirs = fs.readdirSync(VENDOR_ROOT, { withFileTypes: true })
        .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
        .map((d) => d.name);

    for (const plugin of topDirs) {
        const skillsDir = path.join(VENDOR_ROOT, plugin, "skills");
        if (!fs.existsSync(skillsDir)) continue;

        const skillFolders = fs.readdirSync(skillsDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => d.name);

        for (const skillFolder of skillFolders) {
            const skillMdPath = path.join(skillsDir, skillFolder, "SKILL.md");
            if (!fs.existsSync(skillMdPath)) continue;

            try {
                const raw = fs.readFileSync(skillMdPath, "utf8");
                const { name, description } = parseFrontmatter(raw);
                if (!name) continue;

                const body = raw.replace(FRONTMATTER_RE, "").trim();
                skills.push({
                    id: `${slugify(plugin)}/${slugify(skillFolder)}`,
                    name,
                    description: description ?? "",
                    plugin,
                    promptBlock: body,
                    selfFill: false,
                });
            } catch {
                // Skip unreadable files silently
            }
        }
    }

    // Add erbrecht stub only if no fachanwalt-erbrecht plugin was loaded
    const hasErbrecht = skills.some((s) => s.plugin.includes("erbrecht"));
    if (!hasErbrecht) skills.push(...builtinStubs());

    return skills;
}

function builtinStubs(): Skill[] {
    return [
        {
            id: "erbrecht/allgemein",
            name: "Erbrecht – Allgemein",
            description:
                "Einstiegs-Skill für erbrechtliche Mandate. " +
                "HINWEIS: Dieses Modul ist ein Gerüst und muss kanzleiintern befüllt werden. " +
                "Klotzkette enthält kein dediziertes Erbrecht-Plugin (Stand 2026-05).",
            plugin: "erbrecht",
            promptBlock:
                "## Erbrecht – Allgemein (Gerüst, selbst zu befüllen)\n\n" +
                "Dieses Modul enthält noch keine kanzleispezifischen Prompts. " +
                "Bitte erbrechtliche Standardbausteine (Testamentsgestaltung, " +
                "Erbscheinsverfahren, Pflichtteilsberechnung, Nachlassverwaltung) " +
                "durch den zuständigen Fachanwalt ergänzen.\n\n" +
                "Bis zur Befüllung gelten die globalen Regeln (Zitierweise, Methodik).",
            selfFill: true,
        },
    ];
}

// ---------------------------------------------------------------------------
// Singleton cache
// ---------------------------------------------------------------------------

let _catalog: Skill[] | null = null;

export function getSkillCatalog(): Skill[] {
    if (!_catalog) _catalog = loadSkillsFromDisk();
    return _catalog;
}

export function findSkillById(id: string): Skill | undefined {
    return getSkillCatalog().find((s) => s.id === id);
}

export function findSkillsByPlugin(plugin: string): Skill[] {
    return getSkillCatalog().filter((s) => s.plugin === plugin);
}

/** Returns a summary list suitable for the frontend skill picker. */
export function listSkills(): Pick<Skill, "id" | "name" | "description" | "plugin" | "selfFill">[] {
    return getSkillCatalog().map(({ id, name, description, plugin, selfFill }) => ({
        id,
        name,
        description,
        plugin,
        selfFill,
    }));
}
