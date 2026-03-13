use anchor_lang::prelude::*;
use anchor_lang::solana_program::program::invoke_signed;
use anchor_spl::token_2022::{
    spl_token_2022::{
        extension::{
            default_account_state::instruction::initialize_default_account_state,
            transfer_hook::instruction::initialize as initialize_transfer_hook,
            ExtensionType,
        },
        instruction::{initialize_mint2, initialize_permanent_delegate},
        state::AccountState,
    },
    Token2022,
};
use transfer_hook::cpi::accounts::InitializeExtraAccountMetaList as InitializeTransferHookExtraAccountMetaList;

use crate::{
    constants::*, error::StablecoinError, events::StablecoinInitialized, state::StablecoinConfig,
};

#[derive(Accounts)]
#[instruction(name: String, symbol: String, uri: String)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, StablecoinConfig>,

    /// CHECK: Mint account initialized via CPI
    #[account(
        mut,
        seeds = [MINT_SEED, config.key().as_ref()],
        bump
    )]
    pub mint: UncheckedAccount<'info>,

    /// CHECK: Transfer hook program used for SSS-2 transfer enforcement
    pub transfer_hook_program: UncheckedAccount<'info>,

    /// CHECK: Transfer-hook validation account PDA ([extra-account-metas, mint])
    #[account(
        mut,
        seeds = [b"extra-account-metas", mint.key().as_ref()],
        bump,
        seeds::program = transfer_hook_program.key(),
    )]
    pub transfer_hook_extra_account_metas: UncheckedAccount<'info>,

    pub token_2022_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<Initialize>,
    name: String,
    symbol: String,
    _uri: String,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
) -> Result<()> {
    require!(name.len() <= MAX_NAME_LENGTH, StablecoinError::NameTooLong);
    require!(
        symbol.len() <= MAX_SYMBOL_LENGTH,
        StablecoinError::SymbolTooLong
    );

    let config_key = ctx.accounts.config.key();
    let config_bump = ctx.bumps.config;
    let mint_bump = ctx.bumps.mint;
    let transfer_hook_program_key = ctx.accounts.transfer_hook_program.key();

    let mut mint_extensions: Vec<ExtensionType> = Vec::new();
    if enable_permanent_delegate {
        mint_extensions.push(ExtensionType::PermanentDelegate);
    }
    if enable_transfer_hook {
        mint_extensions.push(ExtensionType::TransferHook);
    }
    if default_account_frozen {
        mint_extensions.push(ExtensionType::DefaultAccountState);
    }

    let mint_size =
        ExtensionType::try_calculate_account_len::<spl_token_2022::state::Mint>(&mint_extensions)
            .map_err(|_| StablecoinError::MathOverflow)?;

    let rent = &ctx.accounts.rent;
    let lamports = rent.minimum_balance(mint_size);

    let mint_bump_bytes = [mint_bump];
    let mint_seeds: &[&[u8]] = &[MINT_SEED, config_key.as_ref(), &mint_bump_bytes];

    invoke_signed(
        &anchor_lang::solana_program::system_instruction::create_account(
            &ctx.accounts.authority.key(),
            &ctx.accounts.mint.key(),
            lamports,
            mint_size as u64,
            &ctx.accounts.token_2022_program.key(),
        ),
        &[
            ctx.accounts.authority.to_account_info(),
            ctx.accounts.mint.to_account_info(),
            ctx.accounts.system_program.to_account_info(),
        ],
        &[mint_seeds],
    )?;

    if enable_transfer_hook {
        require_keys_eq!(
            transfer_hook_program_key,
            transfer_hook::id(),
            StablecoinError::InvalidTransferHookProgram
        );
        require!(
            ctx.accounts.transfer_hook_program.executable,
            StablecoinError::InvalidTransferHookProgram
        );

        let init_transfer_hook_ix = initialize_transfer_hook(
            &ctx.accounts.token_2022_program.key(),
            &ctx.accounts.mint.key(),
            Some(config_key),
            Some(transfer_hook_program_key),
        )?;

        invoke_signed(
            &init_transfer_hook_ix,
            &[ctx.accounts.mint.to_account_info()],
            &[mint_seeds],
        )?;
    }

    if enable_permanent_delegate {
        let init_permanent_delegate_ix = initialize_permanent_delegate(
            &ctx.accounts.token_2022_program.key(),
            &ctx.accounts.mint.key(),
            &config_key,
        )?;

        invoke_signed(
            &init_permanent_delegate_ix,
            &[ctx.accounts.mint.to_account_info()],
            &[mint_seeds],
        )?;
    }

    if default_account_frozen {
        let init_default_account_state_ix = initialize_default_account_state(
            &ctx.accounts.token_2022_program.key(),
            &ctx.accounts.mint.key(),
            &AccountState::Frozen,
        )?;

        invoke_signed(
            &init_default_account_state_ix,
            &[ctx.accounts.mint.to_account_info()],
            &[mint_seeds],
        )?;
    }

    let init_mint_ix = initialize_mint2(
        &ctx.accounts.token_2022_program.key(),
        &ctx.accounts.mint.key(),
        &config_key,
        Some(&config_key),
        decimals,
    )?;

    invoke_signed(
        &init_mint_ix,
        &[ctx.accounts.mint.to_account_info()],
        &[mint_seeds],
    )?;

    if enable_transfer_hook {
        let config_bump_bytes = [config_bump];
        let config_seeds: &[&[u8]] = &[CONFIG_SEED, &config_bump_bytes];
        let signer_seeds = &[config_seeds];

        transfer_hook::cpi::initialize_extra_account_meta_list(CpiContext::new_with_signer(
            ctx.accounts.transfer_hook_program.to_account_info(),
            InitializeTransferHookExtraAccountMetaList {
                payer: ctx.accounts.authority.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                mint_authority: ctx.accounts.config.to_account_info(),
                extra_account_meta_list: ctx
                    .accounts
                    .transfer_hook_extra_account_metas
                    .to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info(),
            },
            signer_seeds,
        ))?;
    }

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.mint = ctx.accounts.mint.key();
    config.name = name.clone();
    config.symbol = symbol.clone();
    config.uri = _uri;
    config.decimals = decimals;
    config.enable_permanent_delegate = enable_permanent_delegate;
    config.enable_transfer_hook = enable_transfer_hook;
    config.default_account_frozen = default_account_frozen;
    config.bump = config_bump;
    config.mint_bump = mint_bump;
    config.transfer_hook_program = if enable_transfer_hook {
        Some(transfer_hook_program_key)
    } else {
        None
    };
    config.paused = false;
    config._reserved = [0u8; 64];

    emit!(StablecoinInitialized {
        authority: ctx.accounts.authority.key(),
        mint: ctx.accounts.mint.key(),
        name,
        symbol,
        decimals,
        enable_permanent_delegate,
        enable_transfer_hook,
        default_account_frozen,
    });

    Ok(())
}
