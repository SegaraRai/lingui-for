export const load = ({
  locals,
  url,
}: {
  locals: App.Locals;
  url: URL;
}) => {
  // Touch the lang query so SvelteKit reruns this load during client
  // navigations that only change the locale search parameter.
  url.searchParams.get("lang");

  return {
    locale: locals.locale,
  };
};
