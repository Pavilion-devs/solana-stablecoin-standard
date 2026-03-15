import * as anchor from "@coral-xyz/anchor";
import {
  createTransferCheckedWithTransferHookInstruction,
  getAccount,
  getMint,
  getOrCreateAssociatedTokenAccount,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { expect } from "chai";

describe("sss-v2 multi-config", () => {
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
  const authority = (provider.wallet as any).payer as Keypair;
  const CONFIG_SEED = Buffer.from("config");
  const MINT_SEED = Buffer.from("mint");
  const MINTER_SEED = Buffer.from("minter");
  const ROLE_SEED = Buffer.from("role");
  const BLACKLIST_SEED = Buffer.from("blacklist");

  const stablecoinSeedA = Keypair.generate().publicKey.toBuffer();
  const stablecoinSeedB = Keypair.generate().publicKey.toBuffer();

  const [configA] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED, stablecoinSeedA],
    program.programId
  );
  const [configB] = PublicKey.findProgramAddressSync(
    [CONFIG_SEED, stablecoinSeedB],
    program.programId
  );
  const [mintA] = PublicKey.findProgramAddressSync(
    [MINT_SEED, configA.toBuffer()],
    program.programId
  );
  const [mintB] = PublicKey.findProgramAddressSync(
    [MINT_SEED, configB.toBuffer()],
    program.programId
  );

  const minter = Keypair.generate();
  const holder = Keypair.generate();

  function deriveMinterPda(config: PublicKey, member: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [MINTER_SEED, config.toBuffer(), member.toBuffer()],
      program.programId
    )[0];
  }

  function deriveRolePda(config: PublicKey, role: number, member: PublicKey): PublicKey {
    const roleBuffer = Buffer.alloc(1);
    roleBuffer.writeUInt8(role);
    return PublicKey.findProgramAddressSync(
      [ROLE_SEED, config.toBuffer(), roleBuffer, member.toBuffer()],
      program.programId
    )[0];
  }

  function deriveBlacklistPda(config: PublicKey, address: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync(
      [BLACKLIST_SEED, config.toBuffer(), address.toBuffer()],
      program.programId
    )[0];
  }

  async function expectFailure(tx: Promise<unknown>, label: string): Promise<void> {
    try {
      await tx;
      expect.fail(`Expected failure for: ${label}`);
    } catch (err) {
      expect(String(err)).to.have.length.greaterThan(0);
    }
  }

  async function transferWithHook(
    sourceTokenAccount: PublicKey,
    mint: PublicKey,
    destinationTokenAccount: PublicKey,
    sourceOwner: Keypair,
    amount: bigint
  ): Promise<string> {
    const transferIx = await createTransferCheckedWithTransferHookInstruction(
      connection,
      sourceTokenAccount,
      mint,
      destinationTokenAccount,
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

  async function thawTokenAccount(
    config: PublicKey,
    mint: PublicKey,
    freezer: Keypair,
    tokenAccount: PublicKey
  ): Promise<void> {
    const roleMember = deriveRolePda(config, 2, freezer.publicKey);
    const sig = await program.methods
      .thawAccount()
      .accountsStrict({
        config,
        roleMember,
        freezer: freezer.publicKey,
        tokenAccount,
        mint,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();
    await connection.confirmTransaction(sig, "confirmed");
  }

  it("initializes two independent V2 configs under one program", async () => {
    const commonAccounts = {
      authority: authority.publicKey,
      token2022Program: TOKEN_2022_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
      rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    };

    const initializeSigA = await program.methods
      .initializeV2(
        "Alpha USD",
        "AUSD",
        "",
        6,
        false,
        false,
        false,
        Array.from(stablecoinSeedA)
      )
      .accountsStrict({
        ...commonAccounts,
        config: configA,
        mint: mintA,
        transferHookProgram: transferHookProgram.programId,
        transferHookExtraAccountMetas: PublicKey.findProgramAddressSync(
          [Buffer.from("extra-account-metas"), mintA.toBuffer()],
          transferHookProgram.programId
        )[0],
      })
      .rpc();
    await connection.confirmTransaction(initializeSigA, "confirmed");

    const initializeSigB = await program.methods
      .initializeV2(
        "Beta USD",
        "BUSD",
        "",
        6,
        false,
        false,
        false,
        Array.from(stablecoinSeedB)
      )
      .accountsStrict({
        ...commonAccounts,
        config: configB,
        mint: mintB,
        transferHookProgram: transferHookProgram.programId,
        transferHookExtraAccountMetas: PublicKey.findProgramAddressSync(
          [Buffer.from("extra-account-metas"), mintB.toBuffer()],
          transferHookProgram.programId
        )[0],
      })
      .rpc();
    await connection.confirmTransaction(initializeSigB, "confirmed");

    const stateA = await program.account.stablecoinConfig.fetch(configA);
    const stateB = await program.account.stablecoinConfig.fetch(configB);

    expect(stateA.mint.toBase58()).to.equal(mintA.toBase58());
    expect(stateB.mint.toBase58()).to.equal(mintB.toBase58());
    expect(stateA.version).to.equal(1);
    expect(stateB.version).to.equal(1);
    expect(Buffer.from(stateA.stablecoinSeed)).to.deep.equal(stablecoinSeedA);
    expect(Buffer.from(stateB.stablecoinSeed)).to.deep.equal(stablecoinSeedB);

    const mintInfoA = await getMint(connection, mintA, "confirmed", TOKEN_2022_PROGRAM_ID);
    const mintInfoB = await getMint(connection, mintB, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(mintInfoA.address.toBase58()).to.equal(mintA.toBase58());
    expect(mintInfoB.address.toBase58()).to.equal(mintB.toBase58());
  });

  it("isolates minter permissions by config", async () => {
    const minterInfoA = deriveMinterPda(configA, minter.publicKey);
    const minterInfoB = deriveMinterPda(configB, minter.publicKey);

    const addMinterSig = await program.methods
      .addMinter(minter.publicKey, new BN(1_000_000_000))
      .accountsStrict({
        config: configA,
        minterInfo: minterInfoA,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
    await connection.confirmTransaction(addMinterSig, "confirmed");

    const holderAtaA = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      mintA,
      holder.publicKey,
      false,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );
    const holderAtaB = await getOrCreateAssociatedTokenAccount(
      connection,
      authority,
      mintB,
      holder.publicKey,
      false,
      "confirmed",
      { commitment: "confirmed" },
      TOKEN_2022_PROGRAM_ID
    );

    const mintSig = await program.methods
      .mint(new BN(500_000))
      .accountsStrict({
        config: configA,
        mint: mintA,
        minterInfo: minterInfoA,
        minter: minter.publicKey,
        recipientTokenAccount: holderAtaA.address,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([minter])
      .rpc();
    await connection.confirmTransaction(mintSig, "confirmed");

    await expectFailure(
      program.methods
        .mint(new BN(500_000))
        .accountsStrict({
          config: configB,
          mint: mintB,
          minterInfo: minterInfoB,
          minter: minter.publicKey,
          recipientTokenAccount: holderAtaB.address,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minter])
        .rpc(),
      "mint on config B without config B minter authorization"
    );

    const accountA = await getAccount(connection, holderAtaA.address, "confirmed", TOKEN_2022_PROGRAM_ID);
    const accountB = await getAccount(connection, holderAtaB.address, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(accountA.amount).to.equal(500_000n);
    expect(accountB.amount).to.equal(0n);
  });

  describe("operational isolation for compliant V2 configs", () => {
    const stablecoinSeedC = Keypair.generate().publicKey.toBuffer();
    const stablecoinSeedD = Keypair.generate().publicKey.toBuffer();

    const [configC] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED, stablecoinSeedC],
      program.programId
    );
    const [configD] = PublicKey.findProgramAddressSync(
      [CONFIG_SEED, stablecoinSeedD],
      program.programId
    );
    const [mintC] = PublicKey.findProgramAddressSync(
      [MINT_SEED, configC.toBuffer()],
      program.programId
    );
    const [mintD] = PublicKey.findProgramAddressSync(
      [MINT_SEED, configD.toBuffer()],
      program.programId
    );

    const minterScoped = Keypair.generate();
    const pauserC = Keypair.generate();
    const freezerC = Keypair.generate();
    const freezerD = Keypair.generate();
    const blacklisterC = Keypair.generate();
    const seizerC = Keypair.generate();
    const userScoped = Keypair.generate();
    const receiverScopedC = Keypair.generate();
    const receiverScoped = Keypair.generate();
    const treasuryC = Keypair.generate();
    const treasuryD = Keypair.generate();

    let userTokenC: PublicKey;
    let receiverTokenC: PublicKey;
    let userTokenD: PublicKey;
    let receiverTokenD: PublicKey;
    let treasuryTokenC: PublicKey;
    let treasuryTokenD: PublicKey;
    let extraAccountMetaListC: PublicKey;
    let extraAccountMetaListD: PublicKey;

    before(async () => {
      const blacklisterAirdrop = await connection.requestAirdrop(
        blacklisterC.publicKey,
        LAMPORTS_PER_SOL
      );
      await connection.confirmTransaction(blacklisterAirdrop, "confirmed");

      extraAccountMetaListC = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), mintC.toBuffer()],
        transferHookProgram.programId
      )[0];
      extraAccountMetaListD = PublicKey.findProgramAddressSync(
        [Buffer.from("extra-account-metas"), mintD.toBuffer()],
        transferHookProgram.programId
      )[0];

      const commonAccounts = {
        authority: authority.publicKey,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        systemProgram: anchor.web3.SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
      };

      const initSigC = await program.methods
        .initializeV2(
          "Gamma USD",
          "GUSD",
          "",
          6,
          true,
          true,
          true,
          Array.from(stablecoinSeedC)
        )
        .accountsStrict({
          ...commonAccounts,
          config: configC,
          mint: mintC,
          transferHookProgram: transferHookProgram.programId,
          transferHookExtraAccountMetas: extraAccountMetaListC,
        })
        .rpc();
      await connection.confirmTransaction(initSigC, "confirmed");

      const initSigD = await program.methods
        .initializeV2(
          "Delta USD",
          "DUSD",
          "",
          6,
          true,
          true,
          true,
          Array.from(stablecoinSeedD)
        )
        .accountsStrict({
          ...commonAccounts,
          config: configD,
          mint: mintD,
          transferHookProgram: transferHookProgram.programId,
          transferHookExtraAccountMetas: extraAccountMetaListD,
        })
        .rpc();
      await connection.confirmTransaction(initSigD, "confirmed");

      const minterInfoC = deriveMinterPda(configC, minterScoped.publicKey);
      const minterInfoD = deriveMinterPda(configD, minterScoped.publicKey);

      await connection.confirmTransaction(
        await program.methods
          .addMinter(minterScoped.publicKey, new BN(2_000_000_000))
          .accountsStrict({
            config: configC,
            minterInfo: minterInfoC,
            authority: authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc(),
        "confirmed"
      );

      await connection.confirmTransaction(
        await program.methods
          .addMinter(minterScoped.publicKey, new BN(2_000_000_000))
          .accountsStrict({
            config: configD,
            minterInfo: minterInfoD,
            authority: authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc(),
        "confirmed"
      );

      const rolesToAdd: Array<[PublicKey, number, Keypair]> = [
        [configC, 1, pauserC],
        [configC, 2, freezerC],
        [configC, 3, blacklisterC],
        [configC, 4, seizerC],
        [configD, 2, freezerD],
      ];

      for (const [config, role, member] of rolesToAdd) {
        const roleMember = deriveRolePda(config, role, member.publicKey);
        const sig = await program.methods
          .addRole(role, member.publicKey)
          .accountsStrict({
            config,
            roleMember,
            authority: authority.publicKey,
            systemProgram: anchor.web3.SystemProgram.programId,
          })
          .rpc();
        await connection.confirmTransaction(sig, "confirmed");
      }

      userTokenC = (
        await getOrCreateAssociatedTokenAccount(
          connection,
          authority,
          mintC,
          userScoped.publicKey,
          false,
          "confirmed",
          { commitment: "confirmed" },
          TOKEN_2022_PROGRAM_ID
        )
      ).address;
      receiverTokenC = (
        await getOrCreateAssociatedTokenAccount(
          connection,
          authority,
          mintC,
          receiverScopedC.publicKey,
          false,
          "confirmed",
          { commitment: "confirmed" },
          TOKEN_2022_PROGRAM_ID
        )
      ).address;
      treasuryTokenC = (
        await getOrCreateAssociatedTokenAccount(
          connection,
          authority,
          mintC,
          treasuryC.publicKey,
          false,
          "confirmed",
          { commitment: "confirmed" },
          TOKEN_2022_PROGRAM_ID
        )
      ).address;
      userTokenD = (
        await getOrCreateAssociatedTokenAccount(
          connection,
          authority,
          mintD,
          userScoped.publicKey,
          false,
          "confirmed",
          { commitment: "confirmed" },
          TOKEN_2022_PROGRAM_ID
        )
      ).address;
      receiverTokenD = (
        await getOrCreateAssociatedTokenAccount(
          connection,
          authority,
          mintD,
          receiverScoped.publicKey,
          false,
          "confirmed",
          { commitment: "confirmed" },
          TOKEN_2022_PROGRAM_ID
        )
      ).address;
      treasuryTokenD = (
        await getOrCreateAssociatedTokenAccount(
          connection,
          authority,
          mintD,
          treasuryD.publicKey,
          false,
          "confirmed",
          { commitment: "confirmed" },
          TOKEN_2022_PROGRAM_ID
        )
      ).address;

      await thawTokenAccount(configC, mintC, freezerC, userTokenC);
      await thawTokenAccount(configC, mintC, freezerC, receiverTokenC);
      await thawTokenAccount(configC, mintC, freezerC, treasuryTokenC);
      await thawTokenAccount(configD, mintD, freezerD, userTokenD);
      await thawTokenAccount(configD, mintD, freezerD, receiverTokenD);
      await thawTokenAccount(configD, mintD, freezerD, treasuryTokenD);

      await connection.confirmTransaction(
        await program.methods
          .mint(new BN(1_000_000))
          .accountsStrict({
            config: configC,
            mint: mintC,
            minterInfo: minterInfoC,
            minter: minterScoped.publicKey,
            recipientTokenAccount: userTokenC,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minterScoped])
          .rpc(),
        "confirmed"
      );

      await connection.confirmTransaction(
        await program.methods
          .mint(new BN(1_000_000))
          .accountsStrict({
            config: configD,
            mint: mintD,
            minterInfo: minterInfoD,
            minter: minterScoped.publicKey,
            recipientTokenAccount: userTokenD,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minterScoped])
          .rpc(),
        "confirmed"
      );
    });

    it("isolates pause state and freezer roles by config", async () => {
      const minterInfoC = deriveMinterPda(configC, minterScoped.publicKey);
      const minterInfoD = deriveMinterPda(configD, minterScoped.publicKey);
      const pauserRoleC = deriveRolePda(configC, 1, pauserC.publicKey);
      const freezerRoleC = deriveRolePda(configC, 2, freezerC.publicKey);
      const freezerRoleDForCSigner = deriveRolePda(configD, 2, freezerC.publicKey);

      const beforeD = await getAccount(connection, userTokenD, "confirmed", TOKEN_2022_PROGRAM_ID);

      const pauseSig = await program.methods
        .pause()
        .accountsStrict({
          config: configC,
          roleMember: pauserRoleC,
          pauser: pauserC.publicKey,
        })
        .signers([pauserC])
        .rpc();
      await connection.confirmTransaction(pauseSig, "confirmed");

      await expectFailure(
        program.methods
          .mint(new BN(50_000))
          .accountsStrict({
            config: configC,
            mint: mintC,
            minterInfo: minterInfoC,
            minter: minterScoped.publicKey,
            recipientTokenAccount: userTokenC,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .signers([minterScoped])
          .rpc(),
        "mint on paused config C"
      );

      const mintDSig = await program.methods
        .mint(new BN(100_000))
        .accountsStrict({
          config: configD,
          mint: mintD,
          minterInfo: minterInfoD,
          minter: minterScoped.publicKey,
          recipientTokenAccount: userTokenD,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .signers([minterScoped])
        .rpc();
      await connection.confirmTransaction(mintDSig, "confirmed");

      const afterD = await getAccount(connection, userTokenD, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(afterD.amount).to.equal(beforeD.amount + 100_000n);

      const unpauseSig = await program.methods
        .unpause()
        .accountsStrict({
          config: configC,
          roleMember: pauserRoleC,
          pauser: pauserC.publicKey,
        })
        .signers([pauserC])
        .rpc();
      await connection.confirmTransaction(unpauseSig, "confirmed");

      const freezeSig = await program.methods
        .freezeAccount()
        .accountsStrict({
          config: configC,
          roleMember: freezerRoleC,
          freezer: freezerC.publicKey,
          tokenAccount: userTokenC,
          mint: mintC,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezerC])
        .rpc();
      await connection.confirmTransaction(freezeSig, "confirmed");

      const frozenAccountC = await getAccount(connection, userTokenC, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(frozenAccountC.isFrozen).to.be.true;

      await expectFailure(
        program.methods
          .freezeAccount()
          .accountsStrict({
            config: configD,
            roleMember: freezerRoleDForCSigner,
            freezer: freezerC.publicKey,
            tokenAccount: userTokenD,
            mint: mintD,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .signers([freezerC])
          .rpc(),
        "freeze on config D with only config C freezer role"
      );

      await thawTokenAccount(configC, mintC, freezerC, userTokenC);
    });

    it("keeps blacklist and seize scoped to their config", async () => {
      const blacklisterRoleC = deriveRolePda(configC, 3, blacklisterC.publicKey);
      const seizerRoleC = deriveRolePda(configC, 4, seizerC.publicKey);
      const seizerRoleDForCSigner = deriveRolePda(configD, 4, seizerC.publicKey);
      const userBlacklistC = deriveBlacklistPda(configC, userScoped.publicKey);
      const userBlacklistD = deriveBlacklistPda(configD, userScoped.publicKey);
      const treasuryBlacklistC = deriveBlacklistPda(configC, treasuryC.publicKey);
      const treasuryBlacklistD = deriveBlacklistPda(configD, treasuryD.publicKey);

      const blacklistSig = await program.methods
        .addToBlacklist(userScoped.publicKey, "Scoped sanctions match")
        .accountsStrict({
          config: configC,
          roleMember: blacklisterRoleC,
          blacklister: blacklisterC.publicKey,
          blacklistEntry: userBlacklistC,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([blacklisterC])
        .rpc();
      await connection.confirmTransaction(blacklistSig, "confirmed");

      await expectFailure(
        transferWithHook(
          userTokenC,
          mintC,
          receiverTokenC,
          userScoped,
          1n
        ),
        "transfer on config C blocked by config C blacklist"
      );

      expect(
        await connection.getAccountInfo(userBlacklistD, "confirmed")
      ).to.equal(null);

      const beforeReceiverD = await getAccount(
        connection,
        receiverTokenD,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const transferSig = await transferWithHook(
        userTokenD,
        mintD,
        receiverTokenD,
        userScoped,
        1n
      );
      expect(transferSig).to.be.a("string");
      const afterReceiverD = await getAccount(
        connection,
        receiverTokenD,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(afterReceiverD.amount).to.equal(beforeReceiverD.amount + 1n);

      await expectFailure(
        program.methods
          .seize(new BN(50_000))
          .accountsStrict({
            config: configD,
            roleMember: seizerRoleDForCSigner,
            seizer: seizerC.publicKey,
            fromAccount: userTokenD,
            toAccount: treasuryTokenD,
            mint: mintD,
            sssTokenProgram: program.programId,
            token2022Program: TOKEN_2022_PROGRAM_ID,
          })
          .remainingAccounts([
            { pubkey: userBlacklistD, isWritable: false, isSigner: false },
            { pubkey: treasuryBlacklistD, isWritable: false, isSigner: false },
            { pubkey: transferHookProgram.programId, isWritable: false, isSigner: false },
            { pubkey: extraAccountMetaListD, isWritable: false, isSigner: false },
          ])
          .signers([seizerC])
          .rpc(),
        "seize on config D with only config C seizer role"
      );

      const removeBlacklistSig = await program.methods
        .removeFromBlacklist(userScoped.publicKey)
        .accountsStrict({
          config: configC,
          roleMember: blacklisterRoleC,
          blacklister: blacklisterC.publicKey,
          blacklistEntry: userBlacklistC,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([blacklisterC])
        .rpc();
      await connection.confirmTransaction(removeBlacklistSig, "confirmed");

      const beforeReceiverC = await getAccount(
        connection,
        receiverTokenC,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      const unblockedTransferSig = await transferWithHook(
        userTokenC,
        mintC,
        receiverTokenC,
        userScoped,
        1n
      );
      expect(unblockedTransferSig).to.be.a("string");
      const afterReceiverC = await getAccount(
        connection,
        receiverTokenC,
        "confirmed",
        TOKEN_2022_PROGRAM_ID
      );
      expect(afterReceiverC.amount).to.equal(beforeReceiverC.amount + 1n);

      const beforeUserC = await getAccount(connection, userTokenC, "confirmed", TOKEN_2022_PROGRAM_ID);
      const beforeTreasuryC = await getAccount(connection, treasuryTokenC, "confirmed", TOKEN_2022_PROGRAM_ID);

      const seizeSig = await program.methods
        .seize(new BN(50_000))
        .accountsStrict({
          config: configC,
          roleMember: seizerRoleC,
          seizer: seizerC.publicKey,
          fromAccount: userTokenC,
          toAccount: treasuryTokenC,
          mint: mintC,
          sssTokenProgram: program.programId,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .remainingAccounts([
          { pubkey: deriveBlacklistPda(configC, userScoped.publicKey), isWritable: false, isSigner: false },
          { pubkey: treasuryBlacklistC, isWritable: false, isSigner: false },
          { pubkey: transferHookProgram.programId, isWritable: false, isSigner: false },
          { pubkey: extraAccountMetaListC, isWritable: false, isSigner: false },
        ])
        .signers([seizerC])
        .rpc();
      await connection.confirmTransaction(seizeSig, "confirmed");

      const afterUserC = await getAccount(connection, userTokenC, "confirmed", TOKEN_2022_PROGRAM_ID);
      const afterTreasuryC = await getAccount(connection, treasuryTokenC, "confirmed", TOKEN_2022_PROGRAM_ID);
      expect(afterUserC.amount).to.equal(beforeUserC.amount - 50_000n);
      expect(afterTreasuryC.amount).to.equal(beforeTreasuryC.amount + 50_000n);
    });
  });
});
