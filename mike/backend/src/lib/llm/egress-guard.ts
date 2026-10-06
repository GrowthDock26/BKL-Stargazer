/**
 * Egress guard: ensures every outbound LLM/embedding call goes exclusively to
 * api.logicc.io. Any call to another host throws at runtime.
 *
 * Call logEgressCall() immediately before every fetch() to api.logicc.io.
 * assertLogiccHost() is a belt-and-suspenders check for constructed URLs.
 */

const ALLOWED_HOST = "api.logicc.io";

export function assertLogiccHost(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`[egress-guard] Malformed URL: ${url}`);
    }
    if (parsed.hostname !== ALLOWED_HOST) {
        throw new Error(
            `[egress-guard] BLOCKED outbound LLM call to "${parsed.hostname}". ` +
            `Only "${ALLOWED_HOST}" is permitted as LLM egress.`,
        );
    }
}

export type EgressLogEntry = {
    ts: string;
    host: string;
    model: string;
    msg_count: number;
};

export function logEgressCall(model: string, messageCount: number): void {
    const entry: EgressLogEntry = {
        ts: new Date().toISOString(),
        host: ALLOWED_HOST,
        model,
        msg_count: messageCount,
    };
    // Structured stdout — captured by docker logs / cloud log aggregation.
    process.stdout.write(`[egress] ${JSON.stringify(entry)}\n`);
}
