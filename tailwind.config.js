/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: '#174c3c',
        lime: '#c8ef7a',
        canvas: '#f6f7f3',
      },
      fontFamily: {
        sans: ['IBM Plex Sans Arabic', 'Tahoma', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
