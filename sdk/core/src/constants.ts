export const CONFIG_SEED = Buffer.from('config');
export const MINT_SEED = Buffer.from('mint');
export const MINTER_SEED = Buffer.from('minter');
export const ROLE_SEED = Buffer.from('role');
export const BLACKLIST_SEED = Buffer.from('blacklist');

export const MAX_NAME_LENGTH = 32;
export const MAX_SYMBOL_LENGTH = 10;
export const MAX_URI_LENGTH = 200;
export const MAX_REASON_LENGTH = 100;

export enum Role {
  Burner = 0,
  Pauser = 1,
  Freezer = 2,
  Blacklister = 3,
  Seizer = 4,
}

export enum Preset {
  SSS_1 = 'sss-1',
  SSS_2 = 'sss-2',
  CUSTOM = 'custom',
}

export const Presets = Preset;

export const PRESET_CONFIGS = {
  [Preset.SSS_1]: {
    enablePermanentDelegate: false,
    enableTransferHook: false,
    defaultAccountFrozen: false,
  },
  [Preset.SSS_2]: {
    enablePermanentDelegate: true,
    enableTransferHook: true,
    defaultAccountFrozen: true,
  },
};
