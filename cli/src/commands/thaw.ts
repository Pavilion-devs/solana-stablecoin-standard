import { Command } from 'commander';
import { PublicKey } from '@solana/web3.js';
import { loadStablecoinContext } from '../utils/stablecoin';

export const thawCommand = new Command('thaw')
  .description('Thaw a token account')
  .argument('<address>', 'Address to thaw')
  .option('-k, --keypair <path>', 'Path to freezer keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (address: string, options) => {
    try {
      const owner = new PublicKey(address);
      const { stablecoin, wallet } = await loadStablecoinContext(options.rpc, options.keypair);
      const signature = await stablecoin.thawAccount(owner, wallet);

      console.log(`Thawed account owner: ${owner.toBase58()}`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
