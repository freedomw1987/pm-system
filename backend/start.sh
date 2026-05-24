#!/bin/sh
cd /app
npx prisma db push --skip-generate
npx prisma db seed
exec bun dist/index.js