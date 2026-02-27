/**
 * Treasury Manager — Tops up and monitors the on-chain IKA/SUI treasury.
 *
 * The Sui OrchestratorState has an embedded Treasury that holds IKA and SUI
 * balances for coordinator calls (DKG, presign, sign). This manager reads
 * balances and calls add_ika_payment / add_sui_payment to replenish.
 */

import { SuiClient } from '@mysten/sui/client';
import { coinWithBalance, Transaction } from '@mysten/sui/transactions';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import type { IkaConfig } from '@ika.xyz/sdk';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import type { SuiTxQueue } from './sui-tx-queue.js';

export class TreasuryManager {
  private readonly sui: SuiClient;
  private readonly keypair: Ed25519Keypair;
  private readonly ikaConfig: IkaConfig;
  private readonly txQueue: SuiTxQueue;

  constructor(sui: SuiClient, keypair: Ed25519Keypair, ikaConfig: IkaConfig, txQueue: SuiTxQueue) {
    this.sui = sui;
    this.keypair = keypair;
    this.ikaConfig = ikaConfig;
    this.txQueue = txQueue;
  }

  /**
   * Read treasury balances from the OrchestratorState object.
   */
  async getBalances(): Promise<{ ika: bigint; sui: bigint }> {
    const config = getConfig();
    if (!config.suiOrchestratorStateId) {
      return { ika: 0n, sui: 0n };
    }

    const obj = await this.sui.getObject({
      id: config.suiOrchestratorStateId,
      options: { showContent: true },
    });

    const content = obj.data?.content;
    if (content?.dataType !== 'moveObject') {
      logger.warn('Could not read OrchestratorState content');
      return { ika: 0n, sui: 0n };
    }

    const fields = content.fields as Record<string, unknown>;
    // Sui JSON: struct fields are wrapped in { type, fields } objects
    const treasuryWrapper = fields.treasury as { fields?: Record<string, unknown> } | undefined;
    const treasuryFields = treasuryWrapper?.fields;
    if (!treasuryFields) {
      return { ika: 0n, sui: 0n };
    }

    // Balance<T> in Sui JSON is serialized as a plain string value (u64)
    return {
      ika: BigInt((treasuryFields.ika_balance as string) ?? '0'),
      sui: BigInt((treasuryFields.sui_balance as string) ?? '0'),
    };
  }

  /**
   * Top up IKA balance in the treasury.
   */
  async topUpIka(amount: bigint): Promise<string> {
    const config = getConfig();
    const tx = new Transaction();

    const ikaPackageId = this.ikaConfig.packages.ikaPackage;
    const ikaCoin = tx.add(
      coinWithBalance({ type: `${ikaPackageId}::ika::IKA`, balance: Number(amount) }),
    );

    tx.moveCall({
      target: `${config.suiPackageId}::orchestrator::add_ika_payment`,
      arguments: [
        tx.object(config.suiOrchestratorStateId),
        tx.object(config.suiAdminCapId),
        ikaCoin,
      ],
    });

    const result = await this.txQueue.enqueue('add_ika_payment', () =>
      this.sui.signAndExecuteTransaction({
        transaction: tx,
        signer: this.keypair,
      }),
    );

    logger.info(
      { amount: amount.toString(), txDigest: result.digest },
      'Topped up IKA in treasury',
    );
    return result.digest;
  }

  /**
   * Top up SUI balance in the treasury.
   */
  async topUpSui(amount: bigint): Promise<string> {
    const config = getConfig();
    const tx = new Transaction();

    const [suiCoin] = tx.splitCoins(tx.gas, [Number(amount)]);

    tx.moveCall({
      target: `${config.suiPackageId}::orchestrator::add_sui_payment`,
      arguments: [
        tx.object(config.suiOrchestratorStateId),
        tx.object(config.suiAdminCapId),
        suiCoin,
      ],
    });

    const result = await this.txQueue.enqueue('add_sui_payment', () =>
      this.sui.signAndExecuteTransaction({
        transaction: tx,
        signer: this.keypair,
      }),
    );

    logger.info(
      { amount: amount.toString(), txDigest: result.digest },
      'Topped up SUI in treasury',
    );
    return result.digest;
  }

  /**
   * Check treasury balances and replenish if below thresholds.
   */
  async ensureMinimumBalances(): Promise<void> {
    const config = getConfig();
    if (!config.suiOrchestratorStateId) {
      logger.warn('SUI_ORCHESTRATOR_STATE_ID not set — skipping treasury check');
      return;
    }

    try {
      const { ika, sui } = await this.getBalances();
      logger.info(
        { ikaBalance: ika.toString(), suiBalance: sui.toString() },
        'Treasury balances',
      );

      if (ika < config.minIkaBalanceMist) {
        const topUp = config.minIkaBalanceMist * 2n;
        logger.info({ topUp: topUp.toString() }, 'Treasury IKA below minimum — topping up');
        await this.topUpIka(topUp);
      }

      if (sui < config.minSuiBalanceMist) {
        const topUp = config.minSuiBalanceMist * 2n;
        logger.info({ topUp: topUp.toString() }, 'Treasury SUI below minimum — topping up');
        await this.topUpSui(topUp);
      }
    } catch (err) {
      logger.error({ err }, 'Failed to ensure minimum treasury balances');
    }
  }
}
