use crate::{
    error::StablecoinError, events::AuthorityTransferred, state::StablecoinConfig,
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct TransferAuthority<'info> {
    #[account(
        mut,
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    pub authority: Signer<'info>,
}

pub fn transfer_authority(ctx: Context<TransferAuthority>, new_authority: Pubkey) -> Result<()> {
    let config = &mut ctx.accounts.config;
    let old_authority = config.authority;

    config.authority = new_authority;

    emit!(AuthorityTransferred {
        config: config.key(),
        old_authority,
        new_authority,
    });

    Ok(())
}
