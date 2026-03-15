use anchor_lang::error_code;

#[error_code]
pub enum StablecoinError {
    #[msg("Amount must be greater than 0")]
    ZeroAmount,

    #[msg("Token is paused")]
    TokenPaused,

    #[msg("Token is not paused")]
    TokenNotPaused,

    #[msg("Account is frozen")]
    AccountFrozen,

    #[msg("Account is not frozen")]
    AccountNotFrozen,

    #[msg("Unauthorized: not the authority")]
    Unauthorized,

    #[msg("Unauthorized: not a minter")]
    NotAMinter,

    #[msg("Unauthorized: not a burner")]
    NotABurner,

    #[msg("Unauthorized: not a pauser")]
    NotAPauser,

    #[msg("Unauthorized: not a freezer")]
    NotAFreezer,

    #[msg("Unauthorized: not a blacklister")]
    NotABlacklister,

    #[msg("Unauthorized: not a seizer")]
    NotASeizer,

    #[msg("Minter quota exceeded")]
    QuotaExceeded,

    #[msg("Compliance feature not enabled (SSS-2 required)")]
    ComplianceNotEnabled,

    #[msg("Permanent delegate not enabled")]
    PermanentDelegateNotEnabled,

    #[msg("Transfer hook not enabled")]
    TransferHookNotEnabled,

    #[msg("Invalid transfer hook program")]
    InvalidTransferHookProgram,

    #[msg("Missing transfer hook accounts")]
    MissingTransferHookAccounts,

    #[msg("Address is already blacklisted")]
    AlreadyBlacklisted,

    #[msg("Address is not blacklisted")]
    NotBlacklisted,

    #[msg("Name too long (max 32 characters)")]
    NameTooLong,

    #[msg("Symbol too long (max 10 characters)")]
    SymbolTooLong,

    #[msg("URI too long (max 200 characters)")]
    UriTooLong,

    #[msg("Reason too long (max 100 characters)")]
    ReasonTooLong,

    #[msg("Invalid role")]
    InvalidRole,

    #[msg("Already has this role")]
    AlreadyHasRole,

    #[msg("Does not have this role")]
    DoesNotHaveRole,

    #[msg("Math overflow")]
    MathOverflow,

    #[msg("Insufficient balance")]
    InsufficientBalance,

    #[msg("Invalid config PDA")]
    InvalidConfigPda,
}
