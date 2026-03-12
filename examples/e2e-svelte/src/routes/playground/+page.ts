import type { PageLoad } from "./$types";

import { playgroundCopy } from "$lib/i18n/messages";

export const load: PageLoad = () => ({
  copy: playgroundCopy,
});
