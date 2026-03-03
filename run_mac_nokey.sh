#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

# Launch WITHOUT API key so the setup screen appears (for testing onboarding flows)
unset ANTHROPIC_API_KEY

exec pnpm dev
