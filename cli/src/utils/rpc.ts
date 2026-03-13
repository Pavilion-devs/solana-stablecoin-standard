import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const DEFAULT_RPC = 'http://127.0.0.1:8899';

export function getConnection(rpcUrl?: string): Connection {
  const url = rpcUrl || process.env.SOLANA_RPC || DEFAULT_RPC;
  return new Connection(url, 'confirmed');
}

export function getWallet(keypairPath?: string): Keypair {
  const pathArg = keypairPath || process.env.SOLANA_KEYPAIR;
  
  if (!pathArg) {
    const defaultPath = path.join(os.homedir(), '.config', 'solana', 'id.json');
    if (fs.existsSync(defaultPath)) {
      return loadKeypair(defaultPath);
    }
    throw new Error('No keypair provided. Use -k option or set SOLANA_KEYPAIR env');
  }

  return loadKeypair(pathArg);
}

function loadKeypair(pathStr: string): Keypair {
  const expandedPath = pathStr.startsWith('~') 
    ? path.join(os.homedir(), pathStr.slice(1))
    : pathStr;
  
  const data = fs.readFileSync(expandedPath, 'utf-8');
  const secretKey = new Uint8Array(JSON.parse(data));
  return Keypair.fromSecretKey(secretKey);
}
