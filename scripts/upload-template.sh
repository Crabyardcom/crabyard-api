#!/usr/bin/env bash
set -euo pipefail

SCAFFOLD_DIR="${1:?Usage: ./scripts/upload-template.sh <scaffold-dir> [version]}"
VERSION="${2:-0.1.0}"
TARBALL="crabyard-${VERSION}.tar.gz"
API_URL="${API_URL:?Set API_URL env var (e.g. https://api.crabyard.dev)}"
ADMIN_KEY="${ADMIN_KEY:?Set ADMIN_KEY env var}"

echo "Packaging scaffold from ${SCAFFOLD_DIR}..."

tar czf "/tmp/${TARBALL}" \
  -C "${SCAFFOLD_DIR}" \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='target' \
  --exclude='.claude' \
  --exclude='MEMORY.md' \
  base auth ui manifest.toml

echo "Uploading to API as v${VERSION}..."
curl -fsSL \
  -X POST \
  -H "X-Admin-Key: ${ADMIN_KEY}" \
  -H "Content-Type: application/gzip" \
  --data-binary "@/tmp/${TARBALL}" \
  "${API_URL}/template/upload?version=${VERSION}"

echo "Done — template v${VERSION} uploaded."
rm "/tmp/${TARBALL}"
