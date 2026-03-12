import type { PageLoad } from "./$types";

import { homeHero, routeCards } from "$lib/i18n/messages";

export const load: PageLoad = () => ({
  hero: homeHero,
  cards: routeCards,
});
