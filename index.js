/**
 * Host half of `@local/dsh-mindmap`.
 *
 * Responsibilities, all through `ctx.webServer` (same-origin routes the browser
 * half fetches directly) plus `node:fs` under the owning Session's directory:
 *
 *   GET  /dsh-mindmap/health                 -> { ok, version }
 *   GET  /dsh-mindmap/session?session=<id>   -> { ok, cwd, docs:[…] }
 *   GET  /dsh-mindmap/doc?session=&doc=<id>  -> { ok, doc }
 *   GET  /dsh-mindmap/doc?session=&path=<p>  -> { ok, doc }
 *   POST /dsh-mindmap/save  {session,path|docId,doc} -> { ok, path, doc }
 *   POST /dsh-mindmap/saveas{session,path?,title,doc} -> { ok, path, doc }
 *   GET  /dsh-mindmap/list?session=&dir=<p>  -> { ok, entries }
 *
 * Markdown is the source of truth for mind maps: headings and list items are
 * the nodes, `%%…%%` markers carry colour/fold/callout, paragraphs under a
 * node are its note. `.xmind` archives are read through a built-in zip reader
 * (content.json for XMind Zen/2020+, content.xml for XMind 8) and open
 * read-only; saving converts them to a `.md` note beside the archive, the same
 * move the Obsidian plugin's “Convert to Markdown note” makes.
 */
import { readFile, readdir, stat, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateRawSync, zstdDecompressSync } from 'node:zlib';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';

const VERSION = '1.0.0';
const BASE = '/dsh-mindmap';
const SESSIONS_ROOT = join(homedir(), '.dsh', 'sessions');
const MAX_DOC_BYTES = 4 * 1024 * 1024;
const MAX_SAVE_BYTES = 2 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* session log                                                         */
/* ------------------------------------------------------------------ */

const MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function decompressFrames(buf) {
  const starts = [];
  let idx = buf.indexOf(MAGIC, 0);
  while (idx >= 0) {
    starts.push(idx);
    idx = buf.indexOf(MAGIC, idx + 4);
  }
  let text = '';
  for (let i = 0; i < starts.length; i += 1) {
    const end = i + 1 < starts.length ? starts[i + 1] : buf.length;
    try {
      text += zstdDecompressSync(buf.subarray(starts[i], end)).toString('utf8');
    } catch {
      /* truncated or trailing frame */
    }
  }
  return text;
}

