# FilmFund2025 - BSV Blockchain Publishing System

This project provides a comprehensive system for publishing data to the BSV blockchain using MongoDB UTXO management.

## ⚠️ Security Notice

**IMPORTANT**: Never commit wallet files to version control!

The following files contain private keys and should be kept secure:
- `*.json` - All wallet files
- `*.key` - Private key files
- `.env` - Environment variables

## Wallet Files

This directory contains:
- `wallet.json` - Main funding wallet
- `publishing-wallet.json` - Publishing wallet (small UTXOs)
- `sweep-wallet.json` - Sweep wallet (change collection)
- `zk-proof.json` - Zero-knowledge proof data

## Backup

Always backup these files securely before making changes to the system.