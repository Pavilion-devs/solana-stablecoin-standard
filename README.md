# Solana Stablecoin Standard (SSS)

Open-source SDK & core standards for stablecoins on Solana.

Demo video:

- https://youtu.be/axewG2gr8Q0

## Standards

| Standard | Name | Description |
|----------|------|-------------|
| **SSS-1** | Minimal Stablecoin | Mint + freeze + metadata |
| **SSS-2** | Compliant Stablecoin | SSS-1 + permanent delegate + transfer hook + blacklist |
| **SSS-3** | Private Stablecoin | Confidential transfers (bonus) |

## Deployment Model

The current codebase supports two config models:

- `V1 legacy singleton`: the original global config PDA for one stablecoin per deployed program
- `V2 multi-stablecoin`: multiple stablecoins under one deployed program, each addressed by a `stablecoinSeed`

V2 derives config PDAs independently per stablecoin instance, so the SDK, CLI, backend, and frontend can all target a specific stablecoin without deploying a new program for each issuer.

Targeting options across the stack:

- `legacy`: load the original singleton config
- `stablecoinSeed`: resolve a V2 config from a stablecoin seed
- `config`: target an explicit config PDA directly

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

# V2: create a second stablecoin under the same deployed program
sss-token init --preset sss-2 --name "Issuer A USD" --symbol "IAUSD" \
  --stablecoin-seed issuer-a \
  --transfer-hook-program HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU

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

# Explicit V2 targeting for later operations
sss-token status --stablecoin-seed issuer-a
sss-token mint <recipient> 1000000 --stablecoin-seed issuer-a
sss-token status --config <config-pda>
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

// V2: create and load multiple stablecoins under one program
const issuerA = await SolanaStablecoin.create(program, {
  preset: Presets.SSS_2,
  name: 'Issuer A USD',
  symbol: 'IAUSD',
  decimals: 6,
  stablecoinSeed: 'issuer-a',
  transferHookProgram: new PublicKey('HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU'),
});

const issuerALoaded = await SolanaStablecoin.loadWithOptions(program, {
  stablecoinSeed: 'issuer-a',
});

const issuerAByConfig = await SolanaStablecoin.loadWithOptions(program, {
  config: issuerALoaded.getConfigPda(),
});
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

Live demo:

- https://solana-stablecoin-standard-indol.vercel.app/

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
NEXT_PUBLIC_SSS_PROGRAM_ID=CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe
NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID=HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU
```

Frontend targeting notes:

- `Legacy Singleton` loads the original global config PDA.
- `Load By Seed` loads a V2 stablecoin under the same deployed program by `stablecoinSeed`.
- `Load By Config` loads an explicit config PDA directly.
- The dashboard persists the active target in local storage and mirrors it into the URL as `?target=legacy`, `?seed=...`, or `?config=...`.

## Backend Targeting

The backend API is also target-aware:

- mint, burn, and compliance requests accept `stablecoin_seed` or `config`
- if neither is supplied, the backend falls back to `DEFAULT_STABLECOIN_SEED`, `DEFAULT_CONFIG_PDA`, or the legacy singleton
- blacklist storage is scoped per resolved stablecoin target instead of one global in-memory list

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

# Run V2 multi-config tests
yarn ts-mocha -r ts-node/register/transpile-only -p ./tsconfig.json -t 1000000 tests/sss-v2.ts

# Run the isolated CLI regression harness
yarn test:cli

# Run SDK regression tests
yarn workspace @stbr/sss-token test

# Run backend tests
cd backend && cargo test
```

## Program IDs

| Network | SSS Token | Transfer Hook |
|---------|-----------|---------------|
| Localnet | `CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe` | `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU` |
| Devnet (configured) | `CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe` | `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU` |

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
