#!/bin/bash

# Source Node.js and PM2 paths
export PATH="$HOME/node/bin:$PATH"

# Navigate to project directory
cd "$(dirname "$0")" || exit

# Fetch remote changes
git fetch origin main &>/dev/null

# Get commit hashes
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

# If local hash is different from remote, pull and update
if [ "$LOCAL" != "$REMOTE" ]; then
    echo "[$(date)] Updates detected. Updating codebase..."
    git pull origin main
    npm install --production
    pm2 restart cloudpulse
    pm2 save
    echo "[$(date)] Application successfully updated and restarted."
else
    echo "[$(date)] Already up to date."
fi