async function findSessionLog(sessionId) {
  const target = String(sessionId ?? '')
    .split(/[\\/]/)
    .filter(Boolean)
    .pop();
  if (!target || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(target) || target.includes('..')) return undefined;
  let groups;
  try {
    groups = await readdir(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const group of groups) {
    if (!group.isDirectory()) continue;
    const dir = join(SESSIONS_ROOT, group.name, target);
    let entries;
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    const logs = entries.filter((name) => name.endsWith('.jsonl.zstd')).sort();
    if (logs.length) return join(dir, logs[logs.length - 1]);
  }
  return undefined;
}

const logCache = new Map();
const LOG_CACHE_LIMIT = 8;

/** Read-and-fold one session log: header, cwd, and every mind-map candidate. */
async function readSession(sessionId) {
  const file = await findSessionLog(sessionId);
  if (!file) return { file: undefined, cwd: undefined, docs: [] };
  let info;
  try {
    info = await stat(file);
  } catch {
    return { file, cwd: undefined, docs: [] };
  }
  const hit = logCache.get(file);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit;
  const record = { file, mtimeMs: info.mtimeMs, size: info.size, cwd: undefined, docs: [] };
  try {
    const text = decompressFrames(await readFile(file));
    for (const line of text.split('\n')) {
      if (!line) continue;
      // Cheap pre-filter: only four event shapes can carry a mind map.
      if (
        !line.includes('"session"') &&
        !line.includes('assistant/message') &&
        !line.includes('deliverables/presented') &&
        !line.includes('"tool/call"')
      ) {
        continue;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      collectEvent(record, event);
    }
  } catch {
    /* unreadable log: answer with an empty catalogue */
  }
  // One file can be seen twice: a delivered file is also a written file when
  // the Turn both created it and presented it, and an inline map can repeat
  // across streamed assistant messages. Both carry the same id, so collapse
  // them here and keep the latest sighting — otherwise the UI lists the same
  // map several times.
  if (record.docs.length > 1) {
    const byId = new Map();
    for (const doc of record.docs) {
      const prev = byId.get(doc.id);
      if (!prev || (doc.seq ?? 0) > (prev.seq ?? 0)) byId.set(doc.id, doc);
    }
    record.docs = [...byId.values()].sort((a, b) => (b.seq ?? 0) - (a.seq ?? 0));
  }
  logCache.set(file, record);
  while (logCache.size > LOG_CACHE_LIMIT) {
    const oldest = logCache.keys().next();
    if (oldest.done) break;
    logCache.delete(oldest.value);
  }
  return record;
}

function collectEvent(record, event) {
  const type = event?.type;
  const data = event?.data ?? {};
  if (type === 'session') {
    // The header is flat on the event; `data` is the wrapper for every other type.
    const cwd = typeof event.cwd === 'string' ? event.cwd : typeof data.cwd === 'string' ? data.cwd : undefined;
    if (cwd) record.cwd = cwd;
    return;
  }
  if (type === 'assistant/message') {
    const turn = typeof data.turn === 'number' ? data.turn : null;
    const messageId = typeof data?.message?.id === 'string' ? data.message.id : undefined;
    const content = data?.message?.content;
    if (!Array.isArray(content)) return;
    content.forEach((block) => {
      if (block?.type !== 'text' || typeof block.text !== 'string') return;
      for (const map of extractMarkdownMaps(block.text)) {
        record.docs.push({
          // Keyed by content, not by where it was found: the same outline can
          // appear in a streamed message and in the settled message, and those
          // are one map as far as the reader is concerned.
          id: `m:${inlineFingerprint(map.markdown)}`,
          kind: 'inline',
          source: 'message',
          title: map.title,
          messageId,
          turn,
          seq: event.seq,
          nodes: map.nodes,
          depth: map.depth,
          format: 'markdown',
          markdown: map.markdown,
        });
      }
    });
    return;
  }
  if (type === 'deliverables/presented') {
    const turn = typeof data.turn === 'number' ? data.turn : null;
    for (const file of Array.isArray(data.files) ? data.files : []) {
      const path = typeof file?.path === 'string' ? file.path : null;
      if (!path) continue;
      const ext = extname(path).toLowerCase();
      if (ext !== '.md' && ext !== '.markdown' && ext !== '.xmind') continue;
      record.docs.push({
        id: `f:${path}`,
        kind: 'file',
        source: 'deliverable',
        title: basename(path).replace(/\.(md|markdown|xmind)$/i, ''),
        path,
        turn,
        seq: event.seq,
        format: ext === '.xmind' ? 'xmind' : 'markdown',
      });
    }
    return;
  }
  if (type === 'tool/call') {
    const name = String(data.name ?? '');
    if (!/^(write|edit|create_file|write_file|str_replace_editor)$/.test(name)) return;
    let args;
    try {
      args = typeof data.arguments === 'string' ? JSON.parse(data.arguments) : data.arguments;
    } catch {
      return;
    }
    const path = typeof args?.path === 'string' ? args.path : typeof args?.file_path === 'string' ? args.file_path : undefined;
    if (!path) return;
    const ext = extname(path).toLowerCase();
    if (ext === '.xmind') {
      record.docs.push({
        id: `f:${path}`,
        kind: 'file',
        source: 'write',
        title: basename(path).replace(/\.xmind$/i, ''),
        path,
        turn: typeof data.turn === 'number' ? data.turn : null,
        seq: event.seq,
        format: 'xmind',
      });
      return;
    }
    if (ext !== '.md' && ext !== '.markdown') return;
    const text = typeof args?.content === 'string' ? args.content : typeof args?.new_string === 'string' ? args.new_string : undefined;
    if (typeof text !== 'string') return;
    // Only a note that opts in counts. Shape alone listed ordinary structured
    // notes (a README with headings, a round report with a list) as maps.
    if (!declaresMindmap(text)) return;
    const tree = parseMarkdown(text, titleOf(path));
    if (!looksLikeMindmap(tree)) return;
    record.docs.push({
      id: `f:${path}`,
      kind: 'file',
      source: 'write',
      title: titleOf(path),
      path,
      turn: typeof data.turn === 'number' ? data.turn : null,
      seq: event.seq,
      nodes: countNodes(tree),
      depth: treeDepth(tree),
      format: 'markdown',
    });
  }
}

function titleOf(path) {
  return basename(path).replace(/\.(md|markdown|xmind)$/i, '');
}

/* ------------------------------------------------------------------ */
/* Markdown <-> tree                                                   */
/* ------------------------------------------------------------------ */

let nodeSeq = 0;
function newId() {
  nodeSeq += 1;
  return `n${nodeSeq.toString(36)}`;
}

const HEADING = /^(#{1,6})[ \t]+(.*)$/;
const ITEM = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]+(.*)$/;
const MARKER_ONLY = /^\s*%%(.+?)%%\s*$/;
const MARKER_TAIL = /\s*%%([^%\n]+)%%\s*$/;

function splitMarkers(text) {
  const markers = [];
  let rest = String(text ?? '');
  for (;;) {
    const match = MARKER_TAIL.exec(rest);
    if (!match) break;
    markers.unshift(match[1].trim());
    rest = rest.slice(0, match.index);
  }
  return { text: rest, markers };
}

/**
 * Markdown -> tree. Headings nest by level, list items nest by indent, and
 * anything else under a node becomes that node's note. The first H1 is the
 * central topic; without one the fallback title is used.
 */
export function parseMarkdown(text, fallbackTitle) {
  const src = String(text ?? '');
  const lines = src.split(/\r?\n/);
  const root = { id: 'root', text: String(fallbackTitle || '思维导图'), note: '', markers: [], children: [] };
  const stack = [{ node: root, rank: 0 }];
  let sawH1 = false;
  let noteBuf = [];
  let inFence = false;
  let inFront = lines[0] === '---';
  let frontLine = 1;

  const flushNote = () => {
    const body = noteBuf.join('\n').replace(/^\n+|\n+$/g, '');
    if (body) {
      const target = stack[stack.length - 1].node;
      target.note = target.note ? `${target.note}\n${body}` : body;
    }
    noteBuf = [];
  };
  const push = (rank, node) => {
    flushNote();
    while (stack.length > 1 && stack[stack.length - 1].rank >= rank) stack.pop();
    stack[stack.length - 1].node.children.push(node);
    stack.push({ node, rank });
  };

  for (let i = 0; i < lines.length; i += 1) {
    let line = lines[i];

    if (inFront) {
      if (i > 0 && /^---\s*$/.test(line)) inFront = false;
      frontLine = i;
      continue;
    }
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      noteBuf.push(line);
      continue;
    }
    if (inFence) {
      noteBuf.push(line);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const level = heading[1].length;
      const { text: body, markers } = splitMarkers(heading[2].trim());
      if (level === 1 && !sawH1) {
        sawH1 = true;
        flushNote();
        root.text = body || root.text;
        root.markers = markers;
        stack.length = 1;
        continue;
      }
      const node = { id: newId(), text: body || '未命名', note: '', markers, children: [] };
      push(level, node);
      continue;
    }

    const item = ITEM.exec(line);
    if (item) {
      const indent = item[1].replace(/\t/g, '  ').length;
      const { text: body, markers } = splitMarkers(item[2].trim());
      if (!body && !markers.length) {
        noteBuf.push('');
        continue;
      }
      const node = { id: newId(), text: body || '未命名', note: '', markers, children: [] };
      push(1000 + indent, node);
      continue;
    }

    const markerOnly = MARKER_ONLY.exec(line);
    if (markerOnly && stack.length > 1) {
      flushNote();
      stack[stack.length - 1].node.markers.push(markerOnly[1].trim());
      continue;
    }

    if (/^\s*%%[^%]*%%\s*$/.test(line) && stack.length === 1) {
      root.markers.push(line.trim().slice(2, -2).trim());
      continue;
    }

    noteBuf.push(line);
  }
  flushNote();
  if (frontLine >= 0) {
    /* frontmatter is irrelevant to the map; the tree carries what matters */
  }
  return root;
}

/** Tree -> markdown. Headings down to H4, lists deeper; markers and notes kept. */
export function renderMarkdown(root) {
  const out = [];
  const lines = [];
  const walk = (node, depth) => {
    const text = String(node.text ?? '').replace(/\r?\n/g, '<br>');
    const markers = Array.isArray(node.markers) ? node.markers.filter(Boolean) : [];
    if (depth === 0) {
      lines.push(`# ${text}`);
      for (const marker of markers) lines.push(`%%${marker}%%`);
    } else if (depth <= 3) {
      lines.push(`${'#'.repeat(depth + 1)} ${text}`);
      for (const marker of markers) lines.push(`%%${marker}%%`);
    } else {
      const indent = '  '.repeat(Math.max(0, depth - 4));
      const tail = markers.map((marker) => ` %%${marker}%%`).join('');
      lines.push(`${indent}- ${text}${tail}`);
    }
    if (node.note && String(node.note).trim()) {
      for (const line of String(node.note).replace(/\r\n/g, '\n').split('\n')) lines.push(line);
    }
    const kids = Array.isArray(node.children) ? node.children : [];
    if (kids.length && depth >= 1) lines.push('');
    for (const kid of kids) walk(kid, depth + 1);
  };
  walk(root, 0);
  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
  const meta = '---\nmindmap: true\n---\n\n';
  return `${meta}${body}\n`;
}

export function countNodes(node) {
  let total = 1;
  for (const kid of node.children ?? []) total += countNodes(kid);
  return total;
}

export function treeDepth(node, depth = 0) {
  let best = depth;
  for (const kid of node.children ?? []) best = Math.max(best, treeDepth(kid, depth + 1));
  return best;
}

/**
 * Is this document an intentional mind map?
 *
 * Shape alone is not evidence: any note with a couple of headings and a list
 * has "3 nodes and depth 1", which is why ordinary notes kept surfacing as
 * maps. A document counts only when it opts in — a `mindmap: true` (or
 * `mindmap-structure:` / `mindmap-theme:`) front matter key, or a ```mindmap
 * fence somewhere inside it. Reading the front matter of the file itself is
 * what separates "someone drew a map" from "someone wrote structured notes".
 */
export function declaresMindmap(text) {
  const src = String(text ?? '');
  const front = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(src);
  if (front) {
    // Only the front matter block, so a stray `mindmap: true` in prose cannot
    // opt a note in.
    if (/^\s*mindmap(-structure|-theme|-edge|-edge-dash|-edge-corner)?\s*:/im.test(front[1])) return true;
  }
  return /```(?:mindmap|gogoga-mindmap)\b/i.test(src);
}

/**
 * A file is a map when it declares itself one and has a tree worth opening.
 * Kept separate from `declaresMindmap` so the shape check still guards against
 * a declared-but-empty map.
 */
export function looksLikeMindmap(tree) {
  const nodes = countNodes(tree);
  const depth = treeDepth(tree);
  return nodes >= 3 && depth >= 1;
}

/**
 * A stable id for one inline map, derived from its text rather than from its
 * position in the log. The same outline can surface in a streamed message and
 * again in the settled one; hashing the content collapses those into a single
 * entry.
 */
function inlineFingerprint(markdown) {
  return createHash('sha1').update(String(markdown ?? '')).digest('hex').slice(0, 16);
}

/**
 * Pull mind maps out of assistant text.
 *
 * Only an explicit ```mindmap / ```gogoga-mindmap fence counts. An earlier
 * version also guessed from "a run of headings and nested lists", which
 * surfaced ordinary structured answers as maps — so a turn-tail chip appeared
 * under replies that had deliberately not been drawn as a map.
 */
function extractMarkdownMaps(text) {
  const found = [];
  const fence = /```(?:mindmap|gogoga-mindmap)[^\n]*\n([\s\S]*?)```/gi;
  let match;
  while ((match = fence.exec(text)) !== null) {
    const body = match[1];
    const tree = parseMarkdown(body, '思维导图');
    if (!looksLikeMindmap(tree)) continue;
    found.push({
      offset: match.index,
      title: tree.text,
      markdown: body,
      nodes: countNodes(tree),
      depth: treeDepth(tree),
    });
  }
  return found;
}

/* ------------------------------------------------------------------ */
/* zip (for .xmind)                                                    */
/* ------------------------------------------------------------------ */

function readZip(buf) {
  const EOCD = 0x06054b50;
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i -= 1) {
    if (buf.readUInt32LE(i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not a zip archive');
  const count = buf.readUInt16LE(eocd + 10);
  let offset = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i += 1) {
    if (buf.readUInt32LE(offset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const nameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localOffset = buf.readUInt32LE(offset + 42);
    const name = buf.subarray(offset + 46, offset + 46 + nameLen).toString('utf8');
    entries.set(name, { method, compressedSize, localOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return {
    names: [...entries.keys()],
    read(name) {
      const entry = entries.get(name);
      if (!entry) return undefined;
      const head = entry.localOffset;
      if (buf.readUInt32LE(head) !== 0x04034b50) return undefined;
      const nameLen = buf.readUInt16LE(head + 26);
      const extraLen = buf.readUInt16LE(head + 28);
      const start = head + 30 + nameLen + extraLen;
      const raw = buf.subarray(start, start + entry.compressedSize);
      return entry.method === 8 ? inflateRawSync(raw) : Buffer.from(raw);
    },
  };
}

function xmindTopic(topic) {
  if (!topic || typeof topic !== 'object') return undefined;
  const rawTitle = topic.title ?? topic.topic ?? '';
  const node = {
    id: newId(),
    text: String(rawTitle).replace(/<[^>]+>/g, '').trim() || '未命名',
    note: typeof topic?.notes?.plain?.content === 'string' ? topic.notes.plain.content : '',
    markers: Array.isArray(topic.markers)
      ? topic.markers.map((marker) => (typeof marker === 'string' ? marker : marker?.markerId)).filter(Boolean)
      : [],
    children: [],
  };
  const attached = topic?.children?.attached ?? topic?.children?.topics ?? [];
  for (const kid of attached) {
    const child = xmindTopic(kid);
    if (child) node.children.push(child);
  }
  for (const kid of topic?.children?.detached ?? []) {
    const child = xmindTopic(kid);
    if (child) node.children.push(child);
  }
  return node;
}

function mimeOfText(text) {
  return typeof text === 'string' ? text : '';
}
/** Parse an .xmind archive into one sheet of nodes (first sheet wins). */
function parseXmind(buf) {
  const zip = readZip(buf);
  const sheets = [];
  if (zip.names.includes('content.json')) {
    const json = JSON.parse(zip.read('content.json').toString('utf8'));
    const list = Array.isArray(json) ? json : [json];
    for (const sheet of list) {
      const rootTopic = sheet?.rootTopic ?? sheet?.topic;
      if (!rootTopic) continue;
      sheets.push({ name: String(sheet?.title ?? 'Sheet'), root: xmindTopic(rootTopic) });
    }
  } else if (zip.names.includes('content.xml')) {
    const xml = zip.read('content.xml').toString('utf8');
    for (const sheetXml of xml.match(/<sheet\b[\s\S]*?<\/sheet>/g) ?? []) {
      const title = /<title>([\s\S]*?)<\/title>/.exec(sheetXml)?.[1] ?? 'Sheet';
      const rootXml = /<topic\b[\s\S]*<\/topic>/.exec(sheetXml)?.[0];
      const root = rootXml ? xmlTopic(rootXml) : undefined;
      if (root) sheets.push({ name: title, root });
    }
  }
  if (!sheets.length) throw new Error('no sheet in this .xmind archive');
  return sheets;
}

function xmlTopic(xml) {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(xml);
  const node = {
    id: newId(),
    text: String(titleMatch?.[1] ?? '未命名')
      .replace(/<[^>]+>/g, '')
      .trim() || '未命名',
    note: '',
    markers: [],
    children: [],
  };
  const attach = /<topics\b[^>]*type="attached"[^>]*>([\s\S]*?)<\/topics>/.exec(xml);
  if (attach) {
    for (const child of attach[1].match(/<topic\b[\s\S]*?<\/topic>/g) ?? []) {
      node.children.push(xmlTopic(child));
    }
  }
  return node;
}

/* ------------------------------------------------------------------ */
/* documents                                                           */
/* ------------------------------------------------------------------ */

const docCache = new Map();
const DOC_CACHE_LIMIT = 24;

async function readDocFile(path) {
  let info;
  try {
    info = await stat(path);
  } catch (error) {
    throw new Error(`cannot read ${path}: ${error?.code ?? error}`);
  }
  if (!info.isFile()) throw new Error('not a file');
  if (info.size > MAX_DOC_BYTES) throw new Error('file is too large for the mind map viewer');
  const hit = docCache.get(path);
  if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit;
  const bytes = await readFile(path);
  const ext = extname(path).toLowerCase();
  let doc;
  if (ext === '.xmind') {
    const sheets = parseXmind(bytes);
    doc = {
      format: 'xmind',
      readOnly: true,
      sheet: sheets[0].name,
      sheets: sheets.map((sheet) => ({ name: sheet.name, root: sheet.root })),
      root: sheets[0].root,
    };
  } else {
    const text = bytes.toString('utf8');
    // Opening a note in the map view is an explicit act, but the *listing* must
    // not imply every .md is a map. Refusing here keeps the browser and the
    // turn-tail chips honest about what counted, while still letting the user
    // open any file they deliberately pick.
    const tree = parseMarkdown(text, titleOf(path));
    doc = { format: 'markdown', readOnly: false, root: tree, declared: declaresMindmap(text) };
  }
  const record = { mtimeMs: info.mtimeMs, size: info.size, doc: { ...doc, path, title: titleOf(path) } };
  docCache.set(path, record);
  while (docCache.size > DOC_CACHE_LIMIT) {
    const oldest = docCache.keys().next();
    if (oldest.done) break;
    docCache.delete(oldest.value);
  }
  return record;
}

function inlineDoc(entry) {
  const tree = parseMarkdown(entry.markdown, entry.title || '思维导图');
  return {
    format: 'markdown',
    readOnly: false,
    inline: true,
    title: entry.title || tree.text,
    root: tree,
  };
}

/** Resolve an absolute path inside `root`, or throw. */
function confine(root, path) {
  const absolute = resolve(path);
  if (!root) return absolute;
  const rel = relative(resolve(root), absolute);
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return absolute;
  throw new Error('path is outside the session workspace');
}

/* ------------------------------------------------------------------ */
/* Open the note with whatever the OS has associated                    */
/* ------------------------------------------------------------------ */

/**
 * Hand a file to the operating system's default handler for its extension.
 *
 * Deliberately ignorant of which app that is: no vault registry, no executable
 * search, no `obsidian://` URL. Whatever the user associated with `.md` opens,
 * and a note that is not in a vault cannot provoke Obsidian into creating one.
 * Windows goes through the shell's own `FileProtocolHandler`; macOS uses `open`
 * and Linux `xdg-open`. The path is passed as one argv element, never a shell
 * string, and the caller has already confined it to the Session workspace.
 */
async function launchDefault(target) {
  const cwd = dirname(target);
  const subprocess = typeof ctxRef.get === 'function' ? ctxRef.get('subprocess') : undefined;
  const argv =
    process.platform === 'win32'
      ? ['rundll32.exe', 'url.dll,FileProtocolHandler', target]
      : process.platform === 'darwin'
        ? ['open', target]
        : ['xdg-open', target];
  if (subprocess && typeof subprocess.spawn === 'function') {
    const handle = subprocess.spawn({
      argv,
      cwd,
      stdio: { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
      graceMs: 1500,
    });
    // The shell launcher exits as soon as the association is handed off; a
    // non-zero exit here is the one failure the caller can act on.
    const outcome = await Promise.race([
      handle.done,
      new Promise((resolvePromise) => setTimeout(() => resolvePromise(undefined), 2500)),
    ]);
    if (outcome && typeof outcome.exitCode === 'number' && outcome.exitCode !== 0) {
      return { ok: false, error: `launcher exited with ${outcome.exitCode}`, argv: argv[0] };
    }
    return { ok: true, launcher: argv[0] };
  }
  // No subprocess service: fall back to the in-process launcher.
  const { spawn } = await import('node:child_process');
  const child = spawn(argv[0], argv.slice(1), { cwd, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return { ok: true, launcher: argv[0] };
}

/* ------------------------------------------------------------------ */
/* http                                                                */
/* ------------------------------------------------------------------ */

function sendJson(res, body, status = 200) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(payload.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(payload);
}

function readBody(req, limit) {
  return new Promise((resolvePromise, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > limit) {
        reject(new Error('request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolvePromise(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch (error) {
        reject(new Error(`invalid JSON body: ${error?.message ?? error}`));
      }
    });
    req.on('error', reject);
  });
}

async function handle(req, res) {
  const host = req.headers.host ?? '127.0.0.1';
  const url = new URL(req.url ?? '/', `http://${host}`);
  if (!url.pathname.startsWith(BASE)) return undefined;
  const route = url.pathname.slice(BASE.length) || '/';
  const method = String(req.method ?? 'GET').toUpperCase();

  try {
    if (route === '/health') return sendJson(res, { ok: true, version: VERSION });

    if (route === '/session' && method === 'GET') {
      const sessionId = url.searchParams.get('session') ?? '';
      const record = await readSession(sessionId);
      // A file doc's shape is read lazily; only its metadata is listed here.
      const docs = record.docs.map(({ markdown, ...rest }) => rest);
      return sendJson(res, { ok: true, cwd: record.cwd, docs });
    }

    if (route === '/doc' && method === 'GET') {
      const sessionId = url.searchParams.get('session') ?? '';
      const record = await readSession(sessionId);
      const docId = url.searchParams.get('doc');
      const path = url.searchParams.get('path');
      if (path) {
        const absolute = confine(record.cwd, path);
        const loaded = await readDocFile(absolute);
        return sendJson(res, { ok: true, doc: loaded.doc });
      }
      if (!docId) return sendJson(res, { ok: false, error: 'doc or path required' }, 400);
      const entry = record.docs.find((candidate) => candidate.id === docId);
      if (!entry) return sendJson(res, { ok: false, error: 'unknown document' }, 404);
      if (entry.kind === 'inline') {
        const doc = inlineDoc(entry);
        return sendJson(res, { ok: true, doc: { ...doc, id: entry.id, title: doc.title } });
      }
      const absolute = confine(record.cwd, entry.path);
      const loaded = await readDocFile(absolute);
      return sendJson(res, { ok: true, doc: { ...loaded.doc, id: entry.id } });
    }

    if (route === '/save' && method === 'POST') {
      const body = await readBody(req, MAX_SAVE_BYTES);
      const record = await readSession(String(body.session ?? ''));
      const doc = body.doc;
      if (!doc || !doc.root) return sendJson(res, { ok: false, error: 'doc required' }, 400);
      const markdown = renderMarkdown(doc.root);
      const target = body.path
        ? confine(record.cwd, body.path)
        : doc.path
          ? confine(record.cwd, doc.path)
          : undefined;
      if (!target) return sendJson(res, { ok: false, error: 'path required for this document' }, 400);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, markdown, 'utf8');
      docCache.delete(target);
      return sendJson(res, { ok: true, path: target, markdown, bytes: Buffer.byteLength(markdown) });
    }

    if (route === '/saveas' && method === 'POST') {
      const body = await readBody(req, MAX_SAVE_BYTES);
      const record = await readSession(String(body.session ?? ''));
      const doc = body.doc;
      if (!doc || !doc.root) return sendJson(res, { ok: false, error: 'doc required' }, 400);
      const baseDir = record.cwd ?? process.cwd();
      const suggested = String(body.title || doc.title || 'mindmap').replace(/[\\/:*?"<>|]/g, '-').trim() || 'mindmap';
      const target = body.path
        ? confine(baseDir, body.path)
        : resolve(baseDir, `${suggested}.md`);
      const markdown = renderMarkdown(doc.root);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, markdown, 'utf8');
      docCache.delete(target);
      return sendJson(res, { ok: true, path: target, markdown });
    }

    if (route === '/list' && method === 'GET') {
      const sessionId = url.searchParams.get('session') ?? '';
      const record = await readSession(sessionId);
      const dir = confine(record.cwd, url.searchParams.get('dir') || record.cwd || '.');
      const entries = await readdir(dir, { withFileTypes: true });
      const files = entries
        .filter((entry) => entry.isFile() && /\.(md|markdown|xmind)$/i.test(entry.name))
        .map((entry) => ({ name: entry.name, path: join(dir, entry.name) }))
        .slice(0, 200);
      return sendJson(res, { ok: true, dir, entries: files });
    }

    /**
     * Open a file with the operating system's default handler for its extension.
     *
     * The plugin knows nothing about which app that is: no vault registry is
     * read, no executable is searched for, and no `obsidian://` URL is built.
     * The file goes to the shell exactly as a double-click would, so whatever the
     * user associated with `.md` opens it — Obsidian, if that is their choice.
     *
     * Only a path inside the Session's own workspace is accepted, which is what
     * keeps this a read of the user's own notes rather than a way to reach into
     * unrelated directories.
     */
    if (route === '/open' && method === 'GET') {
      const sessionId = url.searchParams.get('session') ?? '';
      const record = await readSession(sessionId);
      const requested = url.searchParams.get('path');
      if (!requested) return sendJson(res, { ok: false, error: 'path required' }, 400);
      const target = confine(record.cwd, requested);
      return sendJson(res, { ok: true, path: target });
    }

    if (route === '/open' && method === 'POST') {
      const body = await readBody(req, 64 * 1024);
      const sessionId = String(body.session ?? '');
      const record = await readSession(sessionId);
      const requested = body.path;
      if (!requested) return sendJson(res, { ok: false, error: 'path required' }, 400);
      const target = confine(record.cwd, String(requested));
      try {
        const info = await stat(target);
        if (!info.isFile()) return sendJson(res, { ok: false, error: 'not a file' }, 400);
      } catch {
        return sendJson(res, { ok: false, error: `not found: ${target}` }, 404);
      }
      try {
        const launched = await launchDefault(target);
        if (!launched.ok) return sendJson(res, { ok: false, ...launched, path: target }, 500);
        return sendJson(res, { ok: true, launched: true, path: target, launcher: launched.launcher });
      } catch (error) {
        return sendJson(res, { ok: false, error: String(error?.message ?? error), path: target }, 500);
      }
    }

    return sendJson(res, { ok: false, error: 'unknown route' }, 404);
  } catch (error) {
    return sendJson(res, { ok: false, error: String(error?.message ?? error) }, 500);
  }
}

export const inject = ['webServer'];

/** The plugin context, so a route can reach optional services (`subprocess`). */
let ctxRef = { get: () => undefined };

export function apply(ctx) {
  ctxRef = ctx;
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'prefix',
        path: BASE,
        handler: (req, res) => handle(req, res),
      }),
    'dsh-mindmap routes',
  );
}
