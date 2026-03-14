import "vitest/browser";

declare module "vitest/browser" {
  interface BrowserCommands {
    captureHydrationErrors: (
      pathname: string,
    ) => Promise<{
      bodyText: string;
      errors: string[];
    }>;
  }
}
