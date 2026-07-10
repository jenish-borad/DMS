import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileTypeFromBuffer } from "file-type";

// ---------------------------------------------------------------------------
// Upload directory — stored OUTSIDE the web root (public/) so files are
// never directly accessible via URL. Served only to authorized users.
// ---------------------------------------------------------------------------
const UPLOAD_DIR = path.resolve(process.cwd(), process.env.UPLOAD_DIR || "uploads");

// Ensure the upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// Allowed file types (allow-list approach)
// ---------------------------------------------------------------------------
const ALLOWED_MIME_TYPES = new Set([
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "text/plain",
    "text/markdown",
]);

const ALLOWED_EXTENSIONS = new Set([".docx", ".txt", ".md"]);

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Multer storage — UUID filenames to prevent path traversal and collisions.
// Original filename is NEVER used in disk paths.
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (_req, _file, cb) => {
        // UUID-based name — decoupled from user-supplied originalname entirely
        const uniqueName = `${crypto.randomUUID()}`;
        cb(null, uniqueName);
    },
});

// ---------------------------------------------------------------------------
// Mime-type filter (first layer — checked before disk write)
// ---------------------------------------------------------------------------
const fileFilter = (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();

    if (!ALLOWED_EXTENSIONS.has(ext)) {
        return cb(new Error(`File type "${ext}" is not allowed. Accepted: .docx, .txt, .md`), false);
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        return cb(new Error(`MIME type "${file.mimetype}" is not allowed.`), false);
    }

    cb(null, true);
};

export const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
        files: 1, // Only one file per request
    },
});

// ---------------------------------------------------------------------------
// Magic-byte validation (second layer — run after multer writes to disk)
// Validates actual file content, not just extension/MIME header.
// ---------------------------------------------------------------------------
export async function validateFileContent(filePath) {
    const buffer = fs.readFileSync(filePath);
    const detected = await fileTypeFromBuffer(buffer);

    // Plain text / markdown files have no magic bytes — allow if buffer is valid UTF-8
    if (!detected) {
        try {
            const decoder = new TextDecoder("utf-8", { fatal: true });
            decoder.decode(buffer);
            return true; // Valid UTF-8 plain text
        } catch {
            return false; // Contains binary/non-UTF-8 bytes
        }
    }

    return ALLOWED_MIME_TYPES.has(detected.mime);
}

// ---------------------------------------------------------------------------
// Text extraction — pulls plain text from uploaded files for search indexing.
// TODO(security): For DOCX, integrate a sandboxed CDR tool to strip
// macros and active content before parsing.
// ---------------------------------------------------------------------------
export async function extractText(filePath, mimeType) {
    const content = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");

    if (mimeType === "text/plain" || mimeType === "text/markdown") {
        // For plain text files, content is directly readable
        const content = fs.readFileSync(filePath, "utf-8").replace(/\r\n/g, "\n");
        return content.slice(0, 500_000); // Cap at 500KB of text
    }

    if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        // TODO(security): Integrate mammoth.js for DOCX parsing with XXE protection
        // (disable external entity expansion, disable DTD processing).
        return `[DOCX content — full text extraction requires mammoth.js integration]`;
    }

    return "";
}

// ---------------------------------------------------------------------------
// Secure file deletion
// ---------------------------------------------------------------------------
export function deleteUploadedFile(filePath) {
    try {
        if (!filePath) return;

        // Resolve full path and verify it's inside UPLOAD_DIR (prevent traversal)
        const resolved = path.resolve(filePath);
        const uploadDirResolved = path.resolve(UPLOAD_DIR);

        // Enforce trailing separator to prevent partial-match bypass
        if (!resolved.startsWith(uploadDirResolved + path.sep)) {
            console.warn(`[SECURITY] Blocked attempt to delete file outside upload dir: ${resolved}`);
            return;
        }

        if (fs.existsSync(resolved)) {
            fs.unlinkSync(resolved);
        }
    } catch (err) {
        console.error("[fileHandler] Failed to delete file:", err.message);
    }
}

export { UPLOAD_DIR };
