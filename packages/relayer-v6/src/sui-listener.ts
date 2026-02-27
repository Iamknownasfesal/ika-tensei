/**
 * Sui Listener — HTTP polling-based event indexer.
 *
 * Uses periodic queryEvents() calls instead of WebSocket subscriptions.
 * Pattern adapted from Patara DCA backend indexer.
 *
 * Features:
 * - Periodic HTTP polling via setInterval + queryEvents
 * - Cursor persistence so missed events are replayed on restart
 * - Overlap guard prevents concurrent polls
 * - Pagination handles burst of events in a single poll cycle
 */

import { SuiClient, type SuiEvent } from '@mysten/sui/client';
import { getConfig } from './config.js';
import type { EventCursor } from './types.js';
import { logger } from './logger.js';
import { getCursor, saveCursor as dbSaveCursor } from './db.js';

export type EventHandler<T = Record<string, unknown>> = (event: T, eventId: string) => Promise<void>;

/** Default poll interval in milliseconds */
const DEFAULT_POLL_INTERVAL_MS = 5_000;

/**
 * SuiListener polls for Sui Move events using queryEvents (HTTP).
 * Accepts a configurable event type suffix so multiple listeners can coexist
 * (e.g., one for SealPending, one for SealSigned).
 */
export class SuiListener<T = Record<string, unknown>> {
  private client: SuiClient;
  private _eventHandler: EventHandler<T> | null = null;
  private _eventType: string;
  private _intervalId: ReturnType<typeof setInterval> | null = null;
  private _polling = false;
  private _isActive = false;

  constructor(eventTypeSuffix: string = 'SealSigned') {
    const config = getConfig();
    this.client = new SuiClient({ url: config.suiRpcUrl });
    // Sui events always reference the original defining package ID, not upgrades
    this._eventType = `${config.suiOriginalPackageId}::orchestrator::${eventTypeSuffix}`;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Check that the Sui HTTP RPC is reachable.
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.client.getLatestCheckpointSequenceNumber();
      return true;
    } catch (err) {
      logger.error({ err }, 'Sui connection check failed');
      return false;
    }
  }

  /**
   * Start listening for events.
   *
   * 1. Loads the last-seen cursor from disk.
   * 2. Replays any missed events since that cursor.
   * 3. Starts periodic polling for new events.
   */
  async start(handler: EventHandler<T>): Promise<void> {
    this._eventHandler = handler;

    // Replay historical events: from saved cursor if available,
    // otherwise from the very beginning.
    const cursor = this.loadCursor();
    logger.info(
      { cursor: cursor ?? 'none — replaying from beginning', eventType: this._eventType },
      'Replaying missed events',
    );
    await this.pollOnce(handler);

    // Start periodic polling
    this._intervalId = setInterval(async () => {
      if (this._polling) return; // Guard against overlapping polls
      try {
        await this.pollOnce(handler);
      } catch (err) {
        logger.error({ err, eventType: this._eventType }, 'Poll cycle failed');
      }
    }, DEFAULT_POLL_INTERVAL_MS);

    this._isActive = true;
    logger.info(
      { eventType: this._eventType, intervalMs: DEFAULT_POLL_INTERVAL_MS },
      'Event polling started',
    );
  }

  /**
   * Stop polling and clean up.
   */
  async unsubscribeFromEvents(): Promise<void> {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
      this._isActive = false;
      logger.info({ eventType: this._eventType }, 'Event polling stopped');
    }
  }

  /**
   * Restart polling (stop + replay + start).
   */
  async reconnect(): Promise<void> {
    await this.unsubscribeFromEvents();
    if (this._eventHandler) {
      await this.start(this._eventHandler);
    }
  }

  /** Whether polling is active. */
  get isActive(): boolean {
    return this._isActive;
  }

  // ─── Private Helpers ───────────────────────────────────────────────────────

  /**
   * Single poll cycle: query events since last cursor, process them,
   * and paginate through all available pages.
   */
  private async pollOnce(handler: EventHandler<T>): Promise<void> {
    this._polling = true;
    try {
      let cursor: EventCursor | undefined = this.loadCursor() ?? undefined;
      let processed = 0;

      while (true) {
        const page = await this.client.queryEvents({
          query: { MoveEventType: this._eventType },
          cursor,
          limit: 50,
          order: 'ascending',
        });

        for (const event of page.data) {
          await this.dispatchEvent(event, handler);
          processed++;
        }

        if (!page.hasNextPage || !page.nextCursor) {
          break;
        }
        cursor = {
          txDigest: page.nextCursor.txDigest,
          eventSeq: page.nextCursor.eventSeq,
        };
      }

      if (processed > 0) {
        logger.info({ processed, eventType: this._eventType }, 'Poll cycle processed events');
      }
    } finally {
      this._polling = false;
    }
  }

  /**
   * Validate, parse and hand off a raw Sui event to the caller's handler.
   */
  private async dispatchEvent(event: SuiEvent, handler: EventHandler<T>): Promise<void> {
    const rawId = event.id;
    if (!rawId) {
      logger.warn('Event missing id, skipping');
      return;
    }

    const eventId = `${rawId.txDigest}:${rawId.eventSeq}`;
    const parsedJson = event.parsedJson as T | undefined;

    if (!parsedJson) {
      logger.warn({ eventId }, 'Event has no parsedJson, skipping');
      return;
    }

    logger.info(
      { eventId, eventType: this._eventType },
      'Received Sui event',
    );

    try {
      await handler(parsedJson, eventId);
      // Persist cursor after successful processing
      this.saveCursor({
        txDigest: rawId.txDigest,
        eventSeq: rawId.eventSeq,
      });
    } catch (err) {
      logger.error({ err, eventId }, 'Error processing Sui event');
      // Do NOT update cursor on failure so we retry on next poll
    }
  }

  // ─── Cursor Persistence ────────────────────────────────────────────────────

  private loadCursor(): EventCursor | null {
    return getCursor(this._eventType) ?? null;
  }

  private saveCursor(cursor: EventCursor): void {
    dbSaveCursor(this._eventType, cursor);
  }
}
