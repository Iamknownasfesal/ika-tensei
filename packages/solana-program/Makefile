.PHONY: build deploy deploy-devnet deploy-mainnet show upgrade-authority set-multisig revoke clean test

PROGRAM_ID := mbEQvaiUYdc65Qz4rd67oBY1LbSCBq1Da8Y1MciwtPa
PROGRAM_PATH := ika_tensei/target/deploy/ika_tensei.so

build:
	cd ika_tensei && cargo build-sbf

test:
	cd ika_tensei && cargo test

deploy-devnet: build
	@solana program deploy $(PROGRAM_PATH) --url devnet
	@echo ""
	@echo "⚠️  REMINDER: Upgrade authority is still set to deployer keypair."
	@echo "⚠️  Remember to transfer upgrade authority to multisig before mainnet deployment."

deploy-mainnet: build
	@solana program deploy $(PROGRAM_PATH) --url mainnet-beta
	@echo ""
	@echo "⚠️  UPGRADE AUTHORITY ACTION REQUIRED!"
	@echo "   Current: Deployer keypair"
	@echo "   Next: Transfer to multisig (see README upgrade authority section)"
	@echo "   Final: Revoke after stability period (--final flag)"

show:
	@solana program show $(PROGRAM_ID)

set-multisig:
	@solana program set-upgrade-authority $(PROGRAM_ID) --new-upgrade-authority $(MULTISIG) $(URL)

revoke:
	@solana program set-upgrade-authority $(PROGRAM_ID) --final $(URL)

clean:
	cd ika_tensei && cargo clean
