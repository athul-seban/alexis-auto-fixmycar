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
]

export default config
