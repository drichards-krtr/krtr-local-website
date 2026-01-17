import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0c0c0d",
        muted: "#6b7280",
        krtrNavy: "#2d2d46",
        krtrRed: "#d71e1f",
        shell: "#eeeeee",
      },
      maxWidth: {
        site: "1100px",
      },
    },
  },
  plugins: [],
};

export default config;
