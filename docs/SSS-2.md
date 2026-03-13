# SSS-2: Compliant Stablecoin

Regulated stablecoin standard with on-chain compliance enforcement.

## Overview

SSS-2 extends SSS-1 with proactive compliance features required by regulated issuers:

- **All SSS-1 features** plus:
- **Permanent Delegate** - Token seizure capability
- **Transfer Hook** - Blacklist enforcement on every transfer
- **Default Frozen** - Accounts frozen until KYC/unfrozen

## Use Cases

- **Regulated stablecoins** - USDC/USDT-class tokens
- **Institutional tokens** - Bank-issued digital currency
- **Compliant securities** - Tokenized assets with compliance
- **Any token requiring** - On-chain blacklist enforcement

## Features

| Feature | Description |
|---------|-------------|
| All SSS-1 Features | Mint, burn, freeze, pause |
| Permanent Delegate | Seize tokens from any account |
| Transfer Hook | Check blacklist on every transfer |
| Default Frozen | New accounts start frozen |
| Blacklist PDAs | On-chain sanctions list |

## Token-2022 Extensions Used

| Extension | Purpose |
|-----------|---------|
| Metadata Pointer | Token name and symbol |
| Freeze Authority | Account freezing capability |
| Permanent Delegate | Token seizure authority |
| Transfer Hook | Blacklist enforcement |
| Default Account State | Frozen by default |

## Quick Start

### CLI

```bash
# Initialize a compliant stablecoin
sss-token init --preset sss-2 --name "Compliant USD" --symbol "CUSD" \
  --transfer-hook-program HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU

# Add to blacklist
sss-token blacklist add <address> --reason "OFAC match"

# Seize tokens
sss-token seize <address> 1000000 --to <treasury>

# Remove from blacklist
sss-token blacklist remove <address>
```

### SDK

```typescript
import { SolanaStablecoin, Preset } from '@stbr/sss-token';
import { PublicKey } from '@solana/web3.js';

// Create compliant stablecoin
const stable = await SolanaStablecoin.create(program, {
  preset: Preset.SSS_2,
  name: 'Compliant USD',
  symbol: 'CUSD',
  decimals: 6,
  transferHookProgram: new PublicKey('HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU'),
}, authority);

// Add to blacklist
await stable.compliance.addToBlacklist(
  suspiciousPubkey,
  'OFAC sanctions match',
  blacklister
);

// Seize tokens
await stable.compliance.seize(
  fromAccount,
  treasuryAccount,
  1_000_000,
  seizer
);

// Remove from blacklist
await stable.compliance.removeFromBlacklist(address, blacklister);
```

## Additional Roles (SSS-2)

| Role | Permission |
|------|------------|
| Blacklister | Add/remove addresses from blacklist |
| Seizer | Seize tokens via permanent delegate |

## Additional Instructions (SSS-2)

| Instruction | Description |
|-------------|-------------|
| `add_to_blacklist` | Add address to blacklist |
| `remove_from_blacklist` | Remove address from blacklist |
| `seize` | Transfer tokens using permanent delegate |

## Transfer Hook

The transfer hook program checks every transfer:

```
Transfer Flow:
┌─────────┐     ┌────────────────┐     ┌─────────┐
│ Sender  │────▶│ Transfer Hook  │────▶│Receiver │
└─────────┘     │                │     └─────────┘
                │ Check:         │
                │ - Sender OK?   │
                │ - Receiver OK? │
                │ - Not paused?  │
                └────────────────┘
```

If either party is blacklisted, the transfer fails.

## Additional Events (SSS-2)

| Event | When |
|-------|------|
| `AddedToBlacklist` | Address blacklisted |
| `RemovedFromBlacklist` | Address unblacklisted |
| `Seized` | Tokens seized |

## Blacklist Entry Structure

```rust
pub struct BlacklistEntry {
    pub config: Pubkey,      // Parent config
    pub address: Pubkey,     // Blacklisted address
    pub reason: String,      // Reason (max 100 chars)
    pub timestamp: i64,      // When blacklisted
    pub bump: u8,            // PDA bump
}
```

## Compliance Workflow

```
1. User flagged by sanctions screening
2. Blacklister adds to blacklist
3. Transfer hook blocks all transfers
4. Seizer confiscates tokens to treasury
5. Compliance team reviews
6. If cleared, remove from blacklist
7. User can transfer again
```

## Security Considerations

### Permanent Delegate

- Allows seizing tokens from any account
- Critical power - limit seizer role carefully
- All seizures are logged on-chain

### Transfer Hook

- Every transfer checked against blacklist
- No way to bypass via direct program interaction
- Hook program must be immutable or governed

### Default Frozen

- New accounts cannot receive tokens until unfrozen
- Provides KYC checkpoint
- Freezer role can unfreeze after verification

## Error Handling

SSS-2 instructions fail gracefully if compliance not enabled:

```rust
require!(
    config.enable_transfer_hook,
    StablecoinError::ComplianceNotEnabled
);
```

## Gas Considerations

SSS-2 operations have higher compute costs:

| Operation | CU (approx) |
|-----------|-------------|
| Initialize | 80,000 |
| Mint | 40,000 |
| Transfer (with hook) | 50,000 |
| Seize | 45,000 |

## Integration with Sanctions Providers

The compliance service can integrate with:

- **OFAC SDN List** - US sanctions
- **EU Consolidated List** - European sanctions
- **Custom lists** - Internal blocklists

## Program IDs

| Program | ID |
|---------|-----|
| SSS Token | `GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM` |
| Transfer Hook | `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU` |
