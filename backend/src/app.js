import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";

// ---------------------------------------------------------------------------
// Security headers via Helmet
// Provides: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection,
// Strict-Transport-Security, Referrer-Policy, Content-Security-Policy
// ---------------------------------------------------------------------------
const app = express();

app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'"],
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameSrc: ["'none'"],
                frameAncestors: ["'none'"], // Clickjacking protection
            },
        },
        // X-Frame-Options: DENY (belt-and-suspenders on top of CSP frame-ancestors)
        frameguard: { action: "deny" },
        // Disable browser feature policies we don't use
        permittedCrossDomainPolicies: false,
    })
);

// ---------------------------------------------------------------------------
// CORS — strict allow-list, no wildcard origins
// ---------------------------------------------------------------------------
const allowedOrigins = [
    process.env.CLIENT_ORIGIN || "http://localhost:5173",
];

app.use(
    cors({
        origin: (origin, callback) => {
            // Allow requests with no origin (e.g., mobile apps, curl, Postman in dev)
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error(`CORS: Origin ${origin} is not allowed`));
            }
        },
        credentials: true, // Required for httpOnly cookies
        methods: ["GET", "POST", "PATCH", "DELETE"],
        allowedHeaders: ["Content-Type", "Authorization"],
    })
);

// ---------------------------------------------------------------------------
// Body parsers
// ---------------------------------------------------------------------------
app.use(express.json({ limit: "1mb" })); // JSON body — 1MB limit
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
import authRouter from "./routes/auth.routes.js";
import documentRouter from "./routes/document.routes.js";
import searchRouter from "./routes/search.routes.js";

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/documents", documentRouter);
app.use("/api/v1/search", searchRouter);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "DMS API is running",
        timestamp: new Date().toISOString(),
    });
});

// ---------------------------------------------------------------------------
// 404 handler
// ---------------------------------------------------------------------------
app.use((_req, res) => {
    res.status(404).json({
        success: false,
        message: "Route not found",
    });
});

// ---------------------------------------------------------------------------
// Global error handler — handles both ApiError and Mongoose errors.
// Never expose stack traces or internal details to the client.
// ---------------------------------------------------------------------------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
    let statusCode = err.statusCode || 500;
    let message    = err.message || "Something went wrong";
    let errors     = [];

    // ── Mongoose ValidationError (schema validation failed) ──────────────────
    if (err.name === "ValidationError") {
        statusCode = 400;
        message    = "Validation failed";
        errors     = Object.values(err.errors).map((e) => e.message);
    }

    // ── MongoDB duplicate key error (unique index violation) ─────────────────
    else if (err.code === 11000 || err.code === 11001) {
        statusCode = 409;
        const field = Object.keys(err.keyPattern || {})[0] || "field";
        message    = `A record with that ${field} already exists`;
    }

    // ── Mongoose CastError (e.g. invalid ObjectId format) ────────────────────
    else if (err.name === "CastError") {
        statusCode = 400;
        message    = `Invalid value for ${err.path}`;
    }

    // ── Multer errors (file upload validation) ────────────────────────────────
    else if (err.name === "MulterError" || (err.message && err.message.includes("File type"))) {
        statusCode = 400;
        message    = err.message;
    }

    // Log full details server-side (never sent to client)
    if (statusCode >= 500) {
        console.error(`\n[ERROR] ${err.name || "Error"}: ${err.message}`);
        console.error(err.stack);
        
        // Write to error.log for debugging purposes
        try {
            const logMessage = `[${new Date().toISOString()}] ${err.name || "Error"}: ${err.message}\n${err.stack}\n\n`;
            fs.appendFileSync("error.log", logMessage);
        } catch (logErr) {
            console.error("Failed to write to error.log:", logErr.message);
        }
    } else if (process.env.NODE_ENV !== "production") {
        console.warn(`[WARN] ${statusCode} ${message}`);
    }

    res.status(statusCode).json({
        success: false,
        // Never expose internal error details to client in production
        message: statusCode >= 500 ? "An internal server error occurred" : message,
        errors,
    });
});

export default app;

