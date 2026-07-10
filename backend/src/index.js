import dotenv from "dotenv";



dotenv.config({ override: true });


import connectDB from "./db/index.js";
import app from "./app.js";

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Boot sequence: connect to DB, then start HTTP server
// ---------------------------------------------------------------------------
connectDB()
    .then(() => {
        app.listen(PORT, "127.0.0.1", () => {
            // Server bound to 127.0.0.1 (localhost only) — not 0.0.0.0
            console.log(`\n🚀 DMS Server running at http://127.0.0.1:${PORT}`);
            console.log(`   Health: http://127.0.0.1:${PORT}/api/v1/health`);
            console.log(`   Auth:   http://127.0.0.1:${PORT}/api/v1/auth`);
            console.log(`   Docs:   http://127.0.0.1:${PORT}/api/v1/documents`);
            console.log(`   Search: http://127.0.0.1:${PORT}/api/v1/search\n`);
        });

        app.on("error", (error) => {
            console.error("Server error:", error.message);
            process.exit(1);
        });
    })
    .catch((error) => {
        console.error("Failed to connect to MongoDB:", error.message);
        process.exit(1);
    });
