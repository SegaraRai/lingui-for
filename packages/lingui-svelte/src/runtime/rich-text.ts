import type { Component } from "svelte";

export type TransComponentDescriptor =
  | {
      kind: "element";
      tag: string;
      props?: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "component";
      component: Component<Record<string, unknown>>;
      props?: Readonly<Record<string, unknown>>;
    };

export type TransComponentMap = Readonly<
  Record<string, TransComponentDescriptor>
>;

export type TransRenderNode =
  | string
  | {
      kind: "component";
      key: string;
      name: string;
      children: readonly TransRenderNode[];
    };

export function formatRichTextTranslation(
  value: string,
  components: TransComponentMap = {},
): TransRenderNode[] {
  return parseNodes(value, 0, components, undefined, new Map()).nodes;
}

function parseNodes(
  value: string,
  start: number,
  components: TransComponentMap,
  expectedClosingTag?: string,
  keyCounters: Map<string, number> = new Map(),
): {
  nodes: TransRenderNode[];
  index: number;
  closed: boolean;
} {
  const nodes: TransRenderNode[] = [];
  let cursor = start;

  while (cursor < value.length) {
    const tagStart = value.indexOf("<", cursor);
    if (tagStart === -1) {
      pushText(nodes, value.slice(cursor));
      return {
        nodes,
        index: value.length,
        closed: expectedClosingTag === undefined,
      };
    }

    if (tagStart > cursor) {
      pushText(nodes, value.slice(cursor, tagStart));
    }

    const closing = matchClosingTag(value, tagStart);
    if (closing) {
      if (expectedClosingTag === closing.name) {
        return {
          nodes,
          index: closing.end,
          closed: true,
        };
      }

      pushText(nodes, value.slice(tagStart, closing.end));
      cursor = closing.end;
      continue;
    }

    const selfClosing = matchSelfClosingTag(value, tagStart);
    if (selfClosing) {
      const component = components[selfClosing.name];
      if (component) {
        const key = allocateStableNodeKey(selfClosing.name, keyCounters);
        nodes.push({
          kind: "component",
          key,
          name: selfClosing.name,
          children: [],
        });
      }
      cursor = selfClosing.end;
      continue;
    }

    const opening = matchOpeningTag(value, tagStart);
    if (!opening) {
      pushText(nodes, value.slice(tagStart, tagStart + 1));
      cursor = tagStart + 1;
      continue;
    }

    const parsedChildren = parseNodes(
      value,
      opening.end,
      components,
      opening.name,
      keyCounters,
    );
    const component = components[opening.name];

    if (!parsedChildren.closed) {
      pushText(nodes, value.slice(tagStart, parsedChildren.index));
      cursor = parsedChildren.index;
      continue;
    }

    if (component) {
      const key = allocateStableNodeKey(opening.name, keyCounters);
      nodes.push({
        kind: "component",
        key,
        name: opening.name,
        children: parsedChildren.nodes,
      });
    } else {
      nodes.push(...parsedChildren.nodes);
    }

    cursor = parsedChildren.index;
  }

  return {
    nodes,
    index: cursor,
    closed: expectedClosingTag === undefined,
  };
}

function allocateStableNodeKey(
  name: string,
  keyCounters: Map<string, number>,
): string {
  const currentCount = keyCounters.get(name) ?? 0;
  keyCounters.set(name, currentCount + 1);
  return `${name}:${currentCount}`;
}

function pushText(nodes: TransRenderNode[], text: string): void {
  if (text.length === 0) {
    return;
  }

  const previous = nodes.at(-1);
  if (typeof previous === "string") {
    nodes[nodes.length - 1] = `${previous}${text}`;
    return;
  }

  nodes.push(text);
}

function matchOpeningTag(
  value: string,
  start: number,
): {
  name: string;
  end: number;
} | null {
  const match = /^<([A-Za-z0-9]+)>/.exec(value.slice(start));
  if (!match) {
    return null;
  }

  return {
    name: match[1],
    end: start + match[0].length,
  };
}

function matchClosingTag(
  value: string,
  start: number,
): {
  name: string;
  end: number;
} | null {
  const match = /^<\/([A-Za-z0-9]+)>/.exec(value.slice(start));
  if (!match) {
    return null;
  }

  return {
    name: match[1],
    end: start + match[0].length,
  };
}

function matchSelfClosingTag(
  value: string,
  start: number,
): {
  name: string;
  end: number;
} | null {
  const match = /^<([A-Za-z0-9]+)\s*\/>/.exec(value.slice(start));
  if (!match) {
    return null;
  }

  return {
    name: match[1],
    end: start + match[0].length,
  };
}
