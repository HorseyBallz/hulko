// Cloud sync (opt-in in Settings). The browser encrypts its data before sending it, with a key that never leaves the
// user's devices; this only keeps the encrypted text under an id made from that key, with a revision number so two
// devices can't overwrite each other unknowingly. GET reads, PUT writes (409 when the revision moved on), DELETE
// removes. Same D1 database as the user counter (USERS); the table is made on first use.
const ID = /^[0-9a-f]{32}$/;
const MAX = 200000;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { "content-type": "application/json", "cache-control": "no-store" }
});

async function query(db, run) {
  try { return await run(); }
  catch (e) {
    if (!/no such table/i.test(String(e && e.message))) throw e;
    await db.prepare("CREATE TABLE IF NOT EXISTS sync (id TEXT PRIMARY KEY, rev INTEGER NOT NULL, data TEXT NOT NULL, at INTEGER NOT NULL)").run();
    return run();
  }
}

export async function onRequest({ request, env }) {
  const db = env.USERS;
  if (!db) return json({ error: "no database" }, 503);
  const id = new URL(request.url).searchParams.get("id") || "";
  if (!ID.test(id)) return json({ error: "bad id" }, 400);
  const row = () => query(db, () => db.prepare("SELECT rev, data FROM sync WHERE id = ?").bind(id).first());

  if (request.method === "GET") {
    const r = await row();
    return r ? json({ rev: r.rev, data: r.data }) : json({ error: "none" }, 404);
  }
  if (request.method === "DELETE") {
    await query(db, () => db.prepare("DELETE FROM sync WHERE id = ?").bind(id).run());
    return json({ ok: true });
  }
  if (request.method !== "PUT") return json({ error: "method" }, 405);

  let body = null;
  try { body = await request.json(); } catch (e) {}
  const { rev, data } = body || {};
  if (!Number.isInteger(rev) || rev < 0 || typeof data !== "string" || !data || data.length > MAX) return json({ error: "bad body" }, 400);
  // rev is the revision this device last saw: 0 makes a new row, anything else must still be the newest
  const res = await query(db, () => rev === 0
    // shortcut: no new row while 100 rows were written in the last hour, site-wide (same reason as the cap in users.js);
    // existing rows still save. Counts every written row, not only new ones, so updating a row can't hide it from the cap
    ? db.prepare("INSERT OR IGNORE INTO sync (id, rev, data, at) SELECT ?1, 1, ?2, ?3 WHERE (SELECT COUNT(*) FROM sync WHERE at > ?3 - 3600000) < 100").bind(id, data, Date.now()).run()
    : db.prepare("UPDATE sync SET rev = rev + 1, data = ?, at = ? WHERE id = ? AND rev = ?").bind(data, Date.now(), id, rev).run());
  if (!res.meta.changes) {
    const r = await row();
    if (!r && rev === 0) return json({ error: "busy" }, 429);
    return json({ error: "conflict", rev: r ? r.rev : 0 }, 409);
  }
  return json({ rev: rev + 1 });
}
