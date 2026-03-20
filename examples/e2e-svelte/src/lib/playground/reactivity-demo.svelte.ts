export const reactivityDemoState = $state({
  value: "Alpha" as "Alpha" | "Beta",
});

export function setReactivityDemoValue(value: "Alpha" | "Beta"): void {
  reactivityDemoState.value = value;
}
