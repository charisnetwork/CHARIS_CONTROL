import dns from 'node:dns/promises';
import net from 'node:net';
import { AppError } from '../middlewares/error.middleware';

function isPrivateAddress(address: string): boolean {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168 ||
      a >= 224;
  }
  const lower = address.toLowerCase();
  return lower === '::1' || lower === '::' || lower.startsWith('fc') ||
    lower.startsWith('fd') || lower.startsWith('fe80:') || lower.startsWith('::ffff:127.');
}

/** Validate both the supplied URL and its current DNS resolution before outbound use. */
export async function assertSafePublicUrl(value: string, field = 'URL'): Promise<URL> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(`${field} must be an absolute HTTPS URL`, 400);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') {
    throw new AppError(`${field} must be an HTTPS URL without credentials or a custom port`, 400);
  }
  if (url.hostname === 'localhost' || isPrivateAddress(url.hostname)) {
    throw new AppError(`${field} must not target a local or private address`, 400);
  }
  try {
    const records = await dns.lookup(url.hostname, { all: true, verbatim: true });
    if (records.length === 0 || records.some((record) => isPrivateAddress(record.address))) {
      throw new AppError(`${field} must resolve only to public addresses`, 400);
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(`${field} hostname could not be resolved safely`, 400);
  }
  return url;
}
