const isHexShort = (value: string): boolean => value.length === 4;

export const DEFAULT_FOLDER_COLOR = 'text-accent' as const;

export const FOLDER_COLORS = [
  { name: 'Teal', value: 'text-accent', swatch: '#0D9488' },
  { name: 'Brand', value: 'text-primary', swatch: '#4F46E5' },
  { name: 'Slate', value: 'text-content-secondary', swatch: '#64748B' },
  { name: 'Green', value: 'text-status-success', swatch: '#16A34A' },
  { name: 'Amber', value: 'text-status-warning', swatch: '#D97706' },
  { name: 'Red', value: 'text-status-error', swatch: '#DC2626' },
  { name: 'Blue', value: 'text-status-info', swatch: '#2563EB' },
  { name: 'Emerald', value: 'text-content-accent', swatch: '#10B981' },
] as const;

const TOKEN_TO_HEX: Record<string, string> = Object.fromEntries(
  FOLDER_COLORS.map((color) => [color.value, color.swatch])
);

export const isStyleColor = (value?: string): boolean =>
  !!value && (/^#/.test(value) || /^rgb/.test(value) || /^hsl/.test(value));

/**
 * Matches the web app's folder color tokens (e.g. "text-accent") while also allowing direct colors.
 */
export const resolveFolderAccentColor = (color?: string): string => {
  if (!color) return TOKEN_TO_HEX[DEFAULT_FOLDER_COLOR];
  if (isStyleColor(color)) return color;
  return TOKEN_TO_HEX[color] ?? TOKEN_TO_HEX[DEFAULT_FOLDER_COLOR];
};

const expandHex = (hex: string): string =>
  `#${hex
    .slice(1)
    .split('')
    .map((char) => (isHexShort(hex) ? `${char}${char}` : char))
    .join('')}`;

export const applyOpacity = (color: string, alpha: number): string => {
  if (color.startsWith('#')) {
    const normalizedHex = expandHex(color);
    const intVal = parseInt(normalizedHex.slice(1), 16);
    const r = (intVal >> 16) & 255;
    const g = (intVal >> 8) & 255;
    const b = intVal & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  if (color.startsWith('rgba(')) {
    return color.replace(/rgba\(([^)]+)\)/, (_, values) => {
      const parts = String(values).split(',').slice(0, 3).join(',').trim();
      return `rgba(${parts}, ${alpha})`;
    });
  }

  if (color.startsWith('rgb(')) {
    return color.replace(/^rgb\(([^)]+)\)/, `rgba($1, ${alpha})`);
  }

  if (color.startsWith('hsla(')) {
    return color.replace(/hsla\(([^)]+)\)/, (_, values) => {
      const parts = String(values).split(',').slice(0, 3).join(',').trim();
      return `hsla(${parts}, ${alpha})`;
    });
  }

  if (color.startsWith('hsl(')) {
    return color.replace('hsl(', 'hsla(').replace(')', `, ${alpha})`);
  }

  return TOKEN_TO_HEX[DEFAULT_FOLDER_COLOR];
};

