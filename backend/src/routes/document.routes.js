import { Router } from "express";
import {
    createDocument,
    getDocuments,
    getDocument,
    updateDocument,
    deleteDocument,
} from "../controllers/document.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";
import { upload } from "../utils/fileHandler.js";

const router = Router();

// All document routes require authentication
router.use(verifyJWT);
router.use(apiLimiter);

// ---------------------------------------------------------------------------
// Document CRUD
// POST   /api/v1/documents          — create document (optional file upload)
// GET    /api/v1/documents          — list user's documents (paginated)
// GET    /api/v1/documents/:id      — get a single document
// PATCH  /api/v1/documents/:id      — update document metadata
// DELETE /api/v1/documents/:id      — delete document
// ---------------------------------------------------------------------------
router.post("/", upload.single("file"), createDocument);
router.get("/", getDocuments);
router.get("/:id", getDocument);
router.patch("/:id", updateDocument);
router.delete("/:id", deleteDocument);

export default router;
