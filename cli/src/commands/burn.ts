import { Command } from 'commander';
import { BN } from '@coral-xyz/anchor';
import { loadStablecoinContext } from '../utils/stablecoin';

export const burnCommand = new Command('burn')
  .description('Burn tokens')
  .argument('<amount>', 'Amount to burn')
  .option('-k, --keypair <path>', 'Path to burner keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (amount: string, options) => {
    try {
      const amountBn = new BN(amount);
      const { stablecoin, wallet } = await loadStablecoinContext(options.rpc, options.keypair);
      const signature = await stablecoin.burn({ amount: amountBn }, wallet);

      console.log(`Burned ${amount} tokens`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
