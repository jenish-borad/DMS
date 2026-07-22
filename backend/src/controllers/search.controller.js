import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Document } from "../models/document.model.js";
import { invertedIndex } from "../utils/invertedIndex.js";
import { getCache, setCache, buildCacheKey } from "../utils/redisClient.js";

// ---------------------------------------------------------------------------
// Snippet extraction helper
// Finds the most relevant excerpt of the content around the search terms.
//
// Key fix: if the match is only in the TITLE and not in the content body,
// we return a note explaining that — not a misleading content-start snippet.
//
// For partial (substring) mode: uses .includes() — matches "ip" inside "script"
// For whole-word mode: uses word-boundary check
// ---------------------------------------------------------------------------
function extractSnippet(content, query, snippetLength = 350, matchMode = "partial") {
    if (!query) return "";

    const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 1); // include ALL term lengths, even 1-char

    if (!content || content.trim() === "") {
        return ""; // No content — caller will show title-only match note
    }

    const normalizedContent = content.replace(/\s+/g, " ").trim();
    const lowerContent = normalizedContent.toLowerCase();

    // Check if ANY term actually appears in the content body
    const termInContent = terms.some((t) =>
        matchMode === "whole"
            ? new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(normalizedContent)
            : lowerContent.includes(t)
    );

    if (!termInContent) {
        // Terms are only in the title/tags, not in content.
        // Return the start of the content as context, with a note.
        const preview = normalizedContent.slice(0, snippetLength);
        return (preview.length < normalizedContent.length ? preview + "…" : preview);
    }

    // Find the position of the FIRST match in content to anchor the snippet window
    let firstMatchPos = 0;
    for (const t of terms) {
        let pos;
        if (matchMode === "whole") {
            try {
                const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
                const m = re.exec(normalizedContent);
                pos = m ? m.index : -1;
            } catch {
                pos = lowerContent.indexOf(t);
            }
        } else {
            pos = lowerContent.indexOf(t);
        }
        if (pos !== -1) {
            firstMatchPos = pos;
            break;
        }
    }

    // Scan windows of text to find the one with the highest number of term hits
    // Start the scan from just before the first match (to center the match)
    const scanStart = Math.max(0, firstMatchPos - Math.floor(snippetLength / 2));
    let bestStart = scanStart;
    let bestScore = -1;

    for (let i = scanStart; i <= Math.max(scanStart, normalizedContent.length - snippetLength); i += 15) {
        const window = lowerContent.slice(i, i + snippetLength);
        const score = terms.reduce((acc, t) => {
            if (matchMode === "whole") {
                try {
                    const re = new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
                    return acc + (window.match(re) || []).length;
                } catch {
                    return acc + (window.includes(t) ? 1 : 0);
                }
            }
            // Partial: count all substring occurrences
            let count = 0;
            let pos = 0;
            while ((pos = window.indexOf(t, pos)) !== -1) { count++; pos++; }
            return acc + count;
        }, 0);

        if (score > bestScore) {
            bestScore = score;
            bestStart = i;
        }
    }

    let snippet = normalizedContent.slice(bestStart, bestStart + snippetLength);
    if (bestStart > 0) snippet = "…" + snippet;
    if (bestStart + snippetLength < normalizedContent.length) snippet += "…";

    return snippet;
}

// ---------------------------------------------------------------------------
// Count total occurrences of all query terms in a text string.
// Used to tell the frontend "X matches in this document".
// ---------------------------------------------------------------------------
function countTermMatches(text, terms, matchMode) {
    if (!text || !terms || terms.length === 0) return 0;
    const lowerText = text.toLowerCase();
    let count = 0;

    for (const term of terms) {
        if (!term) continue;
        if (matchMode === "partial") {
            // Count all substring occurrences
            let pos = 0;
            while ((pos = lowerText.indexOf(term.toLowerCase(), pos)) !== -1) {
                count++;
                pos += term.length;
            }
        } else {
            // Whole-word count using word boundaries
            try {
                const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
                const matches = lowerText.match(re);
                count += matches ? matches.length : 0;
            } catch {
                // Fallback to substring
                let pos = 0;
                while ((pos = lowerText.indexOf(term.toLowerCase(), pos)) !== -1) {
                    count++;
                    pos += term.length;
                }
            }
        }
    }

    return count;
}

