import * as anchor from '@coral-xyz/anchor';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import { SolanaStablecoin } from '@stbr/sss-token';

import { type Config, loadConfig } from './config';
import { getConnection, getWallet } from './rpc';
import { type StablecoinTargetOptions } from './target';

const DEFAULT_PROGRAM_ID = 'CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe';
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
  keypairPath?: string,
  target?: StablecoinTargetOptions
): Promise<ProgramContext & { stablecoin: SolanaStablecoin }> {
  const saved = loadConfig();
  const { programId, loadOptions } = resolveStablecoinTarget(saved, target);

  const ctx = createProgramContext(rpcUrl, keypairPath, programId);

  try {
    const stablecoin = loadOptions
      ? await SolanaStablecoin.loadWithOptions(ctx.program, loadOptions)
      : await SolanaStablecoin.load(ctx.program);

    return { ...ctx, stablecoin };
  } catch (err) {
    if (!saved && !loadOptions) {
      throw new Error(
        "Stablecoin config not found. Run 'sss-token init' first or pass --config / --stablecoin-seed."
      );
    }
    throw err;
  }
}

function resolveStablecoinTarget(
  saved: Config | null,
  target?: StablecoinTargetOptions
): {
  programId?: string;
  loadOptions?: Parameters<typeof SolanaStablecoin.loadWithOptions>[1];
} {
  if (target?.config && target?.stablecoinSeed) {
    throw new Error('pass either --config or --stablecoin-seed, not both');
  }

  const programId = target?.programId ?? saved?.programId;
  if (target?.config) {
    return {
      programId,
      loadOptions: { config: new PublicKey(target.config) },
    };
  }

  if (target?.stablecoinSeed) {
    return {
      programId,
      loadOptions: { stablecoinSeed: target.stablecoinSeed },
    };
  }

  if (saved?.configPda) {
    return {
      programId,
      loadOptions: { config: new PublicKey(saved.configPda) },
    };
  }

  if (saved?.stablecoinSeed) {
    return {
      programId,
      loadOptions: { stablecoinSeed: saved.stablecoinSeed },
    };
  }

  return { programId };
}
