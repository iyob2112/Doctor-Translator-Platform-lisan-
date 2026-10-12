/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b1020",
        paper: "#f5f7fb",
        brand: {
          50: "#eefbf7",
          100: "#d3f5ec",
          200: "#a8ebda",
          300: "#6fdac3",
          400: "#38c2a8",
          500: "#14a68d",
          600: "#0b8573",
          700: "#0c6a5d",
          800: "#0d554c",
          900: "#0c463f",
        },
        plum: {
          50: "#f4f2ff",
          100: "#e9e5ff",
          200: "#d5cdff",
          300: "#b6a6ff",
          400: "#9578ff",
          500: "#7a52f5",
          600: "#6a37e0",
          700: "#5a2bbc",
          800: "#4b269a",
          900: "#3f237c",
        },
      },
      fontFamily: {
        display: ['"Sora"', "system-ui", "sans-serif"],
        sans: ['"Inter"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        soft: "0 1px 2px rgba(11,16,32,0.04), 0 10px 30px -18px rgba(11,16,32,0.25)",
        lift: "0 30px 60px -34px rgba(11,16,32,0.45)",
        ring: "0 0 0 1px rgba(255,255,255,0.6) inset",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(14px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pop-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.85)", opacity: "0.7" },
          "70%": { transform: "scale(1.7)", opacity: "0" },
          "100%": { transform: "scale(1.7)", opacity: "0" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-10px)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pop-in": "pop-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) both",
        "pulse-ring": "pulse-ring 1.8s cubic-bezier(0.24, 0.6, 0.35, 1) infinite",
        float: "float 6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
