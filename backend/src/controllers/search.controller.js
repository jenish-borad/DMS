import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Document } from "../models/document.model.js";

// ---------------------------------------------------------------------------
// Snippet extraction helper
// Finds the most relevant excerpt of the content around the search terms.
// Returns a plain-text snippet with matched terms marked.
// ---------------------------------------------------------------------------
function extractSnippet(content, query, snippetLength = 200) {
    if (!content || !query) return "";

    const normalizedContent = content.replace(/\s+/g, " ").trim();
    const terms = query
        .toLowerCase()
        .split(/\s+/)
        .filter((t) => t.length > 2);

    if (terms.length === 0) {
        return normalizedContent.slice(0, snippetLength) + (normalizedContent.length > snippetLength ? "…" : "");
    }

    // Find the best window of text containing the most query terms
    const lowerContent = normalizedContent.toLowerCase();
    let bestStart = 0;
    let bestScore = -1;

    for (let i = 0; i < normalizedContent.length - snippetLength; i += 20) {
        const window = lowerContent.slice(i, i + snippetLength);
        const score = terms.filter((t) => window.includes(t)).length;
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
// GET /api/v1/search
//
// The core USP — full-text search across all documents accessible to the user.
// Accessible = owned by user OR isPublic === true.
//
// Query parameters:
//   q         (string)   — search query (required)
//   tags      (string)   — comma-separated tag filter
//   dateFrom  (string)   — ISO date filter (createdAt >=)
//   dateTo    (string)   — ISO date filter (createdAt <=)
//   page      (number)   — default 1
//   limit     (number)   — default 10, max 50
//   myDocs    (boolean)  — if "true", search only user's own docs
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
    } = req.query;

    // Require a search query
    if (!q || typeof q !== "string" || q.trim() === "") {
        throw new ApiError(400, 'Search query "q" is required');
    }

    const query = q.trim().slice(0, 500); // Cap query length
    const page = Math.max(1, parseInt(pageStr) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(limitStr) || 10));
    const skip = (page - 1) * limit;

    // ---------------------------------------------------------------------------
    // Build the MongoDB filter
    // ---------------------------------------------------------------------------
    const filter = {
        // Full-text search — uses the weighted text index
        $text: { $search: query },

        // Scope: user's own docs OR public docs (unless myDocs=true)
        ...(myDocs === "true"
            ? { owner: req.user._id }
            : {
                  $or: [
                      { owner: req.user._id },
                      { isPublic: true },
                  ],
              }),
    };

    // Tag filter (AND — document must have ALL specified tags)
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
                to.setHours(23, 59, 59, 999); // Include the full end day
                filter.createdAt.$lte = to;
            }
        }
        if (Object.keys(filter.createdAt).length === 0) {
            delete filter.createdAt;
        }
    }

    // ---------------------------------------------------------------------------
    // Execute search with relevance scoring
    // $meta: "textScore" uses MongoDB's weighted text index scoring
    // ---------------------------------------------------------------------------
    const [results, totalCount] = await Promise.all([
        Document.find(filter, {
            // Project textScore for relevance ranking
            score: { $meta: "textScore" },
        })
            .select("title summary tags owner isPublic mimeType fileSize originalName createdAt updatedAt")
            .sort({ score: { $meta: "textScore" }, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .populate("owner", "username fullName")
            .lean(),

        Document.countDocuments(filter),
    ]);

    // ---------------------------------------------------------------------------
    // Enrich results with content snippets (fetched separately to keep projection lean)
    // ---------------------------------------------------------------------------
    const docIds = results.map((r) => r._id);
    const contentMap = await Document.find({ _id: { $in: docIds } })
        .select("_id content")
        .lean()
        .then((docs) =>
            docs.reduce((acc, d) => {
                acc[d._id.toString()] = d.content;
                return acc;
            }, {})
        );

    const enrichedResults = results.map((doc) => ({
        ...doc,
        // Relevance score (higher = more relevant)
        relevanceScore: Math.round((doc.score || 0) * 100) / 100,
        // Contextual snippet from content
        snippet: extractSnippet(contentMap[doc._id.toString()] || "", query, 250),
        // Remove raw score from output
        score: undefined,
    }));

    return res.status(200).json(
        new ApiResponse(
            200,
            {
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
                    filters: {
                        tags: tags || null,
                        dateFrom: dateFrom || null,
                        dateTo: dateTo || null,
                        myDocsOnly: myDocs === "true",
                    },
                },
            },
            `Found ${totalCount} result(s) for "${query}"`
        )
    );
});
