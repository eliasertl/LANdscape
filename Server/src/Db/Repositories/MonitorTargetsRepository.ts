import type { MonitorKind, MonitorTarget } from '@landscape/shared';
import type { Database, Row } from '../Database';

interface TargetRow extends Row {
  id: string;
  kind: string;
  label: string;
  address: string;
  owner: string;
}

/** Monitor targets registered by apps (shortcut targets come from the shortcuts table). */
export class MonitorTargetsRepository {
  constructor(private readonly db: Database) {}

  list(): MonitorTarget[] {
    return this.db.all<TargetRow>('SELECT * FROM monitor_targets ORDER BY id').map((row) => ({ id: row.id, kind: row.kind as MonitorKind, label: row.label, address: row.address, owner: row.owner }));
  }

  upsert(target: MonitorTarget): void {
    this.db.run(
      `INSERT INTO monitor_targets (id, kind, label, address, owner) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, label = excluded.label, address = excluded.address, owner = excluded.owner`,
      target.id,
      target.kind,
      target.label,
      target.address,
      target.owner,
    );
  }

  delete(id: string): boolean {
    return this.db.run('DELETE FROM monitor_targets WHERE id = ?', id).changes > 0;
  }

  deleteByOwner(owner: string): number {
    return this.db.run('DELETE FROM monitor_targets WHERE owner = ?', owner).changes;
  }
}
