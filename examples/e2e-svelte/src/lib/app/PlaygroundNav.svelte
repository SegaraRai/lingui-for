<script lang="ts">
  import { t } from "lingui-for-svelte/macro";

  import { page } from "$app/state";
</script>

<nav
  class="tabs tabs-boxed bg-base-200/70 flex w-full flex-wrap gap-2 p-2"
  aria-label={$t`Playground sections`}
>
  <a
    href="/playground"
    class="tab"
    class:tab-active={page.url.pathname === "/playground"}
  >
    {$t`Overview`}
  </a>
  <a
    href="/playground/basic"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/basic"}
  >
    {$t`Basic`}
  </a>
  <a
    href="/playground/reactive"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/reactive"}
  >
    {$t`Reactive`}
  </a>
  <a
    href="/playground/syntax"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/syntax"}
  >
    {$t`Syntax`}
  </a>
  <a
    href="/playground/rich-text"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/rich-text"}
  >
    {$t`Rich text`}
  </a>
  <a
    href="/playground/components"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/components"}
  >
    {$t`Components`}
  </a>
  <a
    href="/playground/ids"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/ids"}
  >
    {$t`Explicit ids`}
  </a>
  <a
    href="/playground/init-preloaded"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/init-preloaded"}
  >
    {$t`Init: Preloaded`}
  </a>
  <a
    href="/playground/init-lazy"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/init-lazy"}
  >
    {$t`Init: Lazy`}
  </a>
  <a
    href="/playground/init-isolated"
    class="tab"
    class:tab-active={page.url.pathname === "/playground/init-isolated"}
  >
    {$t`Init: Isolated`}
  </a>
</nav>
