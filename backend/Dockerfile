# ─── Stage 1: Builder ───────────────────────────────────────────────────────
# Install ALL deps (dev + production) + generate Prisma client.
# This is the heavy stage — only its outputs (production node_modules + .prisma
# + schema) are copied to the runtime stage below.
FROM oven/bun:1-alpine AS builder

# poppler-utils needed for PDF → image conversion in routes
RUN apk add --no-cache poppler-utils

WORKDIR /app

# Copy manifest first so this layer caches well
COPY package.json bun.lock ./

# Install full deps (incl. devDependencies for prisma CLI / @types)
RUN bun install --frozen-lockfile

# Copy source + prisma schema, then generate Prisma client
COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./
RUN bunx prisma generate

# ─── Stage 2: Runtime ───────────────────────────────────────────────────────
# Slim runtime image — reuses builder's node_modules (already installed +
# Prisma client already generated). No second install, no second generate.
# Layer savings: ~5-10MB (no duplicate @prisma in image cache) + skip
# second `bun install` step (~15s on cold build).
FROM oven/bun:1-alpine

# poppler-utils still needed at runtime (PDF conversion in request handlers)
RUN apk add --no-cache poppler-utils

WORKDIR /app

# Reuse the entire production layer from builder (node_modules + Prisma
# generated client). This is the single biggest win — no re-install.
COPY --from=builder /app/node_modules ./node_modules

# Copy schema (needed at runtime for `prisma migrate deploy` on container
# start, and for some Prisma client internals that resolve schema path).
COPY --from=builder /app/prisma ./prisma

# Copy source code only (no tests, no .env, no README)
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./

# Re-declare env in this stage (multi-stage inherits from base otherwise)
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["bun", "src/index.ts"]
