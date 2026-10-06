/**
 * Vorlagenverwaltung (matter_templates).
 *
 * Admin-Bereich zum Hochladen/Verwalten der DOCX-Vorlagen, die von
 * onboarding.ts und onboardingPaket.ts per {{KEY}}-Platzhalter befüllt
 * werden (Anschreiben, Honorarvereinbarung, Vollmacht, Anspruchsschreiben,
 * Klageschrift). Ohne aktive Vorlage bricht die jeweilige Generierung mit
 * "Vorlage fehlt" ab.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";
import { uploadFile, downloadFile, buildContentDisposition } from "../lib/storage";
import { singleFileUpload } from "../lib/upload";

export const matterTemplatesRouter = Router({ mergeParams: true });

type Db = ReturnType<typeof createServerSupabase>;

const TEMPLATE_TYPES = [
    "ONBOARDING_ANSCHREIBEN",
    "ONBOARDING_HONORARVEREINBARUNG",
    "ONBOARDING_VOLLMACHT",
    // Gerichtliche Vollmacht (Prozessvollmacht, § 80 ZPO) — eigener Typ,
    // getrennt von der außergerichtlichen ONBOARDING_VOLLMACHT. Wird einzeln
    // erzeugt, nicht als Teil des Onboarding-Pakets (siehe onboarding.ts).
    "ONBOARDING_PROZESSVOLLMACHT",
    "ONBOARDING_WIDERRUFSBELEHRUNG",
    // PRE9/PRE10: Der Fragebogen geht dem Interessenten schon vor der
    // Aktenanlage zu (WF-001) und kommt handschriftlich ausgefüllt zurück.
    "PRE_FRAGEBOGEN",
    "ANSPRUCH_SCHREIBEN",
    "KLAGE_SCHRIFT",
] as const;

const DOCX_MIME =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

async function getOrgRole(orgId: string, userId: string, db: Db): Promise<string | null> {
    const { data: member } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
    return member?.role ?? null;
}

function sanitizeFilename(name: string): string {
    return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(-120) || "vorlage.docx";
}

// GET /orgs/:orgId/templates — alle Vorlagen (inkl. Versionshistorie) für die Org
matterTemplatesRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { orgId } = req.params;
    const db = createServerSupabase();

    const role = await getOrgRole(orgId, userId, db);
    if (!role) return void res.status(403).json({ detail: "Access denied" });

    const { data, error } = await db
        .from("matter_templates")
        .select("id, template_type, name, is_active, version_number, created_at")
        .eq("org_id", orgId)
        .order("template_type", { ascending: true })
        .order("version_number", { ascending: false });

    if (error) return void res.status(500).json({ detail: error.message });
    res.json(data ?? []);
});

// POST /orgs/:orgId/templates — neue Vorlagenversion hochladen (nur Admin)
matterTemplatesRouter.post(
    "/",
    requireAuth,
    singleFileUpload("file"),
    async (req, res) => {
        const userId = res.locals.userId as string;
        const { orgId } = req.params;
        const db = createServerSupabase();

        const role = await getOrgRole(orgId, userId, db);
        if (role !== "Admin") {
            return void res.status(403).json({ detail: "Nur Admins dürfen Vorlagen hochladen" });
        }

        const templateType = String(req.body?.template_type ?? "");
        if (!(TEMPLATE_TYPES as readonly string[]).includes(templateType)) {
            return void res.status(400).json({
                detail: `Ungültiger template_type. Erlaubt: ${TEMPLATE_TYPES.join(", ")}`,
            });
        }

        const file = req.file;
        if (!file) return void res.status(400).json({ detail: "Datei fehlt" });
        if (file.mimetype !== DOCX_MIME) {
            return void res
                .status(400)
                .json({ detail: "Nur .docx-Dateien werden als Vorlage unterstützt" });
        }

        const name =
            String(req.body?.name ?? "").trim() || file.originalname || templateType;

        const { data: prev } = await db
            .from("matter_templates")
            .select("id, version_number")
            .eq("org_id", orgId)
            .eq("template_type", templateType)
            .eq("is_active", true)
            .maybeSingle();

        const nextVersion = (prev?.version_number ?? 0) + 1;
        const storagePath = `templates/${orgId}/${templateType}/v${nextVersion}-${sanitizeFilename(file.originalname)}`;

        try {
            await uploadFile(storagePath, file.buffer, DOCX_MIME);
        } catch (err) {
            return void res.status(500).json({
                detail: err instanceof Error ? err.message : "Upload fehlgeschlagen",
            });
        }

        if (prev) {
            await db.from("matter_templates").update({ is_active: false }).eq("id", prev.id);
        }

        const { data: inserted, error } = await db
            .from("matter_templates")
            .insert({
                org_id: orgId,
                template_type: templateType,
                name,
                storage_path: storagePath,
                is_active: true,
                version_number: nextVersion,
                created_by: userId,
            })
            .select("id, template_type, name, is_active, version_number, created_at")
            .single();

        if (error) return void res.status(500).json({ detail: error.message });
        res.status(201).json(inserted);
    },
);

// GET /orgs/:orgId/templates/:id/download — Vorlage zur Kontrolle herunterladen
matterTemplatesRouter.get("/:id/download", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { orgId, id } = req.params;
    const db = createServerSupabase();

    const role = await getOrgRole(orgId, userId, db);
    if (!role) return void res.status(403).json({ detail: "Access denied" });

    const { data: template } = await db
        .from("matter_templates")
        .select("name, storage_path")
        .eq("id", id)
        .eq("org_id", orgId)
        .maybeSingle();

    if (!template) return void res.status(404).json({ detail: "Vorlage nicht gefunden" });

    const raw = await downloadFile(template.storage_path);
    if (!raw) return void res.status(404).json({ detail: "Datei nicht gefunden" });

    res.setHeader("Content-Type", DOCX_MIME);
    res.setHeader(
        "Content-Disposition",
        buildContentDisposition("attachment", `${template.name}.docx`),
    );
    res.send(Buffer.from(raw));
});

// DELETE /orgs/:orgId/templates/:id — Vorlagenversion deaktivieren (nur Admin)
matterTemplatesRouter.delete("/:id", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { orgId, id } = req.params;
    const db = createServerSupabase();

    const role = await getOrgRole(orgId, userId, db);
    if (role !== "Admin") {
        return void res.status(403).json({ detail: "Nur Admins dürfen Vorlagen deaktivieren" });
    }

    const { error } = await db
        .from("matter_templates")
        .update({ is_active: false })
        .eq("id", id)
        .eq("org_id", orgId);

    if (error) return void res.status(500).json({ detail: error.message });
    res.status(204).end();
});
