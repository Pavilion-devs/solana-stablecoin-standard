# Devnet Deployment Proof

Deployment timestamp (UTC): `2026-03-02 09:50:53 UTC`

Deployer / upgrade authority:

- `AB5Wt29Vi8WVUUHuWWmFby6rLw9gEffzbVLmy7icMtYp`

Cluster / RPC used for deploy:

- `https://api.devnet.solana.com`

## Program IDs

- `sss_token`: `GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM`
- `transfer_hook`: `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU`

## Deployment Transactions

1. `transfer_hook` deploy signature:
- `ZovvzjMs87cBL1h6DfR2zhuUFGjZDqjC3UnEHN1UdGB4DbAY2AN6Uc8BDnWQNnJCdzNDrJRy4epgSqboUmNKovu`
- Explorer: `https://solscan.io/tx/ZovvzjMs87cBL1h6DfR2zhuUFGjZDqjC3UnEHN1UdGB4DbAY2AN6Uc8BDnWQNnJCdzNDrJRy4epgSqboUmNKovu?cluster=devnet`

2. `sss_token` deploy signature:
- `5bUnCCjQ25jc7nDsaaQ8WxCBwLSSDp2JBFX6hchG49qtjtAKQZ8YzraXKp1n7Jai2Ay38MLsU5jRiKhdaTqh25pj`
- Explorer: `https://solscan.io/tx/5bUnCCjQ25jc7nDsaaQ8WxCBwLSSDp2JBFX6hchG49qtjtAKQZ8YzraXKp1n7Jai2Ay38MLsU5jRiKhdaTqh25pj?cluster=devnet`

Finality checks:

- `solana confirm ZovvzjMs87cBL1h6DfR2zhuUFGjZDqjC3UnEHN1UdGB4DbAY2AN6Uc8BDnWQNnJCdzNDrJRy4epgSqboUmNKovu --url https://api.devnet.solana.com` -> `Finalized`
- `solana confirm 5bUnCCjQ25jc7nDsaaQ8WxCBwLSSDp2JBFX6hchG49qtjtAKQZ8YzraXKp1n7Jai2Ay38MLsU5jRiKhdaTqh25pj --url https://api.devnet.solana.com` -> `Finalized`

## On-Chain Program Verification

1. `transfer_hook`
- Program: `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU`
- ProgramData: `FnPJ4uSo94rJLRTkncxw6Rjr2cGVHTG5MbBGZEGZv8D4`
- Last deployed slot: `445674320`
- Explorer: `https://solscan.io/account/HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU?cluster=devnet`

2. `sss_token`
- Program: `GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM`
- ProgramData: `BD1w4roegR6L7aZH7oR1pGQKo4LTkmfGbWeddebQyyta`
- Last deployed slot: `445674477`
- Explorer: `https://solscan.io/account/GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM?cluster=devnet`
