/** Cal.com popup appearance shared by both website themes. */
export const bookingUi = {
  cssVarsPerTheme: {
    light: { "cal-brand": "#211f1f" },
    dark: { "cal-brand": "#fcfafa" },
  },
  hideEventTypeDetails: false,
  layout: "month_view",
  useSlotsViewOnSmallScreen: true,
} as const;

/** Official Cal queue bootstrap, with script loading delegated to Next.js. */
export const bookingBootstrap = `
(function (C, L) {
  let p = function (a, ar) { a.q.push(ar); };
  C.Cal = C.Cal || function () {
    let cal = C.Cal; let ar = arguments;
    if (!cal.loaded) { cal.ns = {}; cal.q = cal.q || []; cal.loaded = true; }
    if (ar[0] === L) {
      const api = function () { p(api, arguments); };
      const namespace = ar[1]; api.q = api.q || [];
      if (typeof namespace === "string") {
        cal.ns[namespace] = cal.ns[namespace] || api;
        p(cal.ns[namespace], ar); p(cal, ["initNamespace", namespace]);
      } else p(cal, ar);
      return;
    }
    p(cal, ar);
  };
})(window, "init");
Cal("init", "meeting", { origin: "https://app.cal.com" });
`;
