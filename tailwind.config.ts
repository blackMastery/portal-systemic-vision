import type { Config } from "tailwindcss";

const config: Config = {
  // Explicit rather than relying on the `media` default: there is no dark theme
  // here, so a stray `dark:` utility must stay inert instead of firing on OS
  // preference and half-darkening the UI.
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    // lib/ was previously unscanned — a class string defined in a helper there
    // produced no CSS at all. The status-tone helper lives here.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./hooks/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Surfaces ──────────────────────────────────────────────────
        background: "hsl(var(--background))",
        canvas: "hsl(var(--canvas))",
        overlay: "hsl(var(--overlay))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },

        // ── Ink ───────────────────────────────────────────────────────
        foreground: {
          DEFAULT: "hsl(var(--foreground))",
          secondary: "hsl(var(--foreground-secondary))",
          muted: "hsl(var(--foreground-muted))",
          faint: "hsl(var(--foreground-faint))",
        },

        // ── Lines ─────────────────────────────────────────────────────
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",

        // ── Brand ─────────────────────────────────────────────────────
        // `primary` is a FILL. Use `primary-strong` for anything that draws
        // (links, icons, focus rings) — see app/globals.css.
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
          strong: "hsl(var(--primary-strong))",
          soft: "hsl(var(--primary-soft))",
          "soft-deep": "hsl(var(--primary-soft-deep))",
          "soft-foreground": "hsl(var(--primary-strong))",
        },

        // ── Status ────────────────────────────────────────────────────
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
          "soft-foreground": "hsl(var(--success-soft-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          strong: "hsl(var(--warning-strong))",
          soft: "hsl(var(--warning-soft))",
          "soft-foreground": "hsl(var(--warning-soft-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
          soft: "hsl(var(--danger-soft))",
          "soft-foreground": "hsl(var(--danger-soft-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
          "soft-foreground": "hsl(var(--info-soft-foreground))",
        },
        violet: {
          DEFAULT: "hsl(var(--violet))",
          foreground: "hsl(var(--violet-foreground))",
          soft: "hsl(var(--violet-soft))",
          "soft-foreground": "hsl(var(--violet-soft-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
};
export default config;
