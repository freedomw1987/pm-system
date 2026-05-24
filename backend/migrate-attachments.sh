#!/bin/bash
docker cp migrate-attachments.ts pm-system-backend-1:/app/migrate-attachments.ts
docker exec pm-system-backend-1 sh -c 'cd /app && bun migrate-attachments.ts'
