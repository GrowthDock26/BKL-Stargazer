import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { chatRouter } from "./routes/chat";
import { projectsRouter } from "./routes/projects";
import { projectChatRouter } from "./routes/projectChat";
import { documentsRouter } from "./routes/documents";
import { tabularRouter } from "./routes/tabular";
import { workflowsRouter } from "./routes/workflows";
import { userRouter } from "./routes/user";
import { downloadsRouter } from "./routes/downloads";
import { mattersRouter } from "./routes/matters";
import { intakeRouter } from "./routes/intake";
import { gwgRouter } from "./routes/gwg";
import { preRouter } from "./routes/pre";
import { interessentenRouter } from "./routes/interessenten";
import { onboardingRouter } from "./routes/onboarding";
import { anspruchRouter } from "./routes/anspruch";
import { fristenRouter } from "./routes/fristen";
import { erbrechtRouter } from "./routes/erbrecht";
import { kapitalmarktRouter } from "./routes/kapitalmarkt";
import { arbeitsrechtRouter } from "./routes/arbeitsrecht";
import { gesellschaftsrechtRouter } from "./routes/gesellschaftsrecht";
import { wissensbasisRouter } from "./routes/wissensbasis";
import { rechtsprechungRouter } from "./routes/rechtsprechung";
import { litigationRouter } from "./routes/litigation";
import { nachlassverzeichnisRouter } from "./routes/nachlassverzeichnis";
import { skillsRouter } from "./routes/skills";
import { orgsRouter } from "./routes/orgs";
import { matterTemplatesRouter } from "./routes/matterTemplates";
import { processExpiredFristen } from "./lib/matter/deadline-engine";
import { processFristenBenachrichtigungen } from "./lib/matter/fristen-notify";
import { createServerSupabase } from "./lib/supabase";

// ---------------------------------------------------------------------------
// Egress guard: verify at startup that LOGICC_API_KEY is set
// ---------------------------------------------------------------------------

if (!process.env.LOGICC_API_KEY?.trim()) {
    console.error(
        "[FATAL] LOGICC_API_KEY is not set. " +
        "This server refuses to start without the sole permitted LLM egress credential.",
    );
    process.exit(1);
}

if (!process.env.DOWNLOAD_SIGNING_SECRET?.trim()) {
    console.error(
        "[FATAL] DOWNLOAD_SIGNING_SECRET is not set. " +
        "Generate one with: openssl rand -hex 32",
    );
    process.exit(1);
}

const app = express();
const PORT = process.env.PORT ?? 3001;
const isProduction = process.env.NODE_ENV === "production";

function envInt(name: string, fallback: number): number {
    const raw = process.env[name];
    if (!raw) return fallback;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function minutes(value: number): number { return value * 60 * 1000; }
function hours(value: number): number { return minutes(value * 60); }

function makeLimiter(options: { windowMs: number; max: number; message?: string }) {
    return rateLimit({
        windowMs: options.windowMs,
        max: options.max,
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => req.method === "OPTIONS",
        message: { detail: options.message ?? "Too many requests. Please try again later." },
    });
}

const generalLimiter = makeLimiter({
    windowMs: minutes(envInt("RATE_LIMIT_GENERAL_WINDOW_MINUTES", 15)),
    max: envInt("RATE_LIMIT_GENERAL_MAX", 300),
});
const chatLimiter = makeLimiter({
    windowMs: minutes(envInt("RATE_LIMIT_CHAT_WINDOW_MINUTES", 15)),
    max: envInt("RATE_LIMIT_CHAT_MAX", 30),
    message: "Too many chat requests. Please try again later.",
});
const chatCreateLimiter = makeLimiter({
    windowMs: minutes(envInt("RATE_LIMIT_CHAT_CREATE_WINDOW_MINUTES", 15)),
    max: envInt("RATE_LIMIT_CHAT_CREATE_MAX", 60),
});
const uploadLimiter = makeLimiter({
    windowMs: hours(envInt("RATE_LIMIT_UPLOAD_WINDOW_HOURS", 1)),
    max: envInt("RATE_LIMIT_UPLOAD_MAX", 50),
    message: "Too many upload requests. Please try again later.",
});

app.disable("x-powered-by");
app.set("trust proxy", envInt("TRUST_PROXY_HOPS", 1));

app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
        hsts: isProduction ? { maxAge: 15552000, includeSubDomains: true } : false,
        referrerPolicy: { policy: "no-referrer" },
    }),
);

app.use(
    cors({
        origin: process.env.FRONTEND_URL ?? "http://localhost:3000",
        credentials: true,
    }),
);

app.use(generalLimiter);
app.use(express.json({ limit: "50mb" }));

// Rate limiting for specific routes
app.post("/chat", chatLimiter);
app.post("/projects/:projectId/chat", chatLimiter);
app.post("/tabular-review/:reviewId/chat", chatLimiter);
app.post("/tabular-review/:reviewId/generate", chatLimiter);
app.post("/chat/create", chatCreateLimiter);
app.post("/chat/:chatId/generate-title", chatCreateLimiter);
app.post("/single-documents", uploadLimiter);
app.post("/single-documents/:documentId/versions", uploadLimiter);
app.post("/projects/:projectId/documents", uploadLimiter);
app.post("/matters/:matterId/intake/", uploadLimiter);

