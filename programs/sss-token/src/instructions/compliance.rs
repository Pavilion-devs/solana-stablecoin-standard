use anchor_lang::prelude::*;
use anchor_lang::solana_program::instruction::AccountMeta;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::{spl_token_2022::instruction::transfer_checked, Token2022};

use crate::{
    constants::*,
    error::StablecoinError,
    events::{AddedToBlacklist, RemovedFromBlacklist, Seized},
    state::{BlacklistEntry, RoleMember, StablecoinConfig},
};

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct AddToBlacklist<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = config.enable_transfer_hook @ StablecoinError::ComplianceNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[3u8], blacklister.key().as_ref()],
        bump = role_member.bump,
    )]
    pub role_member: Account<'info, RoleMember>,

    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        init_if_needed,
        payer = blacklister,
        space = BlacklistEntry::LEN,
        seeds = [BLACKLIST_SEED, config.key().as_ref(), address.as_ref()],
        bump
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn add_to_blacklist(
    ctx: Context<AddToBlacklist>,
    address: Pubkey,
    reason: String,
) -> Result<()> {
    require!(
        reason.len() <= MAX_REASON_LENGTH,
        StablecoinError::ReasonTooLong
    );

    let entry = &mut ctx.accounts.blacklist_entry;

    entry.config = ctx.accounts.config.key();
    entry.address = address;
    entry.reason = reason.clone();
    entry.timestamp = Clock::get()?.unix_timestamp;
    entry.bump = ctx.bumps.blacklist_entry;

    emit!(AddedToBlacklist {
        config: ctx.accounts.config.key(),
        blacklister: ctx.accounts.blacklister.key(),
        address,
        reason,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(address: Pubkey)]
pub struct RemoveFromBlacklist<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = config.enable_transfer_hook @ StablecoinError::ComplianceNotEnabled,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[3u8], blacklister.key().as_ref()],
        bump = role_member.bump,
    )]
    pub role_member: Account<'info, RoleMember>,

    #[account(mut)]
    pub blacklister: Signer<'info>,

    #[account(
        mut,
        close = blacklister,
        seeds = [BLACKLIST_SEED, config.key().as_ref(), address.as_ref()],
        bump = blacklist_entry.bump,
        constraint = blacklist_entry.address == address @ StablecoinError::NotBlacklisted,
        constraint = blacklist_entry.config == config.key() @ StablecoinError::NotBlacklisted,
    )]
    pub blacklist_entry: Account<'info, BlacklistEntry>,

    pub system_program: Program<'info, System>,
}

pub fn remove_from_blacklist(ctx: Context<RemoveFromBlacklist>, address: Pubkey) -> Result<()> {
    emit!(RemovedFromBlacklist {
        config: ctx.accounts.config.key(),
        blacklister: ctx.accounts.blacklister.key(),
        address,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct Seize<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = config.enable_permanent_delegate @ StablecoinError::PermanentDelegateNotEnabled,
        constraint = !config.paused @ StablecoinError::TokenPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[4u8], seizer.key().as_ref()],
        bump = role_member.bump,
    )]
    pub role_member: Account<'info, RoleMember>,

    pub seizer: Signer<'info>,

    /// CHECK: Source token account to seize from
    #[account(mut)]
    pub from_account: UncheckedAccount<'info>,

    /// CHECK: Destination token account (treasury)
    #[account(mut)]
    pub to_account: UncheckedAccount<'info>,

    /// CHECK: Mint account
    pub mint: UncheckedAccount<'info>,

    /// CHECK: SSS token program account needed for transfer-hook execute extras
    #[account(address = crate::ID)]
    pub sss_token_program: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
}

pub fn seize<'info>(
    ctx: Context<'_, '_, '_, 'info, Seize<'info>>,
    amount: u64,
) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    let config = &ctx.accounts.config;

    let mut transfer_ix = transfer_checked(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.from_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.to_account.key(),
        &ctx.accounts.config.key(),
        &[],
        amount,
        config.decimals,
    )?;

    let mut account_infos = vec![
        ctx.accounts.from_account.to_account_info(),
        ctx.accounts.mint.to_account_info(),
        ctx.accounts.to_account.to_account_info(),
        ctx.accounts.config.to_account_info(),
    ];

    if config.enable_transfer_hook {
        require!(
            ctx.remaining_accounts.len() >= 4,
            StablecoinError::MissingTransferHookAccounts
        );

        let source_blacklist = ctx.remaining_accounts[0].clone();
        let destination_blacklist = ctx.remaining_accounts[1].clone();
        let transfer_hook_program = ctx.remaining_accounts[2].clone();
        let extra_account_meta_list = ctx.remaining_accounts[3].clone();
        let configured_transfer_hook_program = config
            .transfer_hook_program
            .ok_or(StablecoinError::InvalidTransferHookProgram)?;

        require_keys_eq!(
            transfer_hook_program.key(),
            configured_transfer_hook_program,
            StablecoinError::InvalidTransferHookProgram
        );
        require!(
            transfer_hook_program.executable,
            StablecoinError::InvalidTransferHookProgram
        );

        transfer_ix.accounts.push(AccountMeta::new_readonly(
            ctx.accounts.config.key(),
            false,
        ));
        transfer_ix.accounts.push(AccountMeta::new_readonly(
            ctx.accounts.sss_token_program.key(),
            false,
        ));
        transfer_ix
            .accounts
            .push(AccountMeta::new_readonly(source_blacklist.key(), false));
        transfer_ix
            .accounts
            .push(AccountMeta::new_readonly(destination_blacklist.key(), false));
        transfer_ix.accounts.push(AccountMeta::new_readonly(
            transfer_hook_program.key(),
            false,
        ));
        transfer_ix.accounts.push(AccountMeta::new_readonly(
            extra_account_meta_list.key(),
            false,
        ));

        account_infos.push(ctx.accounts.config.to_account_info());
        account_infos.push(ctx.accounts.sss_token_program.to_account_info());
        account_infos.push(source_blacklist);
        account_infos.push(destination_blacklist);
        account_infos.push(transfer_hook_program);
        account_infos.push(extra_account_meta_list);
    }

    ctx.accounts
        .config
        .with_signer_seeds(|seeds| invoke_signed(&transfer_ix, &account_infos, &[seeds]))?;

    emit!(Seized {
        config: ctx.accounts.config.key(),
        seizer: ctx.accounts.seizer.key(),
        from_account: ctx.accounts.from_account.key(),
        to_account: ctx.accounts.to_account.key(),
        amount,
    });

    Ok(())
}