// ---------------------------------------------------------------------------
// GET /api/v1/search
//
// Query parameters:
//   q          (string)   — search query (required)
//   tags       (string)   — comma-separated tag filter
//   dateFrom   (string)   — ISO date filter (createdAt >=)
//   dateTo     (string)   — ISO date filter (createdAt <=)
//   page       (number)   — default 1
//   limit      (number)   — default 10, max 50
//   myDocs     (boolean)  — if "true", search only user's own docs
//   matchMode  (string)   — "whole" (default) | "partial"
//                           whole  → MongoDB $text index (fast, whole words only)
//                           partial → $regex on title+content (finds substrings)
// ---------------------------------------------------------------------------
export const searchDocuments = asyncHandler(async (req, res) => {
    const {
        q,
        tags,
        dateFrom,
        dateTo,
        page: pageStr = "1",
        limit: limitStr = "10",
        myDocs,
        matchMode = "whole",
    } = req.query;

    // Require a search query
    if (!q || typeof q !== "string" || q.trim() === "") {
        throw new ApiError(400, 'Search query "q" is required');
    }

    // Normalize query — collapse whitespace, trim, cap length
    const query = q.trim().replace(/\s+/g, " ").slice(0, 500);
    const page = Math.max(1, parseInt(pageStr) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 10));
    const skip = (page - 1) * limit;
    const isPartial = matchMode === "partial";

    // ── Step 1: Check Redis cache ─────────────────────────────────────────────
    const cacheKey = buildCacheKey(req.user._id.toString(), {
        q: query,
        tags,
        dateFrom,
        dateTo,
        myDocs,
        matchMode,
        page,
        limit,
    });

    const cached = await getCache(cacheKey);
    if (cached) {
        // Return cached response with a cache-hit flag
        return res.status(200).json(
            new ApiResponse(
                200,
                { ...cached, cacheHit: true },
                `[CACHED] Found ${cached.pagination.total} result(s) for "${query}"`
            )
        );
    }

    // ── Step 2: Build MongoDB filter based on matchMode ───────────────────────
    const scopeFilter =
        myDocs === "true"
            ? { owner: req.user._id }
            : { $or: [{ owner: req.user._id }, { isPublic: true }] };

    let textFilter;

    if (isPartial) {
        // Partial / prefix mode: use $regex on title, content, and tags.
        // Escape the query to prevent regex injection.
        const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const re = new RegExp(escapedQuery, "i");
        textFilter = { $or: [{ title: re }, { content: re }, { tags: re }] };
    } else {
        // Whole-word mode: use MongoDB's weighted text index
        // Check inverted index first for candidate pre-filtering
        const candidates = invertedIndex.lookup(query);

        if (candidates !== null && candidates.size === 0) {
            // Inverted index is confident — zero matches exist
            return res.status(200).json(
                new ApiResponse(
                    200,
                    {
                        query,
                        results: [],
                        pagination: { page, limit, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
                        meta: { searchedAt: new Date().toISOString(), matchMode, cacheHit: false },
                    },
                    `Found 0 result(s) for "${query}"`
                )
            );
        }

        textFilter = { $text: { $search: query } };

        // If inverted index returned candidates, pre-filter to those IDs
        if (candidates !== null && candidates.size > 0) {
            textFilter._id = { $in: [...candidates] };
        }
    }

    // ── IMPORTANT: use $and to combine textFilter + scopeFilter ───────────────
    // DO NOT spread them: both may contain $or, and spreading would cause
    // the second $or to overwrite the first — making the text filter vanish.
    //
    // e.g. { ...$or:[{title}] , ...$or:[{owner}] } → only $or:[{owner}] survives
    //
    // $and ensures BOTH conditions are enforced by MongoDB.
    const baseFilter = { $and: [textFilter, scopeFilter] };
    const filter = baseFilter;

    // Tag filter — added directly (no $or conflict, uses a different key)
    if (tags) {
        const tagList = String(tags)
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter((t) => t.length > 0 && t.length <= 50)
            .slice(0, 10);
        if (tagList.length > 0) {
            filter.tags = { $all: tagList };
        }
    }

    // Date range filter
    if (dateFrom || dateTo) {
        filter.createdAt = {};
        if (dateFrom) {
            const from = new Date(dateFrom);
            if (!isNaN(from.getTime())) filter.createdAt.$gte = from;
        }
        if (dateTo) {
            const to = new Date(dateTo);
            if (!isNaN(to.getTime())) {
                to.setHours(23, 59, 59, 999);
                filter.createdAt.$lte = to;
            }
        }
        if (Object.keys(filter.createdAt).length === 0) delete filter.createdAt;
    }

    // ── Step 3: Execute query ─────────────────────────────────────────────────
    let resultsQuery;
    let sortOption;

    if (isPartial) {
        // Partial mode — sort: title matches first, then by date
        resultsQuery = Document.find(filter)
            .select("title summary tags owner isPublic mimeType fileSize originalName createdAt updatedAt content")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("owner", "username fullName")
            .lean();
    } else {
        // Whole-word mode — sort by relevance score descending
        resultsQuery = Document.find(filter, { score: { $meta: "textScore" } })
            .select("title summary tags owner isPublic mimeType fileSize originalName createdAt updatedAt content")
            .sort({ score: { $meta: "textScore" }, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("owner", "username fullName")
            .lean();
    }

    const [results, totalCount] = await Promise.all([
        resultsQuery,
        Document.countDocuments(filter),
    ]);

    // ── Step 4: Enrich results with snippet + match count ─────────────────────
    const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length >= 1); // include all term lengths incl. 2-char like "ip"

    const enrichedResults = results.map((doc) => {
        const content = doc.content || "";
        const lowerContent = content.toLowerCase();

        // Helper: does term appear in a string?
        const termHit = (str, t) =>
            matchMode === "partial"
                ? str.toLowerCase().includes(t)
                : (() => {
                      try {
                          return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(str);
                      } catch { return str.toLowerCase().includes(t); }
                  })();

        // Check each field individually
        const termInContent = content.length > 0 && terms.some((t) => termHit(content, t));
        const termInTitle   = terms.some((t) => termHit(doc.title || "", t));
        const termInTags    = Array.isArray(doc.tags) &&
            doc.tags.some((tag) => terms.some((t) => termHit(tag, t)));

        // Which tag(s) matched — shown in UI so user understands why doc appeared
        const matchedTags = Array.isArray(doc.tags)
            ? doc.tags.filter((tag) => terms.some((t) => termHit(tag, t)))
            : [];

        // Determine primary match location
        let matchLocation;
        if (termInContent)                          matchLocation = "content";
        else if (termInTitle)                       matchLocation = "title";
        else if (termInTags)                        matchLocation = "tags";
        else                                        matchLocation = "unknown"; // shouldn't happen

        // Only extract a snippet if terms actually appear in content
        const snippet = termInContent
            ? extractSnippet(content, query, 350, matchMode)
            : "";

        // Match counts — only count where terms actually appear
        const snippetMatchCount = termInContent ? countTermMatches(snippet, terms, matchMode) : 0;
        const titleMatchCount   = termInTitle   ? countTermMatches(doc.title, terms, matchMode) : 0;
        const tagsMatchCount    = matchedTags.reduce(
            (acc, tag) => acc + countTermMatches(tag, terms, matchMode), 0
        );
        const totalMatchCount = snippetMatchCount + titleMatchCount + tagsMatchCount;

        const enriched = {
            ...doc,
            snippet,
            matchMode,
            matchLocation,   // "content" | "title" | "tags" | "unknown"
            matchedTags,     // which specific tags matched
            matchCount: totalMatchCount,
            // Remove raw content from search results payload (keep it lean)
            content: undefined,
        };

        // Relevance score is only available in whole-word mode
        if (!isPartial && doc.score !== undefined) {
            enriched.relevanceScore = Math.round((doc.score || 0) * 100) / 100;
            enriched.score = undefined;
        } else {
            enriched.relevanceScore = null;
        }

        return enriched;
    });

    // ── Step 5: Build response payload ───────────────────────────────────────
    const payload = {
        query,
        results: enrichedResults,
        pagination: {
            page,
            limit,
            total: totalCount,
            totalPages: Math.ceil(totalCount / limit),
            hasNext: page * limit < totalCount,
            hasPrev: page > 1,
        },
        meta: {
            searchedAt: new Date().toISOString(),
            matchMode,
            cacheHit: false,
            filters: {
                tags: tags || null,
                dateFrom: dateFrom || null,
                dateTo: dateTo || null,
                myDocsOnly: myDocs === "true",
            },
        },
    };

    // ── Step 6: Cache the result in Redis ─────────────────────────────────────
    // myDocs=true results are user-specific → shorter TTL (10s)
    // Public search results → 60s TTL
    const ttl = myDocs === "true" ? 10 : 60;
    await setCache(cacheKey, payload, ttl);

    return res.status(200).json(
        new ApiResponse(
            200,
            payload,
            `Found ${totalCount} result(s) for "${query}"`
        )
    );
});
