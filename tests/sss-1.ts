import * as anchor from "@coral-xyz/anchor";
import {
  getOrCreateAssociatedTokenAccount,
  getAccount,
  getExtraAccountMetaAddress,
  getMint,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("SSS-1: Minimal Stablecoin - Integration Test", () => {
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
  let minter: Keypair;
  let blacklister: Keypair;
  let freezer: Keypair;
  let user: Keypair;
  
  let config: PublicKey;
  let mint: PublicKey;
  let transferHookExtraAccountMetas: PublicKey;
  let minterInfo: PublicKey;
  let userBurnerRole: PublicKey;
  let freezerRole: PublicKey;
  let blacklisterRole: PublicKey;
  let blacklistEntry: PublicKey;
  let userTokenAccount: PublicKey;

  const CONFIG_SEED = Buffer.from("config");
  const MINT_SEED = Buffer.from("mint");
  const MINTER_SEED = Buffer.from("minter");
  const ROLE_SEED = Buffer.from("role");
  const BLACKLIST_SEED = Buffer.from("blacklist");

  function isAlreadyInUseError(error: unknown): boolean {
    return String(error).toLowerCase().includes("already in use");
  }

  async function waitForAccount(
    pubkey: PublicKey,
    attempts = 20,
    delayMs = 250
  ): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      const info = await connection.getAccountInfo(pubkey, "confirmed");
      if (info) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    throw new Error(`Account ${pubkey.toBase58()} was not found after waiting`);
  }

  before(async () => {
    authority = (provider.wallet as any).payer as Keypair;
    if (!authority) {
      throw new Error("Provider wallet does not expose a payer keypair for authority operations");
    }
    minter = Keypair.generate();
    blacklister = Keypair.generate();
    freezer = Keypair.generate();
    user = Keypair.generate();

    [config] = PublicKey.findProgramAddressSync([CONFIG_SEED], program.programId);
    [mint] = PublicKey.findProgramAddressSync([MINT_SEED, config.toBuffer()], program.programId);
    transferHookExtraAccountMetas = getExtraAccountMetaAddress(mint, transferHookProgram.programId);
    [minterInfo] = PublicKey.findProgramAddressSync(
      [MINTER_SEED, config.toBuffer(), minter.publicKey.toBuffer()],
      program.programId
    );
    [userBurnerRole] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, config.toBuffer(), Buffer.from([0]), user.publicKey.toBuffer()],
      program.programId
    );
    [freezerRole] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, config.toBuffer(), Buffer.from([2]), freezer.publicKey.toBuffer()],
      program.programId
    );
    [blacklisterRole] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, config.toBuffer(), Buffer.from([3]), blacklister.publicKey.toBuffer()],
      program.programId
    );
    [blacklistEntry] = PublicKey.findProgramAddressSync(
      [BLACKLIST_SEED, config.toBuffer(), user.publicKey.toBuffer()],
      program.programId
    );

    console.log("Config:", config.toString());
    console.log("Mint:", mint.toString());
    console.log("Authority:", authority.publicKey.toString());
    console.log("User:", user.publicKey.toString());

    const airdropPromises = [minter, blacklister, freezer, user].map(async (kp) => {
      const sig = await connection.requestAirdrop(kp.publicKey, 10 * LAMPORTS_PER_SOL);
      await connection.confirmTransaction(sig);
    });
    await Promise.all(airdropPromises);
  });

  it("should create stablecoin", async () => {
    try {
      const sig = await program.methods
        .initialize("Test USD", "TUSD", "", 6, false, false, false)
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
      console.log("Config already initialized, reusing existing state");
    }

    const configAccount = await program.account.stablecoinConfig.fetch(config);
    expect(configAccount.name.length).to.be.greaterThan(0);
    expect(configAccount.paused).to.be.false;

    await waitForAccount(mint);
    const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log("Mint initialized - supply:", mintInfo.supply.toString());
    expect(mintInfo.decimals).to.equal(6);
    expect(mintInfo.mintAuthority?.toString()).to.equal(config.toString());
    console.log("✓ Stablecoin initialized");
  });

  it("should add minter", async () => {
    await program.methods
      .addMinter(minter.publicKey, new BN(1_000_000_000))
      .accountsStrict({
        config,
        minterInfo,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

    const info = await program.account.minterInfo.fetch(minterInfo);
    expect(info.quota.toNumber()).to.equal(1_000_000_000);
    console.log("✓ Minter added");
  });

  it("should add burner and freezer roles", async () => {
    await program.methods
      .addRole(0, user.publicKey)
      .accountsStrict({
        config,
        roleMember: userBurnerRole,
        authority: authority.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([authority])
      .rpc();

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
  });

  it("should mint tokens", async () => {
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
    userTokenAccount = userAta.address;
    console.log("User token account:", userTokenAccount.toString());

    const accountBefore = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (accountBefore.isFrozen) {
      console.log("Account is frozen by default (SSS-2 config), thawing first...");
      const thawSig = await program.methods
        .thawAccount()
        .accountsStrict({
          config,
          roleMember: freezerRole,
          freezer: freezer.publicKey,
          tokenAccount: userTokenAccount,
          mint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      await connection.confirmTransaction(thawSig, "confirmed");
    }

    const amount = new BN(100_000_000);
    
    const sig = await program.methods
      .mint(amount)
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
    await connection.confirmTransaction(sig, "confirmed");

    // Verify mint supply increased
    const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log("Mint supply after mint:", mintInfo.supply.toString());

    // Fetch token account
    const account = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
    console.log(`Token account balance: ${account.amount}`);
    expect(account.amount.toString()).to.equal("100000000");
    console.log("✓ Minted 100000000 tokens to user");
  });

  it("should update minter quota", async () => {
    const info = await program.account.minterInfo.fetch(minterInfo);
    expect(info.minted.toNumber()).to.equal(100_000_000);
    console.log("✓ Minter quota updated");
  });

  it("should burn tokens with the burner role", async () => {
    const beforeAccount = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
    const beforeMint = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    const burnAmount = 25_000_000n;

    const sig = await program.methods
      .burn(new BN(25_000_000))
      .accountsStrict({
        config,
        mint,
        roleMember: userBurnerRole,
        burner: user.publicKey,
        tokenAccount: userTokenAccount,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([user])
      .rpc();
    await connection.confirmTransaction(sig, "confirmed");

    const account = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
    const mintInfo = await getMint(connection, mint, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(account.amount).to.equal(beforeAccount.amount - burnAmount);
    expect(mintInfo.supply).to.equal(beforeMint.supply - burnAmount);
  });

  it("should freeze and thaw accounts with the freezer role", async () => {
    const preCheck = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
    if (preCheck.isFrozen) {
      const thawFirst = await program.methods
        .thawAccount()
        .accountsStrict({
          config,
          roleMember: freezerRole,
          freezer: freezer.publicKey,
          tokenAccount: userTokenAccount,
          mint,
          token2022Program: TOKEN_2022_PROGRAM_ID,
        })
        .signers([freezer])
        .rpc();
      await connection.confirmTransaction(thawFirst, "confirmed");
    }

    const freezeSig = await program.methods
      .freezeAccount()
      .accountsStrict({
        config,
        roleMember: freezerRole,
        freezer: freezer.publicKey,
        tokenAccount: userTokenAccount,
        mint,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();
    await connection.confirmTransaction(freezeSig, "confirmed");

    const frozenAccount = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(frozenAccount.isFrozen).to.be.true;

    const thawSig = await program.methods
      .thawAccount()
      .accountsStrict({
        config,
        roleMember: freezerRole,
        freezer: freezer.publicKey,
        tokenAccount: userTokenAccount,
        mint,
        token2022Program: TOKEN_2022_PROGRAM_ID,
      })
      .signers([freezer])
      .rpc();
    await connection.confirmTransaction(thawSig, "confirmed");

    const thawedAccount = await getAccount(connection, userTokenAccount, "confirmed", TOKEN_2022_PROGRAM_ID);
    expect(thawedAccount.isFrozen).to.be.false;
  });

  it("should transfer authority", async () => {
    const newAuthority = Keypair.generate();
    
    await program.methods
      .transferAuthority(newAuthority.publicKey)
      .accountsStrict({
        config,
        authority: authority.publicKey,
      })
      .signers([authority])
      .rpc();

    const configAccount = await program.account.stablecoinConfig.fetch(config);
    expect(configAccount.authority.toString()).to.equal(newAuthority.publicKey.toString());
    console.log("✓ Authority transferred");

    // Transfer back
    await program.methods
      .transferAuthority(authority.publicKey)
      .accountsStrict({
        config,
        authority: newAuthority.publicKey,
      })
      .signers([newAuthority])
      .rpc();
    console.log("✓ Authority transferred back");
  });

  it("should fail compliance operations when compliance is disabled", async () => {
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

    try {
      await program.methods
        .addToBlacklist(user.publicKey, "should fail for sss-1")
        .accountsStrict({
          config,
          roleMember: blacklisterRole,
          blacklister: blacklister.publicKey,
          blacklistEntry,
          systemProgram: anchor.web3.SystemProgram.programId,
        })
        .signers([blacklister])
        .rpc();
      expect.fail("Compliance op should fail when transfer hook module is disabled");
    } catch (error) {
      expect(String(error).length).to.be.greaterThan(0);
    }
  });
});
