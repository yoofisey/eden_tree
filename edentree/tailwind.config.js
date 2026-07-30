/** @type {import('tailwindcss').Config}  */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: "#0A5C36",
        primaryLight: "#4CAF50",
        primaryDark: "#064A2A",
        dark: "#111111",
        light: "#F7F7F7",
        accentRed: "#D64545",
        accentOrange: "#F28C28",
        accentGreen: "#7CB342",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        heading: ["Poppins", "sans-serif"],
      },
      container: {
        center: true,
        padding: {DEFAULT: '1rem', sm: '2rem', lg: '3rem', xl: '4rem', }
      }
    },
  },
  plugins: [],
}
 