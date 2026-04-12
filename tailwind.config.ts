import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        amber: {
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
        },
        zinc: {
          800: "#27272a",
          900: "#18181b",
          950: "#09090b",
        },
        blood: {
          500: "#8b0000",
          600: "#6b0000",
        },
        parchment: {
          100: "#f5e6c8",
          200: "#e8d5a3",
        },
        ember: {
          400: "#ff6b35",
          500: "#e85d26",
        },
      },
      fontFamily: {
        display: ["'Cinzel'", "serif"],
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 8px rgba(245, 158, 11, 0.3)" },
          "50%": { boxShadow: "0 0 20px rgba(245, 158, 11, 0.6)" },
        },
        "clock-tick": {
          "0%, 100%": { transform: "scale(1)" },
          "50%": { transform: "scale(1.15)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s ease-out",
        "pulse-glow": "pulse-glow 2s infinite",
        "clock-tick": "clock-tick 0.3s ease-in-out",
      },
      backgroundImage: {
        "dark-vignette":
          "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.8) 100%)",
      },
    },
  },
  plugins: [],
};

export default config;
