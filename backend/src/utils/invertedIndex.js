import { Document } from "../models/document.model.js";

// ---------------------------------------------------------------------------
// Inverted Index
// A simple in-memory term → Set<docId> mapping that pre-filters candidate
// documents before the MongoDB $text query runs.
//
// How it works:
//   1. On startup → buildIndexFromDB() reads all docs and populates the map
//   2. On doc create/update → add() re-indexes that document's terms
//   3. On doc delete → remove() cleans up all term entries for that docId
//   4. On search → lookup() returns a Set of candidate docIds
//
// This narrows the MongoDB query from "all documents" to "only candidates",
// making scoring much cheaper, especially with the partial-word regex path.
// ---------------------------------------------------------------------------

class InvertedIndex {
    constructor() {
        // Map<term:string, Set<docId:string>>
        this._index = new Map();
        // Map<docId:string, Set<term:string>>  — reverse map for fast removal
        this._docTerms = new Map();
    }

    // ── Tokenize ────────────────────────────────────────────────────────────
    // Splits text into lowercase alphabetic tokens of length >= 2.
    // Filters out common stop words so the index stays lean.
    _tokenize(text) {
        if (!text || typeof text !== "string") return new Set();

        const STOP_WORDS = new Set([
            "a", "an", "the", "is", "in", "it", "of", "to", "and", "or",
            "for", "on", "at", "by", "be", "as", "we", "he", "she", "they",
            "this", "that", "with", "from", "not", "are", "was", "were",
            "has", "have", "had", "but", "if", "do", "did", "so", "its",
        ]);

        const tokens = text
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, " ")
            .split(/\s+/)
            .filter((t) => t.length >= 2 && !STOP_WORDS.has(t));

        return new Set(tokens);
    }

    // ── Add / update a document in the index ────────────────────────────────
    add(docId, title = "", tags = [], content = "") {
        const id = docId.toString();

        // Remove stale entries first (handles updates)
        this.remove(id);

        const combined = [
            title,
            ...(Array.isArray(tags) ? tags : []),
            content.slice(0, 100_000), // Cap content tokens — title/tags matter more
        ].join(" ");

        const terms = this._tokenize(combined);

        // Store reverse mapping so we can clean up on remove
        this._docTerms.set(id, terms);

        for (const term of terms) {
            if (!this._index.has(term)) {
                this._index.set(term, new Set());
            }
            this._index.get(term).add(id);
        }
    }

    // ── Remove a document from the index ────────────────────────────────────
    remove(docId) {
        const id = docId.toString();
        const terms = this._docTerms.get(id);
        if (!terms) return;

        for (const term of terms) {
            const docSet = this._index.get(term);
            if (docSet) {
                docSet.delete(id);
                if (docSet.size === 0) {
                    this._index.delete(term); // Clean up empty sets
                }
            }
        }
        this._docTerms.delete(id);
    }

    // ── Lookup candidate docIds for a query ─────────────────────────────────
    // Returns the INTERSECTION of all term sets (AND semantics — doc must
    // contain ALL query terms). Falls back to UNION if no term matches all.
    lookup(query) {
        const terms = [...this._tokenize(query)];
        if (terms.length === 0) return null; // null = no pre-filter, let Mongo handle it

        // Collect docId sets per term
        const sets = terms
            .map((t) => this._index.get(t))
            .filter(Boolean);

        if (sets.length === 0) return new Set(); // No matches at all

        // Try intersection first (strictest)
        let intersection = new Set(sets[0]);
        for (let i = 1; i < sets.length; i++) {
            intersection = new Set([...intersection].filter((id) => sets[i].has(id)));
        }

        if (intersection.size > 0) return intersection;

        // Fall back to union (at least one term matches)
        const union = new Set();
        for (const s of sets) s.forEach((id) => union.add(id));
        return union;
    }

    // ── Index statistics ─────────────────────────────────────────────────────
    stats() {
        return {
            uniqueTerms: this._index.size,
            indexedDocuments: this._docTerms.size,
        };
    }
}

// Singleton instance used across the application
export const invertedIndex = new InvertedIndex();

// ---------------------------------------------------------------------------
// buildIndexFromDB
// Called once at server startup to warm the inverted index from MongoDB.
// ---------------------------------------------------------------------------
export async function buildIndexFromDB() {
    try {
        console.log("[InvertedIndex] Building index from database...");
        const start = Date.now();

        // Stream documents in batches to avoid loading all content into memory
        const BATCH_SIZE = 200;
        let skip = 0;
        let total = 0;

        while (true) {
            const docs = await Document.find({})
                .select("title tags content")
                .skip(skip)
                .limit(BATCH_SIZE)
                .lean();

            if (docs.length === 0) break;

            for (const doc of docs) {
                invertedIndex.add(doc._id, doc.title, doc.tags, doc.content || "");
            }

            total += docs.length;
            skip += BATCH_SIZE;

            if (docs.length < BATCH_SIZE) break; // Last batch
        }

        const stats = invertedIndex.stats();
        const elapsed = Date.now() - start;
        console.log(
            `[InvertedIndex] ✅ Built: ${stats.indexedDocuments} docs, ` +
            `${stats.uniqueTerms} unique terms — ${elapsed}ms`
        );
    } catch (err) {
        // Non-fatal — app works without the index (falls back to full Mongo scan)
        console.warn("[InvertedIndex] ⚠️  Failed to build index:", err.message);
    }
}
