import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "no-undef": "off",
      "quotes": ["error", "single"],
      "semi": ["error", "always"],
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
];
