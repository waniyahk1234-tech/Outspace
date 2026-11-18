import type Database from 'better-sqlite3';

export function maskContactDetails(input: string): { masked: string; wasMasked: boolean } {
  let masked = input;
  let wasMasked = false;

  // Mask email addresses
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  if (emailRegex.test(masked)) {
    wasMasked = true;
    masked = masked.replace(emailRegex, '[hidden]');
  }

  // Mask Pakistani phone numbers (03xx-xxxxxxx, +92 3xx xxxxxxx, 923xxxxxxxxx, 03xxxxxxxxx)
  const pkPhoneRegex = /(?:\+?92[\s.-]?|0)3\d{2}[\s.-]?\d{7}\b/g;
  if (pkPhoneRegex.test(masked)) {
    wasMasked = true;
    masked = masked.replace(pkPhoneRegex, '[hidden]');
  }

  // Mask general international / local phone numbers (7+ digits with optional separators)
  const genericPhoneRegex = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{3,4}[\s.-]?\d{3,4}\b/g;
  if (genericPhoneRegex.test(masked)) {
    wasMasked = true;
    masked = masked.replace(genericPhoneRegex, '[hidden]');
  }

  return { masked, wasMasked };
}

export function isBlockedBetween(db: Database.Database, userA: string, userB: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?) LIMIT 1`
    )
    .get(userA, userB, userB, userA);
  return Boolean(row);
}
