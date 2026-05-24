#!/bin/bash
pkill -f "bun" || true
sleep 1
cd /app
nohup bun dist/index.js > /tmp/backend.log 2>&1 &
echo "Started PID $!"
sleep 3
cat /tmp/backend.log