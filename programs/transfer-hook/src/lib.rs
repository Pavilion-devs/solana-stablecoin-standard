use anchor_lang::prelude::*;
use anchor_lang::solana_program::{program::invoke_signed, system_instruction};
use spl_tlv_account_resolution::{
    account::ExtraAccountMeta, seeds::Seed, state::ExtraAccountMetaList,
};
use spl_transfer_hook_interface::{
    get_extra_account_metas_address_and_bump_seed,
    instruction::{ExecuteInstruction, TransferHookInstruction},
};
use std::convert::TryInto;

declare_id!("HGAuoP17ytFpMbkToeJbP2RChQUPSv4koKuqqTUvw9dU");

pub mod constants {
    pub const BLACKLIST_SEED: &[u8] = b"blacklist";
    pub const EXTRA_ACCOUNT_METAS_SEED: &[u8] = b"extra-account-metas";
    pub const TOKEN_ACCOUNT_OWNER_OFFSET: u8 = 32;
}

pub mod error {
    use anchor_lang::error_code;

    #[error_code]
    pub enum TransferHookError {
        #[msg("Source account is blacklisted")]
        SourceBlacklisted,
        #[msg("Destination account is blacklisted")]
        DestinationBlacklisted,
        #[msg("Invalid token account mint")]
        InvalidTokenMint,
        #[msg("Invalid SSS config account")]
        InvalidConfig,
        #[msg("Invalid token account data")]
        InvalidTokenAccountData,
        #[msg("Mint authority does not match mint")]
        InvalidMintAuthority,
        #[msg("Invalid extra account metadata PDA")]
        InvalidExtraAccountMetaPda,
        #[msg("Invalid extra account metadata owner")]
        InvalidExtraAccountMetaOwner,
    }
}

#[program]
pub mod transfer_hook {
    use super::*;

    pub fn initialize_extra_account_meta_list(
        ctx: Context<InitializeExtraAccountMetaList>,
    ) -> Result<()> {
        let mint_data = ctx.accounts.mint.try_borrow_data()?;
        let mint_authority = parse_mint_authority(&mint_data)?;
        require!(
            mint_authority == Some(ctx.accounts.mint_authority.key()),
            error::TransferHookError::InvalidMintAuthority
        );

        let (expected_extra_meta_pda, bump) =
            get_extra_account_metas_address_and_bump_seed(&ctx.accounts.mint.key(), ctx.program_id);
        require_keys_eq!(
            ctx.accounts.extra_account_meta_list.key(),
            expected_extra_meta_pda,
            error::TransferHookError::InvalidExtraAccountMetaPda
        );

        let extra_account_metas = build_extra_account_metas(
            &ctx.accounts.mint_authority.key(),
            ctx.accounts.mint_authority.owner,
        )?;

        let account_size = ExtraAccountMetaList::size_of(extra_account_metas.len())?;

        if ctx.accounts.extra_account_meta_list.data_is_empty() {
            let lamports = Rent::get()?.minimum_balance(account_size);
            let mint_key = ctx.accounts.mint.key();
            let bump_seed = [bump];
            let pda_seeds: &[&[u8]] = &[
                constants::EXTRA_ACCOUNT_METAS_SEED,
                mint_key.as_ref(),
                &bump_seed,
            ];

            invoke_signed(
                &system_instruction::create_account(
                    &ctx.accounts.payer.key(),
                    &ctx.accounts.extra_account_meta_list.key(),
                    lamports,
                    account_size as u64,
                    ctx.program_id,
                ),
                &[
                    ctx.accounts.payer.to_account_info(),
                    ctx.accounts.extra_account_meta_list.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
                &[pda_seeds],
            )?;

            let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
            ExtraAccountMetaList::init::<ExecuteInstruction>(&mut data, &extra_account_metas)?;
        } else {
            require_keys_eq!(
                *ctx.accounts.extra_account_meta_list.owner,
                ctx.program_id.key(),
                error::TransferHookError::InvalidExtraAccountMetaOwner
            );

            let mut data = ctx.accounts.extra_account_meta_list.try_borrow_mut_data()?;
            ExtraAccountMetaList::update::<ExecuteInstruction>(&mut data, &extra_account_metas)?;
        }

        Ok(())
    }

    #[instruction(discriminator = [105, 37, 101, 197, 75, 251, 102, 26])]
    pub fn execute<'info>(
        ctx: Context<'_, '_, '_, 'info, ExecuteTransferHook<'info>>,
        amount: u64,
    ) -> Result<()> {
        enforce_transfer_hook_checks(&ctx, amount)
    }

