/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Light theme matching the PDF
        bg:        "#fafafa",
        surface:   "#ffffff",
        elevated:  "#f5f5f5",
        border:    "#e5e5e5",
        "border-strong": "#d4d4d4",
        
        text:      "#171717",
        "text-secondary": "#525252",
        muted:     "#737373",
        dim:       "#a3a3a3",

        // Blue accent from PDF
        accent:        "#3b82f6",
        "accent-hover":"#2563eb",
        "accent-light":"#dbeafe",
        "accent-soft": "#eff6ff",

        // Status colors
        success: "#22c55e",
        "success-light": "#dcfce7",
        warning: "#f59e0b",
        "warning-light": "#fef3c7",
        danger:  "#ef4444",
        "danger-light": "#fee2e2",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1)",
        hover: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
        lifted: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)",
      },
    },
  },
  plugins: [],
};