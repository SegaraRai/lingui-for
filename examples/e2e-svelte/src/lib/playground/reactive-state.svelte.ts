import { msg } from "lingui-for-svelte/macro";

export const reactiveDescriptor = msg`Descriptor from a .svelte.ts module.`;

export const reactiveState = $state({
  name: "SvelteKit",
  count: 2,
  status: "idle" as "idle" | "active",
});

export function incrementReactiveCount(): void {
  reactiveState.count += 1;
}

export function decrementReactiveCount(): void {
  reactiveState.count = Math.max(0, reactiveState.count - 1);
}

export function toggleReactiveStatus(): void {
  reactiveState.status =
    reactiveState.status === "idle" ? "active" : "idle";
}

export function setReactiveName(name: string): void {
  reactiveState.name = name;
}
