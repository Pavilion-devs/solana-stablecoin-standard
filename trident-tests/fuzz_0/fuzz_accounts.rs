use trident_fuzz::fuzzing::*;

/// Storage for all account addresses used in fuzz testing.
///
/// This struct serves as a centralized repository for account addresses,
/// enabling their reuse across different instruction flows and test scenarios.
///
/// Docs: https://ackee.xyz/trident/docs/latest/trident-api-macro/trident-types/fuzz-accounts/
#[derive(Default)]
pub struct AccountAddresses {
    pub config: AddressStorage,

    pub minter_info: AddressStorage,

    pub authority: AddressStorage,

    pub system_program: AddressStorage,

    pub role_member: AddressStorage,

    pub blacklister: AddressStorage,

    pub blacklist_entry: AddressStorage,

    pub mint: AddressStorage,

    pub burner: AddressStorage,

    pub token_account: AddressStorage,

    pub token_2022_program: AddressStorage,

    pub freezer: AddressStorage,

    pub transfer_hook_program: AddressStorage,

    pub transfer_hook_extra_account_metas: AddressStorage,

    pub rent: AddressStorage,

    pub minter: AddressStorage,

    pub recipient_token_account: AddressStorage,

    pub pauser: AddressStorage,

    pub seizer: AddressStorage,

    pub from_account: AddressStorage,

    pub to_account: AddressStorage,

    pub sss_token_program: AddressStorage,
}
