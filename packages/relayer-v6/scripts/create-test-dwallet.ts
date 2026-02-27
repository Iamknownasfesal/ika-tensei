/**
 * Create a test deposit dWallet.
 * Usage: npx tsx scripts/create-test-dwallet.ts [chain]
 *   chain: "near", "base", "ethereum", "solana", etc. (default: "near")
 *
 * Also tries to check the state of a previously created dWallet:
 *   npx tsx scripts/create-test-dwallet.ts --check <dwalletId> [curve]
 */
import { SuiClient } from '@mysten/sui/client';
import { IkaClient, Curve, publicKeyFromDWalletOutput } from '@ika.xyz/sdk';
import { getNetworkConfig } from '@ika.xyz/sdk';
import { DWalletCreator } from '../src/dwallet-creator.js';
import { getConfig } from '../src/config.js';
import { logger } from '../src/logger.js';

async function main() {
  const config = getConfig();
  const sui = new SuiClient({ url: config.suiRpcUrl });
  const ikaConfig = getNetworkConfig(config.ikaNetwork);
  const ikaClient = new IkaClient({ suiClient: sui, config: ikaConfig });
  await ikaClient.initialize();

  // Check existing dWallet mode
  if (process.argv[2] === '--check') {
    const existingId = process.argv[3];
    const curveArg = process.argv[4] || 'ed25519';
    if (!existingId) {
      console.error('Usage: --check <dwalletId> [curve]');
      process.exit(1);
    }
    const curve = curveArg.toLowerCase() === 'secp256k1' ? Curve.SECP256K1 : Curve.ED25519;
    logger.info({ dwalletId: existingId, curve: curveArg }, 'Checking existing dWallet state...');
    try {
      const dw = await ikaClient.getDWalletInParticularState(
        existingId, 'Active', { timeout: 300_000 }
      );
      const pubkey = await publicKeyFromDWalletOutput(
        curve,
        new Uint8Array(dw.state.Active!.public_output),
      );
      console.log('\n=== dWallet is Active ===');
      console.log('dWallet ID:', existingId);
      console.log('Pubkey (hex):', Buffer.from(pubkey).toString('hex'));
    } catch (err) {
      logger.error({ err }, 'dWallet not in Active state yet');
    }
    return;
  }

  // Create new dWallet
  const chain = process.argv[2] || 'near';
  logger.info({ chain }, 'Creating deposit dWallet...');
  const creator = new DWalletCreator();
  const result = await creator.create(chain);

  console.log(`\n=== dWallet Created (${chain}) ===`);
  console.log('dWallet ID:', result.id);
  console.log('Pubkey (hex):', Buffer.from(result.pubkey).toString('hex'));
  console.log('Deposit Address:', result.depositAddress);
}

main().catch((err) => {
  console.error('Failed:', err);
  process.exit(1);
});
