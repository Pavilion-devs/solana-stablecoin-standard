use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke;
use anchor_spl::token_2022::{spl_token_2022::instruction::burn, Token2022};

use crate::{
    constants::*,
    error::StablecoinError,
    events::Burned,
    state::{RoleMember, StablecoinConfig},
};

#[derive(Accounts)]
pub struct Burn<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = !config.paused @ StablecoinError::TokenPaused,
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Mint account
    #[account(mut)]
    pub mint: UncheckedAccount<'info>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[0u8], burner.key().as_ref()],
        bump = role_member.bump,
    )]
    pub role_member: Account<'info, RoleMember>,

    pub burner: Signer<'info>,

    /// CHECK: Token account to burn from
    #[account(mut)]
    pub token_account: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
}

pub fn handler(ctx: Context<Burn>, amount: u64) -> Result<()> {
    require!(amount > 0, StablecoinError::ZeroAmount);

    let burn_ix = burn(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.token_account.key(),
        &ctx.accounts.mint.key(),
        &ctx.accounts.burner.key(),
        &[],
        amount,
    )?;

    invoke(
        &burn_ix,
        &[
            ctx.accounts.token_account.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.burner.to_account_info(),
        ],
    )?;

    emit!(Burned {
        config: ctx.accounts.config.key(),
        burner: ctx.accounts.burner.key(),
        amount,
    });

    Ok(())
}
