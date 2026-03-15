import { Command } from 'commander';
import { loadStablecoinContext } from '../utils/stablecoin';
import { addStablecoinTargetOptions, pickStablecoinTargetOptions } from '../utils/target';

interface SignatureSummary {
  signature: string;
  slot: number;
  blockTime: number | null;
}

export const auditLogCommand = addStablecoinTargetOptions(new Command('audit-log')
  .description('Show recent on-chain activity for the configured stablecoin')
  .option('-l, --limit <count>', 'Maximum number of entries to display', '20')
  .option('-a, --action <type>', 'Only show entries that include this instruction/action')
  .option('-r, --rpc <url>', 'RPC endpoint URL'))
  .action(async (options) => {
    try {
      const limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit <= 0) {
        throw new Error(`Invalid limit: ${options.limit}`);
      }
      const actionFilter =
        typeof options.action === 'string' && options.action.trim().length > 0
          ? normalizeInstructionLabel(options.action)
          : undefined;

      const { stablecoin, connection } = await loadStablecoinContext(
        options.rpc,
        undefined,
        pickStablecoinTargetOptions(options)
      );
      const fetchLimit = Math.max(limit * 2, 20);
      const [configSignatures, mintSignatures] = await Promise.all([
        connection.getSignaturesForAddress(stablecoin.getConfigPda(), { limit: fetchLimit }, 'confirmed'),
        connection.getSignaturesForAddress(stablecoin.getMintPda(), { limit: fetchLimit }, 'confirmed'),
      ]);

      const unique = new Map<string, SignatureSummary>();
      for (const entry of [...configSignatures, ...mintSignatures]) {
        if (!unique.has(entry.signature)) {
          unique.set(entry.signature, {
            signature: entry.signature,
            slot: entry.slot,
            blockTime: entry.blockTime ?? null,
          });
        }
      }

      const signatures = [...unique.values()]
        .sort((left, right) => {
          const leftTime = left.blockTime ?? 0;
          const rightTime = right.blockTime ?? 0;
          if (leftTime === rightTime) {
            return right.slot - left.slot;
          }
          return rightTime - leftTime;
        })
        .slice(0, limit);

      if (signatures.length === 0) {
        console.log('No recent activity found.');
        return;
      }

      const transactions = await Promise.all(
        signatures.map((entry) =>
          connection.getTransaction(entry.signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          })
        )
      );

      const activity = signatures
        .map((entry, index) => {
          const tx = transactions[index];
          const instructions = extractInstructionLabels(tx?.meta?.logMessages ?? []);
          return {
            signature: entry.signature,
            slot: entry.slot,
            blockTime: entry.blockTime,
            status: tx?.meta?.err ? 'ERR' : 'OK',
            instructions,
          };
        })
        .filter((entry) => {
          if (!actionFilter) {
            return true;
          }
          return entry.instructions.some(
            (instruction) => normalizeInstructionLabel(instruction) === actionFilter
          );
        });

      if (activity.length === 0) {
        console.log(
          actionFilter
            ? `No recent activity found for action: ${options.action}`
            : 'No recent activity found.'
        );
        return;
      }

      console.log('Recent activity:');
      activity.forEach((entry) => {
        const time = entry.blockTime
          ? new Date(entry.blockTime * 1000).toISOString()
          : 'unknown-time';
        const label =
          entry.instructions.length > 0 ? entry.instructions.join(' -> ') : 'Unknown';

        console.log(
          `${time} | ${entry.status} | slot=${entry.slot} | ${label} | ${entry.signature}`
        );
      });
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

function extractInstructionLabels(logMessages: string[]): string[] {
  const labels = new Set<string>();

  for (const log of logMessages) {
    const marker = 'Program log: Instruction: ';
    const index = log.indexOf(marker);
    if (index >= 0) {
      labels.add(log.slice(index + marker.length).trim());
    }
  }

  return [...labels];
}

function normalizeInstructionLabel(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}
