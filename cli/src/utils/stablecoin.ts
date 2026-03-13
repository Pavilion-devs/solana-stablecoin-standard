import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { SolanaStablecoin } from '@stbr/sss-token';

import { loadConfig } from './config';
import { getConnection, getWallet } from './rpc';

const DEFAULT_PROGRAM_ID = 'GZpZyBHsMrLNmvc6W8ic9SEaZ21BeTfQhW7vKnQPmQiM';
const DEFAULT_IDL_PATH = path.resolve(process.cwd(), 'target', 'idl', 'sss_token.json');

export interface ProgramContext {
  program: anchor.Program;
  connection: anchor.web3.Connection;
  wallet: anchor.web3.Keypair;
  programId: PublicKey;
}

function buildWallet(keypair: anchor.web3.Keypair): anchor.Wallet {
  const signTx = <T extends Transaction | VersionedTransaction>(tx: T): T => {
    if (tx instanceof Transaction) {
      tx.partialSign(keypair);
    } else {
      tx.sign([keypair]);
    }
    return tx;
  };

  return {
    publicKey: keypair.publicKey,
    payer: keypair,
    signTransaction: async <T extends Transaction | VersionedTransaction>(tx: T) =>
      signTx(tx),
    signAllTransactions: async <T extends Transaction | VersionedTransaction>(txs: T[]) =>
      txs.map((tx) => signTx(tx)),
  };
}

function loadIdl(programId: PublicKey): anchor.Idl {
  if (!fs.existsSync(DEFAULT_IDL_PATH)) {
    throw new Error(`IDL not found at ${DEFAULT_IDL_PATH}. Run 'anchor build' first.`);
  }

  const idl = JSON.parse(fs.readFileSync(DEFAULT_IDL_PATH, 'utf8'));
  idl.address = programId.toBase58();
  return idl as anchor.Idl;
}

export function createProgramContext(
  rpcUrl?: string,
  keypairPath?: string,
  explicitProgramId?: string
): ProgramContext {
  const connection = getConnection(rpcUrl);
  const wallet = getWallet(keypairPath);
  const programId = new PublicKey(explicitProgramId ?? loadConfig()?.programId ?? DEFAULT_PROGRAM_ID);

  const provider = new anchor.AnchorProvider(connection, buildWallet(wallet), {
    commitment: 'confirmed',
  });
  anchor.setProvider(provider);

  const program = new anchor.Program(loadIdl(programId), provider);

  return { program, connection, wallet, programId };
}

export async function loadStablecoinContext(
  rpcUrl?: string,
  keypairPath?: string
): Promise<ProgramContext & { stablecoin: SolanaStablecoin }> {
  const saved = loadConfig();
  if (!saved) {
    throw new Error("Stablecoin config not found. Run 'sss-token init' first.");
  }

  const ctx = createProgramContext(rpcUrl, keypairPath, saved.programId);
  const stablecoin = await SolanaStablecoin.load(ctx.program);

  return { ...ctx, stablecoin };
}
