#!/usr/bin/env bash
set -euo pipefail

DATA_DIR="data"
ELLIPTIC_DIR="$DATA_DIR/elliptic"
OFAC_DIR="$DATA_DIR/ofac"
UBO_DIR="$DATA_DIR/ubo"

echo "============================================"
echo "  Sanctions Screening Engine — Data Setup"
echo "============================================"

mkdir -p "$ELLIPTIC_DIR" "$OFAC_DIR" "$UBO_DIR"

# Detect Kaggle CLI 

HAS_KAGGLE=false
if kaggle datasets list --max-size 1 &> /dev/null; then
    HAS_KAGGLE=true
else
    echo ""
    echo "[!] Kaggle not authenticated. Run: kaggle auth login"
    echo ""
fi

#  Elliptic Bitcoin Transaction Graph 

ELLIPTIC_CLASSES=$(find "$ELLIPTIC_DIR" -name "elliptic_txs_classes.csv" 2>/dev/null | head -1)

if [ -n "$ELLIPTIC_CLASSES" ]; then
    echo ""
    echo "[ok] Elliptic dataset already exists, skipping."
else
    if [ "$HAS_KAGGLE" = true ]; then
        echo ""
        echo "[..] Downloading Elliptic Bitcoin dataset via Kaggle CLI..."
        kaggle datasets download -d ellipticco/elliptic-data-set -p "$ELLIPTIC_DIR" --unzip
        ELLIPTIC_CLASSES=$(find "$ELLIPTIC_DIR" -name "elliptic_txs_classes.csv" 2>/dev/null | head -1)
        echo "[ok] Elliptic dataset ready."
    else
        echo ""
        echo "[!!] Elliptic dataset missing. Download manually:"
        echo "     https://www.kaggle.com/datasets/ellipticco/elliptic-data-set"
        echo "     Unzip contents into: $ELLIPTIC_DIR/"
    fi
fi

# UBO / Ownership dataset 

UBO_FOUND=false
for f in "$UBO_DIR"/*.csv; do
    [ -f "$f" ] && UBO_FOUND=true && break
done

if [ "$UBO_FOUND" = true ]; then
    echo ""
    echo "[ok] UBO dataset already exists, skipping."
else
    if [ "$HAS_KAGGLE" = true ]; then
        echo ""
        echo "[..] Downloading UBO Register dataset via Kaggle CLI..."
        kaggle datasets download -d sasanj/ultimate-beneficial-owners-companies-investments -p "$UBO_DIR" --unzip
        echo "[ok] UBO dataset ready."
    else
        echo ""
        echo "[!!] UBO dataset missing. Download manually:"
        echo "     https://www.kaggle.com/datasets/sasanj/ultimate-beneficial-owners-companies-investments"
        echo "     Unzip contents into: $UBO_DIR/"
    fi
fi

# OFAC Sanctioned Wallet Addresses 

OFAC_ETH="$OFAC_DIR/sanctioned_addresses_ETH.txt"
OFAC_BTC="$OFAC_DIR/sanctioned_addresses_XBT.txt"
OFAC_BASE="https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists"

if [ -f "$OFAC_ETH" ] && [ -f "$OFAC_BTC" ]; then
    echo ""
    echo "[ok] OFAC wallet lists already exist, skipping."
else
    echo ""
    echo "[..] Downloading OFAC sanctioned wallet addresses..."
    curl -sL "$OFAC_BASE/sanctioned_addresses_ETH.txt"  -o "$OFAC_ETH"
    curl -sL "$OFAC_BASE/sanctioned_addresses_XBT.txt"  -o "$OFAC_BTC"
    curl -sL "$OFAC_BASE/sanctioned_addresses_USDT.txt" -o "$OFAC_DIR/sanctioned_addresses_USDT.txt"
    curl -sL "$OFAC_BASE/sanctioned_addresses_USDC.txt" -o "$OFAC_DIR/sanctioned_addresses_USDC.txt"
    echo "[ok] OFAC wallets ready."
fi


echo "Datasets downloaded successfully!"

