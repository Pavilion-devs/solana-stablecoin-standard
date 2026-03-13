import { PublicKey } from '@solana/web3.js';
import {
  CONFIG_SEED,
  MINT_SEED,
  MINTER_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
} from './constants';

export function deriveConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

export function deriveMintPda(
  programId: PublicKey,
  config: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINT_SEED, config.toBuffer()],
    programId
  );
}

export function deriveMinterPda(
  programId: PublicKey,
  config: PublicKey,
  minter: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [MINTER_SEED, config.toBuffer(), minter.toBuffer()],
    programId
  );
}

export function deriveRolePda(
  programId: PublicKey,
  config: PublicKey,
  role: number,
  member: PublicKey
): [PublicKey, number] {
  const roleBuffer = Buffer.alloc(1);
  roleBuffer.writeUInt8(role);
  return PublicKey.findProgramAddressSync(
    [ROLE_SEED, config.toBuffer(), roleBuffer, member.toBuffer()],
    programId
  );
}

export function deriveBlacklistPda(
  programId: PublicKey,
  config: PublicKey,
  address: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [BLACKLIST_SEED, config.toBuffer(), address.toBuffer()],
    programId
  );
}
