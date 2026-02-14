export interface ResourceRecord {
  id: number;
  name: string;
  lang: string;
}

export const capitalizeLanguageName = (lang: string): string =>
  lang
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

export function buildLanguages<T extends ResourceRecord>(
  resources: T[],
  languageSort?: (a: string, b: string) => number
): string[] {
  const unique = Array.from(new Set(resources.map((r) => r.lang).filter(Boolean)));
  const sorted = languageSort ? unique.sort(languageSort) : unique.sort((a, b) => a.localeCompare(b));
  return ['All', ...sorted];
}

export function filterResources<T extends ResourceRecord>(resources: T[], searchTerm: string): T[] {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return resources;

  return resources.filter((resource) => {
    const name = resource.name.toLowerCase();
    const lang = resource.lang.toLowerCase();
    return name.includes(normalized) || lang.includes(normalized);
  });
}

export function groupResources<T extends ResourceRecord>(resources: T[]): Record<string, T[]> {
  return resources.reduce(
    (acc, item) => {
      (acc[item.lang] = acc[item.lang] || []).push(item);
      return acc;
    },
    {} as Record<string, T[]>
  );
}

