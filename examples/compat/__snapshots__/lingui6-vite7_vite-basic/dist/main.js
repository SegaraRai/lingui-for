import { i18n } from "@lingui/core";
const subject = "Vite";
const app = document.querySelector("#app");
if (app) {
  app.textContent = i18n._(
    /** i18n */
    {
      id: "tLUJKK",
      values: {
        subject
      }
    }
  );
}
