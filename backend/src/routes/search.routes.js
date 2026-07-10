import { Router } from "express";
import { searchDocuments } from "../controllers/search.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { apiLimiter } from "../middlewares/rateLimiter.middleware.js";

const router = Router();

// All search routes require authentication
router.use(verifyJWT);
router.use(apiLimiter);

// ---------------------------------------------------------------------------
// GET /api/v1/search
//
// Full-text search across documents accessible to the authenticated user.
//
// Query parameters:
//   q         (string, required)  — search query
//   tags      (string)            — comma-separated tag filter
//   dateFrom  (string)            — ISO date (e.g. 2024-01-01)
//   dateTo    (string)            — ISO date (e.g. 2024-12-31)
//   page      (number)            — page number (default: 1)
//   limit     (number)            — results per page (default: 10, max: 50)
//   myDocs    (boolean)           — "true" to search only own docs
//
// Example:
//   GET /api/v1/search?q=invoice&tags=finance,2024&dateFrom=2024-01-01&page=1
// ---------------------------------------------------------------------------
router.get("/", searchDocuments);

export default router;
