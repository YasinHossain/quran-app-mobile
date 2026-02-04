/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Keep names aligned with the web app’s semantic tokens so UI code can stay consistent.
        background: { DEFAULT: '#F7F9F9', dark: '#0F172A' },
        surface: { DEFAULT: '#FFFFFF', dark: '#1E293B' },
        'surface-navigation': { DEFAULT: '#FFFFFF', dark: '#182333' },
        foreground: { DEFAULT: '#374151', dark: '#E7E5E4' },
        muted: { DEFAULT: '#6B7280', dark: '#94A3B8' },
        accent: { DEFAULT: '#0D9488', dark: '#14B8A6' },
        'accent-hover': { DEFAULT: '#0F766E', dark: '#0D9488' },
        interactive: { DEFAULT: '#F3F4F6', dark: '#334155' },
        'interactive-hover': { DEFAULT: '#E5E7EB', dark: '#475569' },
        border: { DEFAULT: '#E5E7EB', dark: '#334155' },
        error: { DEFAULT: '#DC2626', dark: '#F87171' },
        'on-accent': { DEFAULT: '#FFFFFF', dark: '#FFFFFF' },

        'number-badge': { DEFAULT: '#F3F4F6', dark: '#334155' },

        'content-primary': { DEFAULT: '#374151', dark: '#E7E5E4' },
        'content-secondary': { DEFAULT: '#6B7280', dark: '#94A3B8' },
      },
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '24px',
      },
    },
  },
  plugins: [],
};
