import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { getSecret } from "../utils/getSecret.js";
import jwt from "jsonwebtoken";
import { ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME } from "../constants.js";

// ---------------------------------------------------------------------------
// Cookie options — httpOnly + Secure + SameSite=Lax
// Cookie names are defined in src/constants.js (shared with auth middleware).
// ---------------------------------------------------------------------------
const IS_PROD = process.env.NODE_ENV === "production";

const cookieOptions = {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "Lax",
    path: "/",
};

/**
 * Generate both access + refresh tokens and persist the refresh token in DB.
 */
async function generateTokens(userId) {
    const user = await User.findById(userId).select("+refreshToken");
    if (!user) throw new ApiError(500, "User not found during token generation");

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    // Persist refresh token hash in DB for rotation validation
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
}

// ---------------------------------------------------------------------------
// POST /api/v1/auth/register
// ---------------------------------------------------------------------------
export const registerUser = asyncHandler(async (req, res) => {
    const { username, email, fullName, password } = req.body;

    // Validate required fields — not empty after trim
    if (
        [username, email, fullName, password].some(
            (field) => typeof field !== "string" || field.trim() === ""
        )
    ) {
        throw new ApiError(400, "All fields are required: username, email, fullName, password");
    }

    // Password strength — minimum 8 characters (Mongoose minlength enforces this too)
    if (password.length < 8) {
        throw new ApiError(400, "Password must be at least 8 characters long");
    }
    if (password.length > 128) {
        throw new ApiError(400, "Password cannot exceed 128 characters");
    }

    // Check for existing user — check both username and email
    const existingUser = await User.findOne({
        $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }],
    });

    if (existingUser) {
        // Generic message — don't reveal which field exists (prevents enumeration)
        throw new ApiError(409, "An account with that username or email already exists");
    }

    const user = await User.create({
        username: username.toLowerCase().trim(),
        email: email.toLowerCase().trim(),
        fullName: fullName.trim(),
        password,
    });

    // Return user without sensitive fields
    const createdUser = await User.findById(user._id).select("-password -refreshToken");

    if (!createdUser) {
        throw new ApiError(500, "User registration failed. Please try again.");
    }

    return res
        .status(201)
        .json(new ApiResponse(201, createdUser, "Account created successfully"));
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/login
// ---------------------------------------------------------------------------
export const loginUser = asyncHandler(async (req, res) => {
    const { email, username, password } = req.body;

    if (!email && !username) {
        throw new ApiError(400, "Email or username is required");
    }

    if (!password) {
        throw new ApiError(400, "Password is required");
    }

    // Fetch user with password field (excluded by default via `select: false`)
    const user = await User.findOne({
        $or: [
            ...(email ? [{ email: email.toLowerCase() }] : []),
            ...(username ? [{ username: username.toLowerCase() }] : []),
        ],
    }).select("+password");

    // Use constant-time comparison to avoid timing attacks
    // Even if user is not found, we still call compare (to prevent timing-based enumeration)
    const dummyHash = "$2b$12$invalidhashtopreventtimingattacksonuserenum";
    const isPasswordValid = user
        ? await user.isPasswordCorrect(password)
        : await import("bcryptjs").then((m) => m.default.compare(password, dummyHash).catch(() => false));

    if (!user || !isPasswordValid) {
        // Generic message — don't reveal whether email/username exists
        throw new ApiError(401, "Invalid credentials");
    }

    const { accessToken, refreshToken } = await generateTokens(user._id);

    const loggedInUser = await User.findById(user._id);

    return res
        .status(200)
        .cookie(ACCESS_COOKIE_NAME, accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000, // 15 minutes
        })
        .cookie(REFRESH_COOKIE_NAME, refreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        })
        .json(
            new ApiResponse(
                200,
                {
                    user: loggedInUser,
                    // Also return tokens in body for API clients that don't use cookies
                    accessToken,
                },
                "Logged in successfully"
            )
        );
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/logout (protected)
// ---------------------------------------------------------------------------
export const logoutUser = asyncHandler(async (req, res) => {
    // Invalidate the refresh token stored in DB
    await User.findByIdAndUpdate(
        req.user._id,
        { $unset: { refreshToken: 1 } },
        { new: true }
    );

    return res
        .status(200)
        .clearCookie(ACCESS_COOKIE_NAME, cookieOptions)
        .clearCookie(REFRESH_COOKIE_NAME, cookieOptions)
        .json(new ApiResponse(200, {}, "Logged out successfully"));
});

// ---------------------------------------------------------------------------
// POST /api/v1/auth/refresh-token
// ---------------------------------------------------------------------------
export const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken =
        req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

    if (!incomingRefreshToken) {
        throw new ApiError(401, "Refresh token is required");
    }

    let decodedToken;
    try {
        const secret = getSecret("REFRESH_TOKEN_SECRET", "refresh_token_secret.txt");
        // Algorithm hardcoded — never derived from token header
        decodedToken = jwt.verify(incomingRefreshToken, secret, {
            algorithms: ["HS256"],
        });
    } catch {
        throw new ApiError(401, "Invalid or expired refresh token");
    }

    const user = await User.findById(decodedToken._id).select("+refreshToken");

    if (!user) {
        throw new ApiError(401, "User not found");
    }

    // Rotate validation — incoming token must match what's stored in DB
    if (incomingRefreshToken !== user.refreshToken) {
        // Token was already used or revoked — invalidate all sessions
        await User.findByIdAndUpdate(user._id, { $unset: { refreshToken: 1 } });
        throw new ApiError(401, "Refresh token has been revoked. Please log in again.");
    }

    const { accessToken, refreshToken: newRefreshToken } = await generateTokens(user._id);

    return res
        .status(200)
        .cookie(ACCESS_COOKIE_NAME, accessToken, {
            ...cookieOptions,
            maxAge: 15 * 60 * 1000,
        })
        .cookie(REFRESH_COOKIE_NAME, newRefreshToken, {
            ...cookieOptions,
            maxAge: 7 * 24 * 60 * 60 * 1000,
        })
        .json(
            new ApiResponse(
                200,
                { accessToken },
                "Access token refreshed"
            )
        );
});

// ---------------------------------------------------------------------------
// GET /api/v1/auth/me (protected)
// ---------------------------------------------------------------------------
export const getMe = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "User profile fetched successfully"));
});
