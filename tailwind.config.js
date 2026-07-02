import tailwindcssAnimate from 'tailwindcss-animate'

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
      // Semantic surface tokens (one slate family — the body bg is already slate-900).
      // New components use these; the legacy gray-* usage migrates onto them over time.
      colors: {
        surface: {
          DEFAULT: '#0f172a', // slate-900 — page
          raised: '#1e293b',  // slate-800 — cards
          sunken: '#020617',  // slate-950 — bg / inset inputs
          border: '#334155',  // slate-700
        },
        brand: '#3b82f6',   // blue-500 — primary + AI
        success: '#10b981', // emerald-500
        danger: '#ef4444',  // red-500 — destructive / over-target ONLY
      },
    },
  },
  // tailwindcss-animate powers every `animate-in`/`fade-in`/`slide-in-from-*`/`zoom-in`
  // class across the modals, sheets, toasts, and onboarding. Without it registered those
  // classes emit ZERO CSS and every bottom sheet pops in with no motion.
  plugins: [tailwindcssAnimate],
}
