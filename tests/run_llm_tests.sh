#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

MODEL_DIR="$HOME/Models/Qwen3.5-35B-A3B-4bit-mlx"
PORT=8080
BASE_URL="http://127.0.0.1:$PORT/v1"

# ── Preflight ──

if [ ! -d "$MODEL_DIR" ]; then
  echo "ERROR: Model not found at $MODEL_DIR"
  echo "Download it first or update MODEL_DIR in this script."
  exit 1
fi

if ! command -v mlx_lm.server &>/dev/null; then
  echo "ERROR: mlx_lm.server not found. Install: uv tool install mlx-lm"
  exit 1
fi

# ── Start server if not already running ──

STARTED_SERVER=false

if curl -s --max-time 2 "$BASE_URL/models" &>/dev/null; then
  echo "LLM server already running on port $PORT"
else
  echo "Starting mlx_lm.server on port $PORT..."
  mlx_lm.server \
    --model "$MODEL_DIR" \
    --host 127.0.0.1 \
    --port "$PORT" \
    --max-tokens 32768 \
    --chat-template-args '{"enable_thinking":false}' \
    &>/dev/null &
  SERVER_PID=$!
  STARTED_SERVER=true

  # Wait for ready (up to 60s for model load)
  for i in $(seq 1 60); do
    if curl -s --max-time 2 "$BASE_URL/models" &>/dev/null; then
      echo "Server ready (${i}s)"
      break
    fi
    if ! kill -0 "$SERVER_PID" 2>/dev/null; then
      echo "ERROR: Server process died"
      exit 1
    fi
    sleep 1
  done

  if ! curl -s --max-time 2 "$BASE_URL/models" &>/dev/null; then
    echo "ERROR: Server failed to start after 60s"
    kill "$SERVER_PID" 2>/dev/null || true
    exit 1
  fi
fi

# ── Cleanup on exit ──

cleanup() {
  if [ "$STARTED_SERVER" = true ] && [ -n "${SERVER_PID:-}" ]; then
    echo "Stopping LLM server (pid $SERVER_PID)..."
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

# ── Run tests ──

echo ""
echo "════════════════════════════════════════════════════════════"
echo " Proactive triage tests"
echo "════════════════════════════════════════════════════════════"
python3 tests/proactive_triage_test.py --base-url "$BASE_URL" "$@"
TRIAGE_EXIT=$?

echo ""
echo "════════════════════════════════════════════════════════════"
echo " Noah harness tests"
echo "════════════════════════════════════════════════════════════"
python3 tests/noah_harness.py --base-url "$BASE_URL" "$@"
HARNESS_EXIT=$?

# ── Summary ──

echo ""
echo "════════════════════════════════════════════════════════════"
echo " Done"
echo "════════════════════════════════════════════════════════════"
echo "  Triage:  $([ $TRIAGE_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"
echo "  Harness: $([ $HARNESS_EXIT -eq 0 ] && echo 'PASS' || echo 'FAIL')"

exit $(( TRIAGE_EXIT | HARNESS_EXIT ))
