/// <reference types="astro/client" />

type SupportedLocale = import("./lib/i18n/locale").SupportedLocale;

declare namespace App {
  interface Locals {
    locale: SupportedLocale;
  }
}
