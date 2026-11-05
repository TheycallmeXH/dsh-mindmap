// Layout invariants for every structure: no two node boxes may overlap, and a
// horizontal/vertical order that the reader can follow. Wrapping text long
// enough to force multi-line labels is the case that used to collide.
// Run: node test/layout.test.cjs
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

/** Extract one top-level function declaration by brace matching. */
function grab(name) {
  const start = src.indexOf(`function ${name}`);
  if (start < 0) throw new Error(`function ${name} not found`);
  let depth = 0;
  let out = '';
  for (let i = start; i < src.length; i += 1) {
    const ch = src[i];
    out += ch;
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return out;
}

const constBlock = /const FONT = 13;[\s\S]*?const V_GAP = \d+;/.exec(src);
if (!constBlock) throw new Error('layout constants not found');

const code = [
  constBlock[0],
  'const measureCache = new Map(); const MEASURE_CACHE_LIMIT = 4096;',
  'const markerCache = new WeakMap();',
  grab('isWide'),
  grab('textWidth'),
  grab('wrapText'),
  grab('measureNode'),
  grab('measureAll'),
  grab('linesOf'),
  grab('childList'),
  grab('isFolded'),
  grab('hasMarker'),
  grab('markerInfo'),
  grab('markerColor'),
  grab('sideOf'),
  grab('subtreeWidth'),
  grab('layoutHorizontal'),
  grab('layoutVertical'),
  grab('layoutTree'),
  grab('offsetAll'),
  grab('edgeBetween'),
  grab('rebuildEdge'),
  grab('collectEdges'),
  grab('layoutMap'),
  grab('edgePath'),
  'return { layoutMap, measureNode, subtreeWidth, edgePath, MAX_W, MIN_W };',
].join('\n');

const api = new Function(code)();

const failures = [];
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
}

/** Two axis-aligned boxes overlap when they share interior area on both axes. */
function overlaps(a, b) {
  const pad = 1; // allow sub-pixel touching, refuse real intersection
  return (
    a.x + a.w > b.x + pad &&
    b.x + b.w > a.x + pad &&
    a.y + a.h > b.y + pad &&
    b.y + b.h > a.y + pad
  );
}

function node(id, text, children = []) {
  return { id, text, note: '', markers: [], children };
}

/* A tree whose every node is long enough to wrap onto several lines, which is
   exactly the case that used to make siblings fight for space. */
const longTree = node('root', '项目的整体结构与主要分支说明', [
  node('a', '一个很长的第一分支名称用来制造换行压力', [
    node('a1', '子项甲：这里也写得很长，会占好几行', [
      node('a1x', '孙项甲一：同样很长的描述文本'),
      node('a1y', '孙项甲二：同样很长的描述文本'),
    ]),
    node('a2', '子项乙：内容同样不短，需要换行'),
  ]),
  node('b', '一个同样很长的第二分支名称也来制造换行', [
    node('b1', '子项丙：这里也写得很长，会占好几行', [
      node('b1x', '孙项乙一：同样很长的描述文本'),
      node('b1y', '孙项乙二：同样很长的描述文本'),
    ]),
    node('b2', '子项丁：内容同样不短，需要换行'),
  ]),
  node('c', '第三个分支也不短，仍然需要换行显示', [
    node('c1', '子项戊：这里也写得很长，会占好几行'),
  ]),
]);

const structures = ['mindmap', 'logic-right', 'org-down', 'tree-right'];

for (const structure of structures) {
  const layout = api.layoutMap(longTree, structure);
  const nodes = layout.nodes;

  check(`${structure}: every node got a box`, nodes.length === 13, `${nodes.length} nodes`);

  let worst = null;
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      if (overlaps(nodes[i], nodes[j])) {
        worst = `${nodes[i].node.text.slice(0, 12)} x ${nodes[j].node.text.slice(0, 12)}`;
        break;
      }
    }
    if (worst) break;
  }
  check(`${structure}: no two node boxes overlap`, !worst, worst ?? '');

  // A node must be inside the reported canvas, or export would clip it.
  const outside = nodes.filter(
    (n) => n.x < -1 || n.y < -1 || n.x + n.w > layout.width + 1 || n.y + n.h > layout.height + 1,
  );
  check(`${structure}: every node fits the reported canvas`, outside.length === 0, `${outside.length} outside`);
}

