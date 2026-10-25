#!/usr/bin/env bash
# Build only. Never stops services, changes the database, or starts a deployment.
set -euo pipefail
project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
node -e 'const [a,b]=process.versions.node.split(".").map(Number); if (!((a===20&&b>=19)||(a===22&&b>=12)||a>22)) { console.error("Node.js 20.19+ atau 22.12+ diperlukan."); process.exit(1); }'
npm ci --no-audit --no-fund
npm ci --prefix backend --no-audit --no-fund
(cd backend && npx --no-install prisma generate)
npm run build --prefix backend
npm run build
printf '%s\n' 'Build selesai. Migrasi database dan restart PM2 dilakukan terpisah sesuai docs/OPERATIONS.md.'
