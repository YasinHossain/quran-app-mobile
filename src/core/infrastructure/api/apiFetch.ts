const API_BASE_URL = 'https://api.quran.com/api/v4/';

export async function apiFetch<T>(
  endpointOrUrl: string,
  params: Record<string, string> = {},
  errorMessage = 'Request failed'
): Promise<T> {
  const url = endpointOrUrl.startsWith('http')
    ? new URL(endpointOrUrl)
    : new URL(endpointOrUrl.replace(/^\/+/, ''), API_BASE_URL);

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === 'string' && value.length > 0) {
      url.searchParams.set(key, value);
    }
  });

  const response = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`${errorMessage} (${response.status})`);
  }

  return (await response.json()) as T;
}

