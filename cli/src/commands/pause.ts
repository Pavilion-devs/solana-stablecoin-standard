import { Command } from 'commander';
import { loadStablecoinContext } from '../utils/stablecoin';

export const pauseCommand = new Command('pause')
  .description('Pause or unpause the token')
  .option('--unpause', 'Unpause the token')
  .option('-k, --keypair <path>', 'Path to pauser keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (options) => {
    try {
      const { stablecoin, wallet } = await loadStablecoinContext(options.rpc, options.keypair);

      if (options.unpause) {
        const signature = await stablecoin.unpause(wallet);
        console.log('Token unpaused');
        console.log(`Signature: ${signature}`);
      } else {
        const signature = await stablecoin.pause(wallet);
        console.log('Token paused');
        console.log(`Signature: ${signature}`);
      }
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
