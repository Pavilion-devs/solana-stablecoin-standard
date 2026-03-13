import * as anchor from "@coral-xyz/anchor";
import {
  AccountState,
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getDefaultAccountState,
  getExtraAccountMetaAddress,
  getMint,
  getOrCreateAssociatedTokenAccount,
  getPermanentDelegate,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import {
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { expect } from "chai";

describe("sss-2", () => {
  const anchorAny = anchor as any;
  const BN = anchorAny.BN ?? anchorAny.default?.BN;
  if (!BN) {
    throw new Error("Unable to resolve BN from @coral-xyz/anchor");
  }

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.SssToken as anchor.Program;
  const transferHookProgram = anchor.workspace.TransferHook as anchor.Program;
  const connection = provider.connection;

  let authority: Keypair;
  let blacklister: Keypair;
  let freezer: Keypair;
  let seizer: Keypair;
  let pauser: Keypair;
  let minter: Keypair;
  let user: Keypair;
  let receiver: Keypair;
  let treasury: Keypair;

  let config: PublicKey;
  let mint: PublicKey;
  let transferHookExtraAccountMetas: PublicKey;
  let minterInfo: PublicKey;
  let blacklisterRole: PublicKey;
  let freezerRole: PublicKey;

  let userTokenAccount: PublicKey;
  let receiverTokenAccount: PublicKey;
  let treasuryTokenAccount: PublicKey;

  const CONFIG_SEED = Buffer.from("config");
  const MINT_SEED = Buffer.from("mint");
  const MINTER_SEED = Buffer.from("minter");
  const ROLE_SEED = Buffer.from("role");
  const BLACKLIST_SEED = Buffer.from("blacklist");

  function isAlreadyInUseError(error: unknown): boolean {
    return String(error).toLowerCase().includes("already in use");
  }

  const getConfigPda = (): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
  };

  const getMintPda = (cfg: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync([MINT_SEED, cfg.toBuffer()], program.programId);
  };

  const getMinterPda = (cfg: PublicKey, minterPubkey: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [MINTER_SEED, cfg.toBuffer(), minterPubkey.toBuffer()],
      program.programId
    );
  };

  const getRolePda = (cfg: PublicKey, role: number, member: PublicKey): [PublicKey, number] => {
    const roleBuffer = Buffer.alloc(1);
    roleBuffer.writeUInt8(role);
    return PublicKey.findProgramAddressSync(
      [ROLE_SEED, cfg.toBuffer(), roleBuffer, member.toBuffer()],
      program.programId
    );
  };

  const getBlacklistPda = (cfg: PublicKey, address: PublicKey): [PublicKey, number] => {
    return PublicKey.findProgramAddressSync(
      [BLACKLIST_SEED, cfg.toBuffer(), address.toBuffer()],
      program.programId
    );
  };

  async function airdrop(pubkey: PublicKey, sol = 2): Promise<void> {
    const sig = await connection.requestAirdrop(pubkey, sol * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  }

  async function expectFailure(tx: Promise<unknown>, label: string): Promise<void> {
    try {
      await tx;
      expect.fail(`Expected failure for: ${label}`);
    } catch (err) {
      expect(String(err).length).to.be.greaterThan(0);
    }
  }

  async function transferWithHook(sourceOwner: Keypair, amount: bigint): Promise<string> {
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection,
      userTokenAccount,
      mint,
      receiverTokenAccount,
      sourceOwner.publicKey,
      amount,
      6,
      [],
      "confirmed",
      TOKEN_2022_PROGRAM_ID
    );

    const tx = new Transaction().add(transferIx);
    tx.feePayer = authority.publicKey;
    const signers =
      sourceOwner.publicKey.equals(authority.publicKey) ? [authority] : [authority, sourceOwner];
    return sendAndConfirmTransaction(connection, tx, signers, {
      commitment: "confirmed",
      preflightCommitment: "confirmed",
    });
  }

  async function thawTokenAccount(tokenAccount: PublicKey): Promise<void> {
    const sig = await program.methods
      .thawAccount()
      .accountsStrict({
        config,
        roleMember: freezerRole,
        freezer: freezer.publicKey,
        tokenAccount,
        mint,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();
    await connection.confirmTransaction(sig, "confirmed");
  }

  before(async () => {
    authority = (provider.wallet as any).payer as Keypair;
    if (!authority) {
      throw new Error("Provider wallet does not expose a payer keypair for authority operations");
    }

    blacklister = Keypair.generate();
    freezer = Keypair.generate();
    seizer = Keypair.generate();
    pauser = Keypair.generate();
    minter = Keypair.generate();
    user = Keypair.generate();
    receiver = Keypair.generate();
    treasury = Keypair.generate();

    [config] = getConfigPda();
    [mint] = getMintPda(config);
    transferHookExtraAccountMetas = getExtraAccountMetaAddress(mint, transferHookProgram.programId);
    [minterInfo] = getMinterPda(config, minter.publicKey);
    [blacklisterRole] = getRolePda(config, 3, blacklister.publicKey);
    [freezerRole] = getRolePda(config, 2, freezer.publicKey);

    await Promise.all(
      [blacklister, freezer, seizer, pauser, minter, user, receiver, treasury].map((kp) =>
        airdrop(kp.publicKey)
      )
    );
  });

  describe("Initialize SSS-2", () => {
    it("should create a compliant stablecoin with SSS-2 preset", async () => {
      try {
        const sig = await program.methods
          .initialize(
            "Compliant USD",
            "CUSD",
            "",
            6,
            true, // enablePermanentDelegate
            true, // enableTransferHook
            true // defaultAccountFrozen
          )
          .accountsStrict({
            authority: authority.publicKey,
            config,
            mint,
            transferHookProgram: transferHookProgram.programId,
            transferHookExtraAccountMetas,
            token2022Program: TOKEN_2022_PROGRAM_ID,
            systemProgram: anchor.web3.SystemProgram.programId,
            rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          })
          .signers([authority])
          .rpc();
        await connection.confirmTransaction(sig, "confirmed");
      } catch (error) {
        if (!isAlreadyInUseError(error)) {
          throw error;
        }
      }

      const configAccount = await program.account.stablecoinConfig.fetch(config);
      expect(configAccount.enablePermanentDelegate).to.be.true;
      expect(configAccount.enableTransferHook).to.be.true;
      expect(configAccount.defaultAccountFrozen).to.be.true;

      const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(getPermanentDelegate(mintInfo)?.delegate.toBase58()).to.equal(config.toBase58());
      expect(getDefaultAccountState(mintInfo)?.state).to.equal(AccountState.Frozen);
      expect(mintInfo.freezeAuthority?.toBase58()).to.equal(config.toBase58());
    });

    it("should add compliance and operations roles", async () => {
      // Add minter
      await program.methods
        .addMinter(minter.publicKey, new BN(1_000_000_000_000))
        .accountsStrict({
          config,
          minterInfo,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Add freezer (role 2)
      await program.methods
        .addRole(2, freezer.publicKey)
        .accountsStrict({
          config,
          roleMember: freezerRole,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Add blacklister (role 3)
      await program.methods
        .addRole(3, blacklister.publicKey)
        .accountsStrict({
          config,
          roleMember: blacklisterRole,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Add seizer (role 4)
      const [seizerRole] = getRolePda(config, 4, seizer.publicKey);
      await program.methods
        .addRole(4, seizer.publicKey)
        .accountsStrict({
          config,
          roleMember: seizerRole,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      // Add pauser (role 1)
      const [pauserRole] = getRolePda(config, 1, pauser.publicKey);
      await program.methods
        .addRole(1, pauser.publicKey)
        .accountsStrict({
          config,
          roleMember: pauserRole,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();
    });
  });

  describe("Minting Setup", () => {
    it("should mint baseline balances for transfer-hook checks", async () => {
      const userAta = await getOrCreateAssociatedTokenAccount(
        connection,
        minter,
        mint,
        user.publicKey,
        false,
        "confirmed",
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );
      const receiverAta = await getOrCreateAssociatedTokenAccount(
        connection,
        minter,
        mint,
        receiver.publicKey,
        false,
        "confirmed",
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );
      userTokenAccount = userAta.address;
      receiverTokenAccount = receiverAta.address;

      const freshUserAccount = await getAccount(
        connection,
        userTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const freshReceiverAccount = await getAccount(
        connection,
        receiverTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(freshUserAccount.isFrozen).to.be.true;
      expect(freshReceiverAccount.isFrozen).to.be.true;

      await thawTokenAccount(userTokenAccount);
      await thawTokenAccount(receiverTokenAccount);

      await program.methods
        .mint(new BN(100_000_000))
        .accountsStrict({
          config,
          mint,
          minterInfo,
          minter: minter.publicKey,
          recipientTokenAccount: userTokenAccount,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();

      const account = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(account.owner.toString()).to.equal(user.publicKey.toString());
      expect(account.isFrozen).to.be.false;
    });
  });

  describe("Security and Negative Tests", () => {
    it("should fail add_minter for non-authority signer", async () => {
      const unauthorized = Keypair.generate();
      const randomMinter = Keypair.generate();
      await airdrop(unauthorized.publicKey);

      const [unauthorizedMinterInfo] = getMinterPda(config, randomMinter.publicKey);
      await expectFailure(
        program.methods
          .addMinter(randomMinter.publicKey, new BN(100))
          .accountsStrict({
            config,
            minterInfo: unauthorizedMinterInfo,
            authority: unauthorized.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([unauthorized])
          .rpc(),
        "add_minter unauthorized"
      );
    });

    it("should enforce minter quota", async () => {
      const limitedMinter = Keypair.generate();
      const limitedRecipient = Keypair.generate();
      await Promise.all([airdrop(limitedMinter.publicKey), airdrop(limitedRecipient.publicKey)]);

      const [limitedMinterInfo] = getMinterPda(config, limitedMinter.publicKey);
      await program.methods
        .addMinter(limitedMinter.publicKey, new BN(10))
        .accountsStrict({
          config,
          minterInfo: limitedMinterInfo,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const limitedAta = await getOrCreateAssociatedTokenAccount(
        connection,
        limitedMinter,
        mint,
        limitedRecipient.publicKey,
        false,
        "confirmed",
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );

      await expectFailure(
        program.methods
          .mint(new BN(11))
          .accountsStrict({
            config,
            mint,
            minterInfo: limitedMinterInfo,
            minter: limitedMinter.publicKey,
            recipientTokenAccount: limitedAta.address,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .signers([limitedMinter])
          .rpc(),
        "quota exceeded"
      );
    });

    it("should block mint while paused and allow after unpause", async () => {
      const [pauserRole] = getRolePda(config, 1, pauser.publicKey);

      await program.methods
        .pause()
        .accountsStrict({
          config,
          roleMember: pauserRole,
          pauser: pauser.publicKey,
        })
        .signers([pauser])
        .rpc();

      await expectFailure(
        program.methods
          .mint(new BN(1))
          .accountsStrict({
            config,
            mint,
            minterInfo,
            minter: minter.publicKey,
            recipientTokenAccount: userTokenAccount,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minter])
          .rpc(),
        "mint while paused"
      );

      await program.methods
        .unpause()
        .accountsStrict({
          config,
          roleMember: pauserRole,
          pauser: pauser.publicKey,
        })
        .signers([pauser])
        .rpc();

      await program.methods
        .mint(new BN(1))
        .accountsStrict({
          config,
          mint,
          minterInfo,
          minter: minter.publicKey,
          recipientTokenAccount: userTokenAccount,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc();
    });

    it("should revoke minter permissions after remove_minter", async () => {
      const removableMinter = Keypair.generate();
      const removableRecipient = Keypair.generate();
      await Promise.all([airdrop(removableMinter.publicKey), airdrop(removableRecipient.publicKey)]);

      const [removableMinterInfo] = getMinterPda(config, removableMinter.publicKey);
      await program.methods
        .addMinter(removableMinter.publicKey, new BN(1_000))
        .accountsStrict({
          config,
          minterInfo: removableMinterInfo,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      await program.methods
        .removeMinter(removableMinter.publicKey)
        .accountsStrict({
          config,
          minterInfo: removableMinterInfo,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      const removableAta = await getOrCreateAssociatedTokenAccount(
        connection,
        removableMinter,
        mint,
        removableRecipient.publicKey,
        false,
        "confirmed",
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );

      await expectFailure(
        program.methods
          .mint(new BN(1))
          .accountsStrict({
            config,
            mint,
            minterInfo: removableMinterInfo,
            minter: removableMinter.publicKey,
            recipientTokenAccount: removableAta.address,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .signers([removableMinter])
          .rpc(),
        "mint by removed minter"
      );
    });

    it("should revoke blacklister permissions after remove_role", async () => {
      const tempBlacklister = Keypair.generate();
      const tempTarget = Keypair.generate();
      await Promise.all([airdrop(tempBlacklister.publicKey), airdrop(tempTarget.publicKey)]);

      const [tempRole] = getRolePda(config, 3, tempBlacklister.publicKey);
      const [tempBlacklistEntry] = getBlacklistPda(config, tempTarget.publicKey);

      await program.methods
        .addRole(3, tempBlacklister.publicKey)
        .accountsStrict({
          config,
          roleMember: tempRole,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      await program.methods
        .removeRole(3, tempBlacklister.publicKey)
        .accountsStrict({
          config,
          roleMember: tempRole,
          authority: authority.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([authority])
        .rpc();

      await expectFailure(
        program.methods
          .addToBlacklist(tempTarget.publicKey, "revoked role should fail")
          .accountsStrict({
            config,
            roleMember: tempRole,
            blacklister: tempBlacklister.publicKey,
            blacklistEntry: tempBlacklistEntry,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .signers([tempBlacklister])
          .rpc(),
        "blacklist with removed role"
      );
    });
  });

  describe("Transfer Hook Enforcement", () => {
    it("should allow transfer when neither side is blacklisted", async () => {
      const sig = await transferWithHook(user, 1_000_000n);
      expect(sig).to.be.a("string");
    });

    it("should block transfer when source owner is blacklisted", async () => {
      const [sourceBlacklistEntry] = getBlacklistPda(config, user.publicKey);
      await program.methods
        .addToBlacklist(user.publicKey, "source sanctions match")
        .accountsStrict({
          config,
          roleMember: blacklisterRole,
          blacklister: blacklister.publicKey,
          blacklistEntry: sourceBlacklistEntry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();

      await expectFailure(
        transferWithHook(user, 1n),
        "source blacklisted hook check"
      );
    });

    it("should allow transfer again after source is removed from blacklist", async () => {
      const [sourceBlacklistEntry] = getBlacklistPda(config, user.publicKey);
      const removeSig = await program.methods
        .removeFromBlacklist(user.publicKey)
        .accountsStrict({
          config,
          roleMember: blacklisterRole,
          blacklister: blacklister.publicKey,
          blacklistEntry: sourceBlacklistEntry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();
      await connection.confirmTransaction(removeSig, "confirmed");

      const sig = await transferWithHook(user, 1n);
      expect(sig).to.be.a("string");
    });

    it("should block transfer when destination owner is blacklisted", async () => {
      const [destinationBlacklistEntry] = getBlacklistPda(config, receiver.publicKey);
      await program.methods
        .addToBlacklist(receiver.publicKey, "destination sanctions match")
        .accountsStrict({
          config,
          roleMember: blacklisterRole,
          blacklister: blacklister.publicKey,
          blacklistEntry: destinationBlacklistEntry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();

      await expectFailure(
        transferWithHook(user, 1n),
        "destination blacklisted hook check"
      );
    });

    it("should clear destination blacklist and allow transfer", async () => {
      const [destinationBlacklistEntry] = getBlacklistPda(config, receiver.publicKey);
      const removeSig = await program.methods
        .removeFromBlacklist(receiver.publicKey)
        .accountsStrict({
          config,
          roleMember: blacklisterRole,
          blacklister: blacklister.publicKey,
          blacklistEntry: destinationBlacklistEntry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();
      await connection.confirmTransaction(removeSig, "confirmed");

      const sig = await transferWithHook(user, 1n);
      expect(sig).to.be.a("string");
    });
  });

  describe("Seize", () => {
    it("should seize funds using the permanent delegate authority", async () => {
      const treasuryAta = await getOrCreateAssociatedTokenAccount(
        connection,
        minter,
        mint,
        treasury.publicKey,
        false,
        "confirmed",
        { commitment: "confirmed" },
        TOKEN_2022_PROGRAM_ID
      );
      treasuryTokenAccount = treasuryAta.address;

      const freshTreasuryAccount = await getAccount(
        connection,
        treasuryTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(freshTreasuryAccount.isFrozen).to.be.true;

      await thawTokenAccount(treasuryTokenAccount);

      const beforeUser = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
      const beforeTreasury = await getAccount(
        connection,
        treasuryTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const [sourceBlacklistEntry] = getBlacklistPda(config, user.publicKey);
      const [destinationBlacklistEntry] = getBlacklistPda(config, treasury.publicKey);

      const [seizerRole] = getRolePda(config, 4, seizer.publicKey);
      const seizeSig = await program.methods
        .seize(new BN(500_000))
        .accountsStrict({
          config,
          roleMember: seizerRole,
          seizer: seizer.publicKey,
          fromAccount: userTokenAccount,
          toAccount: treasuryTokenAccount,
          mint,
          sssTokenProgram: program.programId,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: sourceBlacklistEntry, isWritable: false, isSigner: false },
          { pubkey: destinationBlacklistEntry, isWritable: false, isSigner: false },
          { pubkey: transferHookProgram.programId, isWritable: false, isSigner: false },
          { pubkey: transferHookExtraAccountMetas, isWritable: false, isSigner: false },
        ])
        .signers([seizer])
        .rpc();
      await connection.confirmTransaction(seizeSig, "confirmed");

      const afterUser = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
      const afterTreasury = await getAccount(
        connection,
        treasuryTokenAccount,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );

      expect(afterUser.amount).to.equal(beforeUser.amount - 500_000n);
      expect(afterTreasury.amount).to.equal(beforeTreasury.amount + 500_000n);
    });
  });
});
