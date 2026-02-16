/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './head.html',
    './scripts/**/*.js',
    './blocks/**/*.{html,js,css}',
    './styles/**/*.css',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
