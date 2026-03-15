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
    constants::*,
    error::StablecoinError,
    events::StablecoinInitialized,
    state::StablecoinConfig,
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

#[derive(Accounts)]
#[instruction(
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
    stablecoin_seed: [u8; 32]
)]
pub struct InitializeV2<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = StablecoinConfig::LEN,
        seeds = [CONFIG_SEED, stablecoin_seed.as_ref()],
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
    uri: String,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
) -> Result<()> {
    let config_bump_bytes = [ctx.bumps.config];
    let config_signer_seeds: [&[u8]; 2] = [CONFIG_SEED, &config_bump_bytes];

    initialize_common(
        &ctx.accounts.authority,
        &mut ctx.accounts.config,
        &ctx.accounts.mint,
        &ctx.accounts.transfer_hook_program,
        &ctx.accounts.transfer_hook_extra_account_metas,
        &ctx.accounts.token_2022_program,
        &ctx.accounts.system_program,
        &ctx.accounts.rent,
        name,
        symbol,
        uri,
        decimals,
        enable_permanent_delegate,
        enable_transfer_hook,
        default_account_frozen,
        ctx.bumps.config,
        ctx.bumps.mint,
        CONFIG_VERSION_V1,
        StablecoinConfig::v1_seed(),
        &config_signer_seeds,
    )
}

pub fn handler_v2(
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
    let config_bump_bytes = [ctx.bumps.config];
    let config_signer_seeds: [&[u8]; 3] =
        [CONFIG_SEED, stablecoin_seed.as_ref(), &config_bump_bytes];

    initialize_common(
        &ctx.accounts.authority,
        &mut ctx.accounts.config,
        &ctx.accounts.mint,
        &ctx.accounts.transfer_hook_program,
        &ctx.accounts.transfer_hook_extra_account_metas,
        &ctx.accounts.token_2022_program,
        &ctx.accounts.system_program,
        &ctx.accounts.rent,
        name,
        symbol,
        uri,
        decimals,
        enable_permanent_delegate,
        enable_transfer_hook,
        default_account_frozen,
        ctx.bumps.config,
        ctx.bumps.mint,
        CONFIG_VERSION_V2,
        stablecoin_seed,
        &config_signer_seeds,
    )
}

#[allow(clippy::too_many_arguments)]
fn initialize_common<'info>(
    authority: &Signer<'info>,
    config: &mut Account<'info, StablecoinConfig>,
    mint: &UncheckedAccount<'info>,
    transfer_hook_program: &UncheckedAccount<'info>,
    transfer_hook_extra_account_metas: &UncheckedAccount<'info>,
    token_2022_program: &Program<'info, Token2022>,
    system_program: &Program<'info, System>,
    rent: &Sysvar<'info, Rent>,
    name: String,
    symbol: String,
    uri: String,
    decimals: u8,
    enable_permanent_delegate: bool,
    enable_transfer_hook: bool,
    default_account_frozen: bool,
    config_bump: u8,
    mint_bump: u8,
    version: u8,
    stablecoin_seed: [u8; 32],
    config_signer_seeds: &[&[u8]],
) -> Result<()> {
    require!(name.len() <= MAX_NAME_LENGTH, StablecoinError::NameTooLong);
    require!(
        symbol.len() <= MAX_SYMBOL_LENGTH,
        StablecoinError::SymbolTooLong
    );
    require!(uri.len() <= MAX_URI_LENGTH, StablecoinError::UriTooLong);

    let config_key = config.key();
    let transfer_hook_program_key = transfer_hook_program.key();

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
    let lamports = rent.minimum_balance(mint_size);

    let mint_bump_bytes = [mint_bump];
    let mint_seeds: &[&[u8]] = &[MINT_SEED, config_key.as_ref(), &mint_bump_bytes];

    invoke_signed(
        &anchor_lang::solana_program::system_instruction::create_account(
            &authority.key(),
            &mint.key(),
            lamports,
            mint_size as u64,
            &token_2022_program.key(),
        ),
        &[
            authority.to_account_info(),
            mint.to_account_info(),
            system_program.to_account_info(),
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
            transfer_hook_program.executable,
            StablecoinError::InvalidTransferHookProgram
        );

        let init_transfer_hook_ix = initialize_transfer_hook(
            &token_2022_program.key(),
            &mint.key(),
            Some(config_key),
            Some(transfer_hook_program_key),
        )?;

        invoke_signed(
            &init_transfer_hook_ix,
            &[mint.to_account_info()],
            &[mint_seeds],
        )?;
    }

    if enable_permanent_delegate {
        let init_permanent_delegate_ix =
            initialize_permanent_delegate(&token_2022_program.key(), &mint.key(), &config_key)?;

        invoke_signed(
            &init_permanent_delegate_ix,
            &[mint.to_account_info()],
            &[mint_seeds],
        )?;
    }

    if default_account_frozen {
        let init_default_account_state_ix = initialize_default_account_state(
            &token_2022_program.key(),
            &mint.key(),
            &AccountState::Frozen,
        )?;

        invoke_signed(
            &init_default_account_state_ix,
            &[mint.to_account_info()],
            &[mint_seeds],
        )?;
    }

    let init_mint_ix = initialize_mint2(
        &token_2022_program.key(),
        &mint.key(),
        &config_key,
        Some(&config_key),
        decimals,
    )?;

    invoke_signed(
        &init_mint_ix,
        &[mint.to_account_info()],
        &[mint_seeds],
    )?;

    if enable_transfer_hook {
        let signer_seeds = &[config_signer_seeds];

        transfer_hook::cpi::initialize_extra_account_meta_list(CpiContext::new_with_signer(
            transfer_hook_program.to_account_info(),
            InitializeTransferHookExtraAccountMetaList {
                payer: authority.to_account_info(),
                mint: mint.to_account_info(),
                mint_authority: config.to_account_info(),
                extra_account_meta_list: transfer_hook_extra_account_metas.to_account_info(),
                system_program: system_program.to_account_info(),
            },
            signer_seeds,
        ))?;
    }

    config.authority = authority.key();
    config.mint = mint.key();
    config.name = name.clone();
    config.symbol = symbol.clone();
    config.uri = uri;
    config.decimals = decimals;
    config.enable_permanent_delegate = enable_permanent_delegate;
    config.enable_transfer_hook = enable_transfer_hook;
    config.default_account_frozen = default_account_frozen;
    config.version = version;
    config.stablecoin_seed = stablecoin_seed;
    config.bump = config_bump;
    config.mint_bump = mint_bump;
    config.transfer_hook_program = if enable_transfer_hook {
        Some(transfer_hook_program_key)
    } else {
        None
    };
    config.paused = false;
    config._reserved = [0u8; 31];

    emit!(StablecoinInitialized {
        authority: authority.key(),
        mint: mint.key(),
        name,
        symbol,
        decimals,
        enable_permanent_delegate,
        enable_transfer_hook,
        default_account_frozen,
    });

    Ok(())
}
