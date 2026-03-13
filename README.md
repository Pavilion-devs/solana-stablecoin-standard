# Solana Stablecoin Standard (SSS)

Open-source SDK & core standards for stablecoins on Solana.

## Standards

| Standard | Name | Description |
|----------|------|-------------|
| **SSS-1** | Minimal Stablecoin | Mint + freeze + metadata |
| **SSS-2** | Compliant Stablecoin | SSS-1 + permanent delegate + transfer hook + blacklist |
| **SSS-3** | Private Stablecoin | Confidential transfers (bonus) |

## Quick Start

### Installation

```bash
# SDK
npm install @stbr/sss-token

# CLI
npm install -g sss-token
```

### CLI Usage

```bash
# SSS-1: Minimal stablecoin
sss-token init --preset sss-1 --name "My USD" --symbol "MUSD"

# SSS-2: Compliant stablecoin
sss-token init --preset sss-2 --name "Compliant USD" --symbol "CUSD" \
  --transfer-hook-program HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU

# Custom config file
sss-token init --custom ./config.toml

# Operations
sss-token mint <recipient> 1000000
sss-token burn 1000000
sss-token status
sss-token supply
sss-token holders --min-balance 1000000
sss-token audit-log --action mint
sss-token freeze <address>
sss-token thaw <address>
sss-token pause
sss-token unpause

# SSS-2 compliance
sss-token blacklist add <address> --reason "OFAC match"
sss-token blacklist remove <address>
sss-token seize <address> --to <treasury>
```

### SDK Usage

```typescript
import { Presets, SolanaStablecoin } from '@stbr/sss-token';
import { PublicKey } from '@solana/web3.js';

// SSS-1
const stable = await SolanaStablecoin.create(program, {
  preset: Presets.SSS_1,
  name: 'My USD',
  symbol: 'MUSD',
  decimals: 6,
});

// Mint
await stable.mint({ recipient, amount: 1_000_000 });
const supply = await stable.getTotalSupply();

// SSS-2 Compliance
const compliant = await SolanaStablecoin.create(program, {
  preset: Presets.SSS_2,
  name: 'Compliant USD',
  symbol: 'CUSD',
  decimals: 6,
  transferHookProgram: new PublicKey('HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU'),
});

await compliant.compliance.blacklistAdd(address, 'OFAC match');
await compliant.compliance.seize(from, treasury, 1_000_000);
```

## Project Structure

```
solana-stablecoin-standard/
├── programs/
│   ├── sss-token/          # Main stablecoin program
│   └── transfer-hook/      # SSS-2 transfer hook
├── sdk/core/               # @stbr/sss-token
├── cli/                    # sss-token CLI
├── web/                    # Example frontend using the SDK
├── tests/                  # Integration tests
└── docs/                   # Documentation
```

## Example Frontend

```bash
# Build the SDK first so the local frontend dependency is available
yarn workspace @stbr/sss-token build

# Install and run the example frontend
cd web
cp .env.example .env
npm install
npm run dev
```

Optional environment variables for `web/`:

```bash
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SSS_PROGRAM_ID=GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM
NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID=HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU
```

## Build

```bash
# Build programs
anchor build

# Build SDK
cd sdk/core && npm run build

# Build CLI
cd cli && npm run build
```

## Test

```bash
# Run full integration suite against a clean local validator
solana-test-validator --reset
anchor test --skip-local-validator

# Run SSS-1 tests only
yarn ts-mocha -r ts-node/register/transpile-only -p ./tsconfig.json -t 1000000 tests/sss-1.ts

# Run SSS-2 tests only
yarn ts-mocha -r ts-node/register/transpile-only -p ./tsconfig.json -t 1000000 tests/sss-2.ts

# Run the isolated CLI regression harness
yarn test:cli
```

## Program IDs

| Network | SSS Token | Transfer Hook |
|---------|-----------|---------------|
| Localnet | `GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM` | `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU` |
| Devnet (configured) | `GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM` | `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU` |

## Documentation

- [Documentation Index](docs/README.md)
- [Devnet Deployment Proof](docs/DEVNET-PROOF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [SDK Reference](docs/SDK.md)
- [Operations Runbook](docs/OPERATIONS.md)
- [SSS-1: Minimal Stablecoin](docs/SSS-1.md)
- [SSS-2: Compliant Stablecoin](docs/SSS-2.md)
- [Compliance](docs/COMPLIANCE.md)
- [Backend API](docs/API.md)

## License

MIT
