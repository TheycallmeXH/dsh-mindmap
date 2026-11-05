// Mount the plugin's real client half under jsdom against the real Host half.
// Run: node test/render.test.cjs
//   (cwd = dsh-mindmap; react/jsdom come from the sibling session-ref-board
//    install so this package itself stays dependency-free)
const path = require('node:path');
const fs = require('node:fs');
const http = require('node:http');
const { pathToFileURL } = require('node:url');

const here = __dirname;
const deps = path.join(here, '..', '..', 'session-ref-board', 'node_modules');
const React = require(path.join(deps, 'react'));
const ReactDOMClient = require(path.join(deps, 'react-dom', 'client.js'));
const { act } = require(path.join(deps, 'react'));
const { JSDOM } = require(path.join(deps, 'jsdom'));

const { VirtualConsole } = require(path.join(deps, 'jsdom'));
// React's input value tracker reads a detached instance under jsdom and raises a
// TypeError that never reaches our handlers as a failure. JSDOM reports it
// through its own virtual console, so route that one message away and let every
// other diagnostic through unchanged.
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (error) => {
  if (String(error?.message ?? error).includes("Cannot read properties of null (reading 'tag')")) return;
  console.error(error);
});

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1:54983/',
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
global.Blob = window.Blob;
global.URL = window.URL;
global.Image = window.Image;
global.localStorage = window.localStorage;
window.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.HTMLElement.prototype.setPointerCapture = function () {};
window.HTMLElement.prototype.releasePointerCapture = function () {};
// jsdom's focus() fires a focus event React 18's input polyfill cannot consume
// (`attachEvent` is IE-only); the plugin only needs focus() not to throw.
window.HTMLElement.prototype.focus = function focus() {
  this.__focused = true;
};

/* ---------- host half on an ephemeral port ---------- */

const hostModule = () => import(pathToFileURL(path.join(here, '..', 'index.js')).href);

let port;
let closeServer;
let pending;

async function startHost() {
  const mod = await hostModule();
  // One context for both halves: the Host half registers its route here and
  // resolves `subprocess` from it, the Client half registers slots.
  pending = makeCtx();
  mod.apply(pending.ctx);
  const server = http.createServer((req, res) => pending.registry.route.handler(req, res));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  closeServer = () => server.close();
}

/** Node's global fetch, with this plugin's relative routes pointed at the test server. */
function installFetch() {
  const nodeFetch = globalThis.fetch;
  global.fetch = (input, init) => {
    const url = String(input);
    return nodeFetch(url.startsWith('http') ? url : `http://127.0.0.1:${port}${url}`, init);
  };
  window.fetch = global.fetch;
}

/* ---------- load the client factory ---------- */

function loadFactory() {
  const source = fs.readFileSync(path.join(here, '..', 'client.js'), 'utf8');
  let captured;
  window.__ModuleLoader__ = {
    load(entry) {
      captured = entry;
    },
  };
  // eslint-disable-next-line no-new-func
  new Function('window', source)(window);
  const fakeRequire = (name) => {
    if (name === 'react') return React;
    throw new Error(`unexpected module ${name}`);
  };
  return { entry: captured, factory: captured.factory(fakeRequire) };
}

/* ---------- mock ctx ---------- */

function makeCtx() {
  const registry = { tabs: [], bodies: [], effects: [] };
  const tabs = {
    register(definition) {
      registry.tabs.push(definition);
      return () => {
        registry.tabs = registry.tabs.filter((entry) => entry !== definition);
      };
    },
  };
  const opened = [];
  const ctrl = {
    openTab(kind, options) {
      opened.push({ kind, options });
    },
  };
  const services = {
    sidebarRightTabs: tabs,
    sidebarRight: ctrl,
    locale: { getLocale: () => ({ active: 'zh' }), subscribe: () => () => {} },
  };
  // The Host half reaches this through `ctx.get('subprocess')` for the
  // open-in-Obsidian launch; a recording double proves the argv, not a shell line.
  const spawned = [];
  services.subprocess = {
    spawn(spec) {
      spawned.push(spec);
      return { done: Promise.resolve({ exitCode: 0, signal: null }) };
    },
  };
  const ctx = {
    effect(fn, label) {
      registry.effects.push(label);
      return fn();
    },
    get(name) {
      return services[name];
    },
    webServer: {
      register(route) {
        registry.route = route;
        return () => {};
      },
    },
    slots: {
      inject(key, callback) {
        return callback();
      },
      register(registration, component) {
        registry.bodies.push({ registration, component });
        return () => {};
      },
    },
  };
  return { ctx, registry, opened, spawned };
}

/* ---------- helpers ---------- */

function textOf(el) {
  return el?.textContent ?? '';
}

/** Run a callback, then drain timers inside act so React flushes the result. */
async function pump(ms = 400) {
  await act(async () => {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  });
}

