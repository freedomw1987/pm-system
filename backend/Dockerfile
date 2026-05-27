FROM oven/bun:1-alpine

# Install poppler-utils for PDF to image conversion
RUN apk add --no-cache poppler-utils

WORKDIR /app

# Copy package files and install dependencies.
COPY package.json ./
COPY bun.lock ./
RUN bun install

# Copy application source.
COPY . .

# Generate Prisma client only at build time.
RUN bunx prisma generate

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["bun", "src/index.ts"]
