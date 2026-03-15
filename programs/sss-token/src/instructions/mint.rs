use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::{spl_token_2022::instruction::mint_to, Token2022};

use crate::{
    constants::*,
    error::StablecoinError,
    events::Minted,
    state::{MinterInfo, StablecoinConfig},
};

#[derive(Accounts)]
pub struct Mint<'info> {
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = !config.paused @ StablecoinError::TokenPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Mint account
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,

    #[account(
        mut,
        seeds = [MINTER_SEED, config.key().as_ref(), minter.key().as_ref()],
        bump = minter_info.bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    pub minter: Signer<'info>,

    /// CHECK: Recipient token account
    #[account(mut)]
    pub recipient_token_account: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Mint>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);
    require!(
        ctx.accounts.minter_info.can_mint(amount),
        StablecoinError::QuotaExceeded
    );

    let config = &ctx.accounts.config;
    let config_bump = config.bump;

    let seeds: &[&[u8]] = &[CONFIG_SEED, &[config_bump]];
    let signer_seeds = &[seeds];

    let mint_ix = mint_to(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.recipient_token_account.key(),
        &ctx.accounts.config.key(),
        &[],
        amount,
    )?;

    invoke_signed(
        &mint_ix,
        &[
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.recipient_token_account.to_account_info(),
            ctx.accounts.config.to_account_info(),
            ctx.accounts.token_2022_program.to_account_info(),
        ],
        signer_seeds,
    )?;

    let minter_info = &mut ctx.accounts.minter_info;
    minter_info.minted = minter_info
        .minted
        .checked_add(amount)
        .ok_or(StablecoinError::MathOverflow)?;

    emit!(Minted {
        config: ctx.accounts.config.key(),
        minter: ctx.accounts.minter.key(),
        recipient: ctx.accounts.recipient_token_account.key(),
        amount,
    });

    Ok(())
}
