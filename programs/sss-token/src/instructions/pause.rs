use crate::{
    constants::*,
    error::StablecoinError,
    events::{TokenPaused, TokenUnpaused},
    state::{RoleMember, StablecoinConfig},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Pause<'info> {
    #[account(
        mut,
        seeds = [CONFIG_SEED],
        bump = config.bump,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        seeds = [ROLE_SEED, config.key().as_ref(), &[1], pauser.key().as_ref()],
        bump,
    )]
    pub role_member: Account<'info, RoleMember>,

    pub pauser: Signer<'info>,
}

pub fn pause(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(!config.paused, StablecoinError::TokenPaused);

    config.paused = true;

    emit!(TokenPaused {
        config: config.key(),
        pauser: ctx.accounts.pauser.key(),
    });

    Ok(())
}

pub fn unpause(ctx: Context<Pause>) -> Result<()> {
    let config = &mut ctx.accounts.config;
    require!(config.paused, StablecoinError::TokenNotPaused);

    config.paused = false;

    emit!(TokenUnpaused {
        config: config.key(),
        pauser: ctx.accounts.pauser.key(),
    });

    Ok(())
}
