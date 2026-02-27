use near_contract_standards::non_fungible_token::metadata::{
    NFTContractMetadata, NonFungibleTokenMetadataProvider, TokenMetadata, NFT_METADATA_SPEC,
};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_sdk::collections::LazyOption;
use near_sdk::{
    env, near, AccountId, BorshStorageKey, PanicOnDefault, Promise, PromiseOrValue,
};

#[derive(BorshStorageKey)]
#[near(serializers = [borsh])]
enum StorageKey {
    NonFungibleToken,
    Metadata,
    TokenMetadata,
    Enumeration,
    Approval,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct TestNft {
    tokens: NonFungibleToken,
    metadata: LazyOption<NFTContractMetadata>,
    next_token_id: u64,
}

#[near]
impl TestNft {
    #[init]
    pub fn new(owner_id: AccountId) -> Self {
        let metadata = NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Ika Tensei Test NFT".to_string(),
            symbol: "IKTEST".to_string(),
            icon: None,
            base_uri: None,
            reference: None,
            reference_hash: None,
        };
        Self {
            tokens: NonFungibleToken::new(
                StorageKey::NonFungibleToken,
                owner_id,
                Some(StorageKey::TokenMetadata),
                Some(StorageKey::Enumeration),
                Some(StorageKey::Approval),
            ),
            metadata: LazyOption::new(StorageKey::Metadata, Some(&metadata)),
            next_token_id: 0,
        }
    }

    /// Mint a new NFT. Only callable by the contract owner.
    #[payable]
    pub fn nft_mint(
        &mut self,
        token_id: TokenId,
        receiver_id: AccountId,
        token_metadata: TokenMetadata,
    ) -> Token {
        assert_eq!(
            env::predecessor_account_id(),
            self.tokens.owner_id,
            "Only owner can mint"
        );
        self.tokens.internal_mint(token_id, receiver_id, Some(token_metadata))
    }

    /// Mint a free test NFT to the caller. Anyone can call this.
    /// Caller must attach at least 0.01 NEAR to cover storage.
    #[payable]
    pub fn mint_free(&mut self) -> Token {
        let deposit = env::attached_deposit();
        assert!(
            deposit.as_yoctonear() >= 10_000_000_000_000_000_000_000, // 0.01 NEAR
            "Attach at least 0.01 NEAR for storage"
        );

        let token_id = self.next_token_id.to_string();
        self.next_token_id += 1;

        let receiver = env::predecessor_account_id();
        let metadata = TokenMetadata {
            title: Some(format!("Ika Test NFT #{}", token_id)),
            description: Some("A test NFT for the Ika Tensei seal ritual".to_string()),
            media: None,
            media_hash: None,
            copies: Some(1),
            issued_at: Some(env::block_timestamp().to_string()),
            expires_at: None,
            starts_at: None,
            updated_at: None,
            extra: None,
            reference: None,
            reference_hash: None,
        };

        self.tokens.internal_mint(token_id, receiver, Some(metadata))
    }

    /// View the next token ID that will be minted.
    pub fn get_next_token_id(&self) -> u64 {
        self.next_token_id
    }
}

// Standard NEP-171 implementations
near_contract_standards::impl_non_fungible_token_core!(TestNft, tokens);
near_contract_standards::impl_non_fungible_token_approval!(TestNft, tokens);
near_contract_standards::impl_non_fungible_token_enumeration!(TestNft, tokens);

#[near]
impl NonFungibleTokenMetadataProvider for TestNft {
    fn nft_metadata(&self) -> NFTContractMetadata {
        self.metadata.get().unwrap()
    }
}
