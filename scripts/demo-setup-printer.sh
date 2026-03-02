#!/usr/bin/env bash
# Demo Scenario 3: "My printer won't print"
# Pauses the Brother printer and sends a test job so it gets stuck.
#
# Ask Noah: "I'm trying to print but nothing comes out"
#
# To undo manually:
#   cupsenable Brother_HL_L2405W
#   cancel -a Brother_HL_L2405W
set -euo pipefail

PRINTER="Brother_HL_L2405W"

echo "==> Pausing printer: $PRINTER"
cupsdisable "$PRINTER"

echo "==> Sending 3 test print jobs (they'll get stuck)..."
echo "Test page 1 - quarterly report" | lp -d "$PRINTER" -t "Q4 Report" 2>/dev/null
echo "Test page 2 - invoice" | lp -d "$PRINTER" -t "Invoice #1042" 2>/dev/null
echo "Test page 3 - meeting notes" | lp -d "$PRINTER" -t "Meeting Notes" 2>/dev/null

echo ""
echo "==> Done. Printer is paused with 3 stuck jobs."
lpstat -p "$PRINTER"
lpstat -o "$PRINTER" 2>/dev/null || true

echo ""
echo "==> Ask Noah: \"I'm trying to print but nothing comes out\""
echo ""
echo "==> To undo: cupsenable $PRINTER && cancel -a $PRINTER"
