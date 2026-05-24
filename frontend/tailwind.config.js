/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0f1ff',
          100: '#e0e4ff',
          200: '#c7cdfe',
          300: '#a5aafc',
          400: '#8187f7',
          500: '#667eea',
          600: '#5a6fd6',
          700: '#4a5abf',
          800: '#3d4aa0',
          900: '#353d82',
        },
        accent: {
          50: '#faf5ff',
          100: '#f3e8ff',
          200: '#e9d5ff',
          300: '#d8b4fe',
          400: '#c084fc',
          500: '#a855f7',
          600: '#9333ea',
          700: '#7c3aed',
          800: '#6b21a8',
          900: '#581c87',
        }
      },
      fontFamily: {
        sans: ['Segoe UI', 'Microsoft JhengHei', 'sans-serif'],
      }
    },
  },
  plugins: [require("@tailwindcss/typography")],
}