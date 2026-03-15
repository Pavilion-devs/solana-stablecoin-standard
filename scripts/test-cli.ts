import { execFileSync, spawn, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as net from "net";
import * as os from "os";
import * as path from "path";
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";

const PROJECT_ROOT = path.resolve(__dirname, "..");
const TEST_TIMEOUT_MS = 60_000;

async function main(): Promise<void> {
  const portBase = await reservePortBlock(40);
  const rpcPort = portBase;
  // Solana RPC clients derive the websocket endpoint as rpcPort + 1.
  // Keep that port free and move gossip away from it.
  const faucetPort = portBase + 2;
  const gossipPort = portBase + 3;
  const dynamicPortStart = portBase + 10;
  const dynamicPortEnd = portBase + 39;
  const rpcUrl = `http://127.0.0.1:${rpcPort}`;
  const walletPath = resolveWalletPath();
  const wallet = loadKeypair(walletPath);
  const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), "sss-cli-ledger-"));
  const cliHome = fs.mkdtempSync(path.join(os.tmpdir(), "sss-cli-home-"));
  const validatorLogPath = path.join(ledgerDir, "validator.log");
  const validatorLog = fs.openSync(validatorLogPath, "w");
  const sssTokenProgramId = loadKeypair(
    path.join(PROJECT_ROOT, "target", "deploy", "sss_token-keypair.json")
  ).publicKey.toBase58();
  const sssTokenProgramKeypairPath = path.join(
    PROJECT_ROOT,
    "target",
    "deploy",
    "sss_token-keypair.json"
  );
  const sssTokenProgramPath = path.join(PROJECT_ROOT, "target", "deploy", "sss_token.so");
  const transferHookProgramId = loadKeypair(
    path.join(PROJECT_ROOT, "target", "deploy", "transfer_hook-keypair.json")
  ).publicKey.toBase58();
  const transferHookProgramKeypairPath = path.join(
    PROJECT_ROOT,
    "target",
    "deploy",
    "transfer_hook-keypair.json"
  );
  const transferHookProgramPath = path.join(
    PROJECT_ROOT,
    "target",
    "deploy",
    "transfer_hook.so"
  );

  let validator: ChildProcess | undefined;

  const cleanup = async () => {
    if (validator && validator.exitCode === null) {
      validator.kill("SIGINT");
      const start = Date.now();
      while (validator.exitCode === null && Date.now() - start < 5_000) {
        await sleep(100);
      }
      if (validator.exitCode === null) {
        validator.kill("SIGKILL");
      }
    }
  };

  process.on("SIGINT", () => {
    void cleanup().finally(() => process.exit(130));
  });
  process.on("SIGTERM", () => {
    void cleanup().finally(() => process.exit(143));
  });

  try {
    run(["anchor", "build"]);
    run(["yarn", "workspace", "@stbr/sss-token", "build"]);
    run(["yarn", "workspace", "sss-token", "build"]);

    validator = spawn(
      "solana-test-validator",
      [
        "--reset",
        "--ledger",
        ledgerDir,
        "--bind-address",
        "127.0.0.1",
        "--gossip-port",
        String(gossipPort),
        "--rpc-port",
        String(rpcPort),
        "--faucet-port",
        String(faucetPort),
        "--dynamic-port-range",
        `${dynamicPortStart}-${dynamicPortEnd}`,
      ],
      {
        cwd: PROJECT_ROOT,
        stdio: ["ignore", validatorLog, validatorLog],
      }
    );

    const connection = new Connection(rpcUrl, "confirmed");
    await waitForRpc(connection);
    await fundWallet(connection, wallet.publicKey);

    const sharedEnv = {
      ...process.env,
      ANCHOR_PROVIDER_URL: rpcUrl,
      ANCHOR_WALLET: walletPath,
      SOLANA_URL: rpcUrl,
      CLI_TEST_RPC: rpcUrl,
    };

    deployProgram({
      rpcUrl,
      walletPath,
      programBinaryPath: transferHookProgramPath,
      programKeypairPath: transferHookProgramKeypairPath,
    });
    deployProgram({
      rpcUrl,
      walletPath,
      programBinaryPath: sssTokenProgramPath,
      programKeypairPath: sssTokenProgramKeypairPath,
    });
    run(
      [
        "yarn",
        "ts-mocha",
        "-r",
        "ts-node/register/transpile-only",
        "-p",
        "./tsconfig.json",
        "-t",
        "1000000",
        "tests/cli.ts",
      ],
      {
        env: {
          ...sharedEnv,
          CLI_TEST_HOME: cliHome,
          CLI_TEST_RPC: rpcUrl,
          CLI_TEST_WALLET: walletPath,
          CLI_TEST_PROGRAM_ID: sssTokenProgramId,
          CLI_TEST_TRANSFER_HOOK_PROGRAM_ID: transferHookProgramId,
        },
      }
    );
  } catch (error) {
    const validatorLog = fs.existsSync(validatorLogPath)
      ? fs.readFileSync(validatorLogPath, "utf8")
      : "Validator log missing";
    console.error("CLI integration harness failed.");
    console.error(`Ledger: ${ledgerDir}`);
    console.error(`CLI HOME: ${cliHome}`);
    console.error(`Validator log: ${validatorLogPath}`);
    console.error(validatorLog.split("\n").slice(-50).join("\n"));
    throw error;
  } finally {
    await cleanup();
    fs.closeSync(validatorLog);
  }
}

