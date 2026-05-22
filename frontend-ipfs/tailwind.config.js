/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          base: '#0b0b10',
          panel: '#15151c',
          elevated: '#1c1c25',
          hover: '#23232f',
        },
        border: {
          subtle: '#2a2a36',
        },
        text: {
          primary: '#f5f5f7',
          secondary: '#a0a0ac',
          muted: '#6b6b78',
        },
        brand: {
          DEFAULT: '#7c5cff',
          hover: '#8b6dff',
          soft: '#7c5cff20',
        },
        bubble: {
          incoming: '#23232f',
          outgoing: '#7c5cff',
        },
        online: '#22c55e',
      },
      borderRadius: {
        bubble: '1.25rem',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
