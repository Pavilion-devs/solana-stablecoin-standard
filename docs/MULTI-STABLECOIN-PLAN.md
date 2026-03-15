# Multi-Stablecoin Migration Plan

## Goal

Remove the current single-config-per-deployment limitation without breaking the existing codebase, SDK, CLI, frontend, or deployed instances during development.

The end state should allow one deployed `sss_token` program to manage multiple independent stablecoins.

## Current Problem

Today the program is effectively a singleton:

- `config` is derived from `[CONFIG_SEED]`
- `mint` is derived from `[MINT_SEED, config]`
- all minter/role/blacklist PDAs are derived from `config`

That means one deployed program can only create one stablecoin config and one mint.

Operationally, the current workaround is "deploy a new program for every stablecoin". That is not a good standard-level architecture.

## Root Cause

The root cause is the `config` PDA design.

Because `config` uses only a fixed seed, there is no stablecoin-specific namespace inside one program deployment.

Important nuance:

- We should not directly "include the mint key in the config PDA" while `mint` is itself derived from `config`
- that creates a circular dependency

So the fix has to introduce a new stablecoin-specific seed that exists before the mint PDA is derived.

## Recommended Design

Use a stablecoin-specific seed for `config`, then continue deriving `mint` from `config`.

Recommended PDA model:

- `config = PDA([CONFIG_SEED, stablecoin_seed])`
- `mint = PDA([MINT_SEED, config])`
- `minter = PDA([MINTER_SEED, config, minter])`
- `role = PDA([ROLE_SEED, config, role, member])`
- `blacklist = PDA([BLACKLIST_SEED, config, address])`

This gives us:

- multiple stablecoins under one program
- no circular dependency
- authority can still be transferred without invalidating the config PDA
- minimal change to downstream PDA families because everything already keys off `config`

## Why This Path

This is the least disruptive architecture change because:

- the mint can remain program-derived
- transfer-hook extra-account-meta PDA logic stays per mint
- role/minter/blacklist isolation already follows `config`
- the mental model remains "one config controls one mint"

## Seed Format

The program should not rely on arbitrary-length strings as PDA seeds directly.

Recommended canonical seed input:

- `stablecoin_seed: [u8; 32]`

User-facing tooling can still accept friendly labels such as `pusd-devnet`, but SDK/CLI/frontend should hash or normalize that value into a fixed 32-byte seed before sending it on-chain.

That gives us:

- deterministic PDA derivation
- simple cross-client compatibility
- no seed-length surprises

## Compatibility Strategy

We should not replace the singleton path in one shot.

We should add a V2 path first.

Recommended compatibility model:

1. Keep the current singleton path as V1.
2. Add multi-stablecoin support as V2.
3. Make SDK/CLI/frontend prefer V2 for new instances.
4. Keep V1 readable and operable for existing deployed instances.
5. Only consider deprecating V1 after V2 is stable.

This avoids breaking:

- existing tests
- existing frontend demo
- existing devnet instance
- any external users already relying on the singleton PDA

## On-Chain Design Changes

### 1. Add V2 config derivation

Introduce an `initialize_v2` flow that accepts `stablecoin_seed: [u8; 32]`.

Its config PDA should be:

- `[CONFIG_SEED, stablecoin_seed]`

Its mint PDA should remain:

- `[MINT_SEED, config]`

### 2. Store V2 seed metadata in config

The program needs enough information inside `StablecoinConfig` to re-derive its signer seeds during later instructions.

Recommended additions:

- `version: u8`
- `stablecoin_seed: [u8; 32]`

We already have `_reserved: [u8; 64]`, so this can be absorbed without changing account size if we plan it carefully.

That is important because:

- changing the account size unnecessarily makes migration harder
- existing account layout compatibility is easier to preserve if we reuse reserved bytes

### 3. Add a reusable config signer helper

Right now many instructions assume signer seeds are:

- `[CONFIG_SEED, bump]`

For V2, signer seeds should be:

- `[CONFIG_SEED, stablecoin_seed, bump]`

We should centralize this logic in one helper instead of duplicating seed branching across every instruction.

### 4. Update instruction account validation

Current instructions often constrain `config` with:

- `seeds = [CONFIG_SEED]`

That will not work for V2.

Recommended approach:

- V1 instructions remain unchanged
- V2 instructions validate `config` by recomputing the expected PDA from fields stored inside `config`

This avoids passing `stablecoin_seed` into every instruction forever.

### 5. Keep one operational instruction surface where possible

The only new instruction that must be additive is `initialize_v2`.

For the rest of the program, the safer implementation path is:

- keep the existing operational instruction names
- make them accept either a V1 or V2 config account
- centralize config PDA validation and config signer seed derivation in shared helpers

That avoids duplicating the entire instruction set while still preserving V1 compatibility.

## SDK Changes

### New concepts

SDK must stop assuming "one program = one config".

Recommended API direction:

- `create(program, params, options)`
- `load(program, options)`

Where `options` includes:

- `stablecoinSeed`
- optionally `config`

Suggested behavior:

- if `config` is passed, load directly
- else if `stablecoinSeed` is passed, derive V2 config
- else fall back to V1 singleton load for backward compatibility

