import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        krtrRed: "#c8102e",
      },
    },
  },
  plugins: [],
};

export default config;
