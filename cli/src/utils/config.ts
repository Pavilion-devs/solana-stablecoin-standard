import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  programId: string;
  configPda: string;
  mintPda: string;
  name: string;
  symbol: string;
  decimals: number;
  network: string;
  stablecoinSeed?: string;
  version?: number;
}

const CONFIG_FILE = '.sss-token.json';

export function getConfigPath(): string {
  return path.join(os.homedir(), CONFIG_FILE);
}

export function loadConfig(): Config | null {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }
  const data = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(data);
}

export function saveConfig(config: Config): void {
  const configPath = getConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

export interface InitConfigFile {
  preset?: string;
  name?: string;
  symbol?: string;
  decimals?: number;
  uri?: string;
  enablePermanentDelegate?: boolean;
  enableTransferHook?: boolean;
  transferHookProgram?: string;
  defaultFrozen?: boolean;
  stablecoinSeed?: string;
  programId?: string;
  rpc?: string;
}

export function loadInitConfigFile(filePath: string): InitConfigFile {
  const expandedPath = filePath.startsWith('~')
    ? path.join(os.homedir(), filePath.slice(1))
    : filePath;
  const content = fs.readFileSync(expandedPath, 'utf8');
  const extension = path.extname(expandedPath).toLowerCase();

  const raw =
    extension === '.json' ? JSON.parse(content) : parseTomlConfig(content);

  return normalizeInitConfig(raw);
}

export function parseTomlConfig(content: string): Record<string, any> {
  const result: Record<string, any> = {};
  const lines = content.split('\n');
  let currentSection = result;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const section = trimmed.slice(1, -1);
      currentSection = result[section] = {};
    } else {
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=').trim();
      currentSection[key.trim()] = parseValue(value);
    }
  }

  return result;
}

function parseValue(value: string): any {
  if (value.startsWith('"') && value.endsWith('"')) {
    return value.slice(1, -1);
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  const num = Number(value);
  if (!isNaN(num)) return num;
  return value;
}

function normalizeInitConfig(raw: Record<string, any>): InitConfigFile {
  const stablecoinSection = asObject(raw.stablecoin);
  const tokenSection = asObject(raw.token);
  const networkSection = asObject(raw.network);
  const merged = {
    ...raw,
    ...stablecoinSection,
    ...tokenSection,
    ...networkSection,
  };

  return {
    preset: asString(merged.preset),
    name: asString(merged.name),
    symbol: asString(merged.symbol),
    decimals: asNumber(merged.decimals),
    uri: asString(merged.uri),
    enablePermanentDelegate: asBoolean(
      merged.enablePermanentDelegate ?? merged.enable_permanent_delegate
    ),
    enableTransferHook: asBoolean(
      merged.enableTransferHook ?? merged.enable_transfer_hook
    ),
    transferHookProgram: asString(
      merged.transferHookProgram ?? merged.transfer_hook_program
    ),
    defaultFrozen: asBoolean(
      merged.defaultFrozen ??
        merged.default_frozen ??
        merged.defaultAccountFrozen ??
        merged.default_account_frozen
    ),
    stablecoinSeed: asString(merged.stablecoinSeed ?? merged.stablecoin_seed),
    programId: asString(merged.programId ?? merged.program_id),
    rpc: asString(merged.rpc ?? merged.rpcUrl ?? merged.rpc_url),
  };
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' ? (value as Record<string, any>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}
