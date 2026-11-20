// The app lives on fit.hulko.xyz only: the project's own *.pages.dev addresses answer 404, and hulko.xyz (the future
// page for every faculty) forwards to fit.hulko.xyz/import, which first copies the data browsers saved on hulko.xyz (via /export).
// shortcut: every request now runs a Function (free plan: 100k/day), switch to a Bulk Redirect if traffic gets near that
export const onRequest = ({ request, next }) => {
  const url = new URL(request.url);
  if (url.hostname.endsWith('.pages.dev')) return new Response('Not found', { status: 404 });
  // /api stays for tabs still open on hulko.xyz; 302, not 301, since browsers would keep a 301 after hulko.xyz gets its own page
  if (url.hostname === 'hulko.xyz' && !/^\/(api\/|export(\.html)?$)/.test(url.pathname))
    return Response.redirect('https://fit.hulko.xyz/import?to=' + encodeURIComponent(url.pathname + url.search), 302);
  return next();
};
