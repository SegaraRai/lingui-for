<script lang="ts">
  import { page } from "$app/state";
  import { t } from "lingui-for-svelte/macro";
</script>

<nav
  class="tabs tabs-boxed flex w-full flex-wrap gap-2 bg-base-200/70 p-2"
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
</nav>
