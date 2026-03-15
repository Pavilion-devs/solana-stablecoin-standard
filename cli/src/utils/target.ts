import { Command } from 'commander';

export interface StablecoinTargetOptions {
  programId?: string;
  config?: string;
  stablecoinSeed?: string;
}

interface StablecoinTargetOptionConfig {
  allowConfig?: boolean;
  allowStablecoinSeed?: boolean;
  allowProgramId?: boolean;
}

export function addStablecoinTargetOptions<T extends Command>(
  command: T,
  options: StablecoinTargetOptionConfig = {}
): T {
  const {
    allowConfig = true,
    allowStablecoinSeed = true,
    allowProgramId = true,
  } = options;

  if (allowConfig) {
    command.option('--config <pubkey>', 'Explicit stablecoin config PDA to target');
  }
  if (allowStablecoinSeed) {
    command.option(
      '--stablecoin-seed <seed>',
      'Stablecoin seed for V2 targeting (plain text, max 32 bytes)'
    );
  }
  if (allowProgramId) {
    command.option('--program-id <programId>', 'SSS program ID override');
  }

  return command;
}

export function pickStablecoinTargetOptions(
  options?: StablecoinTargetOptions
): StablecoinTargetOptions | undefined {
  if (!options) {
    return undefined;
  }

  return {
    programId: options.programId,
    config: options.config,
    stablecoinSeed: options.stablecoinSeed,
  };
}
