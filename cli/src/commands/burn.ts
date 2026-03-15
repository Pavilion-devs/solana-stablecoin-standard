import { Command } from 'commander';
import { BN } from '@coral-xyz/anchor';
import { loadStablecoinContext } from '../utils/stablecoin';
import { addStablecoinTargetOptions, pickStablecoinTargetOptions } from '../utils/target';

export const burnCommand = addStablecoinTargetOptions(new Command('burn')
  .description('Burn tokens')
  .argument('<amount>', 'Amount to burn')
  .option('-k, --keypair <path>', 'Path to burner keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL'))
  .action(async (amount: string, options) => {
    try {
      const amountBn = new BN(amount);
      const { stablecoin, wallet } = await loadStablecoinContext(
        options.rpc,
        options.keypair,
        pickStablecoinTargetOptions(options)
      );
      const signature = await stablecoin.burn({ amount: amountBn }, wallet);

      console.log(`Burned ${amount} tokens`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
