// Performance regression bench for the layout engine and the wrap metric.
// Run: node test/bench.cjs
// Prints ops/sec for the pure functions the canvas calls on every frame, so a
// change that makes them slower is visible without opening the app.
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');

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
  grab('edgeBetween'),
  grab('rebuildEdge'),
  grab('sideOf'),
  grab('subtreeWidth'),
  grab('layoutHorizontal'),
  grab('layoutVertical'),
  grab('layoutTree'),
  grab('offsetAll'),
  grab('collectEdges'),
  grab('layoutMap'),
  grab('edgePath'),
  'return { layoutMap, measureNode, wrapText, edgePath };',
].join('\n');

const api = new Function(code)();

/** A wide, deep tree with realistic Chinese labels. */
function buildTree(fanout, depth) {
  let id = 0;
  const make = (level, name) => {
    const node = { id: `${'n'}${id += 1}`, text: `${name}第${level}层节点说明文字`, note: '', markers: [], children: [] };
    if (level < depth) {
      for (let i = 0; i < fanout; i += 1) node.children.push(make(level + 1, `${name}${i}`));
    }
    return node;
  };
  return make(0, 'root');
}

function bench(label, fn, iterations) {
  // Warm up so the JIT has compiled the path before timing.
  for (let i = 0; i < Math.min(3, iterations); i += 1) fn();
  const start = process.hrtime.bigint();
  for (let i = 0; i < iterations; i += 1) fn();
  const ns = Number(process.hrtime.bigint() - start);
  const ms = ns / 1e6 / iterations;
  console.log(`  ${label.padEnd(34)} ${ms.toFixed(3)} ms/op   ${(1000 / ms).toFixed(0)} ops/s`);
  return ms;
}

const shapes = [
  { fanout: 4, depth: 3, nodes: 85, label: '85 nodes' },
  { fanout: 5, depth: 4, nodes: 781, label: '781 nodes' },
];
const structures = ['mindmap', 'logic-right', 'org-down', 'tree-right'];

const results = [];
for (const shape of shapes) {
  const tree = buildTree(shape.fanout, shape.depth);
  console.log(`\n${shape.label}:`);
  for (const structure of structures) {
    const ms = bench(`${structure} layout`, () => api.layoutMap(tree, structure), shape.nodes > 500 ? 30 : 200);
    results.push({ shape: shape.label, structure, ms });
  }
}

// Wrap cost is what runs per node per relayout; keep it visible on its own.
const sample = '一个很长的第一分支名称用来制造换行压力，需要折行显示';
bench('wrapText (long CJK label)', () => api.wrapText(sample, 200, 13), 20000);
bench('edgePath (curve)', () => api.edgePath({ shape: 'curve', x1: 10, y1: 20, x2: 180, y2: 90 }), 50000);

console.log('\n--- copy into the budget ---');
for (const row of results) console.log(`${row.shape} ${row.structure}: ${row.ms.toFixed(3)} ms`);
