import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as anchor from "@coral-xyz/anchor";
import { expect } from "chai";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

describe("CLI integration", function () {
  this.timeout(180_000);

  const projectRoot = path.resolve(process.cwd());
  const cliEntrypoint = path.join(projectRoot, "cli", "dist", "index.js");
  const testHome = requiredEnv("CLI_TEST_HOME");
  const rpcUrl = requiredEnv("CLI_TEST_RPC");
  const walletPath = requiredEnv("CLI_TEST_WALLET");
  const programId = requiredEnv("CLI_TEST_PROGRAM_ID");
  const transferHookProgramId = requiredEnv("CLI_TEST_TRANSFER_HOOK_PROGRAM_ID");
  const idlPath = path.join(projectRoot, "target", "idl", "sss_token.json");
  const configPath = path.join(testHome, ".sss-token.json");
  const customConfigPath = path.join(testHome, "stablecoin.toml");
  const alphaConfigPath = path.join(testHome, "stablecoin-alpha.toml");
  const betaConfigPath = path.join(testHome, "stablecoin-beta.toml");
  const alphaSeed = "alpha-usd";
  const betaSeed = "beta-usd";
  const wallet = loadKeypair(walletPath);
  const walletPubkey = wallet.publicKey.toBase58();
  const provider = new anchor.AnchorProvider(
    new anchor.web3.Connection(rpcUrl, "confirmed"),
    new anchor.Wallet(wallet),
    { commitment: "confirmed" }
  );
  const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
  idl.address = programId;
  const program = new anchor.Program(idl, provider);
  const CONFIG_SEED = Buffer.from("config");
  const ROLE_SEED = Buffer.from("role");

  before(() => {
    if (!fs.existsSync(cliEntrypoint)) {
      throw new Error(`CLI build not found at ${cliEntrypoint}. Run yarn workspace sss-token build.`);
    }

    fs.rmSync(testHome, { recursive: true, force: true });
    fs.mkdirSync(testHome, { recursive: true });
    fs.writeFileSync(
      customConfigPath,
      [
        'preset = "custom"',
        'name = "Smoke USD"',
        'symbol = "SMK"',
        "decimals = 6",
        'uri = ""',
        "enable_permanent_delegate = true",
        "enable_transfer_hook = true",
        `transfer_hook_program = "${transferHookProgramId}"`,
        "default_frozen = false",
        `rpc = "${rpcUrl}"`,
        `program_id = "${programId}"`,
        "",
      ].join("\n")
    );
    fs.writeFileSync(
      alphaConfigPath,
      [
        'preset = "custom"',
        'name = "Alpha USD"',
        'symbol = "AUSD"',
        "decimals = 6",
        'uri = ""',
        `stablecoin_seed = "${alphaSeed}"`,
        "enable_permanent_delegate = false",
        "enable_transfer_hook = false",
        "default_frozen = false",
        `rpc = "${rpcUrl}"`,
        `program_id = "${programId}"`,
        "",
      ].join("\n")
    );
    fs.writeFileSync(
      betaConfigPath,
      [
        'preset = "custom"',
        'name = "Beta USD"',
        'symbol = "BUSD"',
        "decimals = 6",
        'uri = ""',
        `stablecoin_seed = "${betaSeed}"`,
        "enable_permanent_delegate = false",
        "enable_transfer_hook = false",
        "default_frozen = false",
        `rpc = "${rpcUrl}"`,
        `program_id = "${programId}"`,
        "",
      ].join("\n")
    );
  });

  it("initializes from a custom config file", () => {
    const output = runCli(["init", "--custom", customConfigPath, "--keypair", walletPath]);
    expect(output).to.contain("Initializing stablecoin with preset: custom");
    expect(output).to.contain("Stablecoin initialized successfully");
    expect(output).to.contain(`Program: ${programId}`);

    const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    expect(savedConfig.programId).to.equal(programId);
    expect(savedConfig.name).to.equal("Smoke USD");
    expect(savedConfig.symbol).to.equal("SMK");
    expect(savedConfig.decimals).to.equal(6);
    expect(savedConfig.network).to.equal(rpcUrl);
  });

  it("supports separate unpause and thaw commands", async () => {
    const savedConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const config = new PublicKey(savedConfig.configPda);
    const mint = new PublicKey(savedConfig.mintPda);

    await addRole(config, 1, wallet.publicKey);
    await addRole(config, 2, wallet.publicKey);
    await ensureTokenAccount(mint, wallet.publicKey);

    const pauseOutput = runCli(["pause", "--rpc", rpcUrl]);
    expect(pauseOutput).to.contain("Token paused");

    const unpauseOutput = runCli(["unpause", "--rpc", rpcUrl]);
    expect(unpauseOutput).to.contain("Token unpaused");

    const freezeOutput = runCli(["freeze", walletPubkey, "--rpc", rpcUrl]);
    expect(freezeOutput).to.contain(`Froze account owner: ${walletPubkey}`);

    const thawOutput = runCli(["thaw", walletPubkey, "--rpc", rpcUrl]);
    expect(thawOutput).to.contain(`Thawed account owner: ${walletPubkey}`);
  });

  it("creates chain activity for holders and audit-log coverage", () => {
    const addMinterOutput = runCli([
      "minters",
      "add",
      walletPubkey,
      "1000000000",
      "--rpc",
      rpcUrl,
      "--keypair",
      walletPath,
    ]);
    expect(addMinterOutput).to.contain(`Added minter ${walletPubkey}`);

    const mintOutput = runCli([
      "mint",
      walletPubkey,
      "5000000",
      "--rpc",
      rpcUrl,
      "--keypair",
      walletPath,
    ]);
    expect(mintOutput).to.contain("Minted 5000000 tokens");
    expect(mintOutput).to.contain(walletPubkey);
  });

  it("lists holders filtered by minimum balance", () => {
    const output = runCli(["holders", "--rpc", rpcUrl, "--min-balance", "1000000"]);
    expect(output).to.contain("Matching holders: 1");
    expect(output).to.contain(`owner=${walletPubkey}`);
    expect(output).to.contain("amount=5000000");
    expect(output).to.contain("Min balance: 1000000");
  });

  it("filters audit log output by exact action", () => {
    const output = runCli(["audit-log", "--rpc", rpcUrl, "--action", "mint"]);
    expect(output).to.contain("Recent activity:");
    expect(output).to.contain("Mint -> MintTo");
    expect(output).to.not.contain("AddMinter");
  });

  it("reports total supply through the CLI status command", () => {
    const output = runCli(["status", "--rpc", rpcUrl]);
    expect(output).to.contain("Stablecoin Status:");
    expect(output).to.contain("Total Supply: 5000000");
  });

  it("targets multiple V2 configs with --stablecoin-seed and --config", () => {
    const alphaConfig = deriveConfig(alphaSeed);
    const betaConfig = deriveConfig(betaSeed);

    const initAlphaOutput = runCli([
      "init",
      "--custom",
      alphaConfigPath,
      "--keypair",
      walletPath,
    ]);
    expect(initAlphaOutput).to.contain(`Config PDA: ${alphaConfig.toBase58()}`);
    expect(initAlphaOutput).to.contain(`Stablecoin Seed: ${alphaSeed}`);

    const initBetaOutput = runCli([
      "init",
      "--custom",
      betaConfigPath,
      "--keypair",
      walletPath,
    ]);
    expect(initBetaOutput).to.contain(`Config PDA: ${betaConfig.toBase58()}`);
    expect(initBetaOutput).to.contain(`Stablecoin Seed: ${betaSeed}`);
    expect(alphaConfig.toBase58()).to.not.equal(betaConfig.toBase58());

    const addMinterOutput = runCli([
      "minters",
      "add",
      walletPubkey,
      "1000000000",
      "--rpc",
      rpcUrl,
      "--keypair",
      walletPath,
      "--config",
      alphaConfig.toBase58(),
    ]);
    expect(addMinterOutput).to.contain(`Added minter ${walletPubkey}`);

    const mintOutput = runCli([
      "mint",
      walletPubkey,
      "7000000",
      "--rpc",
      rpcUrl,
      "--keypair",
      walletPath,
      "--stablecoin-seed",
      alphaSeed,
    ]);
    expect(mintOutput).to.contain("Minted 7000000 tokens");

    const alphaStatus = runCli([
      "status",
      "--rpc",
      rpcUrl,
      "--config",
      alphaConfig.toBase58(),
    ]);
    expect(alphaStatus).to.contain("Name: Alpha USD");
    expect(alphaStatus).to.contain("Symbol: AUSD");
    expect(alphaStatus).to.contain("Total Supply: 7000000");
    expect(alphaStatus).to.contain(`Config: ${alphaConfig.toBase58()}`);

    const betaStatus = runCli([
      "status",
      "--rpc",
      rpcUrl,
      "--stablecoin-seed",
      betaSeed,
    ]);
    expect(betaStatus).to.contain("Name: Beta USD");
    expect(betaStatus).to.contain("Symbol: BUSD");
    expect(betaStatus).to.contain("Total Supply: 0");
    expect(betaStatus).to.contain(`Config: ${betaConfig.toBase58()}`);

    const alphaHolders = runCli([
      "holders",
      "--rpc",
      rpcUrl,
      "--config",
      alphaConfig.toBase58(),
      "--min-balance",
      "1",
    ]);
    expect(alphaHolders).to.contain("Matching holders: 1");
    expect(alphaHolders).to.contain(`owner=${walletPubkey}`);
    expect(alphaHolders).to.contain("amount=7000000");

    const betaHolders = runCli([
      "holders",
      "--rpc",
      rpcUrl,
      "--stablecoin-seed",
      betaSeed,
      "--min-balance",
      "1",
    ]);
    expect(betaHolders).to.contain("Matching holders: 0");
    expect(betaHolders).to.contain("No holders matched the current filter.");
  });

  function runCli(args: string[]): string {
    try {
      return execFileSync("node", [cliEntrypoint, ...args], {
        cwd: projectRoot,
        env: {
          ...process.env,
          HOME: testHome,
          SOLANA_KEYPAIR: walletPath,
          HTTP_PROXY: "",
          HTTPS_PROXY: "",
          ALL_PROXY: "",
          http_proxy: "",
          https_proxy: "",
          all_proxy: "",
          NO_PROXY: "127.0.0.1,localhost",
          no_proxy: "127.0.0.1,localhost",
        },
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error: any) {
      const stdout = error.stdout ? String(error.stdout) : "";
      const stderr = error.stderr ? String(error.stderr) : "";
      throw new Error(
        [`CLI command failed: ${args.join(" ")}`, stdout.trim(), stderr.trim()]
          .filter((part) => part.length > 0)
          .join("\n")
      );
    }
  }

  async function addRole(config: PublicKey, role: number, member: PublicKey): Promise<void> {
    const roleBuffer = Buffer.alloc(1);
    roleBuffer.writeUInt8(role);
    const [roleMember] = PublicKey.findProgramAddressSync(
      [ROLE_SEED, config.toBuffer(), roleBuffer, member.toBuffer()],
      new PublicKey(programId)
    );

    const signature = await program.methods
      .addRole(role, member)
      .accountsStrict({
        config,
        roleMember,
        authority: wallet.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([wallet])
      .rpc();
    await provider.connection.confirmTransaction(signature, "confirmed");
  }

  async function ensureTokenAccount(mint: PublicKey, owner: PublicKey): Promise<void> {
    const tokenAccount = getAssociatedTokenAddressSync(
      mint,
      owner,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );
    const instruction = createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      tokenAccount,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const tx = new anchor.web3.Transaction().add(instruction);
    const signature = await provider.sendAndConfirm(tx, [wallet]);
    await provider.connection.confirmTransaction(signature, "confirmed");
  }

  function deriveConfig(seed: string): PublicKey {
    return PublicKey.findProgramAddressSync(
      [CONFIG_SEED, normalizeSeed(seed)],
      new PublicKey(programId)
    )[0];
  }

  function normalizeSeed(seed: string): Buffer {
    const bytes = Buffer.from(seed, "utf8");
    if (bytes.length > 32) {
      throw new Error(`Seed too long for test: ${seed}`);
    }
    const normalized = Buffer.alloc(32);
    bytes.copy(normalized);
    return normalized;
  }
});

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function loadKeypair(filePath: string): Keypair {
  const content = fs.readFileSync(filePath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(content)));
}
