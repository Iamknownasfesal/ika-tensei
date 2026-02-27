/**
 * Rate-limited SuiClient wrapper.
 *
 * The IKA SDK's fetchEncryptionKeysFromNetwork fires 200+ concurrent
 * getObject calls via Promise.all, overwhelming public Sui RPCs.
 * This wrapper limits concurrency to avoid timeouts and 429 errors.
 */

import { SuiClient } from '@mysten/sui/client';

const DEFAULT_MAX_CONCURRENT = 15;

/**
 * Wrap a SuiClient to rate-limit `getObject` and `getDynamicFields` calls.
 * Returns the same SuiClient instance (mutated) with patched methods.
 */
export function rateLimitSuiClient(
  client: SuiClient,
  maxConcurrent = DEFAULT_MAX_CONCURRENT,
): SuiClient {
  let active = 0;
  const queue: Array<() => void> = [];

  function acquire(): Promise<void> {
    if (active < maxConcurrent) {
      active++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      queue.push(() => {
        active++;
        resolve();
      });
    });
  }

  function release(): void {
    active--;
    const next = queue.shift();
    if (next) next();
  }

  // Patch getObject
  const originalGetObject = client.getObject.bind(client);
  (client as any).getObject = async function (...args: Parameters<typeof originalGetObject>) {
    await acquire();
    try {
      return await originalGetObject(...args);
    } finally {
      release();
    }
  };

  // Patch getDynamicFields
  const originalGetDynamicFields = client.getDynamicFields.bind(client);
  (client as any).getDynamicFields = async function (...args: Parameters<typeof originalGetDynamicFields>) {
    await acquire();
    try {
      return await originalGetDynamicFields(...args);
    } finally {
      release();
    }
  };

  return client;
}
