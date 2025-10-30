/** @type {import('tailwindcss').Config} */
const colors = require('tailwindcss/colors');

// Paleta de marca basada en el nuevo logo (rojo/negro/gris)
const brandRed = {
  50:  '#FFF1F1',
  100: '#FFE0E0',
  200: '#FFC1C1',
  300: '#FF8A8A',
  400: '#FF4D4D',
  500: '#FF2D2D', // Principal
  600: '#E61E1E',
  700: '#C41616',
  800: '#A11212',
  900: '#7E0E0E',
  950: '#330505',
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
