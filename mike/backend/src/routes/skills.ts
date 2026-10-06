/**
 * Skills API — expose Klotzkette skill catalog to the frontend.
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { listSkills, findSkillById } from "../lib/klotzkette/skills";

export const skillsRouter = Router();

skillsRouter.get("/", requireAuth, (_req, res) => {
    res.json(listSkills());
});

skillsRouter.get("/:skillId(*)", requireAuth, (req, res) => {
    const skill = findSkillById(req.params.skillId);
    if (!skill) return void res.status(404).json({ detail: "Skill not found" });
    res.json(skill);
});
