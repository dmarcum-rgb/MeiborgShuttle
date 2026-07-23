/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Helvetica Neue', 'Helvetica', 'Arial', 'system-ui', 'sans-serif'],
        serif: ['Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
      },
      colors: {
        // Meiborg dark-glass tokens
        bg: '#161a21',
        signal: '#ffc93c',
        'signal-dim': 'rgba(255, 201, 60, 0.14)',
        mist: '#edf1f7',
        dim: '#c0cad7',
        faint: '#95a2b2',
        ok: '#4bd3a0',
        bad: '#ff6b6b',
        edge: 'rgba(255, 255, 255, 0.09)',
        edge2: 'rgba(255, 255, 255, 0.17)',
        glass: 'rgba(26, 30, 38, 0.60)',
        glass2: 'rgba(255, 255, 255, 0.055)',
      },
      keyframes: {
        shrink: {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        },
      },
      animation: {
        shrink: 'shrink 6s linear forwards',
      },
    },
  },
  plugins: [],
};
