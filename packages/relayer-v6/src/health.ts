/**
 * Health check endpoint for the relayer
 */

import http from 'http';
import { getConfig } from './config.js';
import { logger } from './logger.js';
import type { HealthStatus } from './types.js';

/**
 * Health check server
 */
export class HealthServer {
  private server: http.Server | null = null;
  private status: HealthStatus;
  
  constructor() {
    this.status = {
      status: 'down',
      timestamp: Date.now(),
      suiConnected: false,
      solanaConnected: false,
      eventsProcessed: 0,
      eventsFailed: 0,
    };
  }

  /**
   * Start the health check server
   */
  start(): void {
    const config = getConfig();
    
    this.server = http.createServer(async (req, res) => {
      // Only handle /health endpoint
      if (req.url !== '/health') {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not Found' }));
        return;
      }

      // Update timestamp
      this.status.timestamp = Date.now();

      // Set CORS headers
      res.setHeader('Content-Type', 'application/json');

      // Determine overall status
      if (!this.status.suiConnected || !this.status.solanaConnected) {
        this.status.status = 'down';
      } else if (this.status.eventsFailed > this.status.eventsProcessed) {
        this.status.status = 'degraded';
      } else {
        this.status.status = 'healthy';
      }

      // Return minimal info — don't leak internal counters to unauthenticated callers
      res.writeHead(200);
      res.end(JSON.stringify({
        status: this.status.status,
        timestamp: this.status.timestamp,
      }));
    });

    this.server.listen(config.healthPort, () => {
      logger.info({ port: config.healthPort }, 'Health check server started');
    });

    this.server.on('error', (error) => {
      logger.error({ error }, 'Health check server error');
    });
  }

  /**
   * Stop the health check server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      logger.info('Health check server stopped');
    }
  }

  /**
   * Update Sui connection status
   */
  setSuiConnected(connected: boolean): void {
    this.status.suiConnected = connected;
  }

  /**
   * Update Solana connection status
   */
  setSolanaConnected(connected: boolean): void {
    this.status.solanaConnected = connected;
  }

  /**
   * Increment events processed counter
   */
  incrementProcessed(): void {
    this.status.eventsProcessed++;
  }

  /**
   * Increment events failed counter
   */
  incrementFailed(): void {
    this.status.eventsFailed++;
  }

  /**
   * Update last processed event ID
   */
  setLastProcessedEvent(eventId: string): void {
    this.status.lastProcessedEvent = eventId;
  }

  /**
   * Get current status
   */
  getStatus(): HealthStatus {
    return { ...this.status };
  }
}
