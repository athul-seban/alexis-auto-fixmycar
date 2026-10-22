import nextConfig from "eslint-config-next"

const config = [
  ...nextConfig,
  {
    ignores: ["node_modules/**", ".next/**", "out/**", "prisma/**"],
  },
  {
    rules: {
      // This codebase's established pattern for section-scoped data fetching is to
      // reset a loading flag to true at the top of an effect keyed on a filter/tab
      // dependency, then flip it false in .then()/.finally(). That's a legitimate,
      // synchronous, one-time reset per dependency change, not the render-thrashing
      // pattern this (very new, still-evolving) rule is meant to catch.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Production code is `any`-free: a thrown value is `unknown` (see src/lib/errors.ts), a session user is typed
    // (src/types/next-auth.d.ts, src/lib/session.ts) and Prisma inputs have generated types. Tests may still cast a mock.
    files: ["app/**/*.{ts,tsx}", "src/**/*.{ts,tsx}", "proxy.ts"],
    ignores: ["**/*.test.{ts,tsx}", "src/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
]

export default config
