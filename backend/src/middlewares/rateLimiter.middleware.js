import rateLimit from "express-rate-limit";

/**
 * Auth rate limiter — prevents brute force on login/register.
 * Limit is configurable via AUTH_RATE_LIMIT_MAX env var.
 * Default: 30 in dev (enough for tests + normal use), set to 5 in production .env.
 *
 * Note: 5 register tests + 5+ login tests = 10+ auth requests per run.
 * Production should use a stricter limit (5–10/15min).
 */
const AUTH_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX || "30", 10);

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: AUTH_MAX,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: `Too many requests from this IP. Please try again after 15 minutes.`,
    },
    skipSuccessfulRequests: false,
});

/**
 * General API rate limiter — prevents abuse on document/search endpoints.
 * 100 requests per minute per IP.
 */
export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests, please slow down.",
    },
    skipSuccessfulRequests: false,
});
