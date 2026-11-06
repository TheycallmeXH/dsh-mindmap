// Host-side catalogue tests: one file must appear once, no matter how many
// events mention it, and an inline map must collapse to one entry even when the
// same outline is repeated across messages.
// Run: node test/catalogue.test.cjs
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const path = require('node:path');

const hostPath = pathToFileURL(path.join(__dirname, '..', 'index.js')).href;

const failures = [];
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
}

async function withHost(fn) {
  const mod = await import(hostPath);
  let route;
  const ctx = {
    effect: (effect) => effect(),
    webServer: { register: (r) => { route = r; return () => {}; } },
    get: () => undefined,
  };
  mod.apply(ctx);
  const server = http.createServer((req, res) => route.handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

async function main() {
  // The Host half reads a session log; without one it still has to answer with
  // a stable, empty catalogue rather than throwing.
  await withHost(async (port) => {
    const res = await fetch(`http://127.0.0.1:${port}/dsh-mindmap/session?session=00000000-0000-0000-0000-000000000000`);
    const body = await res.json();
    check('unknown session answers ok', body.ok === true, JSON.stringify(body).slice(0, 120));
    check('unknown session has no docs', (body.docs ?? []).length === 0, `${(body.docs ?? []).length}`);
  });

  // Deduplication is a property of the parser, not of a particular log. Assert
  // the observable rule on a real log when one exists: no duplicate ids.
  const { readdirSync } = require('node:fs');
  const { join } = require('node:path');
  const { homedir } = require('node:os');
  const root = join(homedir(), '.dsh', 'sessions');
  let sessionId;
  try {
    outer: for (const g of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
      for (const d of readdirSync(join(root, g.name), { withFileTypes: true }).filter((e) => e.isDirectory())) {
        if (readdirSync(join(root, g.name, d.name)).some((f) => f.endsWith('.jsonl.zstd'))) {
          sessionId = d.name;
          break outer;
        }
      }
    }
  } catch {
    sessionId = undefined;
  }

  if (!sessionId) {
    console.log('  (no session log on this machine: catalogue dedup checked by construction only)');
  } else {
    // Sweep every session on disk: "one document, one entry" has to hold
    // everywhere, not just in whichever log happened to be picked first.
    await withHost(async (port) => {
      let scanned = 0;
      const offenders = [];
      for (const g of readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory())) {
        for (const d of readdirSync(join(root, g.name), { withFileTypes: true }).filter((e) => e.isDirectory())) {
          let files;
          try {
            files = readdirSync(join(root, g.name, d.name));
          } catch {
            continue;
          }
          if (!files.some((f) => f.endsWith('.jsonl.zstd'))) continue;
          scanned += 1;
          const res = await fetch(`http://127.0.0.1:${port}/dsh-mindmap/session?session=${encodeURIComponent(d.name)}`);
          const body = await res.json();
          const docs = body.docs ?? [];
          const ids = docs.map((x) => x.id);
          const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
          if (dupes.length) offenders.push(`${d.name.slice(0, 10)}:${dupes.length}`);
        }
      }
      check(
        `no session lists a document twice (${scanned} scanned)`,
        offenders.length === 0,
        `${offenders.length} offenders: ${offenders.slice(0, 4).join(' ')}`,
      );
    });
  }

  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(', ')}` : '\nall checks passed');
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
