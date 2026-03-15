import { Command } from 'commander';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { loadStablecoinContext } from '../utils/stablecoin';
import { addStablecoinTargetOptions, pickStablecoinTargetOptions } from '../utils/target';

export const seizeCommand = addStablecoinTargetOptions(new Command('seize')
  .description('Seize tokens from an account (SSS-2)')
  .argument('<address>', 'Source token account address to seize from')
  .argument('<amount>', 'Amount to seize')
  .requiredOption('--to <treasury>', 'Destination token account address')
  .option('-k, --keypair <path>', 'Path to seizer keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL'))
  .action(async (address: string, amount: string, options) => {
    try {
      const amountBn = new BN(amount);
      const fromAccount = new PublicKey(address);
      const toAccount = new PublicKey(options.to);

      const { stablecoin, wallet } = await loadStablecoinContext(
        options.rpc,
        options.keypair,
        pickStablecoinTargetOptions(options)
      );
      const signature = await stablecoin.compliance.seize(
        fromAccount,
        toAccount,
        amountBn,
        wallet
      );

      console.log(`Seized ${amount} tokens`);
      console.log(`From: ${fromAccount.toBase58()}`);
      console.log(`To: ${toAccount.toBase58()}`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
