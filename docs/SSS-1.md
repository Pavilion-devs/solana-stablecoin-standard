# SSS-1: Minimal Stablecoin

The simplest stablecoin standard on Solana. Everything you need, nothing you don't.

## Overview

SSS-1 provides the foundational features required for any stablecoin:

- **Mint Authority** - Controlled token issuance
- **Freeze Authority** - Ability to freeze/unfreeze accounts
- **Metadata** - Token name, symbol, and URI
- **Role-Based Access Control** - Separation of duties

## Use Cases

- **Internal tokens** - Company credits, loyalty points
- **DAO treasuries** - Governance tokens with admin control
- **Ecosystem settlement** - Payment rails between parties
- **Simple stablecoins** - Where compliance is reactive (freeze as needed)

## Features

| Feature | Description |
|---------|-------------|
| Mint Control | Only authorized minters can create tokens |
| Mint Quotas | Per-minter limits on issuance |
| Freeze/Thaw | Freeze suspicious accounts |
| Pause/Unpause | Emergency stop for all operations |
| Role Management | Separate burner, pauser, freezer roles |
| Authority Transfer | Hand over admin rights |

## Token-2022 Extensions Used

| Extension | Purpose |
|-----------|---------|
| Metadata Pointer | Token name and symbol |
| Freeze Authority | Account freezing capability |

## Quick Start

### CLI

```bash
# Initialize a minimal stablecoin
sss-token init --preset sss-1 --name "My USD" --symbol "MUSD"

# Add a minter with quota
sss-token minters add <pubkey> 1000000000

# Mint tokens
sss-token mint <recipient> 1000000

# Freeze an account
sss-token freeze <address>

# Pause all operations
sss-token pause
```

### SDK

```typescript
import { SolanaStablecoin, Preset } from '@stbr/sss-token';

// Create stablecoin
const stable = await SolanaStablecoin.create(program, {
  preset: Preset.SSS_1,
  name: 'My USD',
  symbol: 'MUSD',
  decimals: 6,
}, authority);

// Add minter
await stable.addMinter(minterPubkey, 1_000_000_000, authority);

// Mint tokens
await stable.mint({ recipient: userPubkey, amount: 1_000_000 }, minter);

// Freeze account
await stable.freezeAccount(suspiciousPubkey, freezer);

// Pause token
await stable.pause(pauser);
```

## Roles

| Role | Permission |
|------|------------|
| Master Authority | Transfer authority, manage roles |
| Minter | Mint tokens (within quota) |
| Burner | Burn tokens |
| Pauser | Pause/unpause token |
| Freezer | Freeze/unfreeze accounts |

## Instructions

### Core Operations

| Instruction | Description |
|-------------|-------------|
| `initialize` | Create new stablecoin |
| `mint` | Mint tokens to recipient |
| `burn` | Burn tokens from account |

### Admin Operations

| Instruction | Description |
|-------------|-------------|
| `freeze_account` | Freeze a token account |
| `thaw_account` | Unfreeze a token account |
| `pause` | Pause all operations |
| `unpause` | Resume operations |
| `transfer_authority` | Transfer master authority |

### Role Management

| Instruction | Description |
|-------------|-------------|
| `add_minter` | Add minter with quota |
| `remove_minter` | Remove minter |
| `update_minter_quota` | Update minter's quota |
| `add_role` | Add burner/pauser/freezer |
| `remove_role` | Remove role |

## Events

| Event | When |
|-------|------|
| `StablecoinInitialized` | Token created |
| `Minted` | Tokens minted |
| `Burned` | Tokens burned |
| `AccountFrozen` | Account frozen |
| `AccountThawed` | Account unfrozen |
| `TokenPaused` | Token paused |
| `TokenUnpaused` | Token unpaused |

## Security Considerations

1. **Role Separation** - No single key controls all operations
2. **Mint Quotas** - Limit exposure from compromised minter keys
3. **Emergency Pause** - Stop all operations in case of exploit
4. **Freeze Capability** - Reactive compliance for suspicious activity

## Limitations

- No proactive compliance (use SSS-2 for blacklist enforcement)
- No confidential transfers (use SSS-3 for privacy)
- No token seizure capability (use SSS-2)

## Migration to SSS-2

SSS-1 tokens cannot be directly upgraded to SSS-2. To migrate:

1. Deploy new SSS-2 token
2. Mint 1:1 to users who KYC
3. Burn old SSS-1 tokens
4. Update integrations

## Program ID

| Network | Program ID |
|---------|------------|
| Localnet | `GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM` |
| Devnet (configured) | `GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM` |
