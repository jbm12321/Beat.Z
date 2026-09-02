import { createVst3BuildJobsTable } from '../../../../db/schema.ts';
import type { NativeBuildRequestV1 } from '../contract.ts';
import {
  STALE_BUILD_ERROR,
  STALE_BUILD_TIMEOUT_MS,
  type BuildRepository,
  type Vst3BuildOutcome,
  type Vst3BuildRecord,
  type Vst3BuildStatus,
} from './repository.ts';

interface JobRow {
  id: string;
  status: Vst3BuildStatus;
  request_json: string;
  result_json: string | null;
  error_text: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

function fromRow(row: JobRow): Vst3BuildRecord {
  const result = row.result_json ? JSON.parse(row.result_json) as Extract<Vst3BuildOutcome, { status: 'ready' }> : undefined;
  return {
    id: row.id,
    status: row.status,
    request: JSON.parse(row.request_json) as NativeBuildRequestV1,
    artifact: result?.artifact,
    evidence: result?.evidence,
    error: row.error_text ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    finishedAt: row.finished_at ?? undefined,
  };
}

export class D1BuildRepository implements BuildRepository {
  constructor(private readonly database: D1Database) {}

  async #ready() {
    await this.database.prepare(createVst3BuildJobsTable).run();
  }

  async insert(record: Vst3BuildRecord) {
    await this.#ready();
    await this.database.prepare(`
      INSERT INTO vst3_build_jobs (id, status, request_json, created_at)
      VALUES (?, 'queued', ?, ?)
    `).bind(record.id, JSON.stringify(record.request), record.createdAt).run();
  }

  async get(id: string) {
    await this.#ready();
    const row = await this.database.prepare(`
      SELECT id, status, request_json, result_json, error_text, created_at, started_at, finished_at
      FROM vst3_build_jobs WHERE id = ?
    `).bind(id).first<JobRow>();
    return row ? fromRow(row) : null;
  }

  async claimOldest(now: string) {
    await this.#ready();
    const staleBefore = new Date(Date.parse(now) - STALE_BUILD_TIMEOUT_MS).toISOString();
    await this.database.prepare(`
      UPDATE vst3_build_jobs
      SET status = 'failed', error_text = ?, finished_at = ?
      WHERE status = 'building'
        AND (started_at IS NULL OR started_at < ?)
    `).bind(STALE_BUILD_ERROR, now, staleBefore).run();
    const row = await this.database.prepare(`
      UPDATE vst3_build_jobs
      SET status = 'building', started_at = ?
      WHERE id = (
        SELECT id FROM vst3_build_jobs
        WHERE status = 'queued'
          AND NOT EXISTS (SELECT 1 FROM vst3_build_jobs WHERE status = 'building')
        ORDER BY created_at ASC LIMIT 1
      )
      RETURNING id, status, request_json, result_json, error_text, created_at, started_at, finished_at
    `).bind(now).first<JobRow>();
    return row ? fromRow(row) : null;
  }

  async report(id: string, outcome: Vst3BuildOutcome, now: string) {
    await this.#ready();
    const row = await this.database.prepare(`
      UPDATE vst3_build_jobs
      SET status = ?, result_json = ?, error_text = ?, finished_at = ?
      WHERE id = ? AND status = 'building'
      RETURNING id, status, request_json, result_json, error_text, created_at, started_at, finished_at
    `).bind(
      outcome.status,
      outcome.status === 'ready' ? JSON.stringify(outcome) : null,
      outcome.status === 'failed' ? outcome.error : null,
      now,
      id,
    ).first<JobRow>();
    return row ? fromRow(row) : null;
  }
}
