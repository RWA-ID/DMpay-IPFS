/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // DMpay design tokens — editorial dark, paper/ink, mono accents
        bg: {
          base: '#0B0B0A',      // page bg (near-black)
          panel: '#161513',     // card surface
          elevated: '#1C1B18',  // surface-2
          hover: '#1F1E1A',     // chip / hover
        },
        border: {
          subtle: '#25241F',    // hairline
          strong: '#322F28',    // hairline-strong
        },
        text: {
          primary: '#F2F0E8',   // ink
          secondary: '#D5D3CB', // ink-2
          muted: '#8B8A82',     // mute
          faint: '#5F5E58',     // mute-2
        },
        // Single ink-based accent (paper-on-ink in dark mode)
        brand: {
          DEFAULT: '#F2F0E8',
          hover: '#FFFFFF',
          soft: '#F2F0E812',
          ink: '#0B0B0A',
        },
        chip: {
          DEFAULT: '#1F1E1A',
          ink: '#E7E4D8',
        },
        bubble: {
          incoming: '#1F1E1A',
          outgoing: '#F2F0E8',
        },
        usdc: '#4D9EE4',
        eth: '#8C99E0',
        success: '#5BC685',
        danger: '#E5616F',
        online: '#5BC685',
      },
      borderRadius: {
        bubble: '1.25rem',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
        display: ['Geist', 'Inter', 'sans-serif'],
      },
      letterSpacing: {
        display: '-0.04em',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4), 0 8px 28px -12px rgba(0,0,0,0.6)',
        pop: '0 8px 24px rgba(0,0,0,0.5), 0 24px 56px -16px rgba(0,0,0,0.7)',
      },
    },
  },
  plugins: [],
};
