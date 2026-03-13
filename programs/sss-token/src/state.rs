use anchor_lang::prelude::*;

/// Roles for access control
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug)]
pub enum Role {
    Burner = 0,
    Pauser = 1,
    Freezer = 2,
    Blacklister = 3,
    Seizer = 4,
}

impl Role {
    pub fn from_u8(value: u8) -> Option<Self> {
        match value {
            0 => Some(Role::Burner),
            1 => Some(Role::Pauser),
            2 => Some(Role::Freezer),
            3 => Some(Role::Blacklister),
            4 => Some(Role::Seizer),
            _ => None,
        }
    }
}

/// Main stablecoin configuration
#[account]
pub struct StablecoinConfig {
    /// Master authority
    pub authority: Pubkey,
    /// Token mint
    pub mint: Pubkey,
    /// Token metadata (name)
    pub name: String,
    /// Token metadata (symbol)
    pub symbol: String,
    /// Token metadata (uri)
    pub uri: String,
    /// Token decimals
    pub decimals: u8,
    /// Whether permanent delegate is enabled (SSS-2)
    pub enable_permanent_delegate: bool,
    /// Whether transfer hook is enabled (SSS-2)
    pub enable_transfer_hook: bool,
    /// Whether accounts are frozen by default (SSS-2)
    pub default_account_frozen: bool,
    /// PDA bump
    pub bump: u8,
    /// Mint bump
    pub mint_bump: u8,
    /// Transfer hook program (if enabled)
    pub transfer_hook_program: Option<Pubkey>,
    /// Paused state
    pub paused: bool,
    /// Reserved for future use
    pub _reserved: [u8; 64],
}

impl StablecoinConfig {
    pub const LEN: usize = 8 +    // discriminator
        32 +   // authority
        32 +   // mint
        4 + 32 +   // name (String max 32 chars)
        4 + 10 +   // symbol (String max 10 chars)
        4 + 200 +  // uri (String max 200 chars)
        1 +    // decimals
        1 +    // enable_permanent_delegate
        1 +    // enable_transfer_hook
        1 +    // default_account_frozen
        1 +    // bump
        1 +    // mint_bump
        1 + 32 +   // transfer_hook_program (Option<Pubkey>)
        1 +    // paused
        64; // _reserved

    pub const SEED_PREFIX: &'static [u8] = b"config";
}

/// Minter with quota tracking
#[account]
pub struct MinterInfo {
    /// Config this minter belongs to
    pub config: Pubkey,
    /// Minter public key
    pub minter: Pubkey,
    /// Maximum amount they can mint (0 = unlimited)
    pub quota: u64,
    /// Amount minted so far
    pub minted: u64,
    /// PDA bump
    pub bump: u8,
}

impl MinterInfo {
    pub const LEN: usize = 8 +    // discriminator
        32 +   // config
        32 +   // minter
        8 +    // quota
        8 +    // minted
        1; // bump

    pub const SEED_PREFIX: &'static [u8] = b"minter";

    pub fn can_mint(&self, amount: u64) -> bool {
        if self.quota == 0 {
            return true;
        }
        self.minted
            .checked_add(amount)
            .map(|total| total <= self.quota)
            .unwrap_or(false)
    }
}

/// Role member entry
#[account]
pub struct RoleMember {
    /// Config this role belongs to
    pub config: Pubkey,
    /// Role type
    pub role: u8,
    /// Member public key
    pub member: Pubkey,
    /// PDA bump
    pub bump: u8,
}

impl RoleMember {
    pub const LEN: usize = 8 +    // discriminator
        32 +   // config
        1 +    // role
        32 +   // member
        1; // bump

    pub const SEED_PREFIX: &'static [u8] = b"role";
}

/// Blacklist entry (SSS-2)
#[account]
pub struct BlacklistEntry {
    /// Config this blacklist belongs to
    pub config: Pubkey,
    /// Blacklisted address
    pub address: Pubkey,
    /// Reason for blacklisting
    pub reason: String,
    /// Timestamp of blacklisting
    pub timestamp: i64,
    /// PDA bump
    pub bump: u8,
}

impl BlacklistEntry {
    pub const LEN: usize = 8 +    // discriminator
        32 +   // config
        32 +   // address
        4 + 100 +  // reason (String max 100 chars)
        8 +    // timestamp
        1; // bump

    pub const SEED_PREFIX: &'static [u8] = b"blacklist";
}
