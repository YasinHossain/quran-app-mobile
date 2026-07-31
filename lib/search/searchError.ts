export const ONLINE_SEARCH_REQUIRED_MESSAGE =
  'Search is available online. Connect to the internet to see results.';

export function getSearchErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const isNetworkFailure =
    error instanceof TypeError ||
    /network request failed|failed to fetch|networkerror|internet connection|offline/i.test(message);

  return isNetworkFailure ? ONLINE_SEARCH_REQUIRED_MESSAGE : message;
}
