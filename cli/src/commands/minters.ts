import { BN } from '@coral-xyz/anchor';
import { Command } from 'commander';
import { PublicKey } from '@solana/web3.js';
import { loadStablecoinContext } from '../utils/stablecoin';
import { pickStablecoinTargetOptions } from '../utils/target';

export const mintersCommand = new Command('minters').description('Manage minters');

mintersCommand
  .command('list')
  .description('List all minters for the configured stablecoin')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .option('--config <pubkey>', 'Explicit stablecoin config PDA to target')
  .option('--stablecoin-seed <seed>', 'Stablecoin seed for V2 targeting (plain text, max 32 bytes)')
  .option('--program-id <programId>', 'SSS program ID override')
  .action(async (options) => {
    try {
      const { program, stablecoin } = await loadStablecoinContext(
        options.rpc,
        undefined,
        pickStablecoinTargetOptions(options)
      );
      const accountNs = program.account as Record<string, { all: () => Promise<any[]> }>;
      const allMinterInfos = await accountNs['minterInfo'].all();
      const configKey = stablecoin.getConfigPda().toBase58();

      const filtered = allMinterInfos.filter(
        (entry) => entry.account.config.toBase58() === configKey
      );

      if (filtered.length === 0) {
        console.log('No minters configured.');
        return;
      }

      console.log('Configured minters:');
      for (const entry of filtered) {
        console.log(
          `- ${entry.account.minter.toBase58()} | quota=${entry.account.quota.toString()} | minted=${entry.account.minted.toString()}`
        );
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

mintersCommand
  .command('add')
  .description('Add a minter with quota')
  .argument('<address>', 'Minter public key')
  .argument('<quota>', 'Minter quota (0 = unlimited)')
  .option('-k, --keypair <path>', 'Path to authority keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .option('--config <pubkey>', 'Explicit stablecoin config PDA to target')
  .option('--stablecoin-seed <seed>', 'Stablecoin seed for V2 targeting (plain text, max 32 bytes)')
  .option('--program-id <programId>', 'SSS program ID override')
  .action(async (address: string, quota: string, options) => {
    try {
      const minter = new PublicKey(address);
      const quotaBn = new BN(quota);
      const { stablecoin, wallet } = await loadStablecoinContext(
        options.rpc,
        options.keypair,
        pickStablecoinTargetOptions(options)
      );

      const signature = await stablecoin.addMinter(minter, quotaBn, wallet);
      console.log(`Added minter ${minter.toBase58()} with quota ${quotaBn.toString()}`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

mintersCommand
  .command('remove')
  .description('Remove a minter')
  .argument('<address>', 'Minter public key')
  .option('-k, --keypair <path>', 'Path to authority keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .option('--config <pubkey>', 'Explicit stablecoin config PDA to target')
  .option('--stablecoin-seed <seed>', 'Stablecoin seed for V2 targeting (plain text, max 32 bytes)')
  .option('--program-id <programId>', 'SSS program ID override')
  .action(async (address: string, options) => {
    try {
      const minter = new PublicKey(address);
      const { stablecoin, wallet } = await loadStablecoinContext(
        options.rpc,
        options.keypair,
        pickStablecoinTargetOptions(options)
      );

      const signature = await stablecoin.removeMinter(minter, wallet);
      console.log(`Removed minter ${minter.toBase58()}`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
