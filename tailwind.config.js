/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "DM Sans",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
        display: ["Manrope", "DM Sans", "system-ui", "sans-serif"],
      },
      colors: {
        base: "var(--color-base)",
        surface: "var(--color-surface)",
        ink: "var(--color-ink)",
        mute: "var(--color-mute)",
        zinc: {
          50: "var(--zinc-50)",
          100: "var(--zinc-100)",
          200: "var(--zinc-200)",
          300: "var(--zinc-300)",
          400: "var(--zinc-400)",
          500: "var(--zinc-500)",
          600: "var(--zinc-600)",
          700: "var(--zinc-700)",
          800: "var(--zinc-800)",
          900: "var(--zinc-900)",
          950: "var(--zinc-950)",
        },
        sage: {
          DEFAULT: "#4A6B5D",
          dark: "#37524A",
          darker: "#2B4239",
          light: "#E7EDE9",
        },
        slate: {
          DEFAULT: "var(--color-ink)",
        },
        phase: {
          menstrual: {
            bg: "var(--phase-menstrual-bg)",
            text: "var(--phase-menstrual-text)",
            line: "var(--phase-menstrual-line)",
          },
          follicular: {
            bg: "var(--phase-follicular-bg)",
            text: "var(--phase-follicular-text)",
            line: "var(--phase-follicular-line)",
          },
          ovulatory: {
            bg: "var(--phase-ovulatory-bg)",
            text: "var(--phase-ovulatory-text)",
            line: "var(--phase-ovulatory-line)",
          },
          luteal: {
            bg: "var(--phase-luteal-bg)",
            text: "var(--phase-luteal-text)",
            line: "var(--phase-luteal-line)",
          },
        },
      },
      boxShadow: {
        card: "var(--shadow-card)",
      },
    },
  },
  plugins: [],
};
