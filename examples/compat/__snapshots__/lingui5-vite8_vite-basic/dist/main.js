import { i18n } from "@lingui/core";
// src/main.ts
var subject = "Vite";
var app = document.querySelector("#app");
if (app) app.textContent = i18n._({
	id: "tLUJKK",
	values: { subject }
});
