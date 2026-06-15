# Build stage
FROM oven/bun:1-alpine AS build

WORKDIR /app

COPY package.json ./
COPY bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

# Production stage
FROM nginx:alpine

COPY --from=build /app/dist/ /usr/share/nginx/html/
# Template-based nginx config so the HTTP→HTTPS redirect can
# inject the actual external HTTPS port (e.g. 8443 when the
# host can't bind privileged 443). See docker-entrypoint.sh.
COPY nginx.conf.template /etc/nginx/nginx.conf.template
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
