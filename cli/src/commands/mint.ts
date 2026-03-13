import { Command } from 'commander';
import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import { loadStablecoinContext } from '../utils/stablecoin';

export const mintCommand = new Command('mint')
  .description('Mint tokens to a recipient')
  .argument('<recipient>', 'Recipient address')
  .argument('<amount>', 'Amount to mint')
  .option('-k, --keypair <path>', 'Path to minter keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (recipient: string, amount: string, options) => {
    try {
      const recipientKey = new PublicKey(recipient);
      const amountBn = new BN(amount);

      const { stablecoin, wallet } = await loadStablecoinContext(options.rpc, options.keypair);
      const signature = await stablecoin.mint(
        { recipient: recipientKey, amount: amountBn },
        wallet
      );

      console.log(`Minted ${amount} tokens to ${recipientKey.toBase58()}`);
      console.log(`Signature: ${signature}`);
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
