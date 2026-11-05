// Unit check for the layout metrics: character wrapping must not leave a
// one-character orphan line, and no line may exceed the node's content box.
// Run: node test/wrap.test.cjs
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

const constBlock = /const FONT = 13;[\s\S]*?const MAX_W = \d+;/.exec(src);
if (!constBlock) throw new Error('layout constants not found');

const code = [
  constBlock[0],
  'const measureCache = new Map(); const MEASURE_CACHE_LIMIT = 4096;',
  'const markerCache = new WeakMap();',
  grab('isWide'),
  grab('textWidth'),
  grab('wrapText'),
  grab('measureNode'),
  'return { wrapText, textWidth, measureNode, MAX_W, MIN_W, PAD_X, PAD_Y, FONT };',
].join('\n');

const { wrapText, textWidth, measureNode, MAX_W, PAD_X, FONT } = new Function(code)();
const CONTENT_LIMIT = MAX_W - PAD_X * 2;

const samples = [
  '双击节点就地改名',
  '节点配色与备注',
  '每轮对话结束后的脑图小胶囊',
  'Markdown 标题层级 → 节点',
  '.xmind 只读打开，可另存为 Markdown',
  'Tab 加子节点，Enter 加同级',
  '拖动节点换父级',
  '持久化与恢复',
  '宿主路由全部通过 HTTP 实测',
  'jsdom 全量渲染测试 28 项断言通过',
  '真实界面按钮已出现在标题栏',
  '插件把对话里的 Markdown 大纲当作唯一真相，右侧栏只是同一份文件的另一个编辑器。',
  'Short',
  'A moderately long English label that must wrap onto several lines',
];

const failures = [];
function check(name, ok, detail) {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok || !detail ? '' : ` — ${detail}`}`);
  if (!ok) failures.push(name);
}

for (const text of samples) {
  const measured = measureNode({ text });
  const orphan = measured.lines.length >= 2 && [...measured.lines[measured.lines.length - 1]].length === 1;
  check(`no one-character last line: ${text.slice(0, 18)}`, !orphan, JSON.stringify(measured.lines));
  // The box is sized to its content, so every line must fit inside it.
  const budget = measured.w - PAD_X * 2 + 2;
  const overflow = measured.lines.filter((line) => textWidth(line, FONT) > budget);
  check(`no line over the content box: ${text.slice(0, 18)}`, overflow.length === 0, JSON.stringify(overflow));
  check(`width inside limits: ${text.slice(0, 18)}`, measured.w >= 66 && measured.w <= MAX_W, String(measured.w));
  check(`height covers every line: ${text.slice(0, 18)}`, measured.h >= measured.lines.length * 18, `${measured.h}`);
  if (textWidth(text, FONT) <= CONTENT_LIMIT) {
    check(`a label that fits stays on one line: ${text.slice(0, 18)}`, measured.lines.length === 1, JSON.stringify(measured.lines));
  }
}

// Layout wraps first, then sizes the box to the lines that came out, so the
// invariant is idempotence against the *content budget*, not the final width.
for (const text of samples) {
  const measured = measureNode({ text });
  const again = wrapText(text, CONTENT_LIMIT, FONT);
  check(`wrap is idempotent: ${text.slice(0, 18)}`, again.join('|') === measured.lines.join('|'), `${again.join('|')} vs ${measured.lines.join('|')}`);
  const joined = measured.lines.join('');
  check(`wrap round-trips the text: ${text.slice(0, 18)}`, joined === text || joined === text.replace(/\n/g, ''), JSON.stringify(joined));
}

console.log(failures.length ? `\n${failures.length} FAILED: ${failures.join(', ')}` : '\nall checks passed');
process.exitCode = failures.length ? 1 : 0;
