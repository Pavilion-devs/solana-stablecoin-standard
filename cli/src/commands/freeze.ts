import { Command } from 'commander';
import { PublicKey } from '@solana/web3.js';
import { loadStablecoinContext } from '../utils/stablecoin';

export const freezeCommand = new Command('freeze')
  .description('Freeze or thaw a token account')
  .argument('<address>', 'Address to freeze/thaw')
  .option('--thaw', 'Thaw the account instead of freezing')
  .option('-k, --keypair <path>', 'Path to freezer keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (address: string, options) => {
    try {
      const owner = new PublicKey(address);
      const { stablecoin, wallet } = await loadStablecoinContext(options.rpc, options.keypair);

      if (options.thaw) {
        const signature = await stablecoin.thawAccount(owner, wallet);
        console.log(`Thawed account owner: ${owner.toBase58()}`);
        console.log(`Signature: ${signature}`);
      } else {
        const signature = await stablecoin.freezeAccount(owner, wallet);
        console.log(`Froze account owner: ${owner.toBase58()}`);
        console.log(`Signature: ${signature}`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
