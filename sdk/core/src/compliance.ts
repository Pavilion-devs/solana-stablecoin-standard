import { BN } from '@coral-xyz/anchor';
import { PublicKey, Keypair, SystemProgram } from '@solana/web3.js';
import {
  getAccount,
  getExtraAccountMetaAddress,
  TOKEN_2022_PROGRAM_ID,
} from '@solana/spl-token';
import { SolanaStablecoin } from './stablecoin';
import { deriveBlacklistPda, deriveRolePda } from './pda';
import { Role } from './constants';

export class Compliance {
  private stablecoin: SolanaStablecoin;

  constructor(stablecoin: SolanaStablecoin) {
    this.stablecoin = stablecoin;
  }

  async addToBlacklist(
    address: PublicKey,
    reason: string,
    blacklister?: Keypair
  ): Promise<string> {
    const [blacklistEntry] = deriveBlacklistPda(
      this.stablecoin.getProgramId(),
      this.stablecoin.getConfigPda(),
      address
    );
    const [roleMember] = deriveRolePda(
      this.stablecoin.getProgramId(),
      this.stablecoin.getConfigPda(),
      Role.Blacklister,
      blacklister ? blacklister.publicKey : this.stablecoin.provider.wallet.publicKey
    );

    return this.stablecoin.program.methods
      .addToBlacklist(address, reason)
      .accountsStrict({
        config: this.stablecoin.getConfigPda(),
        roleMember,
        blacklister: blacklister ? blacklister.publicKey : this.stablecoin.provider.wallet.publicKey,
        blacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .signers(blacklister ? [blacklister] : [])
      .rpc();
  }

  async blacklistAdd(
    address: PublicKey,
    reason: string,
    blacklister?: Keypair
  ): Promise<string> {
    return this.addToBlacklist(address, reason, blacklister);
  }

  async removeFromBlacklist(
    address: PublicKey,
    blacklister?: Keypair
  ): Promise<string> {
    const [blacklistEntry] = deriveBlacklistPda(
      this.stablecoin.getProgramId(),
      this.stablecoin.getConfigPda(),
      address
    );
    const [roleMember] = deriveRolePda(
      this.stablecoin.getProgramId(),
      this.stablecoin.getConfigPda(),
      Role.Blacklister,
      blacklister ? blacklister.publicKey : this.stablecoin.provider.wallet.publicKey
    );

    return this.stablecoin.program.methods
      .removeFromBlacklist(address)
      .accountsStrict({
        config: this.stablecoin.getConfigPda(),
        roleMember,
        blacklister: blacklister ? blacklister.publicKey : this.stablecoin.provider.wallet.publicKey,
        blacklistEntry,
        systemProgram: SystemProgram.programId,
      })
      .signers(blacklister ? [blacklister] : [])
      .rpc();
  }

  async blacklistRemove(
    address: PublicKey,
    blacklister?: Keypair
  ): Promise<string> {
    return this.removeFromBlacklist(address, blacklister);
  }

  async seize(
    fromAccount: PublicKey,
    toAccount: PublicKey,
    amount: BN | number,
    seizer?: Keypair
  ): Promise<string> {
    const amountBn = typeof amount === 'number' ? new BN(amount) : amount;
    const seizerKey = seizer ? seizer.publicKey : this.stablecoin.provider.wallet.publicKey;
    const [roleMember] = deriveRolePda(
      this.stablecoin.getProgramId(),
      this.stablecoin.getConfigPda(),
      Role.Seizer,
      seizerKey
    );
    const state = await this.stablecoin.getState();
    let request = this.stablecoin.program.methods
      .seize(amountBn)
      .accountsStrict({
        config: this.stablecoin.getConfigPda(),
        roleMember,
        seizer: seizerKey,
        fromAccount,
        toAccount,
        mint: this.stablecoin.getMintPda(),
        sssTokenProgram: this.stablecoin.getProgramId(),
        token2022Program: TOKEN_2022_PROGRAM_ID,
      });

    if (state.enableTransferHook) {
      const transferHookProgram = state.transferHookProgram;
      if (!transferHookProgram) {
        throw new Error('transferHookProgram is required when transfer hook is enabled');
      }

      const [sourceAccountInfo, destinationAccountInfo] = await Promise.all([
        getAccount(
          this.stablecoin.provider.connection,
          fromAccount,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        ),
        getAccount(
          this.stablecoin.provider.connection,
          toAccount,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        ),
      ]);
      const [sourceBlacklist] = deriveBlacklistPda(
        this.stablecoin.getProgramId(),
        this.stablecoin.getConfigPda(),
        sourceAccountInfo.owner
      );
      const [destinationBlacklist] = deriveBlacklistPda(
        this.stablecoin.getProgramId(),
        this.stablecoin.getConfigPda(),
        destinationAccountInfo.owner
      );
      const extraAccountMetaList = getExtraAccountMetaAddress(
        this.stablecoin.getMintPda(),
        transferHookProgram
      );

      request = request.remainingAccounts([
        { pubkey: sourceBlacklist, isWritable: false, isSigner: false },
        { pubkey: destinationBlacklist, isWritable: false, isSigner: false },
        { pubkey: transferHookProgram, isWritable: false, isSigner: false },
        { pubkey: extraAccountMetaList, isWritable: false, isSigner: false },
      ]);
    }

    return request
      .signers(seizer ? [seizer] : [])
      .rpc();
  }
}
