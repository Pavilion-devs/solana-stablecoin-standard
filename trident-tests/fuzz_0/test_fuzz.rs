use anchor_lang::AccountDeserialize;
use fuzz_accounts::*;
use spl_associated_token_account_interface::address::get_associated_token_address_with_program_id;
use spl_token_2022_interface::{
    extension::StateWithExtensions,
    state::{Account as TokenAccount, AccountState, Mint},
    ID as TOKEN_2022_PROGRAM_ID,
};
use sss_token::{
    constants::{CONFIG_SEED, MINTER_SEED, MINT_SEED, ROLE_SEED},
    state::{MinterInfo, Role, StablecoinConfig},
};
use trident_fuzz::fuzzing::*;
use types::sss_token::{
    AddMinterInstruction, AddMinterInstructionAccounts, AddMinterInstructionData,
    AddRoleInstruction, AddRoleInstructionAccounts, AddRoleInstructionData, FreezeAccountInstruction,
    FreezeAccountInstructionAccounts, FreezeAccountInstructionData, InitializeInstruction,
    InitializeInstructionAccounts, InitializeInstructionData, MintInstruction,
    MintInstructionAccounts, MintInstructionData, PauseInstruction, PauseInstructionAccounts,
    PauseInstructionData, ThawAccountInstruction, ThawAccountInstructionAccounts,
    ThawAccountInstructionData, UnpauseInstruction, UnpauseInstructionAccounts,
    UnpauseInstructionData,
};

mod fuzz_accounts;
mod types;

const MINTER_QUOTA: u64 = 1_000_000_000_000;

macro_rules! assert_success {
    ($result:expr, $label:expr) => {{
        let result = $result;
        assert!(result.is_success(), "{} failed:\n{}", $label, result.logs());
    }};
}

#[derive(FuzzTestMethods)]
struct FuzzTest {
    trident: Trident,
    fuzz_accounts: AccountAddresses,
}

#[flow_executor]
impl FuzzTest {
    fn new() -> Self {
        Self {
            trident: Trident::default(),
            fuzz_accounts: AccountAddresses::default(),
        }
    }

    #[init]
    fn start(&mut self) {
        let payer = self.trident.payer().pubkey();
        self.trident.airdrop(&payer, 100 * LAMPORTS_PER_SOL);

        let config = derive_config();
        let mint = derive_mint(&config);
        let transfer_hook_program = solana_sdk::system_program::id();
        let transfer_hook_extra_account_metas =
            derive_extra_account_metas(&mint, &transfer_hook_program);

        self.fuzz_accounts.config.insert_with_address(config);
        self.fuzz_accounts.mint.insert_with_address(mint);
        self.fuzz_accounts.authority.insert_with_address(payer);

        let initialize_ix = InitializeInstruction::data(InitializeInstructionData::new(
            self.trident.random_string(8),
            self.trident.random_string(4).to_uppercase(),
            self.trident.random_string(12),
            6,
            false,
            false,
            false,
        ))
        .accounts(InitializeInstructionAccounts::new(
            payer,
            config,
            mint,
            transfer_hook_program,
            transfer_hook_extra_account_metas,
        ))
        .instruction();

        assert_success!(
            self.trident.process_transaction(&[initialize_ix], Some("initialize")),
            "initialize"
        );
        assert_config(&mut self.trident, &config, &mint, payer);

        let minter_info = derive_minter_info(&config, &payer);
        self.fuzz_accounts.minter_info.insert_with_address(minter_info);
        let add_minter_ix = AddMinterInstruction::data(AddMinterInstructionData::new(
            payer,
            MINTER_QUOTA,
        ))
        .accounts(AddMinterInstructionAccounts::new(config, minter_info, payer))
        .instruction();
        assert_success!(
            self.trident
                .process_transaction(&[add_minter_ix], Some("add-minter")),
            "add-minter"
        );

        let pauser_role = derive_role_member(&config, Role::Pauser as u8, &payer);
        let add_pauser_ix = AddRoleInstruction::data(AddRoleInstructionData::new(
            Role::Pauser as u8,
            payer,
        ))
        .accounts(AddRoleInstructionAccounts::new(config, pauser_role, payer))
        .instruction();
        assert_success!(
            self.trident
                .process_transaction(&[add_pauser_ix], Some("add-pauser")),
            "add-pauser"
        );

        let freezer_role = derive_role_member(&config, Role::Freezer as u8, &payer);
        let add_freezer_ix = AddRoleInstruction::data(AddRoleInstructionData::new(
            Role::Freezer as u8,
            payer,
        ))
        .accounts(AddRoleInstructionAccounts::new(config, freezer_role, payer))
        .instruction();
        assert_success!(
            self.trident
                .process_transaction(&[add_freezer_ix], Some("add-freezer")),
            "add-freezer"
        );

        let owner = self.fuzz_accounts.burner.insert(&mut self.trident, None);
        let token_account =
            get_associated_token_address_with_program_id(&owner, &mint, &TOKEN_2022_PROGRAM_ID);
        self.fuzz_accounts.token_account.insert_with_address(token_account);

        let init_token_account_ixs = self.trident.initialize_associated_token_account_2022(
            &payer,
            &mint,
            &owner,
            &[],
        );
        assert_success!(
            self.trident
                .process_transaction(&init_token_account_ixs, Some("init-token-account")),
            "init-token-account"
        );
        assert_token_amount(&mut self.trident, &token_account, 0);
    }

