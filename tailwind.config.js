/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#b6ccff',
          300: '#8badff',
          400: '#5f88ff',
          500: '#3d64f5',
          600: '#2b48d0',
          700: '#2338a0',
          800: '#1e2e7f',
          900: '#1a2766',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
