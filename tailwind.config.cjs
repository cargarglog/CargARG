/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

// Paleta de marca basada en el nuevo logo (rojo profundo, menos brillante)
const brandRed = {
  50:  '#FDF2F2',
  100: '#FDE8E8',
  200: '#FBD5D5',
  300: '#F8B4B4',
  400: '#F98080',
  500: '#E02424', // Principal (rojo profundo)
  600: '#C81E1E',
  700: '#9B1C1C',
  800: '#771D1D',
  900: '#611A1A',
  950: '#330F0F',
};

module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    // Mantenemos toda la paleta por defecto pero
    // reasignamos "blue" a la paleta roja de marca
    colors: {
      ...colors,
      blue: brandRed,
    },
    extend: {
      colors: {
        brand: brandRed,
        charcoal: {
          900: '#0F0F0F',
          800: '#1A1A1A',
          700: '#222222',
          600: '#2A2A2A',
        },
      },
    },
  },
  plugins: [],
};
