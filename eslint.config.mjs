import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Off because the public booking route is a root-level two-segment
      // dynamic route, `/[username]/[slug]` (Phase 4c). @next/next/
      // no-html-link-for-pages compiles each `[segment]` to a broad wildcard
      // (it greedily collapses both segments into `((?!.+?\..+?).*?)`), so the
      // route's pattern then matches nearly any internal `<a href>` and the
      // rule misfires on legitimate full-navigation anchors, for example the
      // `<a>` that kicks off Google OAuth at /settings/calendars (which must be
      // a real navigation, not a prefetching `<Link>`). The rule is a
      // Pages-Router-era guard with little value under the App Router; turning
      // it off project-wide is cleaner than scattering inline disables.
      "@next/next/no-html-link-for-pages": "off",
    },
  },
]);

export default eslintConfig;