### PDA helpers

Add V2 derivation helpers:

- `deriveConfigPdaV2(programId, stablecoinSeed)`
- `deriveMintPda(programId, config)` stays unchanged

### Avoid breaking existing callers

We should keep the current singleton helpers for now, but mark them as legacy in docs.

## CLI Changes

CLI currently assumes one config per program.

Needed changes:

- add `--stablecoin-seed` for `init`, `status`, `mint`, `burn`, `pause`, `freeze`, `thaw`, `roles`, `blacklist`, `seize`
- optionally add `--config <pubkey>` as an escape hatch
- preserve current behavior if neither is given by falling back to V1 singleton mode

Recommended user model:

- new flows use `--stablecoin-seed`
- power users can use `--config`

## Frontend Changes

The frontend currently assumes a single config for the configured program ID.

Needed changes:

- add stablecoin selection or creation state
- store the chosen `stablecoinSeed` or `config`
- stop auto-loading the singleton config by default in V2 mode

Recommended approach:

- keep the current demo dashboard as "legacy singleton mode" until V2 lands
- add a V2 selector/create flow afterward

That keeps the current demo stable while we build the new architecture.

## Backend Changes

Backend assumptions also need to stop treating one program as one stablecoin.

Needed changes:

- request handlers should accept `config` or `stablecoin_seed`
- queries should become per-config, not per-program
- any cached state keyed only by program ID must be revisited

## Testing Strategy

We should not attempt this redesign without expanding tests first.

### Required new tests

1. same authority creates two stablecoins in one program
2. different authorities create stablecoins with the same `stablecoin_seed`
3. role isolation between two configs
4. minter quota isolation between two configs
5. blacklist isolation between two configs
6. pause/freeze isolation between two configs
7. seize isolation between two configs
8. transfer-hook enforcement remains correct per mint
9. SDK can load by `config`
10. SDK can load by `stablecoinSeed`
11. CLI can target two different stablecoins in one deployed program

### Regression coverage

Keep the current V1 tests during the migration.

That gives us:

- confidence we did not break the existing singleton flow
- confidence V2 actually solves the architecture problem

## Deployment Strategy

Do not roll this out directly on the current submission deployment first.

Recommended deployment path:

### Phase 1: localnet only

- implement V2 PDAs and instruction flow
- keep V1 intact
- expand tests heavily

### Phase 2: fresh devnet canary deployment

- deploy a new canary program ID
- create multiple stablecoins under one deployment
- test SDK, CLI, frontend, backend against that canary

### Phase 3: decide mainline upgrade path

After the canary is stable, decide whether to:

- upgrade the main program with additive V2 support
- or publish V2 as a clearly versioned next iteration

## Risks

### 1. Breaking current clients

If we replace the singleton PDA derivation in place, we will break:

- SDK loading
- CLI targeting
- frontend assumptions
- current tests
- existing devnet instances

That is why an additive V2 path is safer.

### 2. Incomplete signer-seed migration

Every instruction that uses `config` as a signer must derive seeds correctly for both V1 and V2.

If we miss even one instruction, behavior will look random and expensive to debug.

### 3. Discovery and UX

Supporting multiple stablecoins technically is not enough.

Users also need a way to choose which stablecoin they are operating on.

That is a product and tooling problem, not just a PDA problem.

## Proposed Implementation Phases

### Phase 0: design lock

- finalize PDA model
- finalize seed encoding
- decide V1/V2 compatibility contract

### Phase 1: on-chain V2 support

- add `initialize_v2`
- add config seed/version storage
- add config signer helper
- add V2 instruction handlers

### Phase 2: SDK and CLI support

- add V2 PDA helpers
- add `load/create` targeting support
- add CLI `--stablecoin-seed` and `--config`

### Phase 3: test expansion

- localnet integration tests
- CLI integration tests
- SDK regression tests

### Phase 4: frontend and backend targeting

- frontend stablecoin selection flow
- backend request scoping by `config` or seed

### Phase 5: canary deployment

- fresh devnet deployment
- multi-stablecoin verification
- doc updates

## Definition of Done

We should only call this fixed when all of the following are true:

1. one deployed program can initialize at least two stablecoins
2. each stablecoin has its own independent mint and config
3. roles, minters, blacklist, pause, freeze, and seize are isolated per config
4. SDK can target a specific stablecoin explicitly
5. CLI can target a specific stablecoin explicitly
6. frontend can select or create a specific stablecoin explicitly
7. backend APIs are per-config, not just per-program
8. V1 singleton flow still works or is intentionally deprecated with a clear migration note

## Recommended Immediate Next Step

Do not start coding the migration yet.

First, lock these design decisions:

1. use `config = PDA([CONFIG_SEED, stablecoin_seed])`
2. keep `mint = PDA([MINT_SEED, config])`
3. add `initialize_v2`, then generalize the existing operational instructions to accept both V1 and V2 configs
4. use the reserved bytes in `StablecoinConfig` for V2 metadata where possible

Once those are agreed, we can break the work into safe implementation tickets instead of trying to rewrite the architecture in one pass.
