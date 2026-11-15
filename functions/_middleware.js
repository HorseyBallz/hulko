// The app lives on hulko.xyz only: the project's own *.pages.dev addresses answer 404.
// shortcut: every request now runs a Function (free plan: 100k/day), switch to a Bulk Redirect if traffic gets near that
export const onRequest = ({ request, next }) =>
  new URL(request.url).hostname.endsWith('.pages.dev') ? new Response('Not found', { status: 404 }) : next();
