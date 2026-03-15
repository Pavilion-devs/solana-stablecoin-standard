# Multi-Stablecoin V2 Tickets

## Objective

Implement a safe V2 path that allows multiple stablecoins under one deployed `sss_token` program without breaking the existing singleton V1 flow.

Corrected V2 PDA model:

- `config = PDA([CONFIG_SEED, stablecoin_seed])`
- `mint = PDA([MINT_SEED, config])`

This model avoids the authority-transfer problem that would occur if `authority` were part of the config PDA seeds.

## Ticket 1: V2 Config Metadata

Status: In progress

Scope:

- extend `StablecoinConfig` with:
  - `version: u8`
  - `stablecoin_seed: [u8; 32]`
- consume existing reserved bytes instead of increasing account size
- add constants for:
  - `CONFIG_VERSION_V1`
  - `CONFIG_VERSION_V2`
  - `STABLECOIN_SEED_LEN`

Acceptance:

- existing V1 accounts still deserialize safely
- new V1 accounts set `version = V1` and zero seed
- new V2 accounts set `version = V2` and persist seed

## Ticket 2: Shared Config Validation Helpers

Status: In progress

Scope:

- add shared helper(s) to:
  - compute expected V1/V2 config PDA from stored config data
  - validate a config account address against the current program ID
  - derive signer seeds for CPI calls using either V1 or V2 config layout

Acceptance:

- later instructions can stop hardcoding `seeds = [CONFIG_SEED]`
- signer seed branching exists in one place, not duplicated across instructions

## Ticket 3: Add `initialize_v2`

Status: Pending

Scope:

- add new program instruction:
  - `initialize_v2(..., stablecoin_seed: [u8; 32])`
- config PDA:
  - `[CONFIG_SEED, stablecoin_seed]`
- mint PDA remains:
  - `[MINT_SEED, config]`
- preserve all current mint extension behavior:
  - permanent delegate
  - transfer hook
  - default account state

Acceptance:

- two different `stablecoin_seed` values can initialize two configs in one program deployment
- mint setup remains identical to V1 except for config derivation

## Ticket 4: Generalize Existing Operational Instructions

Status: Pending

Scope:

- update these instructions to accept both V1 and V2 configs:
  - `mint`
  - `burn`
  - `freeze_account`
  - `thaw_account`
  - `pause`
  - `unpause`
  - `transfer_authority`
  - `add_minter`
  - `remove_minter`
  - `update_minter_quota`
  - `add_role`
  - `remove_role`
  - `add_to_blacklist`
  - `remove_from_blacklist`
  - `seize`

Implementation note:

- remove direct singleton seed constraints on `config`
- replace them with shared config-address validation helpers
- route all config signer CPI calls through the shared signer-seed helper

Acceptance:

- V1 behavior remains unchanged
- V2 configs can use the same operational instruction set

## Ticket 5: SDK V2 PDA Helpers

Status: Pending

Scope:

- add:
  - `deriveConfigPdaV2(programId, stablecoinSeed)`
- keep legacy singleton helper for V1
- add seed normalization helper for SDK callers

Acceptance:

- SDK can derive both V1 and V2 config PDAs deterministically

## Ticket 6: SDK Explicit Load/Create Targeting

Status: Pending

Scope:

- extend SDK create/load APIs to support:
  - `config`
  - `stablecoinSeed`
  - legacy fallback to singleton V1 if neither is provided
- add V2 create path using `initialize_v2`

Acceptance:

- callers can explicitly target one stablecoin under one program
- existing V1 callers do not break

## Ticket 7: CLI Targeting Model

Status: Complete

Scope:

- add `--stablecoin-seed`
- add `--config`
- preserve V1 fallback if neither is supplied
- update init/status/treasury/compliance commands to resolve target config explicitly

Acceptance:

- CLI can operate on two stablecoins under one deployment without ambiguity
- implemented with `--stablecoin-seed` / `--config` targeting and validated in the CLI harness

## Ticket 8: Frontend Targeting Model

Status: Complete

Scope:

- stop assuming one config per program
- add explicit stablecoin selection/creation state
- keep current singleton demo behavior as legacy mode until V2 UI is ready

Acceptance:

- frontend can create/select a specific stablecoin instance
- implemented in the operator dashboard with:
  - `Legacy Singleton`
  - `Load By Seed`
  - `Load By Config`
  - V2 initialize via optional `stablecoinSeed`
  - persisted target state via local storage and URL query params

## Ticket 9: Backend Multi-Config Support

Status: Complete

Scope:

- update backend request model to accept `config` or `stablecoin_seed`
- avoid program-wide singleton assumptions in service code

Acceptance:

- backend endpoints are scoped per stablecoin config
- implemented with request-level `config` / `stablecoin_seed` targeting
- executor now forwards target flags to the CLI path
- backend blacklist state is scoped per resolved target instead of one global map

## Ticket 10: V2 Integration Tests

Status: Complete

Scope:

- add integration tests covering:
  - two V2 configs in one program
  - minter isolation
  - role isolation
  - blacklist isolation
  - freeze/pause isolation
  - seize isolation
  - transfer-hook behavior per mint

Acceptance:

- one test run proves multiple stablecoins can coexist independently in one deployment
- covered and validated for:
  - minter isolation
  - pause/freeze isolation
  - blacklist isolation
  - seize isolation
  - transfer-hook enforcement per mint

## Ticket 11: SDK/CLI Regression Tests

Status: Complete

Scope:

- SDK tests for:
  - V1 load
  - V2 load by seed
  - V2 load by config
- CLI tests for:
  - two distinct V2 targets in one local validator run

Acceptance:

- tooling regressions are caught automatically
- CLI multi-target regression coverage is in place
- SDK load regression coverage now verifies:
  - V1 load
  - V2 load by seed
  - V2 load by config

## Ticket 12: Canary Devnet Rollout

Status: Pending

Scope:

- deploy a fresh canary program ID after local validation
- initialize multiple stablecoins under one deployment
- verify SDK/CLI/frontend/backend against the canary

Acceptance:

- multi-stablecoin behavior is proven outside localnet before any mainline rollout decision

## Immediate Execution Order

This is the recommended implementation order for the next coding passes:

1. Ticket 1
2. Ticket 2
3. Ticket 3
4. Ticket 4
5. Ticket 5
6. Ticket 6
7. Ticket 10

That gets the core V2 architecture working before we touch CLI/frontend/backend targeting.

## Current Milestone

Milestone A:

- land Tickets 1-6 and Ticket 10 locally
- keep V1 working
- prove two V2 stablecoins can be initialized and operated under one deployment

Only after that should we move into CLI/frontend/backend adaptation.