/* mindmap: with no markers a plain outline must still read as two-sided.
   Branches alternate right/left, so at least one top-level child sits left of
   the root and at least one sits right. */
{
  const layout = api.layoutMap(longTree, 'mindmap');
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const root = byId.get('root');
  const kids = ['a', 'b', 'c'].map((id) => byId.get(id));
  const leftOfRoot = kids.filter((k) => k.x + k.w <= root.x + 1);
  const rightOfRoot = kids.filter((k) => k.x >= root.x + root.w - 1);
  check(
    'mindmap: branches appear on both sides of the central topic',
    leftOfRoot.length >= 1 && rightOfRoot.length >= 1,
    `left=${leftOfRoot.length} right=${rightOfRoot.length}`,
  );
  check(
    'mindmap: the two sides are roughly balanced',
    Math.abs(leftOfRoot.length - rightOfRoot.length) <= 1,
    `${leftOfRoot.length} vs ${rightOfRoot.length}`,
  );

  // A left-side branch must bow leftwards, not out to the right and back.
  // Read the real path the renderer would draw and check where its first
  // control point landed, so this cannot pass on a formula of its own.
  const leftEdges = layout.edges.filter((e) => e.shape === 'curve' && e.x2 < e.x1);
  check('mindmap: there are left-going connectors', leftEdges.length >= 1, `${leftEdges.length}`);
  for (const edge of leftEdges.slice(0, 3)) {
    const d = api.edgePath(edge);
    const m = /^M([\d.-]+),([\d.-]+) C([\d.-]+),([\d.-]+)/.exec(d);
    check('a left-going connector parses as a cubic', Boolean(m), d);
    if (!m) continue;
    const startX = parseFloat(m[1]);
    const c1x = parseFloat(m[3]);
    check(
      'a left-going curve points its control handle left',
      c1x <= startX,
      `start=${startX} c1=${c1x} target=${edge.x2}`,
    );
  }
}

/* org-down specifically: siblings must stay level, and their subtree bands must
   not cross. This is the regression the screenshot showed. */
{
  const layout = api.layoutMap(longTree, 'org-down');
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const a = byId.get('a');
  const b = byId.get('b');
  const c = byId.get('c');
  check('org-down: siblings sit on one row', a.y === b.y && b.y === c.y, `${a.y}/${b.y}/${c.y}`);
  check('org-down: siblings run left to right', a.x < b.x && b.x < c.x, `${a.x} < ${b.x} < ${c.x}`);

  // Each child's subtree band must contain all of that subtree's nodes.
  const groups = {
    a: ['a', 'a1', 'a2', 'a1x', 'a1y'],
    b: ['b', 'b1', 'b2', 'b1x', 'b1y'],
    c: ['c', 'c1'],
  };
  const bounds = {};
  for (const [key, ids] of Object.entries(groups)) {
    const boxes = ids.map((id) => byId.get(id));
    bounds[key] = {
      left: Math.min(...boxes.map((n) => n.x)),
      right: Math.max(...boxes.map((n) => n.x + n.w)),
    };
  }
  check('org-down: subtree A stays left of B', bounds.a.right <= bounds.b.left + 1, `${bounds.a.right} vs ${bounds.b.left}`);
  check('org-down: subtree B stays left of C', bounds.b.right <= bounds.c.left + 1, `${bounds.b.right} vs ${bounds.c.left}`);
}

/* Vertical bands: the reserved width must grow with a wider subtree, otherwise
   the overlap fix would be decorative. */
{
  const narrow = node('r', '根', [node('p', '子一'), node('q', '子二')]);
  const wide = node('r', '根', [
    node('p', '子一', [node('p1', '孙一很长名字'), node('p2', '孙二很长名字')]),
    node('q', '子二'),
  ]);
  const nw = api.subtreeWidth(narrow, new Map([['r', { w: 40, h: 30 }], ['p', { w: 40, h: 30 }], ['q', { w: 40, h: 30 }]]));
  const ww = api.subtreeWidth(wide, new Map([
    ['r', { w: 40, h: 30 }], ['p', { w: 40, h: 30 }], ['q', { w: 40, h: 30 }],
    ['p1', { w: 90, h: 30 }], ['p2', { w: 90, h: 30 }],
  ]));
  check('subtreeWidth grows when a descendant makes it wider', ww > nw, `${nw} -> ${ww}`);
}

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(', ')}` : '\nall checks passed');
process.exitCode = failures.length ? 1 : 0;
