/**
 * SQLite Database — Single source of truth for all relayer state.
 *
 * Replaces in-memory Maps, cursor JSON files, and VAA state files.
 * Uses better-sqlite3 (synchronous, fast, zero-config).
 */

import Database from 'better-sqlite3';
import { logger } from './logger.js';
import type {
  SealSession,
  PresignEntry,
  PresignPoolStats,
  EventCursor,
} from './types.js';

let db: Database.Database;

// ─── Init ──────────────────────────────────────────────────────────────────

export function initDb(dbPath: string = './relayer.db'): Database.Database {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id       TEXT PRIMARY KEY,
      solana_wallet    TEXT NOT NULL,
      source_chain     TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'awaiting_payment',
      created_at       INTEGER NOT NULL,
      dwallet_id       TEXT,
      deposit_address  TEXT,
      dwallet_pubkey   BLOB,
      payment_tx_sig   TEXT,
      payment_verified INTEGER,
      nft_name         TEXT,
      collection_name  TEXT,
      reborn_mint      TEXT,
      reborn_name      TEXT,
      reborn_image     TEXT,
      error            TEXT,
      updated_at       INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_deposit ON sessions(deposit_address);
    CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);

    CREATE TABLE IF NOT EXISTS presigns (
      object_id      TEXT PRIMARY KEY,
      presign_id     TEXT NOT NULL,
      presign_bcs    BLOB NOT NULL,
      status         TEXT NOT NULL DEFAULT 'AVAILABLE',
      allocated_at   INTEGER,
      allocated_for  TEXT,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_presigns_status ON presigns(status);

    CREATE TABLE IF NOT EXISTS cursors (
      event_type  TEXT PRIMARY KEY,
      tx_digest   TEXT NOT NULL,
      event_seq   TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vaa_sequences (
      emitter_key    TEXT PRIMARY KEY,
      last_sequence  TEXT NOT NULL,
      updated_at     INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS realms (
      realm_address      TEXT PRIMARY KEY,
      collection_name    TEXT NOT NULL,
      realm_name         TEXT NOT NULL,
      community_mint     TEXT NOT NULL,
      governance_address TEXT NOT NULL,
      treasury_address   TEXT NOT NULL,
      collection_asset   TEXT,
      created_at         INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_realms_collection ON realms(collection_name);
  `);

  // Migration: add centralized flow columns (idempotent)
  const cols = db.pragma('table_info(sessions)') as { name: string }[];
  const colNames = new Set(cols.map(c => c.name));
  if (!colNames.has('nft_contract')) {
    db.exec('ALTER TABLE sessions ADD COLUMN nft_contract TEXT');
  }
  if (!colNames.has('token_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN token_id TEXT');
  }
  if (!colNames.has('token_uri')) {
    db.exec('ALTER TABLE sessions ADD COLUMN token_uri TEXT');
  }
  if (!colNames.has('deposit_tx_hash')) {
    db.exec('ALTER TABLE sessions ADD COLUMN deposit_tx_hash TEXT');
  }
  if (!colNames.has('nft_name')) {
    db.exec('ALTER TABLE sessions ADD COLUMN nft_name TEXT');
  }
  if (!colNames.has('collection_name')) {
    db.exec('ALTER TABLE sessions ADD COLUMN collection_name TEXT');
  }

  // Migration: add unique index on payment_tx_sig to prevent replay attacks
  try {
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_payment_tx ON sessions(payment_tx_sig) WHERE payment_tx_sig IS NOT NULL');
  } catch {
    // Index may already exist
  }

  logger.info({ dbPath }, 'SQLite database initialized');
  return db;
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized — call initDb() first');
  return db;
}

// ─── Sessions ──────────────────────────────────────────────────────────────

/** Check if a payment tx signature has already been used (replay protection). */
export function isPaymentTxUsed(paymentTxSignature: string): boolean {
  const row = getDb().prepare(
    'SELECT 1 FROM sessions WHERE payment_tx_sig = ? LIMIT 1',
  ).get(paymentTxSignature);
  return !!row;
}

export function createSession(session: SealSession): void {
  const now = Date.now();
  getDb().prepare(`
    INSERT INTO sessions (session_id, solana_wallet, source_chain, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(session.sessionId, session.solanaWallet, session.sourceChain, session.status, session.createdAt, now);
}

export function getSession(sessionId: string): SealSession | undefined {
  const row = getDb().prepare('SELECT * FROM sessions WHERE session_id = ?').get(sessionId) as SessionRow | undefined;
  return row ? rowToSession(row) : undefined;
}

export function getSessionByDeposit(depositAddress: string): SealSession | undefined {
  // Try exact match first, then with/without 0x prefix (event vs DB format normalization)
  let row = getDb().prepare('SELECT * FROM sessions WHERE deposit_address = ? ORDER BY created_at DESC LIMIT 1').get(depositAddress) as SessionRow | undefined;
  if (!row && !depositAddress.startsWith('0x')) {
    row = getDb().prepare('SELECT * FROM sessions WHERE deposit_address = ? ORDER BY created_at DESC LIMIT 1').get('0x' + depositAddress) as SessionRow | undefined;
  }
  if (!row && depositAddress.startsWith('0x')) {
    row = getDb().prepare('SELECT * FROM sessions WHERE deposit_address = ? ORDER BY created_at DESC LIMIT 1').get(depositAddress.slice(2)) as SessionRow | undefined;
  }
  return row ? rowToSession(row) : undefined;
}

export function getCompletedSessionsByWallet(solanaWallet: string): SealSession[] {
  const rows = getDb().prepare(
    `SELECT * FROM sessions WHERE solana_wallet = ? AND status = 'complete' AND reborn_mint IS NOT NULL ORDER BY updated_at DESC`
  ).all(solanaWallet) as SessionRow[];
  return rows.map(rowToSession);
}

export function updateSession(sessionId: string, fields: Partial<SessionRow>): void {
  const sets: string[] = [];
  const values: unknown[] = [];

  if (fields.status !== undefined) { sets.push('status = ?'); values.push(fields.status); }
  if (fields.dwallet_id !== undefined) { sets.push('dwallet_id = ?'); values.push(fields.dwallet_id); }
  if (fields.deposit_address !== undefined) { sets.push('deposit_address = ?'); values.push(fields.deposit_address); }
  if (fields.dwallet_pubkey !== undefined) { sets.push('dwallet_pubkey = ?'); values.push(fields.dwallet_pubkey); }
  if (fields.payment_tx_sig !== undefined) { sets.push('payment_tx_sig = ?'); values.push(fields.payment_tx_sig); }
  if (fields.payment_verified !== undefined) { sets.push('payment_verified = ?'); values.push(fields.payment_verified); }
  if (fields.reborn_mint !== undefined) { sets.push('reborn_mint = ?'); values.push(fields.reborn_mint); }
  if (fields.reborn_name !== undefined) { sets.push('reborn_name = ?'); values.push(fields.reborn_name); }
  if (fields.reborn_image !== undefined) { sets.push('reborn_image = ?'); values.push(fields.reborn_image); }
  if (fields.nft_contract !== undefined) { sets.push('nft_contract = ?'); values.push(fields.nft_contract); }
  if (fields.token_id !== undefined) { sets.push('token_id = ?'); values.push(fields.token_id); }
  if (fields.token_uri !== undefined) { sets.push('token_uri = ?'); values.push(fields.token_uri); }
  if (fields.deposit_tx_hash !== undefined) { sets.push('deposit_tx_hash = ?'); values.push(fields.deposit_tx_hash); }
  if (fields.nft_name !== undefined) { sets.push('nft_name = ?'); values.push(fields.nft_name); }
  if (fields.collection_name !== undefined) { sets.push('collection_name = ?'); values.push(fields.collection_name); }
  if (fields.error !== undefined) { sets.push('error = ?'); values.push(fields.error); }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(sessionId);

  getDb().prepare(`UPDATE sessions SET ${sets.join(', ')} WHERE session_id = ?`).run(...values);
}

/**
 * Atomically transition session status with a WHERE guard.
 * Returns true if the update matched (status was expectedStatus), false if race lost.
 * This prevents TOCTOU: two concurrent requests both checking status then both updating.
 */
export function atomicStatusTransition(
  sessionId: string,
  expectedStatus: string,
  newStatus: string,
  extraFields?: Partial<SessionRow>,
): boolean {
  const sets: string[] = ['status = ?'];
  const values: unknown[] = [newStatus];

  if (extraFields) {
    if (extraFields.payment_tx_sig !== undefined) { sets.push('payment_tx_sig = ?'); values.push(extraFields.payment_tx_sig); }
    if (extraFields.payment_verified !== undefined) { sets.push('payment_verified = ?'); values.push(extraFields.payment_verified); }
    if (extraFields.nft_contract !== undefined) { sets.push('nft_contract = ?'); values.push(extraFields.nft_contract); }
    if (extraFields.token_id !== undefined) { sets.push('token_id = ?'); values.push(extraFields.token_id); }
    if (extraFields.deposit_tx_hash !== undefined) { sets.push('deposit_tx_hash = ?'); values.push(extraFields.deposit_tx_hash); }
    if (extraFields.dwallet_id !== undefined) { sets.push('dwallet_id = ?'); values.push(extraFields.dwallet_id); }
    if (extraFields.deposit_address !== undefined) { sets.push('deposit_address = ?'); values.push(extraFields.deposit_address); }
    if (extraFields.dwallet_pubkey !== undefined) { sets.push('dwallet_pubkey = ?'); values.push(extraFields.dwallet_pubkey); }
    if (extraFields.error !== undefined) { sets.push('error = ?'); values.push(extraFields.error); }
  }

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(sessionId);
  values.push(expectedStatus);

  const result = getDb().prepare(
    `UPDATE sessions SET ${sets.join(', ')} WHERE session_id = ? AND status = ?`
  ).run(...values);

  return result.changes > 0;
}

export function updateSessionByDeposit(depositAddress: string, status: string, error?: string): void {
  // Normalize: try with and without 0x prefix to match DB format
  const variants = [depositAddress];
  if (!depositAddress.startsWith('0x')) variants.push('0x' + depositAddress);
  else variants.push(depositAddress.slice(2));

  const now = Date.now();
  for (const addr of variants) {
    const result = error !== undefined
      ? getDb().prepare('UPDATE sessions SET status = ?, error = ?, updated_at = ? WHERE deposit_address = ?')
          .run(status, error, now, addr)
      : getDb().prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE deposit_address = ?')
          .run(status, now, addr);
    if (result.changes > 0) return;
  }
}

interface SessionRow {
  session_id: string;
  solana_wallet: string;
  source_chain: string;
  status: string;
  created_at: number;
  dwallet_id: string | null;
  deposit_address: string | null;
  dwallet_pubkey: Buffer | null;
  payment_tx_sig: string | null;
  payment_verified: number | null;
  nft_contract: string | null;
  token_id: string | null;
  token_uri: string | null;
  deposit_tx_hash: string | null;
  nft_name: string | null;
  collection_name: string | null;
  reborn_mint: string | null;
  reborn_name: string | null;
  reborn_image: string | null;
  error: string | null;
  updated_at: number;
}

function rowToSession(row: SessionRow): SealSession {
  const session: SealSession = {
    sessionId: row.session_id,
    solanaWallet: row.solana_wallet,
    sourceChain: row.source_chain,
    status: row.status as SealSession['status'],
    createdAt: row.created_at,
  };
  if (row.dwallet_id) session.dwalletId = row.dwallet_id;
  if (row.deposit_address) session.depositAddress = row.deposit_address;
  if (row.dwallet_pubkey) session.dwalletPubkey = new Uint8Array(row.dwallet_pubkey);
  if (row.payment_tx_sig) session.paymentTxSignature = row.payment_tx_sig;
  if (row.payment_verified) session.paymentVerifiedAt = row.payment_verified;
  if (row.nft_contract) session.nftContract = row.nft_contract;
  if (row.token_id) session.tokenId = row.token_id;
  if (row.token_uri) session.tokenUri = row.token_uri;
  if (row.deposit_tx_hash) session.depositTxHash = row.deposit_tx_hash;
  if (row.nft_name) session.nftName = row.nft_name;
  if (row.collection_name) session.collectionName = row.collection_name;
  if (row.reborn_mint) {
    session.rebornNFT = {
      mint: row.reborn_mint,
      name: row.reborn_name ?? '',
      image: row.reborn_image ?? '',
    };
  }
  if (row.error) session.error = row.error;
  return session;
}

// ─── Session Expiration ─────────────────────────────────────────────────────

/** Expire stale sessions older than maxAgeSeconds that are still in intermediate states. */
export function expireOldSessions(maxAgeSeconds: number): number {
  const cutoff = Date.now() - (maxAgeSeconds * 1000);
  const result = getDb().prepare(`
    UPDATE sessions SET status = 'error', error = 'Session expired', updated_at = ?
    WHERE status IN ('awaiting_payment', 'payment_confirmed', 'creating_dwallet',
                     'waiting_deposit', 'verifying_deposit', 'uploading_metadata',
                     'creating_seal', 'signing', 'minting')
    AND created_at < ?
  `).run(Date.now(), cutoff);
  return result.changes;
}

// ─── Realms ────────────────────────────────────────────────────────────────

export interface RealmRow {
  realm_address: string;
  collection_name: string;
  realm_name: string;
  community_mint: string;
  governance_address: string;
  treasury_address: string;
  collection_asset: string | null;
  created_at: number;
}

export function insertRealm(realm: Omit<RealmRow, 'collection_asset'>): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO realms
      (realm_address, collection_name, realm_name, community_mint, governance_address, treasury_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    realm.realm_address, realm.collection_name, realm.realm_name,
    realm.community_mint, realm.governance_address, realm.treasury_address, realm.created_at,
  );
}

export function getAllRealms(): RealmRow[] {
  return getDb().prepare('SELECT * FROM realms ORDER BY created_at DESC').all() as RealmRow[];
}

export function getRealmByAddress(realmAddress: string): RealmRow | undefined {
  return getDb().prepare('SELECT * FROM realms WHERE realm_address = ?').get(realmAddress) as RealmRow | undefined;
}

export function getRealmByCollection(collectionName: string): RealmRow | undefined {
  return getDb().prepare('SELECT * FROM realms WHERE collection_name = ? LIMIT 1').get(collectionName) as RealmRow | undefined;
}

export function updateRealmCollectionAsset(realmAddress: string, collectionAsset: string): void {
  getDb().prepare('UPDATE realms SET collection_asset = ? WHERE realm_address = ?').run(collectionAsset, realmAddress);
}

// ─── Presigns ──────────────────────────────────────────────────────────────

export function addPresign(objectId: string, presignId: string, presignBcs: Uint8Array): void {
  getDb().prepare(`
    INSERT OR REPLACE INTO presigns (object_id, presign_id, presign_bcs, status, created_at)
    VALUES (?, ?, ?, 'AVAILABLE', ?)
  `).run(objectId, presignId, Buffer.from(presignBcs), Date.now());
}

export function allocatePresign(vaaHash: string): PresignEntry | null {
  // Release expired first
  releaseExpiredPresigns(5 * 60 * 1000);

  const d = getDb();
  const now = Date.now();

  // Atomic allocation: UPDATE + RETURNING in a single statement prevents race conditions
  // where two concurrent callers could SELECT the same row.
  const row = d.prepare(`
    UPDATE presigns SET status = 'ALLOCATED', allocated_at = ?, allocated_for = ?
    WHERE object_id = (
      SELECT object_id FROM presigns WHERE status = 'AVAILABLE' ORDER BY created_at ASC LIMIT 1
    )
    RETURNING object_id, presign_id, presign_bcs, status, allocated_at, allocated_for, created_at
  `).get(now, vaaHash) as PresignRow | undefined;

  if (!row) return null;

  return {
    objectId: row.object_id,
    presignId: row.presign_id,
    presignBcs: new Uint8Array(row.presign_bcs),
    status: 'ALLOCATED',
    allocatedAt: now,
    allocatedFor: vaaHash,
  };
}

export function markPresignUsed(objectId: string): void {
  getDb().prepare(`UPDATE presigns SET status = 'USED' WHERE object_id = ?`).run(objectId);
}

export function releaseExpiredPresigns(ttlMs: number): number {
  const cutoff = Date.now() - ttlMs;
  const result = getDb().prepare(
    `UPDATE presigns SET status = 'AVAILABLE', allocated_at = NULL, allocated_for = NULL
     WHERE status = 'ALLOCATED' AND allocated_at < ?`,
  ).run(cutoff);
  return result.changes;
}

export function getPresignStats(): PresignPoolStats {
  const d = getDb();
  const available = (d.prepare(`SELECT COUNT(*) as c FROM presigns WHERE status = 'AVAILABLE'`).get() as { c: number }).c;
  const allocated = (d.prepare(`SELECT COUNT(*) as c FROM presigns WHERE status = 'ALLOCATED'`).get() as { c: number }).c;
  const used = (d.prepare(`SELECT COUNT(*) as c FROM presigns WHERE status = 'USED'`).get() as { c: number }).c;
  return { available, allocated, used, total: available + allocated + used };
}

export function getAvailablePresignCount(): number {
  return (getDb().prepare(`SELECT COUNT(*) as c FROM presigns WHERE status = 'AVAILABLE'`).get() as { c: number }).c;
}

interface PresignRow {
  object_id: string;
  presign_id: string;
  presign_bcs: Buffer;
  status: string;
  allocated_at: number | null;
  allocated_for: string | null;
  created_at: number;
}

// ─── Cursors ───────────────────────────────────────────────────────────────

export function getCursor(eventType: string): EventCursor | undefined {
  const row = getDb().prepare('SELECT tx_digest, event_seq FROM cursors WHERE event_type = ?').get(eventType) as { tx_digest: string; event_seq: string } | undefined;
  return row ? { txDigest: row.tx_digest, eventSeq: row.event_seq } : undefined;
}

export function saveCursor(eventType: string, cursor: EventCursor): void {
  getDb().prepare(`
    INSERT INTO cursors (event_type, tx_digest, event_seq, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(event_type) DO UPDATE SET tx_digest = excluded.tx_digest, event_seq = excluded.event_seq, updated_at = excluded.updated_at
  `).run(eventType, cursor.txDigest, cursor.eventSeq, Date.now());
}

// ─── VAA Sequences ─────────────────────────────────────────────────────────

export function getVaaSequence(emitterKey: string): string | undefined {
  const row = getDb().prepare('SELECT last_sequence FROM vaa_sequences WHERE emitter_key = ?').get(emitterKey) as { last_sequence: string } | undefined;
  return row?.last_sequence;
}

export function saveVaaSequence(emitterKey: string, sequence: string): void {
  getDb().prepare(`
    INSERT INTO vaa_sequences (emitter_key, last_sequence, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(emitter_key) DO UPDATE SET last_sequence = excluded.last_sequence, updated_at = excluded.updated_at
  `).run(emitterKey, sequence, Date.now());
}

export function getAllVaaSequences(): Map<string, string> {
  const rows = getDb().prepare('SELECT emitter_key, last_sequence FROM vaa_sequences').all() as { emitter_key: string; last_sequence: string }[];
  const map = new Map<string, string>();
  for (const row of rows) {
    map.set(row.emitter_key, row.last_sequence);
  }
  return map;
}
