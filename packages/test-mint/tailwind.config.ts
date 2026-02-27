import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "void-purple": "#0d0a1a",
        "card-purple": "#1a1230",
        "sigil-border": "#3a2850",
        "ritual-gold": "#ffd700",
        "ghost-white": "#f0e6ff",
        "faded-spirit": "#c8bedc",
        "blood-pink": "#dc143c",
        "spectral-green": "#00ff88",
        "soul-cyan": "#00ccff",
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "monospace"],
        silk: ['"Silkscreen"', "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
