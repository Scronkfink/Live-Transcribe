module.exports = {
  content: [
    './src/**/*.{js,jsx,ts,tsx}', // Adjust the paths to match your project structure
    './public/index.html',
  ],
  theme: {
    extend: {
    },
  },
  plugins: [
    require('daisyui'),
    require('@tailwindcss/forms')
  ],
  daisyui: {
    styled: true,
    themes: true,
    base: true,
    utils: true,
    logs: true,
    rtl: false,
    prefix: "",
  },
}