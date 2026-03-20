import "vite-plus/test/browser";

declare module "vite-plus/test/browser" {
  interface BrowserCommands {
    captureHydrationErrors: (pathname: string) => Promise<{
      bodyText: string;
      errors: string[];
    }>;
    switchLocaleFromHeader: (
      pathname: string,
      localeCode: string,
    ) => Promise<{
      bodyText: string;
      currentUrl: string;
      htmlLang: string | null;
      errors: string[];
    }>;
  }
}
