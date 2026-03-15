use crate::{
    constants::*,
    error::StablecoinError,
    events::{MinterAdded, MinterQuotaUpdated, MinterRemoved, RoleAdded, RoleRemoved},
    state::{MinterInfo, RoleMember, StablecoinConfig},
};
use anchor_lang::prelude::*;

#[derive(Accounts)]
#[instruction(minter: Pubkey)]
pub struct AddOrUpdateMinter<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = MinterInfo::LEN,
        seeds = [MINTER_SEED, config.key().as_ref(), minter.as_ref()],
        bump
    )]
    pub minter_info: Account<'info, MinterInfo>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn add_minter(ctx: Context<AddOrUpdateMinter>, minter: Pubkey, quota: u64) -> Result<()> {
    let minter_info = &mut ctx.accounts.minter_info;

    if minter_info.minter == Pubkey::default() {
        minter_info.config = ctx.accounts.config.key();
        minter_info.minter = minter;
        minter_info.minted = 0;
        minter_info.bump = ctx.bumps.minter_info;
    }

    require!(
        minter_info.minter == minter && minter_info.config == ctx.accounts.config.key(),
        StablecoinError::Unauthorized
    );

    minter_info.quota = quota;

    emit!(MinterAdded {
        config: ctx.accounts.config.key(),
        minter,
        quota,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(minter: Pubkey)]
pub struct RemoveMinter<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [MINTER_SEED, config.key().as_ref(), minter.as_ref()],
        bump = minter_info.bump,
    )]
    pub minter_info: Account<'info, MinterInfo>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn remove_minter(ctx: Context<RemoveMinter>, minter: Pubkey) -> Result<()> {
    require!(
        ctx.accounts.minter_info.minter == minter
            && ctx.accounts.minter_info.config == ctx.accounts.config.key(),
        StablecoinError::Unauthorized
    );

    emit!(MinterRemoved {
        config: ctx.accounts.config.key(),
        minter,
    });

    Ok(())
}

pub fn update_minter_quota(
    ctx: Context<AddOrUpdateMinter>,
    minter: Pubkey,
    new_quota: u64,
) -> Result<()> {
    let minter_info = &mut ctx.accounts.minter_info;
    require!(
        minter_info.minter == minter && minter_info.config == ctx.accounts.config.key(),
        StablecoinError::Unauthorized
    );
    let old_quota = minter_info.quota;

    minter_info.quota = new_quota;

    emit!(MinterQuotaUpdated {
        config: ctx.accounts.config.key(),
        minter,
        old_quota,
        new_quota,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(role: u8, member: Pubkey)]
pub struct AddRole<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        init_if_needed,
        payer = authority,
        space = RoleMember::LEN,
        seeds = [ROLE_SEED, config.key().as_ref(), &[role], member.as_ref()],
        bump
    )]
    pub role_member: Account<'info, RoleMember>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn add_role(ctx: Context<AddRole>, role: u8, member: Pubkey) -> Result<()> {
    // Validate role
    require!(role <= 4, StablecoinError::InvalidRole);

    let role_member = &mut ctx.accounts.role_member;

    role_member.config = ctx.accounts.config.key();
    role_member.role = role;
    role_member.member = member;
    role_member.bump = ctx.bumps.role_member;

    emit!(RoleAdded {
        config: ctx.accounts.config.key(),
        role,
        member,
    });

    Ok(())
}

#[derive(Accounts)]
#[instruction(role: u8, member: Pubkey)]
pub struct RemoveRole<'info> {
    #[account(
        constraint = config.matches_pda(&crate::ID, &config.key()) @ StablecoinError::InvalidConfigPda,
        constraint = config.authority == authority.key() @ StablecoinError::Unauthorized,
    )]
    pub config: Account<'info, StablecoinConfig>,

    #[account(
        mut,
        close = authority,
        seeds = [ROLE_SEED, config.key().as_ref(), &[role], member.as_ref()],
        bump = role_member.bump
    )]
    pub role_member: Account<'info, RoleMember>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}

pub fn remove_role(ctx: Context<RemoveRole>, role: u8, member: Pubkey) -> Result<()> {
    require!(
        ctx.accounts.role_member.role == role
            && ctx.accounts.role_member.member == member
            && ctx.accounts.role_member.config == ctx.accounts.config.key(),
        StablecoinError::Unauthorized
    );

    emit!(RoleRemoved {
        config: ctx.accounts.config.key(),
        role,
        member,
    });

    Ok(())
}
