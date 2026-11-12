/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      colors: {
        cmrl: {
          navy: "#0A192F",
          sidebar: "#0F223D",
          blue: "#0066B3",
          green: "#009E49",
          slate: "#1E293B",
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
