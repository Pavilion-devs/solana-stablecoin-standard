#!/usr/bin/env node

import { Command } from 'commander';
import { initCommand } from './commands/init';
import { mintCommand } from './commands/mint';
import { burnCommand } from './commands/burn';
import { freezeCommand } from './commands/freeze';
import { thawCommand } from './commands/thaw';
import { pauseCommand } from './commands/pause';
import { unpauseCommand } from './commands/unpause';
import { statusCommand, supplyCommand } from './commands/status';
import { mintersCommand } from './commands/minters';
import { blacklistCommand } from './commands/blacklist';
import { seizeCommand } from './commands/seize';
import { holdersCommand } from './commands/holders';
import { auditLogCommand } from './commands/audit-log';

const program = new Command();

program
  .name('sss-token')
  .description('Solana Stablecoin Standard CLI')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(mintCommand);
program.addCommand(burnCommand);
program.addCommand(freezeCommand);
program.addCommand(thawCommand);
program.addCommand(pauseCommand);
program.addCommand(unpauseCommand);
program.addCommand(statusCommand);
program.addCommand(supplyCommand);
program.addCommand(mintersCommand);
program.addCommand(blacklistCommand);
program.addCommand(seizeCommand);
program.addCommand(holdersCommand);
program.addCommand(auditLogCommand);

program.parse();