    #[flow]
    fn mint_flow(&mut self) {
        let payer = self.trident.payer().pubkey();
        let config = derive_config();
        let mint = derive_mint(&config);
        let minter_info = derive_minter_info(&config, &payer);
        let token_account = self
            .fuzz_accounts
            .token_account
            .get(&mut self.trident)
            .expect("token account should exist");
        let amount = self.trident.random_from_range(1_u64..=10_000_u64);

        let before_supply = mint_supply(&mut self.trident, &mint);
        let before_account_amount = token_amount(&mut self.trident, &token_account);

        let mint_ix = MintInstruction::data(MintInstructionData::new(amount))
            .accounts(MintInstructionAccounts::new(
                config,
                mint,
                minter_info,
                payer,
                token_account,
            ))
            .instruction();

        assert_success!(self.trident.process_transaction(&[mint_ix], Some("mint")), "mint");

        let mint_supply = mint_supply(&mut self.trident, &mint);
        let token_amount = token_amount(&mut self.trident, &token_account);
        let minter_state = load_account::<MinterInfo>(&mut self.trident, &minter_info);

        assert_eq!(mint_supply, before_supply + amount);
        assert_eq!(token_amount, before_account_amount + amount);
        assert_eq!(mint_supply, token_amount);
        assert_eq!(minter_state.minted, mint_supply);
        assert!(minter_state.minted <= minter_state.quota);
    }

    #[flow]
    fn pause_roundtrip_flow(&mut self) {
        let payer = self.trident.payer().pubkey();
        let config = derive_config();
        let pauser_role = derive_role_member(&config, Role::Pauser as u8, &payer);

        let pause_ix = PauseInstruction::data(PauseInstructionData::new())
            .accounts(PauseInstructionAccounts::new(config, pauser_role, payer))
            .instruction();
        assert_success!(self.trident.process_transaction(&[pause_ix], Some("pause")), "pause");
        assert!(load_account::<StablecoinConfig>(&mut self.trident, &config).paused);

        let unpause_ix = UnpauseInstruction::data(UnpauseInstructionData::new())
            .accounts(UnpauseInstructionAccounts::new(config, pauser_role, payer))
            .instruction();
        assert_success!(
            self.trident
                .process_transaction(&[unpause_ix], Some("unpause")),
            "unpause"
        );
        assert!(!load_account::<StablecoinConfig>(&mut self.trident, &config).paused);
    }

