/** @type {import('tailwindcss').Config} */
// Maps CSS variables from index.css to Tailwind color names.
// Uses *-ch channel variables so opacity modifiers (bg-primary/10) work.
// Full hsl(...) values live next to them in index.css for VS Code color previews.
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Temporary: everything is PT Mono for now.
        display: ['PT Mono', 'ui-monospace', 'monospace'],
        sans: ['PT Mono', 'ui-monospace', 'monospace'],
        mono: ['PT Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border-ch))',
        input: 'hsl(var(--input-ch))',
        ring: 'hsl(var(--ring-ch))',
        background: 'hsl(var(--background-ch))',
        foreground: 'hsl(var(--foreground-ch))',
        primary: {
          DEFAULT: 'hsl(var(--primary-ch))',
          foreground: 'hsl(var(--primary-foreground-ch))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary-ch))',
          foreground: 'hsl(var(--secondary-foreground-ch))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive-ch))',
          foreground: 'hsl(var(--destructive-foreground-ch))',
        },
        success: {
          DEFAULT: 'hsl(var(--success-ch))',
          foreground: 'hsl(var(--success-foreground-ch))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning-ch))',
          foreground: 'hsl(var(--warning-foreground-ch))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted-ch))',
          foreground: 'hsl(var(--muted-foreground-ch))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent-ch))',
          foreground: 'hsl(var(--accent-foreground-ch))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover-ch))',
          foreground: 'hsl(var(--popover-foreground-ch))',
        },
        card: {
          DEFAULT: 'hsl(var(--card-ch))',
          foreground: 'hsl(var(--card-foreground-ch))',
        },
      },
    },
  },
  plugins: [],
}
