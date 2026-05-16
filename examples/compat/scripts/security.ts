export const FORBIDDEN_ACTIONS_RUNTIME_ENV_KEYS = [
  "ACTIONS_CACHE_SERVICE_V2",
  "ACTIONS_CACHE_URL",
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "ACTIONS_RESULTS_URL",
  "ACTIONS_RUNTIME_TOKEN",
  "ACTIONS_RUNTIME_URL",
] as const;

export function assertNoActionsRuntimeCredentials(): void {
  const presentKeys = FORBIDDEN_ACTIONS_RUNTIME_ENV_KEYS.filter((key) => {
    return process.env[key];
  });

  if (presentKeys.length > 0) {
    throw new Error(
      `Compatibility tests must run without GitHub Actions runtime credentials. Present keys: ${presentKeys.join(", ")}`,
    );
  }
}
