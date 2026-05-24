FROM node:20-alpine

WORKDIR /app

# Install Bun runtime for the requested startup command.
RUN npm install -g bun

# Copy package files and install dependencies.
COPY package.json ./
RUN npm install

# Copy application source.
COPY . .

# Generate Prisma client only at build time (schema push happens at startup)
RUN npx prisma generate

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["bun", "src/index.ts"]
