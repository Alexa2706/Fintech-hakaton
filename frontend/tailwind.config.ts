import type { Config } from "tailwindcss";

// Every color routes through a CSS variable defined in app/globals.css.
// Components consume these semantic names only — no raw Tailwind colors, no hex.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        surface2: "var(--surface-2)",
        hairline: "var(--hairline)",
        "line-strong": "var(--line-strong)",
        text: "var(--text)",
        muted: "var(--text-muted)",
        faint: "var(--text-faint)",
        accent: {
          DEFAULT: "var(--accent)",
          hi: "var(--accent-hi)",
          wash: "var(--accent-wash)",
        },
        risk: {
          high: "var(--risk-high)",
          "high-wash": "var(--risk-high-wash)",
          med: "var(--risk-med)",
          "med-wash": "var(--risk-med-wash)",
          low: "var(--risk-low)",
          "low-wash": "var(--risk-low-wash)",
        },
        cat: {
          sanctioned: "var(--cat-sanctioned)",
          mixer: "var(--cat-mixer)",
          darknet: "var(--cat-darknet)",
          "high-risk": "var(--cat-high-risk)",
          exchange: "var(--cat-exchange)",
          clean: "var(--cat-clean)",
        },
        // shadcn-compatible aliases (so primitives can use border/ring/etc.)
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      borderRadius: {
        none: "0",
      },
    },
  },
  plugins: [],
};

export default config;
