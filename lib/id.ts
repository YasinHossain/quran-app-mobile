const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

export function generateId(): string {
  if (typeof globalThis !== 'undefined') {
    const cryptoGlobal = globalThis as typeof globalThis & { crypto?: Crypto };
    const cryptoApi = cryptoGlobal.crypto;

    if (cryptoApi) {
      if (typeof cryptoApi.randomUUID === 'function') {
        return cryptoApi.randomUUID();
      }

      if (typeof cryptoApi.getRandomValues === 'function') {
        const bytes = cryptoApi.getRandomValues(new Uint8Array(16)) as Uint8Array;
        // RFC 4122, version 4
        bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
        bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
        const hex = toHex(bytes);
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }
    }
  }

  const randomSuffix = Math.random().toString(16).slice(2);
  return `id-${Date.now()}-${randomSuffix}`;
}

