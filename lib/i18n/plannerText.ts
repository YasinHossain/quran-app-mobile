import chaptersData from '../../src/data/chapters.en.json';

type PlannerTextI18n = {
  t: (key: string, values?: Record<string, string | number | undefined>) => string;
  formatNumber: (value: number) => string;
  localizeDigits: (value: string) => string;
};

type ChapterNameRecord = { id: number; name_simple?: string; translated_name?: { name?: string } };

const CHAPTERS: ChapterNameRecord[] = Array.isArray(chaptersData)
  ? (chaptersData as ChapterNameRecord[])
  : ((chaptersData as { chapters?: ChapterNameRecord[] }).chapters ?? []);

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function localizeSurahNames(value: string, i18n: PlannerTextI18n): string {
  let text = value;
  const chapters = CHAPTERS
    .filter((chapter) => typeof chapter.id === 'number')
    .slice()
    .sort((left, right) => (right.name_simple?.length ?? 0) - (left.name_simple?.length ?? 0));

  for (const chapter of chapters) {
    const localizedName = i18n.t(`surah_names.${chapter.id}`, {
      fallback: chapter.name_simple ?? `${i18n.t('surah_tab')} ${chapter.id}`,
    });
    const aliases = [chapter.name_simple, chapter.translated_name?.name].filter(
      (alias): alias is string => Boolean(alias && alias.trim())
    );

    for (const alias of aliases) {
      text = text.replace(new RegExp(`\\b${escapeRegex(alias)}\\b`, 'g'), localizedName);
    }
  }

  return text;
}

export function localizePlannerText(value: string, i18n: PlannerTextI18n): string {
  let text = localizeSurahNames(value, i18n);

  text = text.replace(/\bPages?\s+(\d+)(?:-(\d+))?/gi, (_match, start, end) => {
    const startNumber = i18n.formatNumber(Number(start));
    if (end !== undefined) {
      return `${i18n.t('pages')} ${startNumber}-${i18n.formatNumber(Number(end))}`;
    }
    return i18n.t('page_number_label', { number: Number(start) });
  });

  text = text.replace(/\bJuz\s+(\d+)(?:-(\d+))?/gi, (_match, start, end) => {
    if (end !== undefined) {
      return `${i18n.t('juz_tab')} ${i18n.formatNumber(Number(start))}-${i18n.formatNumber(Number(end))}`;
    }
    return i18n.t('juz_number', { number: Number(start) });
  });

  text = text.replace(/\b(\d+)\s+Verses?\b/gi, (_match, count) =>
    `${i18n.formatNumber(Number(count))} ${i18n.t('verses')}`
  );

  text = text.replace(/\bRemaining\s+(.+)$/i, (_match, rest) =>
    i18n.t('planner_remaining_summary', { value: i18n.localizeDigits(String(rest)) })
  );
  text = text.replace(/\bEnds at\s+(.+)$/i, (_match, rest) =>
    i18n.t('planner_ends_at_summary', { value: i18n.localizeDigits(String(rest)) })
  );
  text = text.replace(/\bDay\s+(\d+)\s+of\s+(\d+)\b/i, (_match, day, total) =>
    i18n.t('planner_day_of_total', { day: Number(day), total: Number(total) })
  );
  text = text.replace(/\bCompleted in\s+(\d+)\s+days?\b/i, (_match, days) => {
    const count = Number(days);
    return i18n.t(count === 1 ? 'planner_completed_in_one_day' : 'planner_completed_in_days', {
      days: count,
    });
  });
  text = text.replace(/\b(\d+)\s+days?\b/gi, (_match, count) => {
    const value = Number(count);
    return i18n.t(value === 1 ? 'planner_one_day' : 'planner_n_days', { count: value });
  });
  text = text.replace(/\s+to\s+/gi, ` ${i18n.t('planner_range_to')} `);
  text = text.replace(/\bDue today\b/i, i18n.t('planner_due_today'));
  text = text.replace(/\bCompleted\b/i, i18n.t('completed'));

  return i18n.localizeDigits(text);
}
