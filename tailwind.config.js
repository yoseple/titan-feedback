/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // iOS safe-area insets. index.html opts into edge-to-edge (viewport-fit=cover +
      // black-translucent status bar), so the sticky header + bottom nav must pad past
      // the notch/home-indicator. Without these, `pt-safe-top`/`pb-safe-bottom` used in
      // Dashboard emit NO CSS and the chrome renders under the status bar / gesture strip.
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
      },
    },
  },
  plugins: [],
}