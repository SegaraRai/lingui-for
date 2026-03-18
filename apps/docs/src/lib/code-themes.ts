import githubDark from "shiki/themes/github-dark.mjs";
import githubLight from "shiki/themes/github-light.mjs";
import oneDarkPro from "shiki/themes/one-dark-pro.mjs";
import oneLight from "shiki/themes/one-light.mjs";

export const sourceCodeThemes = {
  dark: githubDark,
  light: githubLight,
} as const;

export const resultCodeThemes = {
  dark: oneDarkPro,
  light: oneLight,
} as const;
