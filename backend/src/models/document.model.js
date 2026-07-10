import mongoose, { Schema } from "mongoose";

const documentSchema = new Schema(
    {
        title: {
            type: String,
            required: [true, "Document title is required"],
            trim: true,
            maxlength: [500, "Title cannot exceed 500 characters"],
        },
        content: {
            type: String,
            default: "",
            // Extracted plain-text from uploaded file — used for full-text search
        },
        summary: {
            type: String,
            default: "",
            maxlength: [1000, "Summary cannot exceed 1000 characters"],
        },
        fileUrl: {
            type: String,
            default: null,
            // Server-local path (relative to UPLOAD_DIR). Never user-controlled.
        },
        originalName: {
            type: String,
            default: null,
            // Original filename stored in DB for display — NOT used in file paths
        },
        storedName: {
            type: String,
            default: null,
            // UUID-based filename on disk — decoupled from originalName
        },
        mimeType: {
            type: String,
            default: null,
        },
        fileSize: {
            type: Number,
            default: 0,
        },
        tags: {
            type: [String],
            default: [],
            validate: {
                validator: (tags) => tags.length <= 20,
                message: "Cannot have more than 20 tags",
            },
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        isPublic: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
    }
);

/**
 * Compound text index for full-text search (MongoDB native).
 * Weights: title (10x) > tags (5x) > content (1x) — tuned for relevance.
 * This is the core USP of the DMS.
 */
documentSchema.index(
    {
        title: "text",
        tags: "text",
        content: "text",
    },
    {
        weights: {
            title: 10,
            tags: 5,
            content: 1,
        },
        name: "document_fulltext_search_index",
    }
);

// Compound index for fast owner-based queries with sorting
documentSchema.index({ owner: 1, createdAt: -1 });

// Index for public document browsing
documentSchema.index({ isPublic: 1, createdAt: -1 });

export const Document = mongoose.model("Document", documentSchema);
