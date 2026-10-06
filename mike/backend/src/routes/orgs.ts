import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";

export const orgsRouter = Router();

type Db = ReturnType<typeof createServerSupabase>;

function slugify(name: string): string {
    return (
        name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
        "-" + Date.now().toString(36)
    );
}

async function getUserOrgs(userId: string, db: Db) {
    const { data: memberships } = await db
        .from("org_members")
        .select("role, org_id")
        .eq("user_id", userId);

    const orgIds = (memberships ?? []).map((m: { org_id: string }) => m.org_id);
    if (orgIds.length === 0) return [];

    const { data: orgs } = await db
        .from("organizations")
        .select("id, name, slug, created_at")
        .in("id", orgIds);

    return (orgs ?? []).map((org) => ({
        ...org,
        role: memberships?.find((m: { org_id: string }) => m.org_id === org.id)?.role ?? "Anwalt",
    }));
}

// GET /orgs — list user's organizations
orgsRouter.get("/", requireAuth, async (_req, res) => {
    const userId = res.locals.userId as string;
    const db = createServerSupabase();
    const orgs = await getUserOrgs(userId, db);
    res.json(orgs);
});

// POST /orgs — create a new organization, caller becomes Admin
orgsRouter.post("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { name } = req.body ?? {};

    if (!name?.trim()) {
        return void res.status(400).json({ detail: "name ist erforderlich" });
    }

    const db = createServerSupabase();
    const { data: org, error: orgErr } = await db
        .from("organizations")
        .insert({ name: String(name).trim(), slug: slugify(name) })
        .select("id, name, slug, created_at")
        .single();

    if (orgErr) return void res.status(500).json({ detail: orgErr.message });

    const { error: memberErr } = await db
        .from("org_members")
        .insert({ org_id: org.id, user_id: userId, role: "Admin" });

    if (memberErr) return void res.status(500).json({ detail: memberErr.message });

    res.status(201).json({ ...org, role: "Admin" });
});
