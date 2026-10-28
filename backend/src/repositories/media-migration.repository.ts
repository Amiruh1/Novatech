import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

export const IMAGE_TABLES = ['productos', 'categorias', 'banners'] as const;
export type ImageTable = typeof IMAGE_TABLES[number];
export interface ExistingImage { id: number; imagen: string | null; nombre?: string }

export function createMediaMigrationRepository(pool: Pool) {
  const tableName = (table: ImageTable) => {
    if (!IMAGE_TABLES.includes(table)) throw new Error('Invalid image table');
    return table;
  };
  return {
    async hasImageColumn(table: ImageTable): Promise<boolean> {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT COLUMN_NAME FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'imagen'`, [table]
      );
      return rows.length > 0;
    },
    async list(table: ImageTable, afterId: number): Promise<ExistingImage[]> {
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT id, imagen${table === 'categorias' ? ', nombre' : ''} FROM ${tableName(table)}
         WHERE id > ? AND ${table === 'categorias' ? "(imagen IS NULL OR imagen <> '')" : "imagen IS NOT NULL AND imagen <> ''"}
         ORDER BY id LIMIT 100`, [afterId]
      );
      return rows as ExistingImage[];
    },
    async replace(table: ImageTable, image: ExistingImage, newUrl: string): Promise<boolean> {
      const [result] = await pool.execute<ResultSetHeader>(
        `UPDATE ${tableName(table)} SET imagen = ? WHERE id = ? AND imagen <=> ?`, [newUrl, image.id, image.imagen]
      );
      return result.affectedRows === 1;
    },
  };
}

export type MediaMigrationRepository = ReturnType<typeof createMediaMigrationRepository>;
