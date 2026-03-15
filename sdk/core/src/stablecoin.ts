import { BN, Program, AnchorProvider } from '@coral-xyz/anchor';
import {
  PublicKey,
  Keypair,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getExtraAccountMetaAddress,
  getAssociatedTokenAddressSync,
  getMint,
} from '@solana/spl-token';

import {
  deriveConfigPda,
  deriveConfigPdaV2,
  deriveMintPda,
  deriveMinterPda,
  deriveRolePda,
  normalizeStablecoinSeed,
  type StablecoinSeedInput,
} from './pda';
import { Preset, PRESET_CONFIGS, Role, CONFIG_VERSION_V1, CONFIG_VERSION_V2 } from './constants';
import { Compliance } from './compliance';

export interface StablecoinConfigState {
  authority: PublicKey;
  mint: PublicKey;
  name: string;
  symbol: string;
  uri: string;
  decimals: number;
  enablePermanentDelegate: boolean;
  enableTransferHook: boolean;
  defaultAccountFrozen: boolean;
  version: number;
  stablecoinSeed: number[];
  bump: number;
  mintBump: number;
  transferHookProgram: PublicKey | null;
  paused: boolean;
}

export interface CreateStablecoinParams {
  preset?: Preset;
  name: string;
  symbol: string;
  uri?: string;
  decimals?: number;
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  transferHookProgram?: PublicKey;
  defaultAccountFrozen?: boolean;
  stablecoinSeed?: StablecoinSeedInput;
}

export interface StablecoinLoadOptions {
  config?: PublicKey;
  stablecoinSeed?: StablecoinSeedInput;
}

export interface MintParams {
  recipient: PublicKey;
  amount: BN | number;
}

export interface BurnParams {
  amount: BN | number;
}

export class SolanaStablecoin {
  readonly program: Program;
  readonly provider: AnchorProvider;
  readonly config: PublicKey;
  readonly mintAddress: PublicKey;
  readonly decimals: number;
  
  readonly compliance: Compliance;

  private _state: StablecoinConfigState | null = null;

  private constructor(
    program: Program,
    provider: AnchorProvider,
    config: PublicKey,
    mintAddress: PublicKey,
    decimals: number
  ) {
    this.program = program;
    this.provider = provider;
    this.config = config;
    this.mintAddress = mintAddress;
    this.decimals = decimals;
    this.compliance = new Compliance(this);
  }

  static async load(program: Program): Promise<SolanaStablecoin> {
    return SolanaStablecoin.loadWithOptions(program);
  }

  static async loadWithOptions(
    program: Program,
    options?: StablecoinLoadOptions
  ): Promise<SolanaStablecoin> {
    const provider = program.provider as AnchorProvider;
    if (options?.config && options?.stablecoinSeed) {
      throw new Error('pass either config or stablecoinSeed, not both');
    }

    const config = options?.config
      ? options.config
      : options?.stablecoinSeed
        ? deriveConfigPdaV2(program.programId, options.stablecoinSeed)[0]
        : deriveConfigPda(program.programId)[0];

    const accountNs = program.account as Record<string, { fetch: (addr: PublicKey) => Promise<unknown> }>;
    const state = (await accountNs['stablecoinConfig'].fetch(config)) as StablecoinConfigState;

    return new SolanaStablecoin(program, provider, config, state.mint, state.decimals);
  }

  static async create(
    program: Program,
    params: CreateStablecoinParams,
    authority?: Keypair,
    options?: StablecoinLoadOptions
  ): Promise<SolanaStablecoin> {
    const provider = program.provider as AnchorProvider;
    if (options?.config) {
      throw new Error('config cannot be passed to create; use stablecoinSeed or load by config');
    }

    const stablecoinSeed = params.stablecoinSeed ?? options?.stablecoinSeed;
    const [config] = stablecoinSeed
      ? deriveConfigPdaV2(program.programId, stablecoinSeed)
      : deriveConfigPda(program.programId);
    const [mintAddress] = deriveMintPda(program.programId, config);

    const presetConfig =
      params.preset && params.preset !== Preset.CUSTOM
        ? PRESET_CONFIGS[params.preset]
        : undefined;

    const enablePermanentDelegate =
      params.enablePermanentDelegate ??
      presetConfig?.enablePermanentDelegate ??
      false;
    const enableTransferHook =
      params.enableTransferHook ?? presetConfig?.enableTransferHook ?? false;
    const defaultAccountFrozen =
      params.defaultAccountFrozen ?? presetConfig?.defaultAccountFrozen ?? false;
    const transferHookProgram = params.transferHookProgram ?? PublicKey.default;

    if (enableTransferHook && transferHookProgram.equals(PublicKey.default)) {
      throw new Error('transferHookProgram is required when enableTransferHook is true');
    }

    const transferHookExtraAccountMetas = getExtraAccountMetaAddress(
      mintAddress,
      transferHookProgram
    );

    const request = stablecoinSeed
      ? program.methods.initializeV2(
          params.name,
          params.symbol,
          params.uri || '',
          params.decimals || 6,
          enablePermanentDelegate,
          enableTransferHook,
          defaultAccountFrozen,
          Array.from(normalizeStablecoinSeed(stablecoinSeed))
        )
      : program.methods.initialize(
          params.name,
          params.symbol,
          params.uri || '',
          params.decimals || 6,
          enablePermanentDelegate,
          enableTransferHook,
          defaultAccountFrozen
        );

    await request
      .accountsStrict({
        authority: authority ? authority.publicKey : provider.wallet.publicKey,
        config,
        mint: mintAddress,
        transferHookProgram,
        transferHookExtraAccountMetas,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: SYSVAR_RENT_PUBKEY,
      })
      .signers(authority ? [authority] : [])
      .rpc();

    return SolanaStablecoin.loadWithOptions(program, { config });
  }

