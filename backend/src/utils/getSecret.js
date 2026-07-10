import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Secure multi-tier secret resolution.
 * Resolution order: Environment variable → Local file → Cached ephemeral random
 *
 * CRITICAL: The ephemeral secret is cached for the lifetime of the process.
 * Without caching, every call generates a NEW secret → all JWTs become invalid
 * because the verification secret differs from the signing secret.
 *
 * @param {string} envKey  - Environment variable name to look up
 * @param {string} fileKey - Filename in .secrets/ dir (e.g. "access_token_secret.txt")
 * @returns {string} The resolved secret
 */

// In-process cache — one entry per secret key.
// Ephemeral secrets are generated once and reused for the server's lifetime.
const _secretCache = new Map();

export function getSecret(envKey, fileKey) {
    // Tier 1: Environment variable (empty string is treated as "not set")
    if (process.env[envKey]) {
        return process.env[envKey];
    }

    // Tier 2: Local file (dev convenience — do NOT ship to prod)
    const filePath = path.resolve(process.cwd(), `.secrets/${fileKey}`);
    if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf-8").trim();
    }

    // Tier 3: Cached ephemeral random secret
    // Generated ONCE on first call, then reused — never regenerated per-call.
    if (_secretCache.has(envKey)) {
        return _secretCache.get(envKey);
    }

    const ephemeral = crypto.randomBytes(64).toString("hex");
    _secretCache.set(envKey, ephemeral);

    console.warn(
        `\n [SECURITY WARNING] No secret found for "${envKey}".\n` +
        `   Generating ephemeral secret. This is NOT suitable for production\n` +
        `   and will invalidate all tokens on server restart.\n` +
        `   Set ${envKey} in your .env file to fix this.\n`
    );

    return ephemeral;
}
