/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        serif: ['Crimson Text', 'serif'],
      },
      colors: {
        primary: '#f5f5f5',
        secondary: '#2a2a2a',
        accent: '#6b6b6b',
      },
    },
  },
  plugins: [],
};
