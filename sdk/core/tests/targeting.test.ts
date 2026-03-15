import { expect } from 'chai';
import { Keypair, PublicKey } from '@solana/web3.js';

import { CONFIG_VERSION_V1, CONFIG_VERSION_V2 } from '../src/constants';
import { deriveConfigPda, deriveConfigPdaV2, deriveMintPda, normalizeStablecoinSeed } from '../src/pda';
import { SolanaStablecoin, type StablecoinConfigState } from '../src/stablecoin';

function createState(
  programId: PublicKey,
  config: PublicKey,
  version: number,
  stablecoinSeed?: string,
): StablecoinConfigState {
  return {
    authority: Keypair.generate().publicKey,
    mint: deriveMintPda(programId, config)[0],
    name: version === CONFIG_VERSION_V2 ? 'V2 USD' : 'Legacy USD',
    symbol: version === CONFIG_VERSION_V2 ? 'V2USD' : 'LUSD',
    uri: '',
    decimals: 6,
    enablePermanentDelegate: version === CONFIG_VERSION_V2,
    enableTransferHook: false,
    defaultAccountFrozen: false,
    version,
    stablecoinSeed: Array.from(
      version === CONFIG_VERSION_V2
        ? normalizeStablecoinSeed(stablecoinSeed ?? 'v2-seed')
        : normalizeStablecoinSeed(''),
    ),
    bump: 255,
    mintBump: 255,
    transferHookProgram: null,
    paused: false,
  };
}

function createMockProgram(states: Map<string, StablecoinConfigState>) {
  const provider = {
    wallet: { publicKey: Keypair.generate().publicKey },
    connection: {},
  };
  const programId = Keypair.generate().publicKey;
  const fetches: string[] = [];

  const program = {
    programId,
    provider,
    account: {
      stablecoinConfig: {
        fetch: async (address: PublicKey) => {
          fetches.push(address.toBase58());
          const state = states.get(address.toBase58());
          if (!state) {
            throw new Error(`missing state for ${address.toBase58()}`);
          }
          return state;
        },
      },
    },
  };

  return { program: program as never, programId, fetches };
}

describe('SDK stablecoin targeting', () => {
  it('loads the legacy singleton config when no options are supplied', async () => {
    const programId = Keypair.generate().publicKey;
    const legacyConfig = deriveConfigPda(programId)[0];
    const states = new Map<string, StablecoinConfigState>([
      [legacyConfig.toBase58(), createState(programId, legacyConfig, CONFIG_VERSION_V1)],
    ]);

    const { program, fetches } = createMockProgram(states);
    (program as { programId: PublicKey }).programId = programId;

    const stablecoin = await SolanaStablecoin.load(program);
    const state = await stablecoin.getState();

    expect(fetches[0]).to.equal(legacyConfig.toBase58());
    expect(stablecoin.getConfigPda().toBase58()).to.equal(legacyConfig.toBase58());
    expect(stablecoin.getMintPda().toBase58()).to.equal(state.mint.toBase58());
    expect(stablecoin.isLegacyConfig()).to.equal(true);
  });

  it('loads a V2 config by stablecoin seed', async () => {
    const seed = 'issuer-a';
    const programId = Keypair.generate().publicKey;
    const config = deriveConfigPdaV2(programId, seed)[0];
    const states = new Map<string, StablecoinConfigState>([
      [config.toBase58(), createState(programId, config, CONFIG_VERSION_V2, seed)],
    ]);

    const { program, fetches } = createMockProgram(states);
    (program as { programId: PublicKey }).programId = programId;

    const stablecoin = await SolanaStablecoin.loadWithOptions(program, { stablecoinSeed: seed });
    const state = await stablecoin.getState();

    expect(fetches[0]).to.equal(config.toBase58());
    expect(stablecoin.getConfigPda().toBase58()).to.equal(config.toBase58());
    expect(stablecoin.getMintPda().toBase58()).to.equal(state.mint.toBase58());
    expect(stablecoin.isV2Config()).to.equal(true);
    expect(Buffer.from(state.stablecoinSeed).toString('utf8').replace(/\0+$/, '')).to.equal(seed);
  });

  it('loads an explicit config PDA directly', async () => {
    const seed = 'issuer-b';
    const programId = Keypair.generate().publicKey;
    const config = deriveConfigPdaV2(programId, seed)[0];
    const states = new Map<string, StablecoinConfigState>([
      [config.toBase58(), createState(programId, config, CONFIG_VERSION_V2, seed)],
    ]);

    const { program, fetches } = createMockProgram(states);
    (program as { programId: PublicKey }).programId = programId;

    const stablecoin = await SolanaStablecoin.loadWithOptions(program, { config });
    const state = await stablecoin.getState();

    expect(fetches[0]).to.equal(config.toBase58());
    expect(stablecoin.getConfigPda().toBase58()).to.equal(config.toBase58());
    expect(stablecoin.getMintPda().toBase58()).to.equal(state.mint.toBase58());
    expect(stablecoin.isV2Config()).to.equal(true);
  });
});
