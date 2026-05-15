import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink:   "#1A1C1E",
        slate: "#6C7278",
        clay:  "#B8422E",
        stone: "#F7F5F2",
      },
      fontFamily: {
        sans:  ["Public Sans", "sans-serif"],
        label: ["Space Grotesk", "sans-serif"],
      },
      borderRadius: {
        sm: "4px",
        md: "8px",
      },
    },
  },
  plugins: [],
};

export default config;
