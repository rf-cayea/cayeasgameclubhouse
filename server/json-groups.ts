import type { D1Binding } from './database';

/** Read independent JSON aggregates in one database round trip. Scalar
 * subqueries avoid the hosted SQLite limit on UNION/compound SELECT terms. */
export async function readJsonGroups<T>(binding: D1Binding, groups: { sql: string; values: unknown[] }[]): Promise<T[]> {
  if (!groups.length) return [];
  const sql = `SELECT ${groups.map((group, index) => `(${group.sql}) AS group_${index}`).join(',')}`;
  const row = await binding.prepare(sql).bind(...groups.flatMap(group => group.values)).first<Record<string, string>>();
  return groups.flatMap((_, index) => {
    const values: unknown = JSON.parse(row?.[`group_${index}`] ?? '[]');
    if (!Array.isArray(values)) throw new Error('The database returned an invalid JSON aggregate.');
    return values as T[];
  });
}
