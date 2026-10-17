/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          950: "#070b16",
          900: "#0a1020",
          850: "#0d1526",
          800: "#111a30",
          750: "#16213b",
          700: "#1b2947",
          600: "#243657",
          500: "#33496e",
        },
        bullish: {
          DEFAULT: "#22c55e",
          soft: "#16a34a",
          dim: "rgba(34,197,94,0.12)",
        },
        bearish: {
          DEFAULT: "#ef4444",
          soft: "#dc2626",
          dim: "rgba(239,68,68,0.12)",
        },
        neutral: {
          DEFAULT: "#f59e0b",
          soft: "#d97706",
          dim: "rgba(245,158,11,0.12)",
        },
        line: "rgba(255,255,255,0.07)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(0,0,0,0.4), 0 8px 24px -12px rgba(0,0,0,0.6)",
        glow: "0 0 0 1px rgba(34,197,94,0.25), 0 8px 30px -10px rgba(34,197,94,0.35)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.25s ease-out",
        "pulse-dot": "pulse-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
