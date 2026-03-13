import { Command } from 'commander';
import { getAccount, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { loadStablecoinContext } from '../utils/stablecoin';

interface HolderEntry {
  tokenAccount: string;
  owner: string;
  amount: bigint;
  frozen: boolean;
}

export const holdersCommand = new Command('holders')
  .description('List token holders for the configured stablecoin')
  .option('-l, --limit <count>', 'Maximum number of holders to display', '20')
  .option('-m, --min-balance <amount>', 'Only show holders with at least this raw token balance', '1')
  .option('-r, --rpc <url>', 'RPC endpoint URL')
  .action(async (options) => {
    try {
      const limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error(`Invalid limit: ${options.limit}`);
      }
      const minBalance = BigInt(options.minBalance);
      if (minBalance < 0n) {
        throw new Error(`Invalid min balance: ${options.minBalance}`);
      }

      const { stablecoin, connection } = await loadStablecoinContext(options.rpc);
      const mint = stablecoin.getMintPda();
      const tokenAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
        commitment: 'confirmed',
        filters: [{ memcmp: { offset: 0, bytes: mint.toBase58() } }],
      });
      const holders = await Promise.all(
        tokenAccounts.map(async ({ pubkey }) => {
          const account = await getAccount(
            connection,
            pubkey,
            'confirmed',
            TOKEN_2022_PROGRAM_ID
          );
          return {
            tokenAccount: pubkey.toBase58(),
            owner: account.owner.toBase58(),
            amount: account.amount,
            frozen: account.isFrozen,
          } satisfies HolderEntry;
        })
      );

      const activeHolders = holders
        .filter((holder: HolderEntry) => holder.amount >= minBalance)
        .sort((left: HolderEntry, right: HolderEntry) => {
          if (left.amount === right.amount) {
            return left.owner.localeCompare(right.owner);
          }
          return left.amount > right.amount ? -1 : 1;
        })
        .slice(0, limit);

      console.log(`Mint: ${mint.toBase58()}`);
      console.log(`Token accounts: ${tokenAccounts.length}`);
      console.log(`Matching holders: ${activeHolders.length}`);
      console.log(`Min balance: ${minBalance.toString()}`);

      if (activeHolders.length === 0) {
        console.log('No holders matched the current filter.');
        return;
      }

      console.log('Holders:');
      activeHolders.forEach((holder: HolderEntry, index: number) => {
        const frozenSuffix = holder.frozen ? ' | frozen=true' : '';
        console.log(
          `${index + 1}. owner=${holder.owner} | amount=${holder.amount.toString()} | tokenAccount=${holder.tokenAccount}${frozenSuffix}`
        );
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
