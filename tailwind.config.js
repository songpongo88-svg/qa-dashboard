/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    // Compare JSX is injected by Vite, so its classes are not present in src.
    './build/analyticsCompareUiRedesignPatch.js',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
