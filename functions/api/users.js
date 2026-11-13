// Counts the browsers that use the public tracker. Each one sends only a random id that it made itself (no name,
// no address, no cookie); POST adds it once, GET only reads. Both answer {count}. USERS is a D1 database bound to
// the Pages project; its one table is made on first use.
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

async function query(db, run) {
  try { return await run(); }
  catch (e) {
    if (!/no such table/i.test(String(e && e.message))) throw e;
    await db.prepare("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, first INTEGER NOT NULL)").run();
    return run();
  }
}

export async function onRequest({ request, env }) {
  const db = env.USERS;
  if (!db) return json({ error: "no database" }, 503);
  if (request.method === "POST") {
    let id = null;
    try { ({ id } = await request.json()); } catch (e) {}
    if (typeof id !== "string" || !ID.test(id)) return json({ error: "bad id" }, 400);
    // shortcut: at most 300 new ids an hour site-wide, past that the id is just not added (pages.dev can't take a
    // Cloudflare rate-limit rule and no address is kept to limit per visitor); use a rule once the app has its own domain
    await query(db, () => db.prepare("INSERT OR IGNORE INTO users (id, first) SELECT ?1, ?2 WHERE (SELECT COUNT(*) FROM users WHERE first > ?2 - 3600000) < 300").bind(id.toLowerCase(), Date.now()).run());
  } else if (request.method !== "GET") {
    return json({ error: "method" }, 405);
  }
  const row = await query(db, () => db.prepare("SELECT COUNT(*) AS n FROM users").first());
  return json({ count: row ? row.n : 0 });
}