    #[flow]
    fn freeze_thaw_roundtrip_flow(&mut self) {
        let payer = self.trident.payer().pubkey();
        let config = derive_config();
        let mint = derive_mint(&config);
        let freezer_role = derive_role_member(&config, Role::Freezer as u8, &payer);
        let token_account = self
            .fuzz_accounts
            .token_account
            .get(&mut self.trident)
            .expect("token account should exist");

        let freeze_ix = FreezeAccountInstruction::data(FreezeAccountInstructionData::new())
            .accounts(FreezeAccountInstructionAccounts::new(
                config,
                freezer_role,
                payer,
                token_account,
                mint,
            ))
            .instruction();
        assert_success!(
            self.trident
                .process_transaction(&[freeze_ix], Some("freeze-account")),
            "freeze-account"
        );
        assert_eq!(
            token_state(&mut self.trident, &token_account),
            AccountState::Frozen
        );

        let thaw_ix = ThawAccountInstruction::data(ThawAccountInstructionData::new())
            .accounts(ThawAccountInstructionAccounts::new(
                config,
                freezer_role,
                payer,
                token_account,
                mint,
            ))
            .instruction();
        assert_success!(
            self.trident
                .process_transaction(&[thaw_ix], Some("thaw-account")),
            "thaw-account"
        );
        assert_eq!(
            token_state(&mut self.trident, &token_account),
            AccountState::Initialized
        );
    }

    #[end]
    fn end(&mut self) {
        let config = derive_config();
        let mint = derive_mint(&config);
        let payer = self.trident.payer().pubkey();
        assert_config(&mut self.trident, &config, &mint, payer);
    }
}

fn main() {
    FuzzTest::fuzz(32, 8);
}

fn derive_config() -> Pubkey {
    Pubkey::find_program_address(&[CONFIG_SEED], &sss_token::id()).0
}

fn derive_mint(config: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[MINT_SEED, config.as_ref()], &sss_token::id()).0
}

fn derive_minter_info(config: &Pubkey, minter: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[MINTER_SEED, config.as_ref(), minter.as_ref()], &sss_token::id())
        .0
}

fn derive_role_member(config: &Pubkey, role: u8, member: &Pubkey) -> Pubkey {
    let role_bytes = [role];
    Pubkey::find_program_address(
        &[ROLE_SEED, config.as_ref(), &role_bytes, member.as_ref()],
        &sss_token::id(),
    )
    .0
}

fn derive_extra_account_metas(mint: &Pubkey, program_id: &Pubkey) -> Pubkey {
    Pubkey::find_program_address(&[b"extra-account-metas", mint.as_ref()], program_id).0
}

fn assert_config(trident: &mut Trident, config: &Pubkey, mint: &Pubkey, authority: Pubkey) {
    let config_state = load_account::<StablecoinConfig>(trident, config);
    assert_eq!(config_state.authority, authority);
    assert_eq!(config_state.mint, *mint);
    assert!(!config_state.enable_permanent_delegate);
    assert!(!config_state.enable_transfer_hook);
    assert!(!config_state.default_account_frozen);
    assert!(!config_state.paused);
}

fn assert_token_amount(trident: &mut Trident, token_account: &Pubkey, amount: u64) {
    assert_eq!(token_amount(trident, token_account), amount);
}

fn load_account<T: AccountDeserialize>(trident: &mut Trident, address: &Pubkey) -> T {
    let account = trident.get_account(address);
    let mut data = account.data();
    T::try_deserialize(&mut data).expect("account should deserialize")
}

fn mint_supply(trident: &mut Trident, mint: &Pubkey) -> u64 {
    let account = trident.get_account(mint);
    StateWithExtensions::<Mint>::unpack(account.data())
        .expect("mint should deserialize")
        .base
        .supply
}

fn token_amount(trident: &mut Trident, token_account: &Pubkey) -> u64 {
    let account = trident.get_account(token_account);
    StateWithExtensions::<TokenAccount>::unpack(account.data())
        .expect("token account should deserialize")
        .base
        .amount
}

fn token_state(trident: &mut Trident, token_account: &Pubkey) -> AccountState {
    let account = trident.get_account(token_account);
    StateWithExtensions::<TokenAccount>::unpack(account.data())
        .expect("token account should deserialize")
        .base
        .state
}