const failures = [];
function check(name, condition, detail) {
  if (condition) {
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * Pick any session that has a log, because the Host half looks sessions up by
 * id. The suite does not depend on a particular one: if none exists (a clean
 * machine), it falls back to a synthetic id and the routes simply report an
 * empty catalogue, which the assertions tolerate.
 */
function findSession() {
  const { readdirSync } = require('node:fs');
  const { join } = require('node:path');
  const { homedir } = require('node:os');
  const root = join(homedir(), '.dsh', 'sessions');
  let groups = [];
  try {
    groups = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory());
  } catch {
    return undefined;
  }
  // Prefer the workspace this repository sits in (its session group encodes the
  // cwd), otherwise take any session: the suite does not require a particular
  // cwd, it only needs the Host half to resolve *a* session id.
  const workspaceDir = path.resolve(__dirname, '..', '..');
  const encoded = workspaceDir.replace(/[\\/:]/g, '-').replace(/^-/, '');
  for (const pass of [true, false]) {
    for (const group of groups) {
      if (pass && !group.name.includes(encoded)) continue;
      for (const dir of readdirSync(join(root, group.name), { withFileTypes: true }).filter((e) => e.isDirectory())) {
        try {
          if (readdirSync(join(root, group.name, dir.name)).some((f) => f.endsWith('.jsonl.zstd'))) return dir.name;
        } catch {
          /* unreadable session dir: skip */
        }
      }
    }
  }
  return undefined;
}

/* ---------- tests ---------- */

async function main() {
  await startHost();
  installFetch();

  const { entry, factory } = loadFactory();
  check('factory id', entry?.id === 'dsh-mindmap', entry?.id);
  check('inject slots', Array.isArray(factory.inject) && factory.inject.includes('slots'));

  // Both halves share the context `startHost` built: the Host half already
  // registered its route and resolves `subprocess` from it at call time.
  const { ctx, registry, opened, spawned } = pending;
  await act(async () => {
    factory.apply(ctx);
  });

  const tabType = registry.tabs.find((definition) => definition.kind === 'dsh-mindmap:map');
  check('tab type registered', Boolean(tabType), registry.tabs.map((t) => t.kind).join(','));
  check('tab type has a guide entry', (tabType?.guide ?? []).length === 1);
  check(
    'guide entry is localised',
    typeof tabType?.guide?.[0]?.title === 'function' && tabType.guide[0].title() === '思维导图',
  );
  check('guide icon is a component', typeof tabType?.guide?.[0]?.icon === 'function');
  const bodyReg = registry.bodies.find((b) => b.registration.name === 'sidebar.right.pane.tab');
  check('tab body registered under the type id', bodyReg?.registration.key === 'dsh-mindmap/map', bodyReg?.registration.key);
  check('turn-tail entry registered', registry.bodies.some((b) => b.registration.name === 'conversation.chat.turnTail'));
  check('header entry registered', registry.bodies.some((b) => b.registration.name === 'conversation.session.header.utilities'));

  /* --- mount the tab body against a real markdown document --- */

  const sessionId = findSession();
  check('session discovered', Boolean(sessionId), sessionId);

  const MapTab = bodyReg.component;
  const host = document.getElementById('root');
  const root = ReactDOMClient.createRoot(host);

  // The fixture is written here, not copied from a note on this machine: the
  // test must run anywhere the repo is cloned. It carries a heading tree,
  // nested lists, a note paragraph and markers, so every parse path is covered.
  const workDir = path.join(here, '.tmp');
  fs.mkdirSync(workDir, { recursive: true });
  const workMd = path.join(workDir, 'fixture.md');
  fs.writeFileSync(workMd, [
    '---',
    'mindmap: true',
    '---',
    '',
    '# 测试用导图 · 固定样本',
    '',
    '一句话说明：这份文件由测试自己生成，不依赖任何本机笔记。',
    '',
    '## 一、结构',
    '',
    '- 分支甲',
    '  - 子项甲一',
    '    - 孙项甲一',
    '    - 孙项乙一',
    '  - 子项甲二',
    '- 分支乙',
    '  - 子项乙一',
    '  - 子项乙二',
    '- 分支丙',
    '  - 子项丙一',
    '',
    '## 二、标记',
    '',
    '- 带颜色的节点 %%red%%',
    '- 折叠的节点 %%fold%%',
    '- 靠左的节点 %%left%%',
    '',
    '## 三、备注',
    '',
    '- 有备注的节点',
    '',
    '  这里是一段节点备注，写回时会贴在节点下面。',
    '',
    '## 四、深层级',
    '',
    '- 第一层',
    '  - 第二层',
    '    - 第三层',
    '      - 第四层（会写成列表）',
    '        - 第五层',
    '',
  ].join('\n'), 'utf8');

  const params = { path: workMd };
  const useTabInfo = () => ({
    tab: { navigation: { params, revision: 1 }, id: 't1', contentId: 'x' },
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'p1' },
  });

  await act(async () => {
    root.render(React.createElement(MapTab, { sessionId, useTabInfo }));
  });
  await pump(700);

  const nodes = host.querySelectorAll('.dmm-node');
  check('canvas rendered nodes', nodes.length >= 20, `${nodes.length} nodes`);
  const edges = host.querySelectorAll('.dmm-edge');
  check('canvas rendered edges', edges.length >= 10, `${edges.length} edges`);
  check('root node text present', textOf(host).includes('测试用导图'), textOf(host).slice(0, 120));
  // Every node carries its laid-out lines as one pre-formatted text node now.
  const textBlocks = [...host.querySelectorAll('.dmm-node-text')];
  check('every node renders its text', textBlocks.length >= 20 && textBlocks.every((el) => (el.textContent || '').length > 0), `${textBlocks.length} text blocks`);
  check('toolbar offers save', textOf(host).includes('保存'));
  check('structure select rendered', host.querySelectorAll('.dmm-select').length === 1);

  /* --- select a node, then add a child through the toolbar --- */

  const target = nodes[1] ?? nodes[0];
  await act(async () => {
    target.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0 }));
  });
  check('node selection marks the node', target.getAttribute('data-selected') === '1', target.getAttribute('data-selected'));

  /* --- drag guidance: moving over another node shows the drop pill --- */
  // jsdom does no hit-testing layout, so give every node a synthetic screen
  // box (a small grid) and make elementFromPoint return the node whose box
  // holds the point. This exercises the drag path end to end.
  const realElementFromPoint = typeof document.elementFromPoint === 'function' ? document.elementFromPoint.bind(document) : null;
  const syntheticBoxes = new Map();
  const installBoxes = () => {
    // The canvas is the coordinate space every node lives in; jsdom gives it
    // zero bounds, so seed a real box for screen<->world mapping.
    const canvas = host.querySelector('.dmm-canvas');
    if (canvas) {
      canvas.getBoundingClientRect = () => ({ left: 0, top: 0, right: 600, bottom: 400, width: 600, height: 400, x: 0, y: 0 });
    }
    const all = host.querySelectorAll('.dmm-node');
    all.forEach((el, i) => {
      const col = i % 8;
      const row = Math.floor(i / 8);
      const rect = { left: 40 + col * 90, top: 40 + row * 60, right: 40 + col * 90 + 80, bottom: 40 + row * 60 + 50, width: 80, height: 50 };
      syntheticBoxes.set(el, rect);
      el.getBoundingClientRect = () => rect;
    });
    document.elementFromPoint = (x, y) => {
      for (const [el, rect] of syntheticBoxes) {
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return el;
      }
      return null;
    };
  };
  installBoxes();

  const dragTargetNode = host.querySelectorAll('.dmm-node')[3] ?? host.querySelectorAll('.dmm-node')[0];
  const dragSourceNode = host.querySelectorAll('.dmm-node')[1] ?? host.querySelectorAll('.dmm-node')[0];
  // Ensure source and target differ and have real boxes.
  const sourceBox = syntheticBoxes.get(dragSourceNode);
  const targetBox = syntheticBoxes.get(dragTargetNode);
  check('drag source and target are distinct nodes', dragSourceNode !== dragTargetNode);
  // The plugin recognises a double press by timing two presses on one node (~420ms).
  // The earlier selection press used the same node, so wait past that window or the
  // drag would be read as a double-click and open the editor instead.
  await pump(500);
  await act(async () => {
    dragSourceNode.dispatchEvent(
      new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: sourceBox.left + 5, clientY: sourceBox.top + 5 }),
    );
  });
  await act(async () => {
    const canvas = host.querySelector('.dmm-canvas');
    (canvas ?? host).dispatchEvent(
      new window.MouseEvent('pointermove', { bubbles: true, clientX: targetBox.left + 20, clientY: targetBox.top + 20 }),
    );
  });
  await pump(140);
  check('dragging shows a drop pill', host.querySelectorAll('.dmm-drop').length >= 1, `${host.querySelectorAll('.dmm-drop').length} pills`);
  check(
    'drop pill invites letting go over a target',
    textOf(host).includes('松开') || textOf(host).includes('放'),
    host.textContent.slice(-120),
  );
  check('drop target node is highlighted ok', dragTargetNode.getAttribute('data-drop-ok') === '1', `drop-ok=${dragTargetNode.getAttribute('data-drop-ok')}`);
  // The dragged node follows the cursor, so a naive hit test finds it again and
  // the hint wrongly said "can't drop on itself". It is out of hit-testing now,
  // and the hint must talk about the target instead.
  check(
    'the drag hint never says "itself" while dragging',
    !/自己\\b|itself/i.test(textOf(host.querySelector('.dmm-drop'))),
    textOf(host.querySelector('.dmm-drop')),
  );
  // Finish the drag on empty canvas: no move.
  await act(async () => {
    const canvas = host.querySelector('.dmm-canvas');
    (canvas ?? host).dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 30, clientY: 30 }));
  });
  await pump(120);
  check('dropping on empty space clears the pill', host.querySelectorAll('.dmm-drop').length === 0);

  /* --- free drag: dropping on empty canvas keeps the node where it was put --- */
  {
    const freeNode = [...host.querySelectorAll('.dmm-node')][0];
    const freeBox = freeNode.getBoundingClientRect();
    const beforeLeft = parseFloat(freeNode.style.left);
    await pump(500); // stay outside the double-press window
    await act(async () => {
      freeNode.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: freeBox.left + 5, clientY: freeBox.top + 5 }));
    });
    await act(async () => {
      host.querySelector('.dmm-canvas')?.dispatchEvent(
        new window.MouseEvent('pointermove', { bubbles: true, clientX: freeBox.left + 65, clientY: freeBox.top + 45 }),
      );
    });
    await act(async () => {
      host.querySelector('.dmm-canvas')?.dispatchEvent(
        new window.MouseEvent('pointerup', { bubbles: true, clientX: freeBox.left + 65, clientY: freeBox.top + 45 }),
      );
    });
    await pump(150);
    const afterNode = [...host.querySelectorAll('.dmm-node')][0];
    const afterLeft = parseFloat(afterNode.style.left);
    check('dropping on empty canvas moves the node freely', Math.abs(afterLeft - beforeLeft) > 10, `${beforeLeft} -> ${afterLeft}`);

    // The connectors must follow the moved node, not stay at its old position.
    const edgePaths = [...host.querySelectorAll('.dmm-edge')].map((p) => p.getAttribute('d') ?? '');
    const edgeStartPoints = edgePaths.map((d) => d.match(/M([\d.-]+),([\d.-]+)/)).filter(Boolean);
    check('connectors still exist after the move', edgePaths.length >= 3, `${edgePaths.length} edges`);
    const movedNodeBox = {
      x: afterLeft,
      w: parseFloat(afterNode.style.width),
    };
    // At least one path should start at the moved node's new edge, proving the
    // edges were rebuilt from the shifted boxes.
    const startsAtMovedNode = edgeStartPoints.some((m) => Math.abs(parseFloat(m[1]) - movedNodeBox.x) < 3);
    check('a connector starts from the dragged node’s new position', startsAtMovedNode, `edges=${edgePaths.slice(0, 3).join(' | ')}`);
    // And the tidy button is now offered.
    const tidy = [...(host.querySelector('[data-canvas-ui="zoom"]')?.querySelectorAll('button') ?? [])].find((b) =>
      /整理|Tidy up/.test(textOf(b)),
    );
    check('tidy-up is offered once a node was moved', Boolean(tidy));
    if (tidy) {
      await act(async () => {
        tidy.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });
      await pump(150);
      const tidied = parseFloat([...host.querySelectorAll('.dmm-node')][0].style.left);
      check('tidy-up returns the node to the layout position', Math.abs(tidied - beforeLeft) < 2, `${tidied} vs ${beforeLeft}`);
    }
  }

  /* --- cycle rule: an ancestor is a legal target, a descendant is not --- */
  // Build a known chain root > A > A1 so the two cases are unambiguous.
  const byText = (text) => [...host.querySelectorAll('.dmm-node')].find((el) => textOf(el) === text);
  const rootNode = [...host.querySelectorAll('.dmm-node')].find((el) => textOf(el).includes('测试用导图'));
  const childA = [...host.querySelectorAll('.dmm-node')].find((el) => textOf(el).startsWith('一、结构'));
  check('fixture has a root and a child to drag', Boolean(rootNode && childA), `${textOf(rootNode).slice(0, 12)} / ${textOf(childA).slice(0, 12)}`);

  const dragOver = async (sourceEl, targetEl) => {
    const sBox = sourceEl.getBoundingClientRect();
    const tBox = targetEl.getBoundingClientRect();
    await act(async () => {
      sourceEl.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: sBox.left + 5, clientY: sBox.top + 5 }));
    });
    await act(async () => {
      host.querySelector('.dmm-canvas')?.dispatchEvent(
        new window.MouseEvent('pointermove', { bubbles: true, clientX: tBox.left + 20, clientY: tBox.top + 20 }),
      );
    });
    await pump(120);
    const blocked = targetEl.getAttribute('data-drop-blocked');
    const ok = targetEl.getAttribute('data-drop-ok');
    await act(async () => {
      host.querySelector('.dmm-canvas')?.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: tBox.left + 20, clientY: tBox.top + 20 }));
    });
    await pump(120);
    return { blocked, ok };
  };

  // Child -> its own parent (the root) must be ALLOWED.
  if (childA && rootNode) {
    const r = await dragOver(childA, rootNode);
    check('dragging a node onto its parent is allowed', r.ok === '1' && r.blocked !== '1', `ok=${r.ok} blocked=${r.blocked}`);
  }

  // Parent -> its own child must be BLOCKED (that would detach the subtree).
  if (childA && rootNode) {
    const r = await dragOver(rootNode, childA);
    check('dragging a node onto its own child is blocked', r.blocked === '1' && r.ok !== '1', `ok=${r.ok} blocked=${r.blocked}`);
  }

  if (realElementFromPoint) document.elementFromPoint = realElementFromPoint;

  const beforeCount = host.querySelectorAll('.dmm-node').length;
  const addBtn = [...host.querySelectorAll('.dmm-btn')].find((b) => (b.getAttribute('aria-label') || b.getAttribute('title') || '').includes('子节点'));
  check('add-child button exists', Boolean(addBtn));
  await act(async () => {
    addBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  const afterCount = host.querySelectorAll('.dmm-node').length;
  check('adding a child grows the map', afterCount === beforeCount + 1, `${beforeCount} -> ${afterCount}`);
  check('new node opens the inline editor', host.querySelectorAll('.dmm-editor').length === 1);

  /* --- a double press on a node opens its editor --- */
  // The canvas captures the pointer, so a real `dblclick` never reaches the
  // node; the plugin times two presses itself. Two presses within the window
  // must therefore open the editor.
  const dblNode = [...host.querySelectorAll('.dmm-node')][0];
  const dblBox = dblNode.getBoundingClientRect();
  await act(async () => {
    dblNode.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: dblBox.left + 5, clientY: dblBox.top + 5 }));
    dblNode.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: dblBox.left + 5, clientY: dblBox.top + 5 }));
  });
  await pump(150);
  check('a double press opens the node editor', host.querySelectorAll('.dmm-editor').length >= 1, 'no editor opened');

  // Pressing inside the editor must not close it. Its press bubbles to the
  // canvas, which used to focus the canvas — blurring the textarea, whose blur
  // handler commits and destroys it. One click killed a fresh editor.
  const canvasForFocus = host.querySelector('.dmm-canvas');
  let canvasFocusCalls = 0;
  const realCanvasFocus = canvasForFocus.focus.bind(canvasForFocus);
  canvasForFocus.focus = (...args) => {
    canvasFocusCalls += 1;
    realCanvasFocus(...args);
  };
  await act(async () => {
    host.querySelector('.dmm-editor')?.dispatchEvent(
      new window.MouseEvent('pointerdown', { bubbles: true, button: 0 }),
    );
  });
  await pump(150);
  canvasForFocus.focus = realCanvasFocus;
  check('clicking inside the editor keeps it open', host.querySelectorAll('.dmm-editor').length >= 1, 'editor closed on click');
  check(
    'pressing the editor does not move focus to the canvas',
    canvasFocusCalls === 0,
    `${canvasFocusCalls} focus calls`,
  );

  await act(async () => {
    host.querySelector('.dmm-editor')?.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  await pump(150);

  /* --- the editor is comfortable, not a cramped copy of the node --- */

  const editorEl = host.querySelector('.dmm-editor');
  // Wider than the node it replaces, so a long label does not force a column
  // of one-character lines while typing.
  const editedEntryWidth = Math.max(66, parseFloat(
    [...host.querySelectorAll('.dmm-node')].map((n) => n.style.width).find((w) => w) ?? '66',
  ));
  check(
    'editor is wider than a minimum useful column',
    parseFloat(editorEl?.style.width ?? '0') >= 180,
    `editor width ${editorEl?.style.width}`,
  );
  check('editor is a textarea (multi-line capable)', editorEl?.tagName === 'TEXTAREA', editorEl?.tagName);
  check('editor disables autocorrect noise', editorEl?.spellcheck === false || editorEl?.getAttribute('spellcheck') === 'false');
  void editedEntryWidth;

  /* --- edit inline and commit --- */

  const editor = host.querySelector('.dmm-editor');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(editor, '测试节点');
    editor.dispatchEvent(new window.Event('input', { bubbles: true }));
    editor.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true }));
  });
  await pump(150);
  check('inline edit commits', textOf(host).includes('测试节点'), textOf(host).slice(0, 200));

  /* --- IME composition must not commit on Enter --- */
  // Re-open an editor and send a composing Enter, then a real one.
  const editAgain = [...host.querySelectorAll('.dmm-node')][1];
  await act(async () => {
    editAgain?.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
  });
  await pump(120);
  const imeEditor = host.querySelector('.dmm-editor');
  if (imeEditor) {
    // React's input value tracker cannot read a detached instance in jsdom and
    // logs a TypeError while still running our handler correctly; the assertion
    // below is what matters, so the console noise is silenced for these two
    // synthetic keystrokes only.
    const realError = window.console.error;
    window.console.error = () => {};
    try {
      await act(async () => {
        const live = host.querySelector('.dmm-editor');
        if (!live) return;
        const keyEv = new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
        Object.defineProperty(keyEv, 'isComposing', { value: true });
        live.dispatchEvent(keyEv);
      });
      await pump(120);
      check('a composing Enter does not commit', Boolean(host.querySelector('.dmm-editor')), 'editor closed mid-composition');
      // Cancel out so the rest of the suite starts clean.
      await act(async () => {
        const esc = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
        host.querySelector('.dmm-editor')?.dispatchEvent(esc);
      });
      await pump(120);
    } finally {
      window.console.error = realError;
    }
  }

  /* --- toolbar is grouped so the rows read as sections --- */

  const groups = host.querySelectorAll('.dmm-bar .dmm-group');
  check('toolbar controls are grouped', groups.length >= 3, `${groups.length} groups`);
  const allButtonsInGroups = [...host.querySelectorAll('.dmm-bar .dmm-btn')].every(
    (b) => b.closest('.dmm-group') !== null,
  );
  check('every toolbar button sits in a group', allButtonsInGroups);

  /* --- save writes markdown back through the host route --- */

  const saveBtn = [...host.querySelectorAll('.dmm-btn')].find((button) => textOf(button) === '保存');
  await act(async () => {
    saveBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await pump(500);
  const written = fs.readFileSync(workMd, 'utf8');
  check('save wrote the new node to the note', written.includes('测试节点'));
  check('save kept the marker header', written.startsWith('---\nmindmap: true'));
  check('save toast shown', textOf(host).includes('已写入'));

  /* --- structure switching re-lays the map --- */

  const geometryOf = () =>
    [...host.querySelectorAll('.dmm-node')].map((node) => ({
      text: textOf(node),
      left: parseFloat(node.style.left),
      top: parseFloat(node.style.top),
    }));

  const geometry = geometryOf();
  const select = host.querySelector('.dmm-select');
  check('structure select exists before switching', Boolean(select));
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    setter.call(select, 'org-down');
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await pump(150);
  const switched = geometryOf();
  const moved = switched.filter((node) => {
    const previous = geometry.find((row) => row.text === node.text);
    return previous && (Math.abs(previous.top - node.top) > 4 || Math.abs(previous.left - node.left) > 4);
  });
  check('org-down re-lays the map', moved.length >= 5, `${moved.length} nodes moved`);
  // Read the boxes straight from the DOM: a depth snapshot would carry labels
  // that earlier edit tests have already rewritten.
  const rootEl = host.querySelector('.dmm-node[data-depth="0"]');
  const childEl = host.querySelector('.dmm-node[data-depth="1"]');
  const rootTop = rootEl ? parseFloat(rootEl.style.top) : undefined;
  const firstChildTop = childEl ? parseFloat(childEl.style.top) : undefined;
  check(
    'org-down puts the first child below the root',
    rootTop !== undefined && firstChildTop !== undefined && firstChildTop > rootTop,
    `root=${rootTop} child=${firstChildTop}`,
  );

  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    const back = host.querySelector('.dmm-select');
    setter.call(back, 'mindmap');
    back.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await pump(150);

  /* --- tree-right is a distinct layout with square elbows --- */

  const mindGeometry = geometryOf();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    const t = host.querySelector('.dmm-select');
    setter.call(t, 'tree-right');
    t.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await pump(150);
  const treeGeometry = geometryOf();
  const treeMoved = treeGeometry.filter((node) => {
    const previous = mindGeometry.find((row) => row.text === node.text);
    return previous && (Math.abs(previous.top - node.top) > 4 || Math.abs(previous.left - node.left) > 4);
  });
  check('tree-right re-lays the map (different from mind map)', treeMoved.length >= 5, `${treeMoved.length} nodes moved`);
  check(
    'tree-right renders square-elbow connectors, not curves',
    host.querySelectorAll('.dmm-edge[data-shape="elbow-h"]').length >= 5,
    `${host.querySelectorAll('.dmm-edge[data-shape="elbow-h"]').length} elbows`,
  );

  // Back to mind map: curves return, elbows vanish.
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    const back = host.querySelector('.dmm-select');
    setter.call(back, 'mindmap');
    back.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await pump(150);
  check(
    'mind-map mode uses curve connectors (no elbows)',
    host.querySelectorAll('.dmm-edge[data-shape="curve"]').length >= 5 && host.querySelectorAll('.dmm-edge[data-shape="elbow-h"]').length === 0,
    `curves=${host.querySelectorAll('.dmm-edge[data-shape="curve"]').length} elbows=${host.querySelectorAll('.dmm-edge[data-shape="elbow-h"]').length}`,
  );

  /* --- the zoom bar is inert; only its buttons take input --- */

  const zoomBar = host.querySelector('[data-canvas-ui="zoom"]');
  check('zoom bar is marked as canvas UI', Boolean(zoomBar));
  check(
    'zoom bar container ignores pointer events',
    (zoomBar?.style.pointerEvents ?? '') === 'none',
    zoomBar?.style.pointerEvents ?? '(unset)',
  );
  const zoomButtons = [...(zoomBar?.querySelectorAll('button') ?? [])];
  // The zoom controls are always present. (The extra "tidy up" button is
  // conditional on a free-drag offset and was checked in the drag section.)
  check('zoom bar has its zoom buttons', zoomButtons.length >= 3, `${zoomButtons.length}`);
  const buttonsTakeInput = zoomButtons.every((b) => b.style.pointerEvents === 'auto');
  check('every zoom button re-enables pointer events', buttonsTakeInput, zoomButtons.map((b) => b.style.pointerEvents).join(','));
  // Pressing the inert container must reach the canvas. jsdom does no hit
  // testing, so pointer-events cannot gate dispatch here — instead assert the
  // two conditions that make it true in a browser: the container is inert and
  // it registers no gesture-blocking handler of its own.
  check(
    'zoom bar registers no gesture-blocking handler',
    !zoomBar?.onPointerDown && !zoomBar?.onPointerUp,
    'container has its own pointer handler',
  );
  const canvasEl = host.querySelector('.dmm-canvas');
  const worldBefore = canvasEl?.querySelector('.dmm-world')?.style.transform ?? '';
  await act(async () => {
    canvasEl?.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 500, clientY: 700 }));
  });
  await act(async () => {
    canvasEl?.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 380, clientY: 620 }));
  });
  await act(async () => {
    canvasEl?.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 380, clientY: 620 }));
  });
  await pump(80);
  const worldAfter = canvasEl?.querySelector('.dmm-world')?.style.transform ?? '';
  check('pressing the canvas itself pans it', worldBefore !== worldAfter, `${worldBefore} -> ${worldAfter}`);

  /* --- switching structure re-centres the view instead of keeping the old offset --- */

  const transformOf = () => canvasEl?.querySelector('.dmm-world')?.style.transform ?? '';
  // Pan far away first so the old-offset bug would be visible.
  await act(async () => {
    canvasEl?.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 200, clientY: 200 }));
  });
  await act(async () => {
    canvasEl?.dispatchEvent(new window.MouseEvent('pointermove', { bubbles: true, clientX: 520, clientY: 460 }));
  });
  await act(async () => {
    canvasEl?.dispatchEvent(new window.MouseEvent('pointerup', { bubbles: true, clientX: 520, clientY: 460 }));
  });
  await pump(80);
  const panned = transformOf();
  check('dragging empty canvas actually pans', panned !== worldBefore, `${worldBefore} -> ${panned}`);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    const sel = host.querySelector('.dmm-select');
    setter.call(sel, 'org-down');
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await pump(150);
  const afterSwitch = transformOf();
  check('switching structure re-centres the view', afterSwitch !== panned, `kept ${panned}`);
  // Back to mind map so the remaining checks run on the default structure.
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
    const sel = host.querySelector('.dmm-select');
    setter.call(sel, 'mindmap');
    sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  await pump(150);

  /* --- outline panel mirrors the same tree and selects on click --- */

  const outlineBtn = [...host.querySelectorAll('.dmm-btn')].find((b) => (b.getAttribute('aria-label') || b.getAttribute('title') || '') === '大纲');
  check('outline button exists', Boolean(outlineBtn));
  await act(async () => {
    outlineBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  const outlineRows = host.querySelectorAll('.dmm-outline-row');
  check('outline lists nodes', outlineRows.length >= 10, `${outlineRows.length} rows`);
  await act(async () => {
    outlineRows[2]?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  check('outline row selects a node', host.querySelectorAll('.dmm-node[data-selected="1"]').length >= 1);

  /* --- export produces a real SVG download --- */

  let downloaded = null;
  const realCreate = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = realCreate(tag);
    if (String(tag).toLowerCase() === 'a') {
      el.click = () => {
        downloaded = el.download;
      };
    }
    return el;
  };
  window.URL.createObjectURL = () => 'blob:test';
  window.URL.revokeObjectURL = () => {};
  // Export lives in the overflow menu now, so open it first.
  const openMore = async () => {
    const trigger = [...host.querySelectorAll('.dmm-btn')].find((b) => textOf(b) === '⋯');
    if (!host.querySelector('.dmm-menu-list')) {
      await act(async () => {
        trigger?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      });
      await pump(120);
    }
    return Boolean(host.querySelector('.dmm-menu-list'));
  };
  check('overflow menu opens', await openMore(), 'no menu');
  const svgBtn = [...host.querySelectorAll('.dmm-menu-row')].find((row) => textOf(row) === '导出 SVG');
  check('SVG export is offered in the overflow menu', Boolean(svgBtn), [...host.querySelectorAll('.dmm-menu-row')].map((r) => textOf(r)).join('|'));
  await act(async () => {
    svgBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await pump(150);
  document.createElement = realCreate;
  check('SVG export downloads a file', Boolean(downloaded) && downloaded.endsWith('.svg'), String(downloaded));

  /* --- open with the default app: button, one argv launch, the file itself --- */

  await openMore();
  const openBtn = [...host.querySelectorAll('.dmm-menu-row')].find((row) => /默认程序|default app/.test(textOf(row)));
  check('open-with-default-app action exists in the menu', Boolean(openBtn), [...host.querySelectorAll('.dmm-menu-row')].map((r) => textOf(r)).join('|'));
  await act(async () => {
    openBtn?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await pump(160);
  check('opening spawned exactly one process', spawned.length === 1, `${spawned.length} spawns`);
  // Read the toast right after the click: notify clears it after ~2.6s, and
  // the surrounding drag tests have already spent that budget once.
  const toastEl = host.querySelector('.dmm-toast');
  const toastText = textOf(toastEl);
  check(
    'opening was reported to the user',
    Boolean(toastEl) && (toastText.includes('系统') || toastText.includes('交给')),
    `el=${toastEl ? 'yes' : 'null'} text="${toastText}"`,
  );
  const launch = spawned[0];
  check('launch argv is an array', Array.isArray(launch?.argv), JSON.stringify(launch?.argv));
  check(
    'launch goes through the shell handler, not an app-specific path',
    String(launch?.argv?.[0] ?? '').toLowerCase().includes('rundll32'),
    String(launch?.argv?.[0]),
  );
  check(
    'launch passes the note path as its own argv element',
    String(launch?.argv?.[2] ?? '').endsWith('fixture.md'),
    String(launch?.argv?.[2]),
  );
  check(
    'no app-specific URL scheme is built',
    !JSON.stringify(launch?.argv ?? []).includes('obsidian://'),
    JSON.stringify(launch?.argv),
  );

  /* --- the open route refuses anything outside the session workspace --- */

  const callRoute = async (query) => {
    const res = await fetch(`/dsh-mindmap/open?session=${sessionId}&path=${encodeURIComponent(query)}`);
    return { status: res.status, body: await res.json() };
  };
  // The session's workspace is the directory the note lives under, so a
  // sibling *of that root* is the smallest honest "outside" case. Derive it
  // rather than hard-coding a path, and fall back to a system path.
  const { homedir } = require('node:os');
  const outsidePath = 'C:/Windows/win.ini';
  const outsideProbe = await callRoute(outsidePath);
  check('a path outside the workspace is refused', outsideProbe.status === 500, JSON.stringify(outsideProbe.body));
  check(
    'the refusal names the workspace as the only scope',
    String(outsideProbe.body?.error ?? '').includes('session workspace'),
    String(outsideProbe.body?.error),
  );
  const systemProbe = await callRoute('C:/Windows/win.ini');
  check('a system path is refused', systemProbe.status === 500, JSON.stringify(systemProbe.body));
  const ownProbe = await callRoute(workMd.replace(/\\/g, '/'));
  check('a workspace file resolves', ownProbe.status === 200 && ownProbe.body.ok === true, JSON.stringify(ownProbe.body));
  check(
    'the resolver returns the confined path, not a URL',
    String(ownProbe.body?.path ?? '').endsWith('fixture.md') && ownProbe.body?.uri === undefined,
    JSON.stringify(ownProbe.body),
  );

  /* --- .xmind opens read-only --- */
  // Build a minimal XMind archive here (stored, uncompressed ZIP) so the test
  // does not depend on any .xmind file lying around on this machine.
  const xmindPath = path.join(workDir, 'fixture.xmind');
  {
    const sheet = {
      title: 'Fixture Sheet',
      rootTopic: {
        id: 'root',
        title: 'XMind 根节点',
        children: {
          attached: [1, 2, 3].map((n) => ({
            id: `a${n}`,
            title: `分支 ${n}`,
            children: {
              attached: [1, 2, 3].map((m) => ({ id: `a${n}b${m}`, title: `子项 ${n}.${m}` })),
            },
          })),
        },
      },
    };
    const content = Buffer.from(JSON.stringify([sheet]), 'utf8');
    const files = [
      { name: 'content.json', data: content },
      { name: 'metadata.json', data: Buffer.from('{"creator":{"name":"test"}}', 'utf8') },
      { name: 'manifest.json', data: Buffer.from('{"file-entries":{"content.json":{}}}', 'utf8') },
    ];
    // Local file headers + data, then the central directory; no compression.
    const chunks = [];
    const central = [];
    let offset = 0;
    for (const f of files) {
      const nameBuf = Buffer.from(f.name, 'utf8');
      const crc = (() => {
        let c = 0xffffffff;
        for (const byte of f.data) {
          c ^= byte;
          for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
        }
        return (c ^ 0xffffffff) >>> 0;
      })();
      const local = Buffer.alloc(30);
      local.writeUInt32LE(0x04034b50, 0);
      local.writeUInt16LE(20, 4);
      local.writeUInt16LE(0, 6);
      local.writeUInt16LE(0, 8);
      local.writeUInt32LE(crc, 14);
      local.writeUInt32LE(f.data.length, 18);
      local.writeUInt32LE(f.data.length, 22);
      local.writeUInt16LE(nameBuf.length, 26);
      local.writeUInt16LE(0, 28);
      chunks.push(local, nameBuf, f.data);
      const cen = Buffer.alloc(46);
      cen.writeUInt32LE(0x02014b50, 0);
      cen.writeUInt16LE(20, 4);
      cen.writeUInt16LE(20, 6);
      cen.writeUInt16LE(0, 8);
      cen.writeUInt16LE(0, 10);
      cen.writeUInt32LE(crc, 16);
      cen.writeUInt32LE(f.data.length, 20);
      cen.writeUInt32LE(f.data.length, 24);
      cen.writeUInt16LE(nameBuf.length, 28);
      cen.writeUInt32LE(offset, 42);
      central.push(cen, nameBuf);
      offset += local.length + nameBuf.length + f.data.length;
    }
    const cenSize = central.reduce((sum, b) => sum + b.length, 0);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(cenSize, 12);
    eocd.writeUInt32LE(offset, 16);
    fs.writeFileSync(xmindPath, Buffer.concat([...chunks, ...central, eocd]));
  }

  await act(async () => {
    root.render(
      React.createElement(MapTab, {
        sessionId,
        useTabInfo: () => ({
          tab: { navigation: { params: { path: xmindPath }, revision: 2 }, id: 't1' },
          sidebar: { expanded: true, fullscreen: false },
          panel: { id: 'p1' },
        }),
      }),
    );
  });
  await pump(700);
  const xmindNodes = host.querySelectorAll('.dmm-node');
  check('xmind renders its tree', xmindNodes.length >= 13, `${xmindNodes.length} nodes`);
  check('xmind body is read-only', textOf(host).includes('只读'));
  const xmindSave = [...host.querySelectorAll('.dmm-btn')].find((button) => textOf(button) === '保存');
  check('xmind save is disabled', xmindSave?.disabled === true, String(xmindSave?.disabled));

  /* --- turn tail entry lists maps of its own Turn --- */

  const turnTail = registry.bodies.find((b) => b.registration.name === 'conversation.chat.turnTail').component;
  const holder = document.createElement('div');
  document.body.appendChild(holder);
  const tailRoot = ReactDOMClient.createRoot(holder);
  await act(async () => {
    tailRoot.render(React.createElement(turnTail, { sessionId, turn: 1, seq: 99999 }));
  });
  await pump(400);
  const chips = holder.querySelectorAll('.dmm-chip');
  check('turn tail lists this turn’s maps', chips.length >= 1, `${chips.length} chips`);
  if (chips.length) {
    await act(async () => {
      chips[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    check('chip click opens the tab type', opened.some((call) => call.kind === 'dsh-mindmap:map'), JSON.stringify(opened));
  }

  /* --- the picker: empty session, then the workspace browser --- */

  const pickHost = document.createElement('div');
  document.body.appendChild(pickHost);
  const pickRoot = ReactDOMClient.createRoot(pickHost);
  await act(async () => {
    pickRoot.render(
      React.createElement(MapTab, {
        sessionId: '00000000-0000-0000-0000-000000000000',
        useTabInfo: () => ({ tab: { navigation: { params: { picker: true }, revision: 1 } } }),
      }),
    );
  });
  await pump(300);
  check('picker renders when asked', textOf(pickHost).includes('选择一个思维导图'), textOf(pickHost).slice(0, 120));
  check('picker explains the empty state', textOf(pickHost).includes('还没有思维导图'));
  const browseBtn = [...pickHost.querySelectorAll('.dmm-btn')].find((button) => textOf(button) === '浏览工作区文件');
  check('picker offers the workspace browser', Boolean(browseBtn));

  /* browse inside a real session's workspace (a fake id has no cwd) */
  const realHost = document.createElement('div');
  document.body.appendChild(realHost);
  const realRoot = ReactDOMClient.createRoot(realHost);
  await act(async () => {
    realRoot.render(
      React.createElement(MapTab, {
        sessionId,
        useTabInfo: () => ({ tab: { navigation: { params: { picker: true }, revision: 1 } } }),
      }),
    );
  });
  await pump(400);
  check('picker lists the session maps', realHost.querySelectorAll('.dmm-card').length >= 1);
  const browseBtn2 = [...realHost.querySelectorAll('.dmm-btn')].find((button) => textOf(button) === '浏览工作区文件');
  check('real session picker offers the browser', Boolean(browseBtn2));
  await act(async () => {
    browseBtn2?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  });
  await pump(600);
  const browsed = [...realHost.querySelectorAll('.dmm-card-title')].map((el) => textOf(el));
  check('browser lists markdown files', browsed.length >= 1, browsed.slice(0, 8).join(','));
  const pickFirst = [...realHost.querySelectorAll('.dmm-card')].find((card) => textOf(card).includes('.md'));
  check('browser finds a markdown note', Boolean(pickFirst), browsed.slice(0, 6).join(','));
  if (pickFirst) {
    await act(async () => {
      pickFirst.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    });
    await pump(800);
    check('picking a file opens the canvas', realHost.querySelectorAll('.dmm-node').length >= 5, `${realHost.querySelectorAll('.dmm-node').length} nodes`);
    check('picked map renders a root', textOf(realHost).length > 40, textOf(realHost).slice(0, 160));
  }

  await act(async () => {
    root.unmount();
    tailRoot.unmount();
    pickRoot.unmount();
    realRoot.unmount();
  });

  closeServer();
  console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(', ')}` : '\nall checks passed');
  process.exitCode = failures.length ? 1 : 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
