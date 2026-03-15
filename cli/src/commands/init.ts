import { Command } from 'commander';
import { Preset, SolanaStablecoin } from '@stbr/sss-token';
import { PublicKey } from '@solana/web3.js';
import { loadInitConfigFile, saveConfig } from '../utils/config';
import { createProgramContext } from '../utils/stablecoin';
import { addStablecoinTargetOptions } from '../utils/target';

const DEFAULT_TRANSFER_HOOK_PROGRAM_ID = 'HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU';

export const initCommand = addStablecoinTargetOptions(new Command('init')
  .description('Initialize a new stablecoin')
  .option('-p, --preset <preset>', 'Preset to use (sss-1, sss-2, custom)')
  .option('-c, --custom <path>', 'Path to custom JSON or TOML config file')
  .option('-n, --name <name>', 'Token name')
  .option('-s, --symbol <symbol>', 'Token symbol')
  .option('-d, --decimals <decimals>', 'Token decimals')
  .option('-u, --uri <uri>', 'Token URI (metadata)')
  .option('--enable-permanent-delegate', 'Enable permanent delegate (SSS-2)')
  .option('--enable-transfer-hook', 'Enable transfer hook (SSS-2)')
  .option(
    '--transfer-hook-program <programId>',
    'Transfer hook program ID (required when transfer hook is enabled; defaults to localnet)'
  )
  .option('--default-frozen', 'Freeze accounts by default')
  .option('-k, --keypair <path>', 'Path to authority keypair')
  .option('-r, --rpc <url>', 'RPC endpoint URL'), { allowConfig: false })
  .action(async (options) => {
    const fileConfig = options.custom ? loadInitConfigFile(options.custom) : {};
    const presetKey = String(options.preset ?? fileConfig.preset ?? 'sss-1').toLowerCase();
    const presetMap: Record<string, Preset> = {
      'sss-1': Preset.SSS_1,
      'sss-2': Preset.SSS_2,
      custom: Preset.CUSTOM,
    };

    const preset = presetMap[presetKey];
    if (!preset) {
      console.error(`Invalid preset: ${presetKey}. Use sss-1, sss-2, or custom.`);
      process.exit(1);
    }

    const name = options.name ?? fileConfig.name ?? 'Stablecoin';
    const symbol = options.symbol ?? fileConfig.symbol ?? 'USD';
    const uri = options.uri ?? fileConfig.uri ?? '';
    const decimals = Number(options.decimals ?? fileConfig.decimals ?? 6);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
      console.error(`Invalid decimals: ${decimals}`);
      process.exit(1);
    }

    console.log(`Initializing stablecoin with preset: ${preset}`);
    console.log(`Name: ${name}`);
    console.log(`Symbol: ${symbol}`);
    console.log(`Decimals: ${decimals}`);
    if (options.custom) {
      console.log(`Custom config: ${options.custom}`);
    }

    let enablePermanentDelegate =
      options.enablePermanentDelegate || fileConfig.enablePermanentDelegate || false;
    let enableTransferHook =
      options.enableTransferHook || fileConfig.enableTransferHook || false;
    let defaultAccountFrozen =
      options.defaultFrozen || fileConfig.defaultFrozen || false;

    if (preset === 'sss-2') {
      enablePermanentDelegate = true;
      enableTransferHook = true;
      defaultAccountFrozen = true;
    }

    let transferHookProgram: PublicKey | undefined;
    const stablecoinSeed = options.stablecoinSeed ?? fileConfig.stablecoinSeed;
    if (enableTransferHook) {
      transferHookProgram = new PublicKey(
        options.transferHookProgram ??
          fileConfig.transferHookProgram ??
          DEFAULT_TRANSFER_HOOK_PROGRAM_ID
      );
    }

    console.log('\nConfiguration:');
    console.log(`  Permanent Delegate: ${enablePermanentDelegate}`);
    console.log(`  Transfer Hook: ${enableTransferHook}`);
    if (transferHookProgram) {
      console.log(`  Transfer Hook Program: ${transferHookProgram.toBase58()}`);
    }
    console.log(`  Default Frozen: ${defaultAccountFrozen}`);
    if (stablecoinSeed) {
      console.log(`  Stablecoin Seed: ${stablecoinSeed}`);
    }

    try {
      const { program, wallet, programId } = createProgramContext(
        options.rpc ?? fileConfig.rpc,
        options.keypair,
        options.programId ?? fileConfig.programId
      );
      
      console.log(`\nAuthority: ${wallet.publicKey.toString()}`);
      console.log('Creating stablecoin...');

      const stablecoin = await SolanaStablecoin.create(
        program,
        {
          preset,
          name,
          symbol,
          uri,
          decimals,
          enablePermanentDelegate,
          enableTransferHook,
          transferHookProgram,
          defaultAccountFrozen,
          stablecoinSeed,
        },
        wallet
      );

      const state = await stablecoin.getState();

      saveConfig({
        programId: programId.toBase58(),
        configPda: stablecoin.getConfigPda().toBase58(),
        mintPda: stablecoin.getMintPda().toBase58(),
        name: state.name,
        symbol: state.symbol,
        decimals: state.decimals,
        stablecoinSeed,
        version: state.version,
        network:
          options.rpc ??
          fileConfig.rpc ??
          process.env.SOLANA_RPC ??
          'http://127.0.0.1:8899',
      });

      console.log('\nStablecoin initialized successfully');
      console.log(`Program: ${programId.toBase58()}`);
      console.log(`Config PDA: ${stablecoin.getConfigPda().toBase58()}`);
      console.log(`Mint PDA: ${stablecoin.getMintPda().toBase58()}`);
      if (stablecoinSeed) {
        console.log(`Stablecoin Seed: ${stablecoinSeed}`);
      }
      console.log('Run `sss-token status` to view live state.');
    } catch (err: any) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });
