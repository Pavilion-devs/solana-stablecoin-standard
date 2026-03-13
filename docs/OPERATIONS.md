# Operations Runbook

## Prerequisites

- Anchor + Solana CLI installed
- Node.js 18+
- Built artifacts:

```bash
anchor build
yarn workspace @stbr/sss-token build
yarn workspace sss-token build
```

## Local Test Environment

Start a clean validator before integration tests:

```bash
solana-test-validator --reset
anchor test --skip-local-validator
yarn test:cli
```

## Initialize

### SSS-1

```bash
sss-token init --preset sss-1 --name "My USD" --symbol "MUSD"
```

### SSS-2

```bash
sss-token init --preset sss-2 --name "Compliant USD" --symbol "CUSD" \
  --transfer-hook-program HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU
```

### Custom Config File

```bash
sss-token init --custom ./config.toml
```

Example `config.toml`:

```toml
preset = "custom"
name = "Desk USD"
symbol = "DUSD"
decimals = 6
enable_permanent_delegate = true
enable_transfer_hook = true
transfer_hook_program = "HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU"
default_frozen = false
rpc = "http://127.0.0.1:8899"
program_id = "GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM"
```

## Daily Operations

Mint:

```bash
sss-token mint <recipient_pubkey> <amount>
```

Burn:

```bash
sss-token burn <amount>
```

Freeze/thaw:

```bash
sss-token freeze <owner_pubkey>
sss-token freeze <owner_pubkey> --thaw
```

Pause/unpause:

```bash
sss-token pause
sss-token pause --unpause
```

Inspect state:

```bash
sss-token status
sss-token supply
sss-token holders --min-balance 1000000
sss-token audit-log --action mint
```

## SSS-2 Compliance Operations

Blacklist add/remove:

```bash
sss-token blacklist add <owner_pubkey> --reason "OFAC match"
sss-token blacklist remove <owner_pubkey>
```

Seize:

```bash
sss-token seize <from_token_account> <amount> --to <treasury_token_account>
```

## Role Operations

Minter management:

```bash
sss-token minters list
sss-token minters add <minter_pubkey> <quota>
sss-token minters remove <minter_pubkey>
```

## Backend Services

Backend service scaffold is in `backend/`.

Run with Docker Compose:

```bash
cd backend
docker compose up --build
```

Health endpoint:

```bash
curl http://localhost:3000/health
```

## Safety Checklist Before Production Actions

1. Verify active keypair has expected role and authority.
2. Confirm program IDs match deployment target.
3. For SSS-2, verify transfer-hook program ID and extra-account-metas initialization.
4. Record transaction signatures for audit trail.
