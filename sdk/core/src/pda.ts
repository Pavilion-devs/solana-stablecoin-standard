import { PublicKey } from '@solana/web3.js';
import {
  CONFIG_SEED,
  MINT_SEED,
  MINTER_SEED,
  ROLE_SEED,
  BLACKLIST_SEED,
  STABLECOIN_SEED_LEN,
} from './constants';

export type StablecoinSeedInput = Uint8Array | number[] | string;

export function deriveConfigPda(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

export function normalizeStablecoinSeed(seed: StablecoinSeedInput): Buffer {
  const bytes =
    typeof seed === 'string'
      ? Buffer.from(seed, 'utf8')
      : Buffer.from(seed);

  if (bytes.length > STABLECOIN_SEED_LEN) {
    throw new Error(`stablecoin seed must be at most ${STABLECOIN_SEED_LEN} bytes`);
  }

  if (bytes.length === STABLECOIN_SEED_LEN) {
    return Buffer.from(bytes);
  }

  const normalized = Buffer.alloc(STABLECOIN_SEED_LEN);
  bytes.copy(normalized);
  return normalized;
}

export function deriveConfigPdaV2(
  programId: PublicKey,
  stablecoinSeed: StablecoinSeedInput
): [PublicKey, number] {
  const normalizedSeed = normalizeStablecoinSeed(stablecoinSeed);
  return PublicKey.findProgramAddressSync([CONFIG_SEED, normalizedSeed], programId);
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
