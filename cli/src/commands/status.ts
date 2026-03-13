import { Command } from 'commander';
import { loadStablecoinContext } from '../utils/stablecoin';

export const statusCommand = new Command('status')
  .description('Show stablecoin status and configuration')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (options) => {
    try {
      const { stablecoin } = await loadStablecoinContext(options.rpc);
      const state = await stablecoin.getState();
      const totalSupply = await stablecoin.getTotalSupply();

      console.log('Stablecoin Status:');
      console.log(`  Name: ${state.name}`);
      console.log(`  Symbol: ${state.symbol}`);
      console.log(`  Paused: ${state.paused}`);
      console.log(`  Decimals: ${state.decimals}`);
      console.log(`  Total Supply: ${totalSupply.toString()}`);
      console.log(`  Config: ${stablecoin.getConfigPda().toBase58()}`);
      console.log(`  Mint: ${stablecoin.getMintPda().toBase58()}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

export const supplyCommand = new Command('supply')
  .description('Show total token supply')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (options) => {
    try {
      const { stablecoin } = await loadStablecoinContext(options.rpc);
      const totalSupply = await stablecoin.getTotalSupply();
      console.log(`Total Supply: ${totalSupply.toString()}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
