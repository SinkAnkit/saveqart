/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens backed by CSS variables (see index.css).
        // Coherent dark mode is a pure variable swap on the .dark class.
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        card: {
          DEFAULT: 'var(--card)',
          foreground: 'var(--card-foreground)',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        border: 'var(--border)',
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          foreground: 'var(--primary-foreground)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          hover: 'var(--secondary-hover)',
          foreground: 'var(--secondary-foreground)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          foreground: 'var(--accent-foreground)',
        },
        ring: 'var(--ring)',
        // Soft tint blocks
        'tint-primary': 'var(--tint-primary)',
        'tint-secondary': 'var(--tint-secondary)',
        'tint-accent': 'var(--tint-accent)',
        'tint-neutral': 'var(--tint-neutral)',
      },
      fontFamily: {
        sans: ['Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      letterSpacing: {
        tightest: '-0.03em',
      },
      borderRadius: {
        none: '0',
        sm: '0.25rem',
        DEFAULT: '0.375rem',
        md: '0.375rem', // 6px
        lg: '0.5rem', // 8px
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      boxShadow: {
        none: 'none',
        soft: 'none',
        sm: 'none',
        DEFAULT: 'none',
        md: 'none',
        lg: 'none',
        xl: 'none',
        '2xl': 'none',
      },
    },
  },
  plugins: [],
};
