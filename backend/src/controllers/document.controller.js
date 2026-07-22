import path from "path";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { Document } from "../models/document.model.js";
import {
    validateFileContent,
    extractText,
    deleteUploadedFile,
    UPLOAD_DIR,
} from "../utils/fileHandler.js";
import { invertedIndex } from "../utils/invertedIndex.js";
import { delCacheByPattern } from "../utils/redisClient.js";

// ---------------------------------------------------------------------------
// POST /api/v1/documents
// Create a new document — optionally with a file upload.
// ---------------------------------------------------------------------------
export const createDocument = asyncHandler(async (req, res) => {
    const { title, summary, tags, isPublic } = req.body;

    if (!title || typeof title !== "string" || title.trim() === "") {
        if (req.file) deleteUploadedFile(req.file.path);
        throw new ApiError(400, "Document title is required");
    }

    let fileUrl = null;
    let storedName = null;
    let originalName = null;
    let mimeType = null;
    let fileSize = 0;
    let content = "";

    // Process uploaded file if present
    if (req.file) {
        // Magic-byte validation — verify file content matches its claimed type
        const isValidContent = await validateFileContent(req.file.path);
        if (!isValidContent) {
            deleteUploadedFile(req.file.path);
            throw new ApiError(400, "File content does not match the allowed types");
        }

        // Extract text for full-text search indexing
        content = await extractText(req.file.path, req.file.mimetype);

        // Store path relative to UPLOAD_DIR (not the full system path)
        storedName = req.file.filename; // UUID — set by multer
        fileUrl = path.join(UPLOAD_DIR, storedName); // absolute server path, not web-accessible
        originalName = req.file.originalname; // stored for display only — NEVER used in paths
        mimeType = req.file.mimetype;
        fileSize = req.file.size;
    }

    // If no file, allow plain-text content from body
    if (!req.file && req.body.content) {
        content = String(req.body.content).slice(0, 500_000);
    }

    // Parse and sanitize tags
    let parsedTags = [];
    if (tags) {
        const tagInput = Array.isArray(tags) ? tags : [tags];
        parsedTags = tagInput
            .map((t) => String(t).trim().toLowerCase())
            .filter((t) => t.length > 0 && t.length <= 50)
            .slice(0, 20);
    }

    const document = await Document.create({
        title: title.trim(),
        content,
        summary: summary ? String(summary).trim().slice(0, 1000) : "",
        fileUrl,
        storedName,
        originalName,
        mimeType,
        fileSize,
        tags: parsedTags,
        owner: req.user._id,
        isPublic: isPublic === "true" || isPublic === true,
    });

    // ── Update in-process inverted index ──────────────────────────────────
    invertedIndex.add(document._id, document.title, document.tags, content);

    // ── Invalidate Redis search cache for this user ────────────────────────
    // Any search the user ran before this upload is now stale.
    await delCacheByPattern(`${req.user._id}:*`);
    // If the doc is public, also invalidate other users' caches that might include it
    if (document.isPublic) {
        await delCacheByPattern(`*`);
    }

    return res
        .status(201)
        .json(new ApiResponse(201, document, "Document created successfully"));
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents
// List all documents owned by the current user (paginated).
// ---------------------------------------------------------------------------
export const getDocuments = asyncHandler(async (req, res) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    // Optional filters
    const filter = { owner: req.user._id };

    if (req.query.tags) {
        const tags = String(req.query.tags)
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);
        if (tags.length > 0) {
            filter.tags = { $in: tags };
        }
    }

    if (req.query.isPublic !== undefined) {
        filter.isPublic = req.query.isPublic === "true";
    }

    const [documents, total] = await Promise.all([
        Document.find(filter)
            .select("-content -fileUrl -storedName") // Don't expose server paths
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        Document.countDocuments(filter),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                documents,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                    hasNext: page * limit < total,
                    hasPrev: page > 1,
                },
            },
            "Documents fetched successfully"
        )
    );
});

// ---------------------------------------------------------------------------
// GET /api/v1/documents/:id
// Get a single document — owner or public access.
// ---------------------------------------------------------------------------
export const getDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const document = await Document.findById(id)
        .select("-fileUrl -storedName") // Never expose server-side file paths
        .lean();

    if (!document) {
        throw new ApiError(404, "Document not found");
    }

    // Authorization: user must own it or it must be public
    const isOwner = document.owner.toString() === req.user._id.toString();
    const isPublic = document.isPublic;

    if (!isOwner && !isPublic) {
        throw new ApiError(403, "You do not have permission to access this document");
    }

    return res
        .status(200)
        .json(new ApiResponse(200, document, "Document fetched successfully"));
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/documents/:id
// Update a document's metadata — owner only.
// ---------------------------------------------------------------------------
export const updateDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const document = await Document.findById(id);

    if (!document) {
        throw new ApiError(404, "Document not found");
    }

    // Authorization: only the owner can update
    if (document.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You do not have permission to update this document");
    }

    const updates = {};

    if (req.body.title !== undefined) {
        const title = String(req.body.title).trim();
        if (!title) throw new ApiError(400, "Title cannot be empty");
        updates.title = title;
    }

    if (req.body.summary !== undefined) {
        updates.summary = String(req.body.summary).trim().slice(0, 1000);
    }

    if (req.body.content !== undefined) {
        updates.content = String(req.body.content).slice(0, 500_000);
    }

    if (req.body.isPublic !== undefined) {
        updates.isPublic = req.body.isPublic === "true" || req.body.isPublic === true;
    }

    if (req.body.tags !== undefined) {
        const tagInput = Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags];
        updates.tags = tagInput
            .map((t) => String(t).trim().toLowerCase())
            .filter((t) => t.length > 0 && t.length <= 50)
            .slice(0, 20);
    }

    const updatedDocument = await Document.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    ).select("-fileUrl -storedName");

    // ── Re-index updated document ──────────────────────────────────────────
    invertedIndex.add(
        updatedDocument._id,
        updatedDocument.title,
        updatedDocument.tags,
        updates.content !== undefined ? updates.content : (document.content || "")
    );

    // ── Invalidate cache ───────────────────────────────────────────────────
    await delCacheByPattern(`${req.user._id}:*`);
    if (updatedDocument.isPublic || document.isPublic) {
        await delCacheByPattern(`*`);
    }

    return res
        .status(200)
        .json(new ApiResponse(200, updatedDocument, "Document updated successfully"));
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/documents/:id
// Delete a document and its file — owner only.
// ---------------------------------------------------------------------------
export const deleteDocument = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const document = await Document.findById(id);

    if (!document) {
        throw new ApiError(404, "Document not found");
    }

    // Authorization: only the owner can delete
    if (document.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You do not have permission to delete this document");
    }

    // Delete file from disk (safe — path verified inside deleteUploadedFile)
    if (document.fileUrl) {
        deleteUploadedFile(document.fileUrl);
    }

    await Document.findByIdAndDelete(id);

    // ── Remove from in-process inverted index ─────────────────────────────
    invertedIndex.remove(id);

    // ── Invalidate cache ──────────────────────────────────────────────────
    await delCacheByPattern(`${req.user._id}:*`);
    if (document.isPublic) {
        await delCacheByPattern(`*`);
    }

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Document deleted successfully"));
});
