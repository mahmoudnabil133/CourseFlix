const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Mirrors `getStudentWatermarkId` in
 * `apps/web/src/features/lessons/pages/StudentLessonPage.tsx` — the code
 * burned into a student's video watermark so a leaked recording can be
 * traced back to them. No shared package between web and api, so keep
 * both in sync by hand if this ever changes.
 */
export function deriveWatermarkId(userId: string): string {
  return userId.replace(/-/g, '').slice(0, 10).toUpperCase();
}

export function looksLikeUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/**
 * Same derivation as `deriveWatermarkId`, computed in SQL so a search
 * term can be matched against every row's watermark without loading the
 * whole table into memory first.
 *
 * `tableAlias`/`column` must be trusted, hardcoded identifiers (e.g.
 * `'user'`) — never interpolate caller input here. Both are
 * double-quoted deliberately: `user` in particular is a reserved
 * PostgreSQL keyword (the `USER`/`CURRENT_USER` pseudo-function), so an
 * unquoted `user.id` parses as that keyword followed by a dangling
 * `.id` and fails with "syntax error at or near '.'" — reproduced
 * against a live query builder alias, not a guess. Every other
 * reference to this alias in a TypeORM query builder is already quoted
 * for the same reason; this just matches that convention.
 */
export function watermarkSqlExpression(
  tableAlias: string,
  column = 'id',
): string {
  return `UPPER(LEFT(REPLACE("${tableAlias}"."${column}"::text, '-', ''), 10))`;
}
