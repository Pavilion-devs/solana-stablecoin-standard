# Architecture

## Layer Model

The project is organized in three layers:

1. `Layer 1: Base stablecoin program`
- Program: `programs/sss-token`
- Handles initialization, mint/burn, freeze/thaw, pause/unpause, role management, and authority transfer.

2. `Layer 2: Optional compliance module`
- Program: `programs/transfer-hook`
- Enforces blacklist checks on transfers for SSS-2 via Token-2022 transfer hooks.

3. `Layer 3: Presets and operator interfaces`
- SDK: `sdk/core` (`@stbr/sss-token`)
- CLI: `cli` (`sss-token`)
- Backend service scaffold: `backend`

## On-Chain Programs

### `sss-token` program

Primary state:

- `StablecoinConfig` PDA: `[b"config"]`
- Mint PDA: `[b"mint", config]`
- `MinterInfo` PDA: `[b"minter", config, minter]`
- Role member PDA: `[b"role", config, role, member]`
- Blacklist entry PDA: `[b"blacklist", config, address]`

Core behavior:

- Supports SSS-1 and SSS-2 from a single `initialize` instruction.
- Feature gates compliance instructions so SSS-1 deployments fail gracefully on SSS-2 operations.
- Initializes Token-2022 mint and extensions based on config flags.

### `transfer-hook` program

Primary state:

- Extra-account-metas PDA for transfer hook validation:
  `[b"extra-account-metas", mint]` (program-derived under transfer-hook program)

Core behavior:

- Provides `initialize_extra_account_meta_list` to publish required accounts for transfer-hook execution.
- Implements transfer-hook `execute` with the canonical transfer-hook discriminator.
- Validates account layout via SPL TLV account resolution.
- Derives source and destination blacklist PDAs from token-account owner bytes and blocks transfers if either exists.

## Presets

### SSS-1 (Minimal)

- Mint authority
- Freeze authority
- Metadata fields
- Role-based operations

### SSS-2 (Compliant)

- All SSS-1 features
- Permanent delegate support
- Transfer hook wiring
- Blacklist enforcement through transfer hook program
- Seizure workflow via compliance instruction set

## Data Flow (SSS-2 transfer)

1. User submits Token-2022 `transfer_checked` with transfer-hook path.
2. Token-2022 invokes transfer-hook `execute`.
3. Transfer-hook validates extra account metadata list for required accounts.
4. Transfer-hook derives blacklist PDAs for source and destination owners.
5. If either blacklist account exists, transfer fails; otherwise transfer proceeds.

## Security Model

- Role separation for authority, minter, pauser, freezer, blacklister, and seizer.
- Mint quotas per minter.
- Global pause control.
- Compliance operations gated by initialization flags.
- Transfer-hook account validation to reduce account substitution risk.