    pub fn execute_with_blacklist_check(
        ctx: Context<ExecuteTransferHookWithBlacklist>,
        _amount: u64,
    ) -> Result<()> {
        require!(
            ctx.accounts.source_blacklist.data_is_empty(),
            error::TransferHookError::SourceBlacklisted
        );

        require!(
            ctx.accounts.destination_blacklist.data_is_empty(),
            error::TransferHookError::DestinationBlacklisted
        );

        Ok(())
    }
}

fn build_extra_account_metas(
    config: &Pubkey,
    sss_token_program: &Pubkey,
) -> Result<Vec<ExtraAccountMeta>> {
    const CONFIG_ACCOUNT_INDEX: u8 = 5;
    const SSS_TOKEN_PROGRAM_INDEX: u8 = 6;

    Ok(vec![
        ExtraAccountMeta::new_with_pubkey(config, false, false)?,
        ExtraAccountMeta::new_with_pubkey(sss_token_program, false, false)?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            SSS_TOKEN_PROGRAM_INDEX,
            &[
                Seed::Literal {
                    bytes: constants::BLACKLIST_SEED.to_vec(),
                },
                Seed::AccountKey {
                    index: CONFIG_ACCOUNT_INDEX,
                },
                Seed::AccountData {
                    account_index: 0,
                    data_index: constants::TOKEN_ACCOUNT_OWNER_OFFSET,
                    length: 32,
                },
            ],
            false,
            false,
        )?,
        ExtraAccountMeta::new_external_pda_with_seeds(
            SSS_TOKEN_PROGRAM_INDEX,
            &[
                Seed::Literal {
                    bytes: constants::BLACKLIST_SEED.to_vec(),
                },
                Seed::AccountKey {
                    index: CONFIG_ACCOUNT_INDEX,
                },
                Seed::AccountData {
                    account_index: 2,
                    data_index: constants::TOKEN_ACCOUNT_OWNER_OFFSET,
                    length: 32,
                },
            ],
            false,
            false,
        )?,
    ])
}

fn enforce_transfer_hook_checks<'info>(
    ctx: &Context<'_, '_, '_, 'info, ExecuteTransferHook<'info>>,
    amount: u64,
) -> Result<()> {
    let (expected_extra_meta_pda, _) =
        get_extra_account_metas_address_and_bump_seed(&ctx.accounts.mint.key(), ctx.program_id);

    require_keys_eq!(
        ctx.accounts.extra_account_meta_list.key(),
        expected_extra_meta_pda,
        error::TransferHookError::InvalidExtraAccountMetaPda
    );

    require_keys_eq!(
        *ctx.accounts.extra_account_meta_list.owner,
        ctx.program_id.key(),
        error::TransferHookError::InvalidExtraAccountMetaOwner
    );

    let execute_instruction_data = TransferHookInstruction::Execute { amount }.pack();
    let account_infos = ctx.accounts.to_account_infos();
    let extra_meta_data = ctx.accounts.extra_account_meta_list.try_borrow_data()?;
    ExtraAccountMetaList::check_account_infos::<ExecuteInstruction>(
        &account_infos,
        &execute_instruction_data,
        ctx.program_id,
        &extra_meta_data,
    )?;

    let source_data = ctx.accounts.source_account.try_borrow_data()?;
    let destination_data = ctx.accounts.destination_account.try_borrow_data()?;
    let mint_data = ctx.accounts.mint.try_borrow_data()?;

    let source_token_mint = parse_pubkey_at(&source_data, 0)?;
    let source_token_owner =
        parse_pubkey_at(&source_data, constants::TOKEN_ACCOUNT_OWNER_OFFSET as usize)?;
    let destination_token_mint = parse_pubkey_at(&destination_data, 0)?;
    let destination_token_owner = parse_pubkey_at(
        &destination_data,
        constants::TOKEN_ACCOUNT_OWNER_OFFSET as usize,
    )?;
    let mint_authority = parse_mint_authority(&mint_data)?;

    require_keys_eq!(
        source_token_mint,
        ctx.accounts.mint.key(),
        error::TransferHookError::InvalidTokenMint
    );
    require_keys_eq!(
        destination_token_mint,
        ctx.accounts.mint.key(),
        error::TransferHookError::InvalidTokenMint
    );
    require!(
        mint_authority == Some(ctx.accounts.config.key()),
        error::TransferHookError::InvalidConfig
    );
    require_keys_eq!(
        *ctx.accounts.config.owner,
        ctx.accounts.sss_token_program.key(),
        error::TransferHookError::InvalidConfig
    );

    let (expected_source_blacklist, _) = Pubkey::find_program_address(
        &[
            constants::BLACKLIST_SEED,
            ctx.accounts.config.key().as_ref(),
            source_token_owner.as_ref(),
        ],
        ctx.accounts.sss_token_program.key,
    );
    let (expected_destination_blacklist, _) = Pubkey::find_program_address(
        &[
            constants::BLACKLIST_SEED,
            ctx.accounts.config.key().as_ref(),
            destination_token_owner.as_ref(),
        ],
        ctx.accounts.sss_token_program.key,
    );

    require_keys_eq!(
        ctx.accounts.source_blacklist.key(),
        expected_source_blacklist,
        error::TransferHookError::InvalidConfig
    );
    require_keys_eq!(
        ctx.accounts.destination_blacklist.key(),
        expected_destination_blacklist,
        error::TransferHookError::InvalidConfig
    );

    require!(
        ctx.accounts.source_blacklist.data_is_empty(),
        error::TransferHookError::SourceBlacklisted
    );
    require!(
        ctx.accounts.destination_blacklist.data_is_empty(),
        error::TransferHookError::DestinationBlacklisted
    );

    Ok(())
}

