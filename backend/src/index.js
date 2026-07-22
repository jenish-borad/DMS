import dotenv from "dotenv";

dotenv.config({ override: true });

import connectDB from "./db/index.js";
import app from "./app.js";
import { connectRedis } from "./utils/redisClient.js";
import { buildIndexFromDB } from "./utils/invertedIndex.js";

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Boot sequence: connect to DB → warm inverted index → connect Redis → listen
// ---------------------------------------------------------------------------
connectDB()
    .then(async () => {
        // Warm the in-memory inverted index from existing documents
        await buildIndexFromDB();

        // Connect Redis (non-blocking — search works without it)
        await connectRedis();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`\n🚀 DMS Server running on port ${PORT}`);
            console.log(`   Health: /api/v1/health`);
            console.log(`   Auth:   /api/v1/auth`);
            console.log(`   Docs:   /api/v1/documents`);
            console.log(`   Search: /api/v1/search\n`);
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

