import type { I18n, MessageDescriptor, MessageOptions } from "@lingui/core";

export type {
  I18n,
  Locale,
  Locales,
  MessageDescriptor,
  Messages,
} from "@lingui/core";

export const LINGUI_ASTRO_CONTEXT = "__lingui_for_astro__";

export interface LinguiContext {
  i18n: I18n;
}

export interface AstroLike {
  locals: object;
}

export type TransComponentDescriptor =
  | {
      kind: "element";
      tag: string;
      props?: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "component";
      component: unknown;
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

export function setLinguiContext(
  locals: object,
  instance: I18n,
): LinguiContext {
  const context = { i18n: instance };
  (locals as Record<string, unknown>)[LINGUI_ASTRO_CONTEXT] = context;
  return context;
}

export function getLinguiContext(astro: AstroLike): LinguiContext {
  const context = (astro.locals as Record<string, unknown>)[
    LINGUI_ASTRO_CONTEXT
  ];

  if (!context || typeof context !== "object" || !("i18n" in context)) {
    throw new Error(
      "lingui-for-astro runtime context is missing. Set it in middleware or page setup before rendering translated Astro content.",
    );
  }

  return context as LinguiContext;
}

export function mergeRuntimeTransValues(
  descriptor: MessageDescriptor,
  values: Readonly<Record<string, unknown>> = {},
): MessageDescriptor {
  return {
    ...descriptor,
    values: {
      ...descriptor.values,
      ...values,
    },
  };
}

export function translateRuntimeTrans(
  i18n: I18n,
  message: MessageDescriptor | string | undefined,
  values: Readonly<Record<string, unknown>> = {},
  id?: string,
  options?: Omit<MessageOptions, "message">,
): string {
  if (typeof message === "string") {
    return i18n._(id ?? message, values, {
      ...options,
      message,
    });
  }

  if (message) {
    return i18n._(mergeRuntimeTransValues(message, values));
  }

  if (id) {
    return i18n._(id, values, options);
  }

  return "";
}

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

export function RuntimeTrans(): never {
  throw new Error(
    "lingui-for-astro/runtime RuntimeTrans is a compile-time target and should not be called directly.",
  );
}
