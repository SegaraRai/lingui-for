export function reorderPluginBeforeMatcher<
  T extends {
    name?: string | readonly string[] | null | undefined;
  },
>(plugins: T[], pluginName: string, matcher: RegExp): void {
  const currentIndex = plugins.findIndex((plugin) => {
    const names = plugin.name;
    if (Array.isArray(names)) {
      return names.includes(pluginName);
    }
    return names === pluginName;
  });

  if (currentIndex === -1) {
    return;
  }

  const targetIndex = plugins.findIndex((plugin) => {
    const names = plugin.name;
    if (Array.isArray(names)) {
      return names.some((name) => matcher.test(name));
    }
    return typeof names === "string" && matcher.test(names);
  });

  if (targetIndex === -1 || currentIndex < targetIndex) {
    return;
  }

  const [plugin] = plugins.splice(currentIndex, 1);
  plugins.splice(targetIndex, 0, plugin);
}
