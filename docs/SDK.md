# SDK Reference

## Package

- NPM package: `@stbr/sss-token`
- Source: `sdk/core`

## Main Class

- `SolanaStablecoin`

Key entrypoints:

- `SolanaStablecoin.create(program, params, authority?)`
- `SolanaStablecoin.load(program)`

## Presets

Use `Preset` from `@stbr/sss-token`:

- `Preset.SSS_1`
- `Preset.SSS_2`
- `Preset.CUSTOM`

## Create Params

`CreateStablecoinParams`:

- `preset?: Preset`
- `name: string`
- `symbol: string`
- `uri?: string`
- `decimals?: number`
- `enablePermanentDelegate?: boolean`
- `enableTransferHook?: boolean`
- `transferHookProgram?: PublicKey`
- `defaultAccountFrozen?: boolean`

Important:

- If `enableTransferHook` is `true`, `transferHookProgram` is required.

## Example: SSS-1

```ts
import { SolanaStablecoin, Preset } from '@stbr/sss-token';

const stable = await SolanaStablecoin.create(program, {
  preset: Preset.SSS_1,
  name: 'My USD',
  symbol: 'MUSD',
  decimals: 6,
}, authority);
```

## Example: SSS-2

```ts
import { PublicKey } from '@solana/web3.js';
import { SolanaStablecoin, Preset } from '@stbr/sss-token';

const stable = await SolanaStablecoin.create(program, {
  preset: Preset.SSS_2,
  name: 'Compliant USD',
  symbol: 'CUSD',
  decimals: 6,
  transferHookProgram: new PublicKey('HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU'),
}, authority);
```

## Core Methods

- `getState()`
- `getTotalSupply()`
- `mint({ recipient, amount }, minter?)`
- `burn({ amount }, burner?)`
- `freezeAccount(owner, freezer?)`
- `thawAccount(owner, freezer?)`
- `pause(pauser?)`
- `unpause(pauser?)`
- `isPaused()`
- `addMinter(minter, quota, authority?)`
- `removeMinter(minter, authority?)`
- `updateMinterQuota(minter, newQuota, authority?)`
- `addRole(role, member, authority?)`
- `removeRole(role, member, authority?)`
- `transferAuthority(newAuthority, authority?)`

Example:

```ts
const supply = await stable.getTotalSupply();
console.log(supply.toString());
```

## Compliance Module

`stable.compliance` exposes:

- `addToBlacklist(address, reason, blacklister?)`
- `removeFromBlacklist(address, blacklister?)`
- `seize(fromAccount, toAccount, amount, seizer?)`

## PDA Helpers

Exports:

- `deriveConfigPda`
- `deriveMintPda`
- `deriveMinterPda`
- `deriveRolePda`
- `deriveBlacklistPda`

## Roles

`Role` enum:

- `Burner = 0`
- `Pauser = 1`
- `Freezer = 2`
- `Blacklister = 3`
- `Seizer = 4`
