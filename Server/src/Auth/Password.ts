import bcrypt from 'bcryptjs';
import { timingSafeEqual } from 'node:crypto';

/**
 * Verifies a login attempt. Always runs the bcrypt comparison, even when the
 * username does not match, so response time does not reveal which part failed.
 */
export async function verifyCredentials(
  username: string,
  password: string,
  expectedUsername: string,
  passwordHash: string,
): Promise<boolean> {
  const a = Buffer.from(username, 'utf8');
  const b = Buffer.from(expectedUsername, 'utf8');
  const usernameMatches = a.length === b.length && timingSafeEqual(a, b);
  const passwordMatches = await bcrypt.compare(password, passwordHash);
  return usernameMatches && passwordMatches;
}

export async function hashPassword(password: string, cost = 10): Promise<string> {
  return bcrypt.hash(password, cost);
}
