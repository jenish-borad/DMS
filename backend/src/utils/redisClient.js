import { createClient } from "redis";

// ---------------------------------------------------------------------------
// Redis Client Singleton
// Connects to Redis at startup. All search results are cached here.
// Falls back gracefully if Redis is unavailable — search still works,
// just without server-side caching.
// ---------------------------------------------------------------------------

let client = null;
let isConnected = false;

export async function connectRedis() {
    try {
        // Use REDIS_URL directly (e.g. redis://default:pass@host:port)
        // Falls back to local Redis in dev if REDIS_URL is not set
        const redisUrl = process.env.REDIS_URL || "redis://127.0.0.1:6379";

        client = createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 5) {
                        console.warn("[Redis] Max reconnect attempts reached — disabling cache");
                        return false; // Stop retrying
                    }
                    return Math.min(retries * 100, 3000);
                },
            },
        });

        client.on("error", (err) => {
            // Log but don't crash — Redis is optional for operation
            if (isConnected) {
                console.warn("[Redis] Connection error:", err.message);
                isConnected = false;
            }
        });

        client.on("ready", () => {
            isConnected = true;
            console.log("[Redis] ✅ Connected to Redis");
        });

        await client.connect();
    } catch (err) {
        console.warn("[Redis] ⚠️  Could not connect to Redis — caching disabled:", err.message);
        client = null;
        isConnected = false;
    }
}

export async function disconnectRedis() {
    if (client && isConnected) {
        await client.quit();
        isConnected = false;
        console.log("[Redis] Disconnected");
    }
}

// ---------------------------------------------------------------------------
// Cache Helpers
// All keys are prefixed with "dms:" to namespace DMS entries.
// ---------------------------------------------------------------------------

const KEY_PREFIX = "dms:search:";

/**
 * Get a cached value by key.
 * Returns parsed JSON object or null if not found / Redis unavailable.
 */
export async function getCache(key) {
    if (!client || !isConnected) return null;
    try {
        const raw = await client.get(KEY_PREFIX + key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null; // Cache miss on error
    }
}

/**
 * Store a value in cache with a TTL (seconds).
 */
export async function setCache(key, value, ttlSeconds = 60) {
    if (!client || !isConnected) return;
    try {
        await client.setEx(
            KEY_PREFIX + key,
            ttlSeconds,
            JSON.stringify(value)
        );
    } catch {
        // Non-fatal — cache write failure doesn't break search
    }
}

/**
 * Delete all cache keys matching a pattern.
 * Used to invalidate a user's search cache when they write a document.
 * Pattern example: "userId:*" → clears all searches for that user.
 */
export async function delCacheByPattern(pattern) {
    if (!client || !isConnected) return;
    try {
        // SCAN is safer than KEYS for production use (non-blocking)
        let cursor = 0;
        do {
            const result = await client.scan(cursor, {
                MATCH: KEY_PREFIX + pattern,
                COUNT: 100,
            });
            cursor = result.cursor;
            if (result.keys.length > 0) {
                await client.del(result.keys);
            }
        } while (cursor !== 0);
    } catch {
        // Non-fatal
    }
}

/**
 * Build a normalized cache key from search parameters.
 * Ensures "React Developer" and "react developer" hit the same cache slot.
 */
export function buildCacheKey(userId, params) {
    const normalized = {
        q: (params.q || "").toLowerCase().trim().replace(/\s+/g, " "),
        tags: (params.tags || "").toLowerCase().trim(),
        dateFrom: params.dateFrom || "",
        dateTo: params.dateTo || "",
        myDocs: params.myDocs === "true" ? "1" : "0",
        matchMode: params.matchMode || "partial",
        page: String(params.page || 1),
        limit: String(params.limit || 10),
    };

    const parts = [
        userId,
        normalized.q,
        normalized.tags,
        normalized.dateFrom,
        normalized.dateTo,
        normalized.myDocs,
        normalized.matchMode,
        normalized.page,
        normalized.limit,
    ];
    return parts.join(":");
}
