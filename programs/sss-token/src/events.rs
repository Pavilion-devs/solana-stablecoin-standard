use anchor_lang::prelude::*;

#[event]
pub struct StablecoinInitialized {
    pub authority: Pubkey,
    pub mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub enable_permanent_delegate: bool,
    pub enable_transfer_hook: bool,
    pub default_account_frozen: bool,
}

#[event]
pub struct Minted {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub recipient: Pubkey,
    pub amount: u64,
}

#[event]
pub struct Burned {
    pub config: Pubkey,
    pub burner: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AccountFrozen {
    pub config: Pubkey,
    pub freezer: Pubkey,
    pub account: Pubkey,
}

#[event]
pub struct AccountThawed {
    pub config: Pubkey,
    pub freezer: Pubkey,
    pub account: Pubkey,
}

#[event]
pub struct TokenPaused {
    pub config: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct TokenUnpaused {
    pub config: Pubkey,
    pub pauser: Pubkey,
}

#[event]
pub struct AuthorityTransferred {
    pub config: Pubkey,
    pub old_authority: Pubkey,
    pub new_authority: Pubkey,
}

#[event]
pub struct MinterAdded {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub quota: u64,
}

#[event]
pub struct MinterRemoved {
    pub config: Pubkey,
    pub minter: Pubkey,
}

#[event]
pub struct MinterQuotaUpdated {
    pub config: Pubkey,
    pub minter: Pubkey,
    pub old_quota: u64,
    pub new_quota: u64,
}

#[event]
pub struct RoleAdded {
    pub config: Pubkey,
    pub role: u8,
    pub member: Pubkey,
}

#[event]
pub struct RoleRemoved {
    pub config: Pubkey,
    pub role: u8,
    pub member: Pubkey,
}

#[event]
pub struct AddedToBlacklist {
    pub config: Pubkey,
    pub blacklister: Pubkey,
    pub address: Pubkey,
    pub reason: String,
}

#[event]
pub struct RemovedFromBlacklist {
    pub config: Pubkey,
    pub blacklister: Pubkey,
    pub address: Pubkey,
}

#[event]
pub struct Seized {
    pub config: Pubkey,
    pub seizer: Pubkey,
    pub from_account: Pubkey,
    pub to_account: Pubkey,
    pub amount: u64,
}
