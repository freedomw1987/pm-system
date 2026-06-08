import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "bun ./prisma/seed.ts",
  },
  datasource: {
    // Prisma 7 requires the `env()` helper from prisma/config (not raw
    // process.env access) so the CLI can resolve DATABASE_URL at config
    // load time. `process.env["..."]` returns the env var wrapped in
    // generic-string Promise semantics that Prisma 7's config validator
    // doesn't accept — hence "datasource.url is required" even when the
    // env var is set. See docs:
    // https://www.prisma.io/docs/orm/reference/prisma-config-reference
    url: env("DATABASE_URL"),
  },
});