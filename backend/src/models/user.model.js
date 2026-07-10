import mongoose, { Schema } from "mongoose";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getSecret } from "../utils/getSecret.js";

const userSchema = new Schema(
    {
        username: {
            type: String,
            required: [true, "Username is required"],
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
            minlength: [3, "Username must be at least 3 characters"],
            maxlength: [30, "Username cannot exceed 30 characters"],
            match: [/^[a-z0-9_]+$/, "Username may only contain letters, numbers, and underscores"],
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"],
        },
        fullName: {
            type: String,
            required: [true, "Full name is required"],
            trim: true,
            maxlength: [100, "Full name cannot exceed 100 characters"],
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [8, "Password must be at least 8 characters"],
            select: false, // Never returned in queries by default
        },
        refreshToken: {
            type: String,
            select: false,
        },
    },
    {
        timestamps: true,
    }
);

// Hash password before saving — only when modified
userSchema.pre("save", async function () {
    if (!this.isModified("password")) return;
    // bcryptjs with cost factor 12 (memory-hard via bcrypt algorithm)
    this.password = await bcrypt.hash(this.password, 12);
});

/**
 * Compare a plain-text password against the stored hash.
 * Uses bcryptjs constant-time comparison.
 */
userSchema.methods.isPasswordCorrect = async function (password) {
    return await bcrypt.compare(password, this.password);
};

/**
 * Generate a short-lived access token (JWT).
 * Algorithm hardcoded to HS256 — 'none' is never accepted.
 */
userSchema.methods.generateAccessToken = function () {
    const secret = getSecret("ACCESS_TOKEN_SECRET", "access_token_secret.txt");
    return jwt.sign(
        {
            _id: this._id,
            email: this.email,
            username: this.username,
        },
        secret,
        {
            algorithm: "HS256",
            expiresIn: process.env.ACCESS_TOKEN_EXPIRY || "15m",
        }
    );
};

/**
 * Generate a long-lived refresh token (JWT).
 * Algorithm hardcoded to HS256 — 'none' is never accepted.
 */
userSchema.methods.generateRefreshToken = function () {
    const secret = getSecret("REFRESH_TOKEN_SECRET", "refresh_token_secret.txt");
    return jwt.sign(
        {
            _id: this._id,
        },
        secret,
        {
            algorithm: "HS256",
            expiresIn: process.env.REFRESH_TOKEN_EXPIRY || "7d",
        }
    );
};

export const User = mongoose.model("User", userSchema);