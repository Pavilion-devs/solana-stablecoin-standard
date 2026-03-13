# Devnet Deployment Proof

Deployment timestamp (UTC): `2026-03-13 22:16:09 UTC`

Deployer / upgrade authority:

- `AB5Wt29Vi8WVUUHuWWmFby6rLw9gEffzbVLmy7icMtYp`

Cluster / RPC used for deploy:

- `https://api.devnet.solana.com`

## Program IDs

- `sss_token`: `CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe`
- `transfer_hook`: `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU`

## Deployment Transactions

1. `transfer_hook` deploy signature:
- `ZovvzjMs87cBL1h6DfR2zhuUFGjZDqjC3UnEHN1UdGB4DbAY2AN6Uc8BDnWQNnJCdzNDrJRy4epgSqboUmNKovu`
- Explorer: `https://solscan.io/tx/ZovvzjMs87cBL1h6DfR2zhuUFGjZDqjC3UnEHN1UdGB4DbAY2AN6Uc8BDnWQNnJCdzNDrJRy4epgSqboUmNKovu?cluster=devnet`

2. `sss_token` deploy signature:
- `Md6gRNWwFA1z24oDcy3xVWy1HpAbqxSBBfN2pbT7vCUo2UxTzNMaXFP1TfWmv9ET5pVWhdimpPJ3pZZYgUBhJ89`
- Explorer: `https://solscan.io/tx/Md6gRNWwFA1z24oDcy3xVWy1HpAbqxSBBfN2pbT7vCUo2UxTzNMaXFP1TfWmv9ET5pVWhdimpPJ3pZZYgUBhJ89?cluster=devnet`

Finality checks:

- `solana confirm ZovvzjMs87cBL1h6DfR2zhuUFGjZDqjC3UnEHN1UdGB4DbAY2AN6Uc8BDnWQNnJCdzNDrJRy4epgSqboUmNKovu --url https://api.devnet.solana.com` -> `Finalized`
- `solana confirm Md6gRNWwFA1z24oDcy3xVWy1HpAbqxSBBfN2pbT7vCUo2UxTzNMaXFP1TfWmv9ET5pVWhdimpPJ3pZZYgUBhJ89 --url https://api.devnet.solana.com` -> `Finalized`

## On-Chain Program Verification

1. `transfer_hook`
- Program: `HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU`
- ProgramData: `FnPJ4uSo94rJLRTkncxw6Rjr2cGVHTG5MbBGZEGZv8D4`
- Last deployed slot: `445674320`
- Explorer: `https://solscan.io/account/HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU?cluster=devnet`

2. `sss_token`
- Program: `CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe`
- ProgramData: `A2jixfb4jKA4MCrKhHDkKvsMYy57qjhsi6tsup86cEFW`
- Last deployed slot: `448279409`
- Explorer: `https://solscan.io/account/CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe?cluster=devnet`
