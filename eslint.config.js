const eslint = require("@eslint/js");
const tslint = require("typescript-eslint");

module.exports = [
  {
    languageOptions: {
      parser: require("@typescript-eslint/parser"),
      parserOptions: {
        project: "./tsconfig.lint.json",
      },
    },
    plugins: {
      "@typescript-eslint": require("@typescript-eslint/eslint-plugin"),
    },
    rules: {
      "no-trailing-spaces": "error",
    },
  },
  eslint.configs.recommended,
  ...tslint.configs.recommended,
  {
    ignores: [
      "node_modules/**/*",
      "coverage/**/*",
      "dist/**/*",
      ".github/**/*",
      ".git/**/*",
      "eslint.config.js",
    ],
  },
];
