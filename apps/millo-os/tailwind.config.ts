import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0B0D0F",
          surface: "#111418",
          elevated: "#171B21",
          border: "#252B33",
        },
        text: {
          primary: "#F5F7FA",
          secondary: "#A7B0BA",
          muted: "#8D97A3",
        },
        accent: {
          blue: "#8FA8C7",
          silver: "#C9CFD6",
          warm: "#EDEAE6",
          emerald: "#5AA387",
          amber: "#A78942",
        }
      },
      boxShadow: {
        "layer-1":
          "0 1px 0 rgba(255,255,255,0.02), 0 6px 20px rgba(0,0,0,0.35)",
        "layer-2":
          "0 1px 0 rgba(255,255,255,0.03), 0 10px 28px rgba(0,0,0,0.45)",
      }
    },
  },
  plugins: [],
};

export default config;
