#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/4bf484be671bbec93b3bd0fbf09c874bbc1c6cf95ae6ea60df8f0e3ea477d30f/contract';
import startContract from '../../snapshots/4bf484be671bbec93b3bd0fbf09c874bbc1c6cf95ae6ea60df8f0e3ea477d30f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/8390746ee68d6604909d2e7fe42f00e588fcccd4f298fa903f648c89013c73c7/contract';
import endContract from '../../snapshots/8390746ee68d6604909d2e7fe42f00e588fcccd4f298fa903f648c89013c73c7/contract.json' with { type: 'json' };
import {
  Migration,
  MigrationCLI,
  col,
  fn,
  lit,
  primaryKey,
} from '@prisma/orm-postgres/migration';

/**
 * Fase 0 — relasi/FK + field baru.
 *
 * Catatan untuk Post.slug & Post.updatedAt: planner merender pola
 * addColumn(nullable) → dataTransform(backfill) → setNotNull karena kolomnya
 * NOT NULL tanpa default. Backfill itu tidak diperlukan di sini: kedua kolom
 * belum pernah ada, jadi tidak mungkin ada baris lama bernilai NULL, dan tabel
 * Post memang kosong di semua environment (belum ada kode yang menulis post).
 * Jadi kolomnya ditambahkan langsung sebagai NOT NULL.
 *
 * Kalau di masa depan butuh backfill sungguhan, jangan hapus dataTransform-nya:
 * isi closure `check`/`run` dengan query-plan dari
 * `postgres<End>({ contractJson: endContract })` (lihat skill prisma-8,
 * references/migrations.md § Fill a placeholder), lalu self-emit.
 */
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'User',
        columns: [
          col('createdAt', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'Post',
        column: col('published', 'bool', {
          notNull: true,
          default: lit(false),
          codecRef: { codecId: 'pg/bool@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Tenant',
        column: col('avatarUrl', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Tenant',
        column: col('ownerId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Post',
        column: col('slug', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'Post',
        column: col('updatedAt', 'timestamp(3)', {
          notNull: true,
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'Post',
        index: 'Post_tenantSlug_slug_key',
        columns: ['tenantSlug', 'slug'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'Template',
        index: 'Template_name_key',
        columns: ['name'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'User',
        index: 'User_email_key',
        columns: ['email'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Post',
        foreignKey: {
          name: 'Post_tenantSlug_fkey',
          columns: ['tenantSlug'],
          references: { schema: 'public', table: 'Tenant', columns: ['slug'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Tenant',
        foreignKey: {
          name: 'Tenant_templateId_fkey',
          columns: ['templateId'],
          references: { schema: 'public', table: 'Template', columns: ['id'] },
          onDelete: 'restrict',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'Tenant',
        foreignKey: {
          name: 'Tenant_ownerId_fkey',
          columns: ['ownerId'],
          references: { schema: 'public', table: 'User', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
