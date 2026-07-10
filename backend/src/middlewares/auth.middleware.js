import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import { getSecret } from "../utils/getSecret.js";
import { ACCESS_COOKIE_NAME } from "../constants.js";

/**
 * JWT authentication middleware.
 *
 * Security hardening:
 * - Algorithm is hardcoded to HS256 — the 'none' algorithm attack is blocked.
 * - Token is never derived from the unverified header's 'alg' field.
 * - Cookie name comes from src/constants.js (single source of truth).
 * - Accepts token from httpOnly cookie first, then Authorization header as fallback.
 * - Generic error messages prevent information leakage about token state.
 */
export const verifyJWT = asyncHandler(async (req, _, next) => {
    const token =
        req.cookies?.[ACCESS_COOKIE_NAME] ||
        req.header("Authorization")?.replace(/^Bearer\s+/i, "");

    if (!token) {
        throw new ApiError(401, "Authentication required");
    }

    let decodedToken;
    try {
        const secret = getSecret("ACCESS_TOKEN_SECRET", "access_token_secret.txt");
        // CRITICAL: Algorithm hardcoded to HS256. Never derive from token header.
        decodedToken = jwt.verify(token, secret, { algorithms: ["HS256"] });
    } catch {
        // Generic message — do not expose whether token is expired vs invalid
        throw new ApiError(401, "Invalid or expired session. Please log in again.");
    }

    // Validate 'exp' claim is present (belt-and-suspenders on top of jwt.verify)
    if (!decodedToken.exp) {
        throw new ApiError(401, "Invalid token: missing expiry claim.");
    }

    const user = await User.findById(decodedToken._id);
    if (!user) {
        throw new ApiError(401, "User account not found. Please log in again.");
    }

    req.user = user;
    next();
});