import "dotenv/config";
import { defineConfig } from "prisma/config";

// `prisma generate` (postinstall, Docker build stage) must work without a
// database, so DATABASE_URL is read leniently here; migrate/seed fail loudly
// on their own if it is missing.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
