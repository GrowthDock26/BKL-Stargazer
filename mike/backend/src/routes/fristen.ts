/**
 * Org-weite Fristen-Übersicht.
 * GET /fristen?org_id=xxx[&erledigt=false][&days=30]
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { createServerSupabase } from "../lib/supabase";

export const fristenRouter = Router();

fristenRouter.get("/", requireAuth, async (req, res) => {
    const userId = res.locals.userId as string;
    const { org_id, erledigt, days } = req.query;

    if (!org_id || typeof org_id !== "string") {
        return void res.status(400).json({ detail: "org_id ist erforderlich" });
    }

    const db = createServerSupabase();

    // Verify membership
    const { data: member } = await db
        .from("org_members")
        .select("role")
        .eq("user_id", userId)
        .eq("org_id", org_id)
        .maybeSingle();

    if (!member) return void res.status(403).json({ detail: "Access denied" });

    let query = db
        .from("fristen")
        .select(`
            id,
            typ,
            startdatum,
            fristende,
            reminderdatum,
            erledigt,
            notiz,
            reminder_gesendet_at,
            ablauf_benachrichtigt_at,
            created_at,
            matter_id,
            matters:matters!fristen_matter_id_fkey (
                id,
                aktenzeichen,
                bezeichnung,
                state
            )
        `)
        .eq("org_id", org_id)
        .order("fristende", { ascending: true });

    // Filter by erledigt
    if (erledigt === "false") {
        query = query.eq("erledigt", false);
    } else if (erledigt === "true") {
        query = query.eq("erledigt", true);
    }

    // Filter upcoming within N days
    if (days && !isNaN(Number(days))) {
        const until = new Date();
        until.setDate(until.getDate() + Number(days));
        query = query.lte("fristende", until.toISOString().slice(0, 10));
    }

    const { data, error } = await query;
    if (error) return void res.status(500).json({ detail: error.message });

    res.json(data ?? []);
});
