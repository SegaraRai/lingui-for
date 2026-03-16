/**
 * Description of one embeddable node that may appear in a translated rich-text message.
 *
 * Entries are keyed by the placeholder name used in the translated message, for example `"0"` or
 * `"link"`.
 *
 * This is part of the runtime contract used by compiled `<Trans>` output rather than a primary
 * authoring surface.
 */
export type TransComponentDescriptor =
  | {
      /**
       * Renders the placeholder as a plain HTML element such as `strong` or `a`.
       */
      kind: "element";
      /**
       * HTML tag name emitted by the runtime renderer.
       */
      tag: string;
      /**
       * Props/attributes applied to the rendered element.
       */
      props?: Readonly<Record<string, unknown>>;
    }
  | {
      /**
       * Renders the placeholder as an Astro component.
       */
      kind: "component";
      /**
       * Component factory used for the placeholder.
       */
      component: () => unknown;
      /**
       * Props forwarded to the rendered component.
       */
      props?: Readonly<Record<string, unknown>>;
    };

/**
 * Mapping from rich-text placeholder names to their runtime render descriptors.
 */
export type TransComponentMap = Readonly<
  Record<string, TransComponentDescriptor>
>;

/**
 * Tree node produced by parsing a translated rich-text string.
 *
 * Nodes are either raw text segments or placeholder-backed component nodes with child content.
 */
export type TransRenderNode =
  | string
  | {
      /**
       * Discriminator for non-text render nodes.
       */
      kind: "component";
      /**
       * Stable key used while rendering the parsed tree.
       */
      key: string;
      /**
       * Placeholder name that resolves into an entry in {@link TransComponentMap}.
       */
      name: string;
      /**
       * Parsed children nested inside the placeholder.
       */
      children: readonly TransRenderNode[];
    };

/**
 * Parses a translated rich-text message into renderable text/component nodes.
 *
 * @param value Translated string returned by Lingui, including placeholder tags such as `<0>`.
 * @param components Runtime component map keyed by placeholder name.
 * @returns A tree of text and component nodes that can be rendered by the Astro runtime.
 *
 * Unknown placeholders are treated as transparent wrappers and malformed tags fall back to plain
 * text so translation issues do not crash rendering.
 */
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
      if (components[selfClosing.name]) {
        nodes.push({
          kind: "component",
          key: allocateStableNodeKey(selfClosing.name, keyCounters),
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

    if (!parsedChildren.closed) {
      pushText(nodes, value.slice(tagStart, parsedChildren.index));
      cursor = parsedChildren.index;
      continue;
    }

    if (components[opening.name]) {
      nodes.push({
        kind: "component",
        key: allocateStableNodeKey(opening.name, keyCounters),
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
  const count = keyCounters.get(name) ?? 0;
  keyCounters.set(name, count + 1);
  return `${name}:${count}`;
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
    name: match[1]!,
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
    name: match[1]!,
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
    name: match[1]!,
    end: start + match[0].length,
  };
}
