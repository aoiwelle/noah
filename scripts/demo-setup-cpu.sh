#!/usr/bin/env bash
# Demo Scenario 2: "My computer is slow"
# Compiles and spawns a CPU-hogging process with a realistic name
# so it looks like a stuck cloud sync app in Noah's diagnostics.
#
# Ask Noah: "My computer feels really sluggish, what's going on?"
#
# To undo manually: pkill -f CloudSync_Helper
set -euo pipefail

TMPDIR=$(mktemp -d)
BINARY="$TMPDIR/CloudSync_Helper"

# Compile a tiny CPU burner with a realistic process name
cat > "$TMPDIR/burner.c" << 'CEOF'
int main(void) { for (;;) {} return 0; }
CEOF

cc -O0 -o "$BINARY" "$TMPDIR/burner.c"

echo "==> Spawning 3 CloudSync_Helper processes (simulating a stuck cloud sync)..."
for i in 1 2 3; do
  "$BINARY" &
  echo "    PID $! (instance $i)"
done

echo ""
echo "==> Done. CPU should be pegged by 'CloudSync_Helper'."
echo "==> Ask Noah: \"My computer feels really sluggish, what's going on?\""
echo ""
echo "==> To undo: pkill -f CloudSync_Helper"
