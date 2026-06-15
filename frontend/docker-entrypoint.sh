#!/bin/sh
# ============================================================
# PM-System frontend container entrypoint
# Substitute nginx env vars from template, then exec nginx.
#
# envsubst lives in busybox (always present in nginx:alpine).
# GNU gettext envsubst does NOT understand shell ${VAR:-default}
# syntax, so we set defaults here in POSIX-sh-friendly way first.
# Narrow filter (only the two vars we expect) prevents leaking
# unrelated host env into the rendered nginx config.
# ============================================================
set -e

# POSIX-sh defaults (no `:-` operator, use := with : no-op command)
: "${EXTERNAL_HTTPS_PORT:=443}"
: "${EXTERNAL_HTTP_PORT:=80}"
export EXTERNAL_HTTPS_PORT EXTERNAL_HTTP_PORT

envsubst '${EXTERNAL_HTTPS_PORT} ${EXTERNAL_HTTP_PORT}' \
  < /etc/nginx/nginx.conf.template \
  > /etc/nginx/nginx.conf

exec nginx -g "daemon off;"