  async refresh(): Promise<StablecoinConfigState> {
    const accountNs = this.program.account as Record<string, { fetch: (addr: PublicKey) => Promise<unknown> }>;
    this._state = (await accountNs['stablecoinConfig'].fetch(this.config)) as StablecoinConfigState;
    return this._state;
  }

  async getState(): Promise<StablecoinConfigState> {
    if (!this._state) {
      await this.refresh();
    }
    return this._state!;
  }

  isLegacyConfig(): boolean {
    return (this._state?.version ?? CONFIG_VERSION_V1) === CONFIG_VERSION_V1;
  }

  isV2Config(): boolean {
    return (this._state?.version ?? CONFIG_VERSION_V1) === CONFIG_VERSION_V2;
  }

  async getTotalSupply(): Promise<bigint> {
    const mintInfo = await getMint(
      this.provider.connection,
      this.mintAddress,
      'confirmed',
      TOKEN_2022_PROGRAM_ID
    );
    return mintInfo.supply;
  }

  getTokenAccount(owner: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(
      this.mintAddress,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID
    );
  }

  private async ensureRecipientTokenAccount(recipient: PublicKey): Promise<PublicKey> {
    const recipientTokenAccount = this.getTokenAccount(recipient);
    const existing = await this.provider.connection.getAccountInfo(recipientTokenAccount, 'confirmed');

    if (!existing) {
      const createAtaIx = createAssociatedTokenAccountIdempotentInstruction(
        this.provider.wallet.publicKey,
        recipientTokenAccount,
        recipient,
        this.mintAddress,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID
      );
      const tx = new Transaction().add(createAtaIx);
      await this.provider.sendAndConfirm(tx, []);
    }

    return recipientTokenAccount;
  }

