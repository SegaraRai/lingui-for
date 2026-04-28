import { t } from "@lingui/core/macro";

const subject = "Vite";
const app = document.querySelector<HTMLDivElement>("#app");

if (app) {
  app.textContent = t`Hello ${subject}`;
}