fn parse_pubkey_at(data: &[u8], start: usize) -> Result<Pubkey> {
    let bytes: [u8; 32] = data
        .get(start..start + 32)
        .ok_or(error::TransferHookError::InvalidTokenAccountData)?
        .try_into()
        .map_err(|_| error::TransferHookError::InvalidTokenAccountData)?;
    Ok(Pubkey::new_from_array(bytes))
}

fn parse_mint_authority(data: &[u8]) -> Result<Option<Pubkey>> {
    let tag_bytes: [u8; 4] = data
        .get(0..4)
        .ok_or(error::TransferHookError::InvalidTokenAccountData)?
        .try_into()
        .map_err(|_| error::TransferHookError::InvalidTokenAccountData)?;
    let option_tag = u32::from_le_bytes(tag_bytes);

    match option_tag {
        0 => Ok(None),
        1 => Ok(Some(parse_pubkey_at(data, 4)?)),
        _ => Err(error::TransferHookError::InvalidTokenAccountData.into()),
    }
}

#[derive(Accounts)]
pub struct InitializeExtraAccountMetaList<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    /// CHECK: Token mint account
    pub mint: AccountInfo<'info>,

    /// CHECK: SSS config PDA, expected to be mint authority and signed via CPI
    pub mint_authority: Signer<'info>,

    /// CHECK: PDA that stores extra account metadata for execute
    #[account(mut)]
    pub extra_account_meta_list: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ExecuteTransferHook<'info> {
    /// CHECK: Source token account
    pub source_account: AccountInfo<'info>,

    /// CHECK: Token mint
    pub mint: AccountInfo<'info>,

    /// CHECK: Destination token account
    pub destination_account: AccountInfo<'info>,

    /// CHECK: Transfer authority
    pub authority: AccountInfo<'info>,

    /// CHECK: Validation account for transfer-hook extras
    pub extra_account_meta_list: AccountInfo<'info>,

    /// CHECK: SSS token config PDA
    pub config: AccountInfo<'info>,

    /// CHECK: SSS token program account
    pub sss_token_program: AccountInfo<'info>,

    /// CHECK: Source blacklist PDA (must be empty)
    pub source_blacklist: AccountInfo<'info>,

    /// CHECK: Destination blacklist PDA (must be empty)
    pub destination_blacklist: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct ExecuteTransferHookWithBlacklist<'info> {
    /// CHECK: Source token account owner
    pub source_owner: AccountInfo<'info>,

    /// CHECK: Destination token account owner
    pub destination_owner: AccountInfo<'info>,

    /// CHECK: Source blacklist PDA (must be empty)
    #[account(
        seeds = [constants::BLACKLIST_SEED, config.key().as_ref(), source_owner.key().as_ref()],
        bump,
        seeds::program = sss_token_program,
    )]
    pub source_blacklist: AccountInfo<'info>,

    /// CHECK: Destination blacklist PDA (must be empty)
    #[account(
        seeds = [constants::BLACKLIST_SEED, config.key().as_ref(), destination_owner.key().as_ref()],
        bump,
        seeds::program = sss_token_program,
    )]
    pub destination_blacklist: AccountInfo<'info>,

    /// CHECK: SSS token config
    pub config: AccountInfo<'info>,

    /// CHECK: SSS token program
    pub sss_token_program: AccountInfo<'info>,
}
