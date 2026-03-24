#!/bin/bash
set -e

echo "🔨 Building StellarStream contract..."
stellar contract build --optimize

WASM_FILE="target/wasm32-unknown-unknown/release/stellarstream_contracts.wasm"
SIZE=$(stat -f%z "$WASM_FILE" 2>/dev/null || stat -c%s "$WASM_FILE")
SIZE_KB=$((SIZE / 1024))

echo "📦 Final WASM size: ${SIZE_KB}KB"

if [ $SIZE_KB -gt 64 ]; then
    echo "⚠️  WARNING: Binary size (${SIZE_KB}KB) exceeds 64KB limit!"
    exit 1
else
    echo "✅ Binary size is within the 64KB limit"
fi
