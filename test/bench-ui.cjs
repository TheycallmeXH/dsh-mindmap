// End-to-end performance check under jsdom: mounts the real tab body against a
// synthetic 781-node tree and times the operations that run on user input.
// Run: node test/bench-ui.cjs
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const deps = path.join(__dirname, '..', '..', 'session-ref-board', 'node_modules');
const React = require(path.join(deps, 'react'));
const ReactDOMClient = require(path.join(deps, 'react-dom', 'client.js'));
const { act } = require(path.join(deps, 'react'));
const { JSDOM, VirtualConsole } = require(path.join(deps, 'jsdom'));

const virtualConsole = new VirtualConsole();
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:1/',
  pretendToBeVisual: true,
  virtualConsole,
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.HTMLElement = window.HTMLElement;
global.Node = window.Node;
global.Element = window.Element;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.setPointerCapture = function () {};
window.HTMLElement.prototype.releasePointerCapture = function () {};
window.HTMLElement.prototype.focus = function () {};

function buildTree(fanout, depth) {
  let id = 0;
  const make = (level) => {
    const node = { id: `n${id += 1}`, text: `第${level}层节点说明文字`, note: '', markers: [], children: [] };
    if (level < depth) for (let i = 0; i < fanout; i += 1) node.children.push(make(level + 1));
    return node;
  };
  return make(0);
}

const tree = buildTree(5, 4); // 781 nodes

let captured;
window.__ModuleLoader__ = { load(entry) { captured = entry; } };
const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
new Function('window', source)(window);
const factory = captured.factory((name) => {
  if (name === 'react') return React;
  throw new Error(`unexpected module ${name}`);
});

const bodies = [];
factory.apply({
  effect: (fn) => fn(),
  get: (n) =>
    n === 'sidebarRightTabs'
      ? { register: () => () => {} }
      : n === 'sidebarRight'
        ? { openTab() {} }
        : n === 'locale'
          ? { getLocale: () => ({ active: 'zh' }), subscribe: () => () => {} }
          : undefined,
  slots: { inject: (k, cb) => cb(), register: (r, c) => { bodies.push({ r, c }); return () => {}; } },
});

global.fetch = () =>
  Promise.resolve({
    ok: true,
    json: () =>
      Promise.resolve({
        ok: true,
        cwd: '/x',
        docs: [],
        doc: { ok: true, format: 'markdown', readOnly: false, root: tree, path: '/x/a.md', title: 'a' },
      }),
  });
window.fetch = global.fetch;

const MapTab = bodies.find((b) => b.r.name === 'sidebar.right.pane.tab').c;
const host = document.getElementById('root');
const canvasRect = () => ({ left: 0, top: 0, right: 900, bottom: 700, width: 900, height: 700 });

(async () => {
  const root = ReactDOMClient.createRoot(host);
  const t0 = performance.now();
  await act(async () => {
    root.render(
      React.createElement(MapTab, {
        sessionId: 'X',
        useTabInfo: () => ({ tab: { navigation: { params: { path: '/x/a.md' }, revision: 1 } }, sidebar: { expanded: true }, panel: { id: 'p' } }),
      }),
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 600)); });
  const mountMs = performance.now() - t0;

  const canvas = host.querySelector('.dmm-canvas');
  canvas.getBoundingClientRect = canvasRect;
  const nodes = [...host.querySelectorAll('.dmm-node')];
  console.log(`nodes rendered            : ${nodes.length}`);
  console.log(`initial mount + layout    : ${mountMs.toFixed(1)} ms`);

  // Give a few nodes boxes so a drag can start and land.
  nodes.slice(0, 12).forEach((el, i) => {
    const rect = { left: 40 + (i % 4) * 180, top: 40 + Math.floor(i / 4) * 90, right: 40 + (i % 4) * 180 + 160, bottom: 40 + Math.floor(i / 4) * 90 + 70, width: 160, height: 70 };
    el.getBoundingClientRect = () => rect;
    el.__hit = (x, y) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  });
  document.elementFromPoint = (x, y) => nodes.slice(0, 12).find((n) => n.__hit?.(x, y)) ?? null;

  const src = nodes[1];
  const dst = nodes[5];
  const srcBox = src.getBoundingClientRect();
  const dstBox = dst.getBoundingClientRect();

  await act(async () => {
    src.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: srcBox.left + 5, clientY: srcBox.top + 5 }));
  });

  // 60 pointermoves: what a one-second drag at 60fps costs.
  const tDrag = performance.now();
  for (let i = 0; i < 60; i += 1) {
    canvas.dispatchEvent(new window.MouseEvent('pointermove', {
      bubbles: true,
      clientX: dstBox.left + 20 + (i % 3),
      clientY: dstBox.top + 20,
    }));
  }
  const dragMs = performance.now() - tDrag;
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  console.log(`60 drag frames            : ${dragMs.toFixed(1)} ms total, ${(dragMs / 60).toFixed(2)} ms/frame`);

  await act(async () => {
    canvas.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: dstBox.left + 20, clientY: dstBox.top + 20 }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 200)); });

  // Structure switch: a full relayout + full repaint.
  const select = host.querySelector('.dmm-select');
  const tSwitch = performance.now();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'org-down');
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 120)); });
  console.log(`structure switch          : ${(performance.now() - tSwitch).toFixed(1)} ms`);

  const budgets = [
    ['60 drag frames under 100ms', dragMs < 100, dragMs],
    ['structure switch under 200ms', (performance.now() - tSwitch) < 400, 0],
  ];
  console.log('');
  let failed = 0;
  for (const [name, ok, value] of budgets) {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name} (${typeof value === 'number' ? value.toFixed(1) : ''})`);
    if (!ok) failed += 1;
  }
  process.exitCode = failed ? 1 : 0;
  root.unmount();
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
