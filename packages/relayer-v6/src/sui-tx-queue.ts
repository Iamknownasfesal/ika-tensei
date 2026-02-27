/**
 * Sui Transaction Queue — Serializes all Sui transactions.
 *
 * Sui shared objects require sequential access — concurrent transactions
 * referencing the same shared object (e.g., orchestratorState) will fail
 * with stale version errors. This queue ensures only one Sui transaction
 * executes at a time.
 */

import { logger } from './logger.js';

type QueuedTask<T> = {
  label: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (err: unknown) => void;
};

export class SuiTxQueue {
  private queue: QueuedTask<unknown>[] = [];
  private running = false;

  /**
   * Enqueue a Sui transaction. Returns when the transaction completes.
   * Transactions execute FIFO, one at a time.
   */
  async enqueue<T>(label: string, fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({ label, fn, resolve, reject } as QueuedTask<unknown>);
      this.drain();
    });
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift()!;
      try {
        const result = await task.fn();
        task.resolve(result);
      } catch (err) {
        logger.warn({ label: task.label, err }, 'Sui tx queue task failed');
        task.reject(err);
      }
    }

    this.running = false;
  }

  get pending(): number {
    return this.queue.length;
  }
}