  async mint(params: MintParams, minter?: Keypair): Promise<string> {
    const amount = typeof params.amount === 'number' ? new BN(params.amount) : params.amount;
    const recipientTokenAccount = await this.ensureRecipientTokenAccount(params.recipient);
    const [minterInfo] = deriveMinterPda(
      this.program.programId,
      this.config,
      minter ? minter.publicKey : this.provider.wallet.publicKey
    );

    const tx = await this.program.methods
      .mint(amount)
      .accountsStrict({
        config: this.config,
        mint: this.mintAddress,
        minterInfo,
        minter: minter ? minter.publicKey : this.provider.wallet.publicKey,
        recipientTokenAccount,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers(minter ? [minter] : [])
      .rpc();

    return tx;
  }

  async burn(params: BurnParams, burner?: Keypair): Promise<string> {
    const amount = typeof params.amount === 'number' ? new BN(params.amount) : params.amount;
    const burnerKey = burner ? burner.publicKey : this.provider.wallet.publicKey;
    const tokenAccount = this.getTokenAccount(burnerKey);
    const [roleMember] = deriveRolePda(this.program.programId, this.config, Role.Burner, burnerKey);

    const tx = await this.program.methods
      .burn(amount)
      .accountsStrict({
        config: this.config,
        mint: this.mintAddress,
        roleMember,
        burner: burnerKey,
        tokenAccount,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers(burner ? [burner] : [])
      .rpc();

    return tx;
  }

  async freezeAccount(account: PublicKey, freezer?: Keypair): Promise<string> {
    const freezerKey = freezer ? freezer.publicKey : this.provider.wallet.publicKey;
    const tokenAccount = this.getTokenAccount(account);
    const [roleMember] = deriveRolePda(this.program.programId, this.config, Role.Freezer, freezerKey);

    return this.program.methods
      .freezeAccount()
      .accountsStrict({
        config: this.config,
        roleMember,
        freezer: freezerKey,
        tokenAccount,
        mint: this.mintAddress,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers(freezer ? [freezer] : [])
      .rpc();
  }

  async thawAccount(account: PublicKey, freezer?: Keypair): Promise<string> {
    const freezerKey = freezer ? freezer.publicKey : this.provider.wallet.publicKey;
    const tokenAccount = this.getTokenAccount(account);
    const [roleMember] = deriveRolePda(this.program.programId, this.config, Role.Freezer, freezerKey);

    return this.program.methods
      .thawAccount()
      .accountsStrict({
        config: this.config,
        roleMember,
        freezer: freezerKey,
        tokenAccount,
        mint: this.mintAddress,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers(freezer ? [freezer] : [])
      .rpc();
  }

  async pause(pauser?: Keypair): Promise<string> {
    const pauserKey = pauser ? pauser.publicKey : this.provider.wallet.publicKey;
    const [roleMember] = deriveRolePda(this.program.programId, this.config, Role.Pauser, pauserKey);

    return this.program.methods
      .pause()
      .accountsStrict({
        config: this.config,
        roleMember,
        pauser: pauserKey,
      })
      .signers(pauser ? [pauser] : [])
      .rpc();
  }

  async unpause(pauser?: Keypair): Promise<string> {
    const pauserKey = pauser ? pauser.publicKey : this.provider.wallet.publicKey;
    const [roleMember] = deriveRolePda(this.program.programId, this.config, Role.Pauser, pauserKey);

    return this.program.methods
      .unpause()
      .accountsStrict({
        config: this.config,
        roleMember,
        pauser: pauserKey,
      })
      .signers(pauser ? [pauser] : [])
      .rpc();
  }

  async isPaused(): Promise<boolean> {
    const state = await this.getState();
    return state.paused;
  }

  async addMinter(minter: PublicKey, quota: BN | number, authority?: Keypair): Promise<string> {
    const amount = typeof quota === 'number' ? new BN(quota) : quota;
    const [minterInfo] = deriveMinterPda(this.program.programId, this.config, minter);
    const authorityKey = authority ? authority.publicKey : this.provider.wallet.publicKey;

    return this.program.methods
      .addMinter(minter, amount)
      .accountsStrict({
        config: this.config,
        minterInfo,
        authority: authorityKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(authority ? [authority] : [])
      .rpc();
  }

  async removeMinter(minter: PublicKey, authority?: Keypair): Promise<string> {
    const [minterInfo] = deriveMinterPda(this.program.programId, this.config, minter);
    const authorityKey = authority ? authority.publicKey : this.provider.wallet.publicKey;

    return this.program.methods
      .removeMinter(minter)
      .accountsStrict({
        config: this.config,
        minterInfo,
        authority: authorityKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(authority ? [authority] : [])
      .rpc();
  }

  async updateMinterQuota(
    minter: PublicKey,
    newQuota: BN | number,
    authority?: Keypair
  ): Promise<string> {
    const quotaAmount = typeof newQuota === 'number' ? new BN(newQuota) : newQuota;
    const [minterInfo] = deriveMinterPda(this.program.programId, this.config, minter);
    const authorityKey = authority ? authority.publicKey : this.provider.wallet.publicKey;

    return this.program.methods
      .updateMinterQuota(minter, quotaAmount)
      .accountsStrict({
        config: this.config,
        minterInfo,
        authority: authorityKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(authority ? [authority] : [])
      .rpc();
  }

  async addRole(role: Role, member: PublicKey, authority?: Keypair): Promise<string> {
    const [roleMember] = deriveRolePda(this.program.programId, this.config, role, member);
    const authorityKey = authority ? authority.publicKey : this.provider.wallet.publicKey;

    return this.program.methods
      .addRole(role, member)
      .accountsStrict({
        config: this.config,
        roleMember,
        authority: authorityKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(authority ? [authority] : [])
      .rpc();
  }

  async removeRole(role: Role, member: PublicKey, authority?: Keypair): Promise<string> {
    const [roleMember] = deriveRolePda(this.program.programId, this.config, role, member);
    const authorityKey = authority ? authority.publicKey : this.provider.wallet.publicKey;

    return this.program.methods
      .removeRole(role, member)
      .accountsStrict({
        config: this.config,
        roleMember,
        authority: authorityKey,
        systemProgram: SystemProgram.programId,
      })
      .signers(authority ? [authority] : [])
      .rpc();
  }

  async transferAuthority(newAuthority: PublicKey, authority?: Keypair): Promise<string> {
    const authorityKey = authority ? authority.publicKey : this.provider.wallet.publicKey;

    return this.program.methods
      .transferAuthority(newAuthority)
      .accountsStrict({
        config: this.config,
        authority: authorityKey,
      })
      .signers(authority ? [authority] : [])
      .rpc();
  }

  getProgramId(): PublicKey {
    return this.program.programId;
  }

  getConfigPda(): PublicKey {
    return this.config;
  }

  getMintPda(): PublicKey {
    return this.mintAddress;
  }
}
