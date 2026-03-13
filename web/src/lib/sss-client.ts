'use client';

import { AnchorProvider, Program, type Idl } from '@coral-xyz/anchor';
import { useAnchorWallet, useConnection } from '@solana/wallet-adapter-react';
import { PublicKey } from '@solana/web3.js';
import { useMemo } from 'react';
import sssTokenIdl from '@/lib/idl/sss_token.json';

export const DEFAULT_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com';
export const DEFAULT_PROGRAM_ID_STRING =
  process.env.NEXT_PUBLIC_SSS_PROGRAM_ID || 'GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM';
export const DEFAULT_TRANSFER_HOOK_PROGRAM_ID_STRING =
  process.env.NEXT_PUBLIC_TRANSFER_HOOK_PROGRAM_ID ||
  'HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU';

const idl = {
  ...sssTokenIdl,
  address: DEFAULT_PROGRAM_ID_STRING,
} as Idl & { address: string };

export function useStablecoinProgram() {
  const anchorWallet = useAnchorWallet();
  const { connection } = useConnection();

  return useMemo(() => {
    if (!anchorWallet) {
      return null;
    }

    const provider = new AnchorProvider(connection, anchorWallet, {
      commitment: 'confirmed',
      preflightCommitment: 'confirmed',
    });

    return new Program(idl, provider);
  }, [anchorWallet, connection]);
}

export function shortKey(value: string | null | undefined) {
  if (!value) return '--';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

export function formatUnits(value: bigint, decimals: number) {
  if (decimals <= 0) return value.toString();
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const padded = absolute.toString().padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals) || '0';
  const fraction = padded.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

export function parseUiAmount(raw: string, decimals: number) {
  const value = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(value)) {
    throw new Error('Amount must be a positive number');
  }

  const [whole, fraction = ''] = value.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places`);
  }

  const normalized = `${whole}${fraction.padEnd(decimals, '0')}`.replace(/^0+(?=\d)/, '');
  return BigInt(normalized || '0');
}

export function parsePublicKey(raw: string, label: string) {
  try {
    return new PublicKey(raw.trim());
  } catch {
    throw new Error(`${label} is not a valid Solana address`);
  }
}
