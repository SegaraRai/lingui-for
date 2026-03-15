export function normalizePath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function joinPath(...parts: readonly string[]): string {
  const normalized = parts
    .filter(Boolean)
    .map((part, index) => {
      const value = normalizePath(part);
      if (index === 0) {
        return value.replaceAll(/\/+$/g, "");
      }

      return value.replaceAll(/^\/+/g, "").replaceAll(/\/+$/g, "");
    })
    .filter(Boolean);

  return normalized.join("/");
}

export function dirnamePath(value: string): string {
  const normalized = normalizePath(value).replaceAll(/\/+$/g, "");
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? "." : normalized.slice(0, slashIndex);
}

export function basenamePath(value: string): string {
  const normalized = normalizePath(value);
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex === -1 ? normalized : normalized.slice(slashIndex + 1);
}

export function relativePathFrom(from: string, to: string): string {
  const fromParts = splitPathSegments(from);
  const toParts = splitPathSegments(to);
  let sharedLength = 0;

  while (
    sharedLength < fromParts.length &&
    sharedLength < toParts.length &&
    fromParts[sharedLength] === toParts[sharedLength]
  ) {
    sharedLength += 1;
  }

  const upSegments = fromParts.slice(sharedLength).map(() => "..");
  const downSegments = toParts.slice(sharedLength);
  return [...upSegments, ...downSegments].join("/");
}

export function resolveRelativeSpecifier(
  baseDir: string,
  specifier: string,
): string {
  const baseParts = splitPathSegments(baseDir);
  const specifierParts = normalizePath(specifier).split("/");

  for (const part of specifierParts) {
    if (!part || part === ".") {
      continue;
    }

    if (part === "..") {
      baseParts.pop();
      continue;
    }

    baseParts.push(part);
  }

  const prefix = /^[A-Za-z]:$/.test(baseParts[0] ?? "")
    ? `${baseParts.shift()}/`
    : "/";
  return `${prefix}${baseParts.join("/")}`.replace(/^\/\//, "/");
}

export function splitPathSegments(value: string): string[] {
  return normalizePath(value)
    .split("/")
    .filter((segment) => segment.length > 0);
}
