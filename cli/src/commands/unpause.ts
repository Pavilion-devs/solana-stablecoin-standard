import { Command } from 'commander';
import { loadStablecoinContext } from '../utils/stablecoin';

export const unpauseCommand = new Command('unpause')
  .description('Unpause the token')
  .option('-k, --keypair <path>', 'Path to pauser keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (options) => {
    try {
      const { stablecoin, wallet } = await loadStablecoinContext(options.rpc, options.keypair);
      const signature = await stablecoin.unpause(wallet);

      console.log('Token unpaused');
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
