<script lang="ts">
  import { style } from "stillwind/svelte";
  import { t } from "lingui-for-svelte/macro";

  import { page } from "$app/state";
</script>

<nav
  {...style("tabs flex w-full p-2 flex-wrap gap-2 bg-base-200/70")}
  aria-label={$t`Playground sections`}
>
  <a
    href="/playground"
    {...style("tab", page.url.pathname === "/playground" && "tab-active")}
  >
    {$t`Overview`}
  </a>
  <a
    href="/playground/basic"
    {...style("tab", page.url.pathname === "/playground/basic" && "tab-active")}
  >
    {$t`Basic`}
  </a>
  <a
    href="/playground/reactive"
    {...style(
      "tab",
      page.url.pathname === "/playground/reactive" && "tab-active",
    )}
  >
    {$t`Reactive`}
  </a>
  <a
    href="/playground/reactivity"
    {...style(
      "tab",
      page.url.pathname === "/playground/reactivity" && "tab-active",
    )}
  >
    {$t`Reactivity`}
  </a>
  <a
    href="/playground/syntax"
    {...style(
      "tab",
      page.url.pathname === "/playground/syntax" && "tab-active",
    )}
  >
    {$t`Syntax`}
  </a>
  <a
    href="/playground/rich-text"
    {...style(
      "tab",
      page.url.pathname === "/playground/rich-text" && "tab-active",
    )}
  >
    {$t`Rich text`}
  </a>
  <a
    href="/playground/components"
    {...style(
      "tab",
      page.url.pathname === "/playground/components" && "tab-active",
    )}
  >
    {$t`Components`}
  </a>
  <a
    href="/playground/ids"
    {...style("tab", page.url.pathname === "/playground/ids" && "tab-active")}
  >
    {$t`Explicit ids`}
  </a>
  <a
    href="/playground/init-preloaded"
    {...style(
      "tab",
      page.url.pathname === "/playground/init-preloaded" && "tab-active",
    )}
  >
    {$t`Init: Preloaded`}
  </a>
  <a
    href="/playground/init-lazy"
    {...style(
      "tab",
      page.url.pathname === "/playground/init-lazy" && "tab-active",
    )}
  >
    {$t`Init: Lazy`}
  </a>
  <a
    href="/playground/init-isolated"
    {...style(
      "tab",
      page.url.pathname === "/playground/init-isolated" && "tab-active",
    )}
  >
    {$t`Init: Isolated`}
  </a>
</nav>
