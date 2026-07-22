// ---------------------------------------------------------------------------
// Browser-side search result cache using localStorage.
//
// Cache key format: "dms_search:v2:{normalizedParams}"
// CACHE_VERSION must be bumped any time the response shape changes so stale
// entries are automatically ignored without manual localStorage clearing.
//
// Each entry: { data: <search response>, timestamp: <ms> }
// TTL: 60 seconds for public/mixed queries, 10 seconds for myDocs=true
// ---------------------------------------------------------------------------

const CACHE_VERSION  = "v2";                        // bump when response shape changes
const KEY_PREFIX     = `dms_search:${CACHE_VERSION}:`;
const OLD_PREFIX     = "dms_search:";               // old prefix without version
const DEFAULT_TTL_MS = 60 * 1000;                   // 60 seconds
const MY_DOCS_TTL_MS = 10 * 1000;                   // 10 seconds for personal-only results

// ---------------------------------------------------------------------------
// Purge all stale (old-version) cache entries on module load.
// This runs once when the module is first imported.
// ---------------------------------------------------------------------------
(function purgeOldVersionEntries() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            // Remove anything with the old prefix that isn't the current version
            if (key && key.startsWith(OLD_PREFIX) && !key.startsWith(KEY_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
        if (keysToRemove.length > 0) {
            console.log(`[SearchCache] Purged ${keysToRemove.length} stale cache entries`);
        }
    } catch {
        // Silent — localStorage may not be available
    }
})();

/**
 * Build a stable, normalized cache key from search params.
 * Normalizes the query so "React " and "react" hit the same key.
 */
export function buildCacheKey(params = {}) {
    const parts = [
        (params.q || "").toLowerCase().trim().replace(/\s+/g, " "),
        (params.tags || "").toLowerCase().trim(),
        params.dateFrom || "",
        params.dateTo || "",
        params.myDocs === "true" || params.myDocs === true ? "1" : "0",
        params.matchMode || "partial",
        String(params.page || 1),
        String(params.limit || 10),
    ];
    return KEY_PREFIX + parts.join("|");
}

/**
 * Read a cached search result.
 * Returns the cached data or null if missing / expired / wrong version.
 */
export function getCachedSearch(params = {}) {
    try {
        const key = buildCacheKey(params);
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const entry = JSON.parse(raw);

        // Guard: must have the version field to be valid
        if (entry.version !== CACHE_VERSION) {
            localStorage.removeItem(key);
            return null;
        }

        const ttl = params.myDocs === "true" || params.myDocs === true
            ? MY_DOCS_TTL_MS
            : DEFAULT_TTL_MS;

        if (Date.now() - entry.timestamp > ttl) {
            // Expired — remove it
            localStorage.removeItem(key);
            return null;
        }

        return entry.data;
    } catch {
        return null;
    }
}

/**
 * Store a search result in localStorage.
 */
export function setCachedSearch(params = {}, data) {
    try {
        const key = buildCacheKey(params);
        const entry = { data, timestamp: Date.now(), version: CACHE_VERSION };
        localStorage.setItem(key, JSON.stringify(entry));
    } catch {
        // localStorage may be full or disabled — silently ignore
    }
}

/**
 * Clear ALL search cache entries for the current version.
 * Call this after document create/update/delete.
 */
export function clearSearchCache() {
    try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(KEY_PREFIX)) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
        // Silent
    }
}
