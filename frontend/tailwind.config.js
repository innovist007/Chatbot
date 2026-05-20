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

        // Supply Chain palette (matches PDF mockup)
        "sc-purple":       "#534AB7",
        "sc-purple-light": "#EEEDFE",
        "sc-purple-mid":   "#AFA9EC",
        "sc-green":        "#3B6D11",
        "sc-green-light":  "#EAF3DE",
        "sc-green-mid":    "#97C459",
        "sc-red":          "#A32D2D",
        "sc-red-light":    "#FCEBEB",
        "sc-red-mid":      "#F09595",
        "sc-amber":        "#854F0B",
        "sc-amber-light":  "#FAEEDA",
        "sc-amber-mid":    "#EF9F27",
        "sc-blue":         "#185FA5",
        "sc-blue-light":   "#E6F1FB",
        "sc-blue-mid":     "#85B7EB",
        "sc-teal":         "#0F6E56",
        "sc-teal-light":   "#E1F5EE",
        "sc-gray-50":      "#F8F7F3",
        "sc-gray-100":     "#F1EFE8",
        "sc-gray-200":     "#D3D1C7",
        "sc-gray-400":     "#888780",
        "sc-gray-600":     "#5F5E5A",
        "sc-gray-900":     "#2C2C2A",
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