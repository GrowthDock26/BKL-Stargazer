/**
 * User API key management — simplified for LOGICC-only operation.
 *
 * Per the hard requirement, the server's LOGICC_API_KEY is the sole LLM
 * egress credential. This module no longer resolves per-user provider keys
 * for LLM calls. The encryption infrastructure is kept for any future
 * non-LLM secrets (e.g., beA credentials).
 *
 * The `user_api_keys` table is preserved with a 'logicc' provider slot so
 * the schema migration is backward-compatible, but the LLM layer ignores
 * any stored key and always uses the server env variable.
 */

import crypto from "crypto";
import { createServerSupabase } from "./supabase";
import type { UserApiKeys } from "./llm";

type Db = ReturnType<typeof createServerSupabase>;

export type ApiKeyProvider = "logicc";
export type ApiKeySource = "env" | null;
export type ApiKeyStatus = {
    logicc: boolean;
    sources: { logicc: ApiKeySource };
};

function encryptionKey(): Buffer {
    const secret = process.env.USER_API_KEYS_ENCRYPTION_SECRET;
    if (!secret) throw new Error("USER_API_KEYS_ENCRYPTION_SECRET is not configured");
    return crypto.createHash("sha256").update(secret).digest();
}

export function encrypt(value: string): {
    encrypted_key: string;
    iv: string;
    auth_tag: string;
} {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
        encrypted_key: encrypted.toString("base64"),
        iv: iv.toString("base64"),
        auth_tag: cipher.getAuthTag().toString("base64"),
    };
}

export function decrypt(row: {
    encrypted_key: string;
    iv: string;
    auth_tag: string;
}): string | null {
    try {
        const decipher = crypto.createDecipheriv(
            "aes-256-gcm",
            encryptionKey(),
            Buffer.from(row.iv, "base64"),
        );
        decipher.setAuthTag(Buffer.from(row.auth_tag, "base64"));
        return Buffer.concat([
            decipher.update(Buffer.from(row.encrypted_key, "base64")),
            decipher.final(),
        ]).toString("utf8");
    } catch {
        return null;
    }
}

/** Returns the effective LLM key status — always env-sourced from LOGICC_API_KEY. */
export async function getUserApiKeyStatus(
    _userId: string,
    _db?: Db,
): Promise<ApiKeyStatus> {
    const hasEnvKey = !!(process.env.LOGICC_API_KEY?.trim());
    return {
        logicc: hasEnvKey,
        sources: { logicc: hasEnvKey ? "env" : null },
    };
}

/**
 * Returns the UserApiKeys object used by the LLM layer.
 * The LOGICC key is always taken from the server environment — never from
 * per-user storage — to ensure the egress constraint cannot be bypassed.
 */
export async function getUserApiKeys(
    _userId: string,
    _db?: Db,
): Promise<UserApiKeys> {
    return { logicc: null }; // logicc.ts reads LOGICC_API_KEY directly from env
}

export function normalizeApiKeyProvider(value: string): ApiKeyProvider | null {
    return value === "logicc" ? "logicc" : null;
}

export function hasEnvApiKey(): boolean {
    return !!(process.env.LOGICC_API_KEY?.trim());
}
