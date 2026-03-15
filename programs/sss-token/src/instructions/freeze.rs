use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::{spl_token_2022::instruction, Token2022};

use crate::{
    constants::*,
    error::StablecoinError,
    events::{AccountFrozen, AccountThawed},
    state::{RoleMember, StablecoinConfig},
};

#[derive(Accounts)]
pub struct FreezeAccount<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = !config.paused @ StablecoinError::TokenPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[2u8], freezer.key().as_ref()],
        bump = role_member.bump,
    )]
    pub role_member: Account<'info, RoleMember>,

    pub freezer: Signer<'info>,

    /// CHECK: Token account to freeze
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,

    /// CHECK: Mint account
    pub mint: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
}

#[derive(Accounts)]
pub struct ThawAccount<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = !config.paused @ StablecoinError::TokenPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[2u8], freezer.key().as_ref()],
        bump = role_member.bump,
    )]
    pub role_member: Account<'info, RoleMember>,

    pub freezer: Signer<'info>,

    /// CHECK: Token account to thaw
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,

    /// CHECK: Mint account
    pub mint: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
}

pub fn freeze_account(ctx: Context<FreezeAccount>) -> Result<()> {
    let freeze_ix = instruction::freeze_account(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.token_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.config.key(),
        &[],
    )?;

    ctx.accounts.config.with_signer_seeds(|seeds| {
        invoke_signed(
            &freeze_ix,
            &[
                ctx.accounts.token_account.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.config.to_account_info(),
            ],
            &[seeds],
        )
    })?;

    emit!(AccountFrozen {
        config: ctx.accounts.config.key(),
        freezer: ctx.accounts.freezer.key(),
        account: ctx.accounts.token_account.key(),
    });

    Ok(())
}

pub fn thaw_account(ctx: Context<ThawAccount>) -> Result<()> {
    let thaw_ix = instruction::thaw_account(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.token_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.config.key(),
        &[],
    )?;

    ctx.accounts.config.with_signer_seeds(|seeds| {
        invoke_signed(
            &thaw_ix,
            &[
                ctx.accounts.token_account.to_account_info(),
                ctx.accounts.mint.to_account_info(),
                ctx.accounts.config.to_account_info(),
            ],
            &[seeds],
        )
    })?;

    emit!(AccountThawed {
        config: ctx.accounts.config.key(),
        freezer: ctx.accounts.freezer.key(),
        account: ctx.accounts.token_account.key(),
    });

    Ok(())
}
