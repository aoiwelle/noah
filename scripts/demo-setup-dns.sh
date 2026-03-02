#!/usr/bin/env bash
# Demo Scenario 1: "My internet is slow"
# Sets a bad primary DNS with a working fallback so Noah can still
# reach Claude but will correctly diagnose the bad DNS server.
#
# Ask Noah: "My internet feels really slow"
#
# To undo manually: networksetup -setdnsservers Wi-Fi empty
set -euo pipefail

echo "==> Current DNS:"
networksetup -getdnsservers Wi-Fi

echo ""
echo "==> Setting DNS to 192.0.2.1 (dead) + 8.8.8.8 (fallback)..."
sudo networksetup -setdnsservers Wi-Fi 192.0.2.1 8.8.8.8

echo "==> Flushing DNS cache so the bad server is hit immediately..."
sudo dscacheutil -flushcache 2>/dev/null || true
sudo killall -HUP mDNSResponder 2>/dev/null || true

echo ""
echo "==> Done. DNS is now slow (bad primary, working fallback)."
echo "==> Ask Noah: \"My internet feels really slow\""
echo ""
echo "==> To undo: networksetup -setdnsservers Wi-Fi empty"
