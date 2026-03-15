use anchor_lang::prelude::*;

pub mod constants;
pub mod error;
pub mod events;
pub mod instructions;
pub mod state;

use instructions::*;

declare_id!("CRRt7KSFfY55BY64hiYGmiHZa5G9fRdqKTCiRNLmYdPe");

#[program]
pub mod sss_token {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        name: String,
        symbol: String,
        uri: String,
        decimals: u8,
        enable_permanent_delegate: bool,
        enable_transfer_hook: bool,
        default_account_frozen: bool,
    ) -> Result<()> {
        instructions::initialize::handler(
            ctx,
            name,
            symbol,
            uri,
            decimals,
            enable_permanent_delegate,
            enable_transfer_hook,
            default_account_frozen,
        )
    }

    pub fn initialize_v2(
        ctx: Context<InitializeV2>,
        name: String,
        symbol: String,
        uri: String,
        decimals: u8,
        enable_permanent_delegate: bool,
        enable_transfer_hook: bool,
        default_account_frozen: bool,
        stablecoin_seed: [u8; 32],
    ) -> Result<()> {
        instructions::initialize::handler_v2(
            ctx,
            name,
            symbol,
            uri,
            decimals,
            enable_permanent_delegate,
            enable_transfer_hook,
            default_account_frozen,
            stablecoin_seed,
        )
    }

    pub fn mint(ctx: Context<Mint>, amount: u64) -> Result<()> {
        instructions::mint::handler(ctx, amount)
    }

    pub fn burn(ctx: Context<Burn>, amount: u64) -> Result<()> {
        instructions::burn::handler(ctx, amount)
    }

    pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
        instructions::freeze::freeze_account(ctx)
    }

    pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
        instructions::freeze::thaw_account(ctx)
    }

    pub fn pause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::pause(ctx)
    }

    pub fn unpause(ctx: Context<Pause>) -> Result<()> {
        instructions::pause::unpause(ctx)
    }

    pub fn transfer_authority(
        ctx: Context<TransferAuthority>,
        new_authority: Pubkey,
    ) -> Result<()> {
        instructions::admin::transfer_authority(ctx, new_authority)
    }

    pub fn add_minter(ctx: Context<AddOrUpdateMinter>, minter: Pubkey, quota: u64) -> Result<()> {
        instructions::roles::add_minter(ctx, minter, quota)
    }

    pub fn remove_minter(ctx: Context<RemoveMinter>, minter: Pubkey) -> Result<()> {
        instructions::roles::remove_minter(ctx, minter)
    }

    pub fn update_minter_quota(
        ctx: Context<AddOrUpdateMinter>,
        minter: Pubkey,
        new_quota: u64,
    ) -> Result<()> {
        instructions::roles::update_minter_quota(ctx, minter, new_quota)
    }

    pub fn add_role(ctx: Context<AddRole>, role: u8, member: Pubkey) -> Result<()> {
        instructions::roles::add_role(ctx, role, member)
    }

    pub fn remove_role(ctx: Context<RemoveRole>, role: u8, member: Pubkey) -> Result<()> {
        instructions::roles::remove_role(ctx, role, member)
    }

    pub fn add_to_blacklist(
        ctx: Context<AddToBlacklist>,
        address: Pubkey,
        reason: String,
    ) -> Result<()> {
        instructions::compliance::add_to_blacklist(ctx, address, reason)
    }

    pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, address: Pubkey) -> Result<()> {
        instructions::compliance::remove_from_blacklist(ctx, address)
    }

    pub fn seize<'info>(
        ctx: Context<'_, '_, '_, 'info, Seize<'info>>,
        amount: u64,
    ) -> Result<()> {
        instructions::compliance::seize(ctx, amount)
    }
}