function run(command: string[], options?: { env?: NodeJS.ProcessEnv }): void {
  const [binary, ...args] = command;
  execFileSync(binary, args, {
    cwd: PROJECT_ROOT,
    env: options?.env ?? process.env,
    stdio: "inherit",
  });
}

function deployProgram(options: {
  rpcUrl: string;
  walletPath: string;
  programBinaryPath: string;
  programKeypairPath: string;
}): void {
  run(
    [
      "solana",
      "program",
      "deploy",
      "--use-rpc",
      "--url",
      options.rpcUrl,
      "--keypair",
      options.walletPath,
      "--program-id",
      options.programKeypairPath,
      options.programBinaryPath,
    ],
    {
      env: {
        ...process.env,
        ANCHOR_PROVIDER_URL: options.rpcUrl,
        ANCHOR_WALLET: options.walletPath,
        SOLANA_URL: options.rpcUrl,
      },
    }
  );
}

async function waitForRpc(connection: Connection): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < TEST_TIMEOUT_MS) {
    try {
      await connection.getLatestBlockhash("confirmed");
      return;
    } catch {
      await sleep(500);
    }
  }

  throw new Error(`Timed out waiting for validator RPC at ${connection.rpcEndpoint}`);
}

async function fundWallet(connection: Connection, pubkey: PublicKey): Promise<void> {
  const signature = await connection.requestAirdrop(pubkey, 100 * LAMPORTS_PER_SOL);
  await waitForConfirmedSignature(connection, signature);
}

function resolveWalletPath(): string {
  const configured =
    process.env.ANCHOR_WALLET ||
    process.env.SOLANA_KEYPAIR ||
    path.join(os.homedir(), ".config", "solana", "id.json");
  const expanded = configured.startsWith("~")
    ? path.join(os.homedir(), configured.slice(1))
    : configured;

  if (!fs.existsSync(expanded)) {
    throw new Error(`Wallet not found at ${expanded}`);
  }

  return expanded;
}

function loadKeypair(filePath: string): Keypair {
  const content = fs.readFileSync(filePath, "utf8");
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(content)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function reservePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to reserve local port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function reservePortBlock(size: number): Promise<number> {
  const firstCandidate = Math.max(await reservePort(), 40_000);
  const upperBound = 65_535 - size;

  for (let base = firstCandidate; base <= upperBound; base += 1) {
    if (await isPortBlockAvailable(base, size)) {
      return base;
    }
  }

  throw new Error(`Failed to reserve a free port block of size ${size}`);
}

async function isPortBlockAvailable(base: number, size: number): Promise<boolean> {
  for (let port = base; port < base + size; port += 1) {
    if (!(await isPortAvailable(port))) {
      return false;
    }
  }

  return true;
}

async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => {
      server.close((error) => resolve(!error));
    });
  });
}

async function waitForConfirmedSignature(
  connection: Connection,
  signature: string
): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < TEST_TIMEOUT_MS) {
    const statuses = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = statuses.value[0];
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return;
    }
    if (status?.err) {
      throw new Error(`Airdrop failed: ${JSON.stringify(status.err)}`);
    }
    await sleep(500);
  }

  throw new Error(`Timed out waiting for signature ${signature} to confirm`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