// Rate limiting — BKL KI-Assistenten (20 Anfragen/15 Min. pro Nutzer)
const kiLimiter = makeLimiter({
    windowMs: minutes(envInt("RATE_LIMIT_KI_WINDOW_MINUTES", 15)),
    max: envInt("RATE_LIMIT_KI_MAX", 20),
    message: "Zu viele KI-Anfragen. Bitte in wenigen Minuten erneut versuchen.",
});
app.post("/erbrecht/chat", kiLimiter);
app.post("/kapitalmarkt/chat", kiLimiter);
app.post("/arbeitsrecht/chat", kiLimiter);
app.post("/arbeitsrecht/vertrag-pruefen", kiLimiter);
app.post("/gesellschaftsrecht/chat", kiLimiter);
app.post("/gesellschaftsrecht/vertrag-pruefen", kiLimiter);
app.post("/wissensbasis/:id/analysieren", kiLimiter);
app.post("/rechtsprechung/import", kiLimiter);
app.post("/litigation/chat", kiLimiter);
app.post("/litigation/analysieren", kiLimiter);
app.post("/kapitalmarkt/analysieren", kiLimiter);
app.post("/matters/:matterId/nachlassverzeichnis/kontoauszug/analysieren", kiLimiter);
app.post("/matters/:matterId/nachlassverzeichnis/grundbuch/analysieren", kiLimiter);
app.post("/matters/:matterId/nachlassverzeichnis/handelsregister/analysieren", kiLimiter);
app.post("/matters/:matterId/nachlassverzeichnis/schreiben/ermittlung", kiLimiter);
app.post("/matters/:matterId/nachlassverzeichnis/schreiben/kuendigung", kiLimiter);
app.get("/matters/:matterId/nachlassverzeichnis/entwurf", kiLimiter);
app.post("/matters/:matterId/intake/analyze", kiLimiter);
app.post("/matters/:matterId/gwg/personalausweis", kiLimiter);
app.post("/matters/:matterId/pre/analyse", kiLimiter);
app.post("/matters/:matterId/anspruch/generate", kiLimiter);
app.post("/matters/:matterId/onboarding/generate", kiLimiter);

// ---------------------------------------------------------------------------
// Routes — mike original
// ---------------------------------------------------------------------------
app.use("/chat", chatRouter);
app.use("/projects", projectsRouter);
app.use("/projects/:projectId/chat", projectChatRouter);
app.use("/single-documents", documentsRouter);
app.use("/tabular-review", tabularRouter);
app.use("/workflows", workflowsRouter);
app.use("/user", userRouter);
app.use("/users", userRouter);
app.use("/download", downloadsRouter);

// ---------------------------------------------------------------------------
// Routes — BKL Legal OS extensions
// ---------------------------------------------------------------------------
app.use("/matters", mattersRouter);
app.use("/matters/:matterId/intake", intakeRouter);
app.use("/matters/:matterId/gwg", gwgRouter);
app.use("/matters/:matterId/pre", preRouter);
app.use("/matters/:matterId/onboarding", onboardingRouter);
app.use("/matters/:matterId/anspruch", anspruchRouter);
app.use("/interessenten", interessentenRouter);
app.use("/fristen", fristenRouter);
app.use("/erbrecht", erbrechtRouter);
app.use("/kapitalmarkt", kapitalmarktRouter);
app.use("/arbeitsrecht", arbeitsrechtRouter);
app.use("/gesellschaftsrecht", gesellschaftsrechtRouter);
app.use("/wissensbasis", wissensbasisRouter);
app.use("/rechtsprechung", rechtsprechungRouter);
app.use("/litigation", litigationRouter);
app.use("/matters/:matterId/nachlassverzeichnis", nachlassverzeichnisRouter);
app.use("/skills", skillsRouter);
app.use("/orgs", orgsRouter);
app.use("/orgs/:orgId/templates", matterTemplatesRouter);

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
app.get("/health", (_req, res) =>
    res.json({ ok: true, provider: "logicc", version: process.env.npm_package_version ?? "0.1.0" }),
);

// ---------------------------------------------------------------------------
// Fristen-Scheduler (polls every SCHEDULER_INTERVAL_MS, default 5 min)
// ---------------------------------------------------------------------------

const SCHEDULER_INTERVAL_MS = envInt("SCHEDULER_INTERVAL_MS", 5 * 60 * 1000);

async function runScheduler(): Promise<void> {
    const db = createServerSupabase();

    // Reihenfolge ist bedeutsam: processExpiredFristen() markiert eskalierte
    // Erwiderungsfristen als erledigt. Liefen die Benachrichtigungen danach,
    // würde der Reminder-Lauf diese Fristen überspringen.
    //
    // Getrennte try/catch-Blöcke: ein Fehler beim Mailversand darf die
    // Zustandsfortschreibung nicht verhindern — und umgekehrt.
    try {
        await processFristenBenachrichtigungen(db);
    } catch (err) {
        console.error("[scheduler] Fristen-Benachrichtigung fehlgeschlagen:", err);
    }

    try {
        await processExpiredFristen(db);
    } catch (err) {
        console.error("[scheduler] Fristen-Eskalation fehlgeschlagen:", err);
    }
}

// Start scheduler after a 30s warm-up
setTimeout(() => {
    runScheduler();
    setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
    console.log(`[scheduler] Fristen-Scheduler running every ${SCHEDULER_INTERVAL_MS / 1000}s`);
}, 30_000);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`BKL Legal OS backend running on port ${PORT} — LLM egress: api.logicc.io only`);
});
