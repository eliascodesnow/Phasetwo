/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "Inter",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      colors: {
        base: "#FAFAFA",
        sage: {
          DEFAULT: "#4A6B5D",
          dark: "#37524A",
          light: "#E7EDE9",
        },
        slate: {
          DEFAULT: "#27272A",
        },
        phase: {
          menstrual: {
            bg: "#FCE7EA",
            text: "#9F1239",
            line: "#E11D48",
          },
          follicular: {
            bg: "#D1FAE5",
            text: "#065F46",
            line: "#10B981",
          },
          ovulatory: {
            bg: "#FEF3C7",
            text: "#92400E",
            line: "#F59E0B",
          },
          luteal: {
            bg: "#E0E7FF",
            text: "#3730A3",
            line: "#6366F1",
          },
        },
      },
      boxShadow: {
        card: "0 1px 2px 0 rgba(24, 24, 27, 0.04), 0 1px 6px -2px rgba(24, 24, 27, 0.06)",
      },
    },
  },
  plugins: [],
};
