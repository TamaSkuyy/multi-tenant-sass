#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/04dcf3cbf6c994aa67976371b8212a304897224189618245bb803842fc5a38ce/contract';
import endContract from '../../snapshots/04dcf3cbf6c994aa67976371b8212a304897224189618245bb803842fc5a38ce/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/8390746ee68d6604909d2e7fe42f00e588fcccd4f298fa903f648c89013c73c7/contract';
import startContract from '../../snapshots/8390746ee68d6604909d2e7fe42f00e588fcccd4f298fa903f648c89013c73c7/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'Tenant',
        column: col('config', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'User',
        column: col('passwordHash', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
