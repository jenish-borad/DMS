import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    refreshAccessToken,
    getMe,
} from "../controllers/auth.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { authLimiter } from "../middlewares/rateLimiter.middleware.js";
const router = Router();

// ---------------------------------------------------------------------------
// Public routes — rate limited to prevent brute force
// ---------------------------------------------------------------------------
router.post("/register", authLimiter, registerUser);
router.post("/login", authLimiter, loginUser);
router.post("/refresh-token", authLimiter, refreshAccessToken);

// ---------------------------------------------------------------------------
// Protected routes
// ---------------------------------------------------------------------------
router.post("/logout", verifyJWT, logoutUser);
router.get("/me", verifyJWT, getMe);

export default router;
