import { Command } from 'commander';
import { PublicKey } from '@solana/web3.js';
import { loadStablecoinContext } from '../utils/stablecoin';

export const blacklistCommand = new Command('blacklist').description(
  'Manage blacklist (SSS-2)'
);

blacklistCommand
  .command('add')
  .description('Add address to blacklist')
  .argument('<address>', 'Address to blacklist')
  .requiredOption('--reason <reason>', 'Reason for blacklisting')
  .option('-k, --keypair <path>', 'Path to blacklister keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (address: string, options) => {
    try {
      const target = new PublicKey(address);
      const { stablecoin, wallet } = await loadStablecoinContext(options.rpc, options.keypair);
      const signature = await stablecoin.compliance.addToBlacklist(
        target,
        options.reason,
        wallet
      );

      console.log(`Blacklisted ${target.toBase58()}`);
      console.log(`Reason: ${options.reason}`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

blacklistCommand
  .command('remove')
  .description('Remove address from blacklist')
  .argument('<address>', 'Address to remove')
  .option('-k, --keypair <path>', 'Path to blacklister keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (address: string, options) => {
    try {
      const target = new PublicKey(address);
      const { stablecoin, wallet } = await loadStablecoinContext(options.rpc, options.keypair);
      const signature = await stablecoin.compliance.removeFromBlacklist(target, wallet);

      console.log(`Removed ${target.toBase58()} from blacklist`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
