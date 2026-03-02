#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Load API key
export ANTHROPIC_API_KEY="$(sed 's/^ANTHROPIC_API_KEY=//' ~/.secrets/claude.txt)"

exec pnpm dev
