/**
 * Client half of `dsh-mindmap`.
 *
 * Three things live here:
 *
 *   1. A right-sidebar tab type (`dsh-mindmap:map`). It appears in the right
 *      column's guide, which is the entry point the user asked for, and its
 *      body is a real editor canvas: layout, pan/zoom, select, edit, add,
 *      delete, drag-reparent, fold, colour, outline, search, export, save.
 *   2. Turn-tail chips under an assistant Turn that produced a mind map, so a
 *      map written in the conversation is one click from the canvas.
 *   3. A header utility button that opens the tab on the current Session.
 *
 * Data comes from this package's Host half (`/dsh-mindmap/…`): session-scanned
 * inline maps, delivered `.md` / `.xmind` files, and the save route that writes
 * Markdown back to the note.
 *
 * @module dsh-mindmap
 */
window.__ModuleLoader__.load({
  id: 'dsh-mindmap',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState } = React;

    const BASE = '/dsh-mindmap';
    const TAB_ID = 'dsh-mindmap/map';
    const KIND = 'dsh-mindmap:map';
    const SLOT_TAB = 'sidebar.right.pane.tab';
    const SLOT_TURN_TAIL = 'conversation.chat.turnTail';
    const SLOT_HEADER = 'conversation.session.header.utilities';

    /* ------------------------------------------------------------------ */
    /* copy                                                                */
    /* ------------------------------------------------------------------ */

    const DICT = {
      zh: {
        tabTitle: '思维导图',
        guideTitle: '思维导图',
        guideDesc: '查看与编辑对话里的 Markdown 思维导图，打开 .xmind',
        open: '在思维导图中打开',
        entryChip: '脑图',
        entryBadge: '思维导图',
        headerButton: '思维导图',
        picker: '选择一个思维导图',
        pickerEmpty: '这个会话里还没有思维导图。让对话输出 Markdown 大纲，或交付一个 .md / .xmind 文件。',
        pickerLoading: '加载中…',
        browse: '浏览工作区文件',
        browseTitle: '工作区里的 .md / .xmind',
        browseEmpty: '这个目录里没有 .md 或 .xmind。',
        browseParent: '回到工作区根目录',
        back: '返回导图列表',
        switchDoc: '换一张',
        tidyUp: '整理',
        more: '更多',
        dropCycle: '不能放到自己的子树里',
        dropSelf: '不能放到自己',
        dropHere: '松开，成为它的子节点',
        dropFree: '拖到节点上可改变层级，松手停在空白处则保持位置',
        fromMessage: '对话内',
        fromFile: '文件',
        nodeCount: '节点',
        readOnly: '只读（.xmind）',
        saveAsHint: '另存为 Markdown',
        saveName: '文件名',
        confirmSaveAs: '保存',
        cancel: '取消',
        save: '保存',
        saved: '已写入',
        saveFailed: '保存失败',
        copyMd: '复制 Markdown',
        openInObsidian: '用默认程序打开',
        obsidianNeedsSave: '先保存，再用默认程序打开',
        obsidianOpening: '正在打开…',
        obsidianOpened: '已交给系统打开',
        obsidianFailed: '打开失败',
        obsidianNoVault: '已用系统默认程序打开',
        copied: '已复制',
        exportPng: '导出 PNG',
        exportSvg: '导出 SVG',
        outline: '大纲',
        search: '搜索节点',
        structure: '结构',
        logicRight: '逻辑图（向右）',
        mindmap: '思维导图（左右）',
        orgDown: '组织图（向下）',
        treeRight: '树形图（向右）',
        expandAll: '展开全部',
        level2: '只看两层',
        reload: '重新读取',
        addChild: '子节点',
        addSibling: '同级',
        deleteNode: '删除',
        edit: '编辑',
        color: '颜色',
        fold: '折叠',
        unfold: '展开',
        note: '备注',
        notePlaceholder: '节点备注（Markdown）',
        close: '关闭',
        emptyDoc: '空导图',
        deleteConfirm: '删除节点及其子树？',
        file: '文件',
      },
      en: {
        tabTitle: 'Mind Map',
        guideTitle: 'Mind Map',
        guideDesc: 'View and edit Markdown mind maps from the conversation; open .xmind',
        open: 'Open in mind map',
        entryChip: 'Map',
        entryBadge: 'Mind map',
        headerButton: 'Mind map',
        picker: 'Pick a mind map',
        pickerEmpty: 'No mind map in this session yet. Ask for a Markdown outline, or deliver a .md / .xmind file.',
        pickerLoading: 'Loading…',
        browse: 'Browse workspace files',
        browseTitle: 'Markdown / .xmind in this workspace',
        browseEmpty: 'No .md or .xmind in this folder.',
        browseParent: 'Back to the workspace root',
        back: 'Back to the map list',
        switchDoc: 'Switch map',
        tidyUp: 'Tidy up',
        more: 'More',
        dropCycle: 'Cannot drop into its own subtree',
        dropSelf: 'Cannot drop onto itself',
        dropHere: 'Release to make it a child here',
        dropFree: 'Drop on a node to re-parent, or on empty space to keep the position',
        fromMessage: 'in chat',
        fromFile: 'file',
        nodeCount: 'nodes',
        readOnly: 'Read-only (.xmind)',
        saveAsHint: 'Save as Markdown',
        saveName: 'File name',
        confirmSaveAs: 'Save',
        cancel: 'Cancel',
        save: 'Save',
        saved: 'Written to',
        saveFailed: 'Save failed',
        copyMd: 'Copy Markdown',
        openInObsidian: 'Open with default app',
        obsidianNeedsSave: 'Save first, then open with the default app',
        obsidianOpening: 'Opening…',
        obsidianOpened: 'Handed to the system',
        obsidianFailed: 'Could not open it',
        obsidianNoVault: 'Opened with the system default app',
        copied: 'Copied',
        exportPng: 'Export PNG',
        exportSvg: 'Export SVG',
        outline: 'Outline',
        search: 'Search nodes',
        structure: 'Structure',
        logicRight: 'Logic chart (rightward)',
        mindmap: 'Mind map (left and right)',
        orgDown: 'Org chart (downward)',
        treeRight: 'Tree chart (rightward)',
        expandAll: 'Expand all',
        level2: 'Top two levels',
        reload: 'Reload',
        addChild: 'Child',
        addSibling: 'Sibling',
        deleteNode: 'Delete',
        edit: 'Edit',
        color: 'Colour',
        fold: 'Fold',
        unfold: 'Unfold',
        note: 'Note',
        notePlaceholder: 'Node note (Markdown)',
        close: 'Close',
        emptyDoc: 'Empty map',
        deleteConfirm: 'Delete this node and its subtree?',
        file: 'File',
      },
    };

    let localeId = 'zh';
    function T(key) {
      const table = DICT[localeId] ?? DICT.zh;
      return table[key] ?? DICT.zh[key] ?? key;
    }

    /* ------------------------------------------------------------------ */
    /* geometry helpers                                                    */
    /* ------------------------------------------------------------------ */

    const FONT = 13;
    const LINE = 18;
    const PAD_X = 12;
    const PAD_Y = 7;
    const MIN_W = 66;
    const MAX_W = 252;
    const H_GAP = 46;
    const V_GAP = 12;
    const COLORS = ['', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'];
    const HEX_COLOR = {
      red: '#e5484d',
      orange: '#f76b15',
      yellow: '#e0a500',
      green: '#30a46c',
      teal: '#12a594',
      blue: '#3b82f6',
      purple: '#8e4ec6',
      pink: '#d6409f',
      gray: '#8b8d98',
    };

    function isWide(ch) {
      const code = ch.codePointAt(0) ?? 0;
      return (
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xfe30 && code <= 0xfe4f) ||
        (code >= 0xff00 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x1f300 && code <= 0x1f9ff)
      );
    }

    function textWidth(text, size) {
      let total = 0;
      for (const ch of String(text)) total += isWide(ch) ? size : size * 0.56;
      return total;
    }

    function wrapText(text, maxWidth, size) {
      const src = String(text ?? '').replace(/\r/g, '');
      const out = [];
      for (const paragraph of src.split('\n')) {
        if (paragraph === '') {
          out.push('');
          continue;
        }
        let line = '';
        let width = 0;
        for (const ch of paragraph) {
          const w = isWide(ch) ? size : size * 0.56;
          // CJK may break between any two characters, but never leave a single
          // orphan character on its own last line: pull one more character down
          // only when it stops the line from being alone.
          if (width + w > maxWidth && line !== '') {
            out.push(line);
            line = '';
            width = 0;
          }
          line += ch;
          width += w;
        }
        if (line !== '') out.push(line);
      }
      // Rebalance a two-line result whose second line is one character.
      if (out.length >= 2) {
        const last = out[out.length - 1];
        const previous = out[out.length - 2];
        if ([...last].length === 1 && [...previous].length > 2) {
          const chars = [...previous];
          out[out.length - 2] = chars.slice(0, -1).join('');
          out[out.length - 1] = chars[chars.length - 1] + last;
        }
      }
      return out.length ? out : [''];
    }

    /**
     * Measurement is a pure function of the label text, so the same string must
     * never be wrapped twice. On a 780-node map, a full relayout calls this once
     * per node and the memo turns that into a map lookup — this is the single
     * biggest win while typing or dragging.
     */
    const measureCache = new Map();
    const MEASURE_CACHE_LIMIT = 4096;

    function measureNode(node) {
      const text = node.text || '';
      const hit = measureCache.get(text);
      if (hit) return hit;
      // Wrap against the widest content box the node may use, then size the box
      // to the lines that came out. Sizing afterwards (instead of shrinking the
      // budget first) keeps a label that fits on one line on one line.
      //
      // The row height here MUST equal the CSS `line-height` in pixels: the
      // renderer prints one div per line, so a mismatch (1.45 × 13 = 18.85px
      // against an 18px budget) silently clips the last line of every wrapped
      // label. Both sides now use exactly LINE_PX.
      const contentLimit = MAX_W - PAD_X * 2;
      const lines = wrapText(text, contentLimit, FONT);
      let widest = 0;
      for (const line of lines) widest = Math.max(widest, textWidth(line, FONT));
      const width = Math.round(Math.min(MAX_W, Math.max(MIN_W, Math.min(widest, contentLimit) + PAD_X * 2 + 4)));
      // One extra pixel of slack per box: sub-pixel rounding never eats a line.
      const height = Math.max(32, lines.length * LINE + PAD_Y * 2 + 1);
      const result = { w: width, h: height, lines };
      if (measureCache.size >= MEASURE_CACHE_LIMIT) measureCache.clear();
      measureCache.set(text, result);
      return result;
    }

    /**
     * Parsed marker info per node, keyed by the node object. A node keeps the
     * same identity between edits (only its fields change), so this is a stable
     * cache; it is rebuilt when the marker array itself is replaced.
     */
    const markerCache = new WeakMap();

    function markerInfo(node) {
      const markers = node.markers;
      const hit = markerCache.get(node);
      if (hit && hit.ref === markers) return hit;
      const tokens = new Set();
      let color;
      for (const raw of markers ?? []) {
        const text = String(raw).trim();
        if (!text) continue;
        const head = text.split(/[=\s]/)[0].toLowerCase();
        tokens.add(head);
        if (color) continue;
        if (text.startsWith('#')) color = text;
        else if (HEX_COLOR[head]) color = HEX_COLOR[head];
        else if (text.startsWith('color:')) color = text.slice(6).trim();
      }
      const info = { ref: markers, tokens, color };
      markerCache.set(node, info);
      return info;
    }

    function markerColor(node) {
      return markerInfo(node).color;
    }

    function hasMarker(node, name) {
      return markerInfo(node).tokens.has(name);
    }

    function isFolded(node) {
      return hasMarker(node, 'fold');
    }

    /**
     * Which side a top-level branch sits on in the left/right mind map.
     * An explicit marker wins; without one the branch is auto-balanced so a
     * plain Markdown outline (which never carries markers) still reads as a
     * two-sided map instead of collapsing onto the right.
     */
    function sideOf(node, index) {
      if (hasMarker(node, 'left')) return -1;
      if (hasMarker(node, 'right')) return 1;
      return index % 2 === 0 ? 1 : -1;
    }

    /* ------------------------------------------------------------------ */
    /* layout                                                              */
    /* ------------------------------------------------------------------ */

    function measureAll(root, out) {
      out.set(root.id, measureNode(root));
      for (const kid of root.children ?? []) measureAll(kid, out);
    }

    /** The laid-out lines of one node, so rendering and export never re-wrap in CSS. */
    function linesOf(node, sizeMap) {
      return (sizeMap.get(node.id) ?? measureNode(node)).lines;
    }

    function childList(node) {
      if (isFolded(node)) return [];
      return node.children ?? [];
    }

    /** Vertical block layout for a horizontal (logic / mind map) structure. */
    function layoutHorizontal(node, dir, x, y, out, depth, sizeMap) {
      const size = sizeMap.get(node.id) ?? { w: 80, h: 30 };
      const kids = childList(node);
      if (!kids.length) {
        out.nodes.push({ id: node.id, x, y, w: size.w, h: size.h, node, depth });
        return size.h;
      }
      let total = 0;
      const spans = [];
      for (const kid of kids) {
        const kidSize = sizeMap.get(kid.id) ?? { w: 80, h: 30 };
        const kidX = dir > 0 ? x + size.w + H_GAP : x - H_GAP - kidSize.w;
        const span = layoutHorizontal(kid, dir, kidX, y + total, out, depth + 1, sizeMap);
        spans.push(span);
        total += span + V_GAP;
      }
      total -= V_GAP;
      const block = Math.max(size.h, total);
      const selfY = y + (block - size.h) / 2;
      out.nodes.push({ id: node.id, x, y: selfY, w: size.w, h: size.h, node, depth });
      return block;
    }

    /** Horizontal block layout for an org chart (children side by side). */
    /**
     * Width of a whole subtree in the org-chart layout: the node and the
     * horizontal spread of its descendants, which are themselves side by side.
     * This is what a sibling must reserve, not just the node's own box — with
     * only the box width, two neighbours whose subtrees are wide collide and
     * their labels overlap (the "text fights" failure).
     */
    function subtreeWidth(node, sizeMap) {
      const size = sizeMap.get(node.id) ?? { w: 80, h: 30 };
      const kids = childList(node);
      if (!kids.length) return size.w;
      let total = 0;
      for (const kid of kids) total += subtreeWidth(kid, sizeMap);
      total += (kids.length - 1) * H_GAP;
      return Math.max(size.w, total);
    }

    /**
     * Org chart, two passes: reserve each child's *subtree* width so cousin
     * branches never overlap, then centre each child inside its reserved slot.
     * The parent always sits over the middle of its own subtree.
     */
    function layoutVertical(node, cx, y, out, depth, sizeMap) {
      const size = sizeMap.get(node.id) ?? { w: 80, h: 30 };
      const kids = childList(node);
      const x = cx - size.w / 2;
      out.nodes.push({ id: node.id, x, y, w: size.w, h: size.h, node, depth });
      if (!kids.length) return size.h;

      // Pass 1: every child owns the horizontal band its subtree needs.
      const bands = kids.map((kid) => subtreeWidth(kid, sizeMap));
      let total = 0;
      for (const band of bands) total += band;
      total += (kids.length - 1) * H_GAP;

      // Pass 2: walk the bands left to right, each child centred in its own.
      let cursor = cx - total / 2;
      let maxSpan = 0;
      kids.forEach((kid, index) => {
        const band = bands[index];
        const kidCx = cursor + band / 2;
        const span = layoutVertical(kid, kidCx, y + size.h + V_GAP * 4, out, depth + 1, sizeMap);
        maxSpan = Math.max(maxSpan, span);
        cursor += band + H_GAP;
      });
      return size.h + V_GAP * 4 + maxSpan;
    }

    /**
     * Compact tree layout: children stack under a shared elbow instead of being
     * centred on the parent, which keeps a deep tree narrow and is what a
     * "tree chart" means as opposed to a "logic chart". The first child sits
     * level with the parent; the rest follow below.
     */
    function layoutTree(node, dir, x, y, out, depth, sizeMap) {
      const size = sizeMap.get(node.id) ?? { w: 80, h: 30 };
      const kids = childList(node);
      out.nodes.push({ id: node.id, x, y, w: size.w, h: size.h, node, depth });
      if (!kids.length) return size.h;
      let cursor = y;
      let maxBottom = y + size.h;
      for (const kid of kids) {
        const kidSize = sizeMap.get(kid.id) ?? { w: 80, h: 30 };
        const kidX = dir > 0 ? x + size.w + H_GAP : x - H_GAP - kidSize.w;
        const span = layoutTree(kid, dir, kidX, cursor, out, depth + 1, sizeMap);
        cursor += span + V_GAP;
        maxBottom = Math.max(maxBottom, cursor - V_GAP);
      }
      return maxBottom - y;
    }

    function offsetAll(nodes, dx, dy) {
      for (const node of nodes) {
        node.x += dx;
        node.y += dy;
      }
    }

    /**
     * One connector between a parent box and a child box. Pure, so the full
     * rebuild and the incremental patch during a drag produce identical results.
     */
    function edgeBetween(parentEntry, kidEntry, structure) {
      const color = markerColor(parentEntry.node) ?? markerColor(kidEntry.node);
      const id = `${parentEntry.id}>${kidEntry.id}`;
      if (structure === 'org-down') {
        // Elbow: down from the parent, across, then down into the child.
        return {
          id,
          shape: 'elbow-v',
          x1: parentEntry.x + parentEntry.w / 2,
          y1: parentEntry.y + parentEntry.h,
          x2: kidEntry.x + kidEntry.w / 2,
          y2: kidEntry.y,
          color,
        };
      }
      if (structure === 'tree-right') {
        // Orthogonal tree link: out of the parent, a shared vertical spine,
        // then into the child. A freely dragged child may sit left of its
        // parent, so the attachment edge follows it rather than always
        // leaving from the right side.
        const toRight = kidEntry.x + kidEntry.w / 2 >= parentEntry.x + parentEntry.w / 2;
        return {
          id,
          shape: 'elbow-h',
          x1: toRight ? parentEntry.x + parentEntry.w : parentEntry.x,
          y1: parentEntry.y + parentEntry.h / 2,
          x2: toRight ? kidEntry.x : kidEntry.x + kidEntry.w,
          y2: kidEntry.y + kidEntry.h / 2,
          color,
        };
      }
      const toRight = kidEntry.x >= parentEntry.x;
      return {
        id,
        shape: 'curve',
        x1: toRight ? parentEntry.x + parentEntry.w : parentEntry.x,
        y1: parentEntry.y + parentEntry.h / 2,
        x2: toRight ? kidEntry.x : kidEntry.x + kidEntry.w,
        y2: kidEntry.y + kidEntry.h / 2,
        color,
      };
    }

    /** Re-derive one edge from its two current boxes, keeping the structure. */
    function rebuildEdge(edge, parentEntry, kidEntry, structure) {
      return edgeBetween(parentEntry, kidEntry, structure);
    }

    function collectEdges(nodes, structure) {
      const byId = new Map(nodes.map((node) => [node.id, node]));
      const edges = [];
      for (const entry of nodes) {
        const kids = childList(entry.node);
        for (const kid of kids) {
          const kidEntry = byId.get(kid.id);
          if (!kidEntry) continue;
          edges.push(edgeBetween(entry, kidEntry, structure));
        }
      }
      return edges;
    }

    function layoutMap(root, structure) {
      const sizeMap = new Map();
      measureAll(root, sizeMap);
      const out = { nodes: [] };
      if (structure === 'mindmap') {
        const right = [];
        const left = [];
        childList(root).forEach((kid, index) => (sideOf(kid, index) < 0 ? left : right).push(kid));
        const rootSize = sizeMap.get(root.id);
        const virtualRight = { id: '__r', text: '', children: right, markers: [] };
        sizeMap.set('__r', { w: 0, h: 0 });
        const rightBox = { nodes: [] };
        const leftBox = { nodes: [] };
        let rightSpan = 0;
        let leftSpan = 0;
        let ys = 0;
        for (const kid of right) {
          const kidSize = sizeMap.get(kid.id);
          const span = layoutHorizontal(kid, 1, rootSize.w / 2 + H_GAP, ys, rightBox, 1, sizeMap);
          ys += span + V_GAP;
          rightSpan += span + V_GAP;
        }
        ys = 0;
        for (const kid of left) {
          const kidSize = sizeMap.get(kid.id);
          const span = layoutHorizontal(kid, -1, -rootSize.w / 2 - H_GAP - kidSize.w, ys, leftBox, 1, sizeMap);
          ys += span + V_GAP;
          leftSpan += span + V_GAP;
        }
        const totalRight = Math.max(rootSize.h, rightSpan ? rightSpan - V_GAP : 0);
        const totalLeft = Math.max(rootSize.h, leftSpan ? leftSpan - V_GAP : 0);
        offsetAll(rightBox.nodes, 0, -totalRight / 2);
        offsetAll(leftBox.nodes, 0, -totalLeft / 2);
        out.nodes.push({
          id: root.id,
          x: -rootSize.w / 2,
          y: -rootSize.h / 2,
          w: rootSize.w,
          h: rootSize.h,
          node: root,
          depth: 0,
        });
        out.nodes.push(...rightBox.nodes, ...leftBox.nodes);
        void virtualRight;
      } else if (structure === 'org-down') {
        const span = layoutVertical(root, 0, 0, out, 0, sizeMap);
        offsetAll(out.nodes, 0, -span / 2);
      } else if (structure === 'tree-right') {
        const span = layoutTree(root, 1, 0, 0, out, 0, sizeMap);
        offsetAll(out.nodes, 0, -span / 2);
      } else {
        const span = layoutHorizontal(root, 1, 0, 0, out, 0, sizeMap);
        offsetAll(out.nodes, 0, -span / 2);
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const node of out.nodes) {
        minX = Math.min(minX, node.x);
        minY = Math.min(minY, node.y);
        maxX = Math.max(maxX, node.x + node.w);
        maxY = Math.max(maxY, node.y + node.h);
      }
      const pad = 60;
      offsetAll(out.nodes, -minX + pad, -minY + pad);
      return {
        // Each entry carries the exact lines the metrics produced: the renderer
        // prints them verbatim, so CSS never gets a chance to re-wrap and orphan
        // a character the layout did not account for.
        nodes: out.nodes.map((entry) => ({ ...entry, lines: linesOf(entry.node, sizeMap) })),
        edges: collectEdges(out.nodes, structure),
        width: maxX - minX + pad * 2,
        height: maxY - minY + pad * 2,
      };
    }

    /* ------------------------------------------------------------------ */
    /* tree edits                                                          */
    /* ------------------------------------------------------------------ */

    function cloneTree(node) {
      return {
        ...node,
        markers: [...(node.markers ?? [])],
        children: (node.children ?? []).map(cloneTree),
      };
    }

    function findNode(root, id, parent) {
      if (root.id === id) return { node: root, parent };
      for (const kid of root.children ?? []) {
        const hit = findNode(kid, id, root);
        if (hit) return hit;
      }
      return undefined;
    }

    let uid = 0;
    function nextId() {
      uid += 1;
      return `u${Date.now().toString(36)}${uid.toString(36)}`;
    }

    function newChild(text) {
      return { id: nextId(), text: text ?? '新节点', note: '', markers: [], children: [] };
    }

    function walk(node, visit) {
      visit(node);
      for (const kid of node.children ?? []) walk(kid, visit);
    }

    /* ------------------------------------------------------------------ */
    /* markdown (client-side, for copy)                                    */
    /* ------------------------------------------------------------------ */

    function renderMarkdown(root) {
      const lines = [];
      const walkNode = (node, depth) => {
        const text = String(node.text ?? '').replace(/\r?\n/g, '<br>');
        const markers = (node.markers ?? []).filter(Boolean);
        if (depth === 0) {
          lines.push(`# ${text}`);
          for (const marker of markers) lines.push(`%%${marker}%%`);
        } else if (depth <= 3) {
          lines.push(`${'#'.repeat(depth + 1)} ${text}`);
          for (const marker of markers) lines.push(`%%${marker}%%`);
        } else {
          const tail = markers.map((marker) => ` %%${marker}%%`).join('');
          lines.push(`${'  '.repeat(Math.max(0, depth - 4))}- ${text}${tail}`);
        }
        if (node.note && String(node.note).trim()) {
          for (const noteLine of String(node.note).replace(/\r\n/g, '\n').split('\n')) lines.push(noteLine);
        }
        if ((node.children ?? []).length && depth >= 1) lines.push('');
        for (const kid of node.children ?? []) walkNode(kid, depth + 1);
      };
      walkNode(root, 0);
      return `---\nmindmap: true\n---\n\n${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
    }

    function countNodes(node) {
      let total = 1;
      for (const kid of node.children ?? []) total += countNodes(kid);
      return total;
    }

    /* ------------------------------------------------------------------ */
    /* host api                                                            */
    /* ------------------------------------------------------------------ */

    async function getJson(path, signal) {
      const response = await fetch(path, { signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }

    async function postJson(path, body) {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const parsed = await response.json().catch(() => ({}));
      if (!response.ok || parsed?.ok === false) throw new Error(parsed?.error ?? `HTTP ${response.status}`);
      return parsed;
    }

    /* session document catalogue: fetched once per session, shared by every entry */

    const catalogues = new Map();
    /** A cached catalogue older than this is refetched instead of reused. */
    const CATALOGUE_TTL = 4000;

    function invalidateCatalogue(sessionId) {
      catalogues.delete(String(sessionId));
    }

    function loadCatalogue(sessionId, force) {
      if (!sessionId) return Promise.resolve({ docs: [], cwd: undefined });
      const key = String(sessionId);
      const hit = catalogues.get(key);
      if (hit && !force && Date.now() - hit.at < CATALOGUE_TTL) return hit.promise;
      const promise = getJson(`${BASE}/session?session=${encodeURIComponent(key)}`)
        .then((body) => ({ docs: Array.isArray(body.docs) ? body.docs : [], cwd: body.cwd }))
        .catch(() => ({ docs: [], cwd: undefined }));
      catalogues.set(key, { promise, at: Date.now() });
      return promise;
    }

    function useCatalogue(sessionId, nonce) {
      const [state, setState] = useState({ docs: [], cwd: undefined, loading: true });
      useEffect(() => {
        if (!sessionId) {
          setState({ docs: [], cwd: undefined, loading: false });
          return undefined;
        }
        let alive = true;
        setState((prev) => ({ ...prev, loading: true }));
        loadCatalogue(sessionId, nonce > 0).then((body) => {
          if (!alive) return;
          setState({ docs: body.docs, cwd: body.cwd, loading: false });
        });
        return () => {
          alive = false;
        };
      }, [sessionId, nonce]);
      return state;
    }

    /* ------------------------------------------------------------------ */
    /* controller (opening the tab from outside)                           */
    /* ------------------------------------------------------------------ */

    let controller;
    let openParams;

    /** Open the tab. `{ picker: true }` asks for the chooser even when a map is already open. */
    function openMap(params) {
      openParams = params ?? {};
      if (!controller) return false;
      try {
        controller.openTab(KIND, { params: openParams });
        return true;
      } catch {
        return false;
      }
    }

    /* ------------------------------------------------------------------ */
    /* styles                                                              */
    /* ------------------------------------------------------------------ */

    const CSS = `
/* ── shell ─────────────────────────────────────────────────────────────── */
.dmm-root {
  display:flex; flex-direction:column; height:100%; min-height:0;
  color:var(--dsw-alias-label-primary);
  font-family:var(--dsw-font-family,system-ui);
  -webkit-font-smoothing:antialiased;
}

/* Toolbar: grouped controls, separated by space rather than rules. */
.dmm-bar {
  display:flex; align-items:center; gap:14px; padding:10px 14px 9px;
  border-bottom:1px solid var(--dsw-alias-border-l1);
  flex-wrap:wrap; row-gap:8px;
  background:var(--dsw-alias-bg-base);
}
.dmm-group { display:flex; align-items:center; gap:6px; }
.dmm-bar-spacer { flex:1 1 auto; }

/* ── controls ──────────────────────────────────────────────────────────── */
.dmm-btn {
  height:30px; padding:0 11px; border-radius:7px;
  border:1px solid var(--dsw-alias-border-l1);
  background:transparent; color:var(--dsw-alias-label-secondary);
  font:inherit; font-size:12.5px; cursor:pointer;
  display:inline-flex; align-items:center; gap:6px; white-space:nowrap;
  transition:background .12s ease, border-color .12s ease, color .12s ease;
}
.dmm-btn:hover:not(:disabled) {
  background:var(--dsw-alias-bg-layer-2);
  border-color:var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);
}
.dmm-btn:active:not(:disabled) { transform:translateY(.5px); }
.dmm-btn:focus-visible {
  outline:2px solid var(--dsw-alias-brand-primary);
  outline-offset:1px;
}
.dmm-btn[data-on="1"] {
  background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary);
  border-color:var(--dsw-alias-border-l2);
}
.dmm-btn:disabled { opacity:.4; cursor:default; }
.dmm-iconbtn { width:30px; padding:0; justify-content:center; }

.dmm-select {
  height:30px; border-radius:7px; border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-secondary);
  font:inherit; font-size:12.5px; padding:0 8px; cursor:pointer;
}
.dmm-select:hover { border-color:var(--dsw-alias-border-l2); }
.dmm-search {
  height:30px; border-radius:7px; border:1px solid var(--dsw-alias-border-l1);
  background:transparent; color:var(--dsw-alias-label-primary);
  font:inherit; font-size:12.5px; padding:0 10px; width:110px;
}
.dmm-search:hover { border-color:var(--dsw-alias-border-l2); }
.dmm-search:focus {
  outline:none; border-color:var(--dsw-alias-brand-primary);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 20%, transparent);
}

/* ── canvas ─────────────────────────────────────────────────────────────── */
.dmm-body { position:relative; flex:1 1 auto; min-height:0; display:flex; }
.dmm-canvas {
  position:relative; flex:1 1 auto; overflow:hidden; cursor:grab; outline:none;
  background:var(--dsw-alias-bg-base);
  background-image:
    radial-gradient(circle at 1px 1px,
      color-mix(in srgb, var(--dsw-alias-border-l1) 70%, transparent) 1px,
      transparent 0);
  background-size:24px 24px;
}
.dmm-canvas[data-panning="1"] { cursor:grabbing; }
.dmm-world { position:absolute; left:0; top:0; transform-origin:0 0; will-change:transform; }

/* ── connectors ─────────────────────────────────────────────────────────── */
.dmm-edge {
  fill:none;
  stroke:color-mix(in srgb, var(--dsw-alias-label-secondary) 42%, transparent);
  stroke-width:1.5;
  stroke-linecap:round;
}

/* ── nodes ──────────────────────────────────────────────────────────────── */
.dmm-node {
  position:absolute; box-sizing:border-box;
  border-radius:9px; border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);
  font-size:13px; line-height:18px;
  padding:7px 12px; overflow:hidden; cursor:pointer;
  user-select:none; display:flex; align-items:center;
  transition:border-color .12s ease, box-shadow .12s ease, background .12s ease;
}
.dmm-node:hover { border-color:var(--dsw-alias-border-l2); }
/* The central topic is the anchor: heavier weight, tinted ground, no shouting. */
.dmm-node[data-depth="0"] {
  background:color-mix(in srgb, var(--dsw-alias-brand-primary) 9%, var(--dsw-alias-bg-layer-2));
  border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, var(--dsw-alias-border-l2));
  font-weight:600; letter-spacing:.01em;
}
/* One remembered moment: the selection ring. Everything else stays quiet. */
.dmm-node[data-selected="1"] {
  border-color:var(--dsw-alias-brand-primary);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 26%, transparent),
    0 2px 10px color-mix(in srgb, var(--dsw-alias-brand-primary) 12%, transparent);
}
/* While a node is being dragged it follows the cursor, so it is always the
   element under the pointer: the hit test would keep finding the node being
   moved and the hint would always read "can't drop on itself". Taking it out
   of hit-testing lets the search see what is actually behind it. */
.dmm-node[data-drag-source="1"] { opacity:.4; pointer-events:none; }
.dmm-node[data-drop-ok="1"] {
  border-color:var(--dsw-alias-state-success-primary);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-success-primary) 30%, transparent);
}
.dmm-node[data-drop-blocked="1"] {
  border-color:var(--dsw-alias-state-error-primary);
  box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-error-primary) 30%, transparent);
}
.dmm-node[data-match="1"] {
  background:color-mix(in srgb, var(--dsw-alias-state-warn-primary) 20%, var(--dsw-alias-bg-layer-1));
}
/* One text node carries every line; white-space:pre turns its newlines into
   rows, so the exact wrapping the layout computed is kept without a div per
   line. Fewer DOM nodes to create on mount. */
.dmm-node-text {
  width:100%; min-width:0;
  white-space:pre; overflow:hidden; text-overflow:ellipsis;
  line-height:18px;
}

/* Collapse control on a folded branch. */
.dmm-fold {
  position:absolute; right:-10px; top:50%; transform:translateY(-50%);
  width:17px; height:17px; padding:0;
  border-radius:50%; border:1px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-overlay);
  color:var(--dsw-alias-label-secondary);
  font-size:10px; line-height:15px; text-align:center; cursor:pointer; z-index:2;
}
.dmm-fold:hover { color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-brand-primary); }

.dmm-note-dot {
  position:absolute; right:-4px; top:-4px; width:9px; height:9px; border-radius:50%;
  background:var(--dsw-alias-state-warn-primary); opacity:.9;
}

/* ── inline editor ──────────────────────────────────────────────────────── */
.dmm-editor {
  position:absolute; z-index:6;
  border-radius:9px;
  border:1px solid var(--dsw-alias-brand-primary);
  background:var(--dsw-alias-bg-overlay); color:var(--dsw-alias-label-primary);
  font-family:inherit; font-size:13px; line-height:18px;
  padding:7px 12px; outline:none; resize:none; overflow:hidden;
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent),
    0 6px 20px rgba(0,0,0,.14);
}

/* ── drag hint ──────────────────────────────────────────────────────────── */
.dmm-drop {
  position:fixed; z-index:20; padding:4px 11px; border-radius:999px;
  pointer-events:none; font-size:12px; white-space:nowrap;
  box-shadow:0 4px 14px rgba(0,0,0,.16);
}
.dmm-drop-ok {
  background:color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, var(--dsw-alias-bg-overlay));
  color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-state-success-primary);
}
.dmm-drop-bad {
  background:color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, var(--dsw-alias-bg-overlay));
  color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-state-error-primary);
}

/* ── outline ────────────────────────────────────────────────────────────── */
.dmm-outline {
  width:232px; flex:0 0 232px;
  border-right:1px solid var(--dsw-alias-border-l1);
  overflow:auto; padding:8px 6px;
  background:var(--dsw-alias-bg-base);
}
.dmm-outline-row {
  display:flex; align-items:center; gap:7px; height:26px; padding:0 7px;
  border-radius:6px; cursor:pointer; font-size:12.5px;
  color:var(--dsw-alias-label-secondary);
  white-space:nowrap; overflow:hidden;
}
.dmm-outline-row:hover { background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary); }
.dmm-outline-row[data-selected="1"] {
  background:var(--dsw-alias-bg-layer-2); color:var(--dsw-alias-label-primary);
}
.dmm-outline-dot {
  width:5px; height:5px; border-radius:50%; flex:0 0 auto;
  background:var(--dsw-alias-border-l2);
}
.dmm-outline-row[data-depth="0"] .dmm-outline-dot { background:var(--dsw-alias-brand-primary); }
.dmm-outline-text { overflow:hidden; text-overflow:ellipsis; }

/* ── picker ─────────────────────────────────────────────────────────────── */
.dmm-picker { padding:16px; overflow:auto; flex:1 1 auto; }
.dmm-picker-title { font-size:13.5px; font-weight:600; }
.dmm-card {
  display:flex; align-items:center; gap:12px;
  padding:11px 12px; border-radius:9px;
  border:1px solid var(--dsw-alias-border-l1);
  margin-bottom:8px; cursor:pointer;
  background:var(--dsw-alias-bg-layer-1);
  transition:border-color .12s ease, background .12s ease;
}
.dmm-card:hover {
  border-color:var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-layer-2);
}
.dmm-card-main { flex:1 1 auto; min-width:0; }
.dmm-card-title {
  font-size:13px; font-weight:600;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.dmm-card-sub {
  margin-top:2px; font-size:11.5px; color:var(--dsw-alias-label-dimmed);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.dmm-badge {
  font-size:11px; padding:2px 8px; border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-dimmed); white-space:nowrap; flex:0 0 auto;
}

/* ── states ─────────────────────────────────────────────────────────────── */
.dmm-empty {
  padding:18px; font-size:12.5px; color:var(--dsw-alias-label-secondary); line-height:1.7;
}
.dmm-toast {
  position:absolute; left:50%; bottom:16px; transform:translateX(-50%);
  padding:6px 13px; border-radius:999px;
  background:var(--dsw-alias-bg-overlay);
  border:1px solid var(--dsw-alias-border-l2);
  font-size:12px; color:var(--dsw-alias-label-secondary);
  z-index:9; max-width:70%; overflow:hidden;
  text-overflow:ellipsis; white-space:nowrap;
  box-shadow:0 4px 14px rgba(0,0,0,.12);
}

/* ── colour menu ────────────────────────────────────────────────────────── */
.dmm-menu {
  position:absolute; z-index:8; padding:7px; border-radius:9px;
  background:var(--dsw-alias-bg-overlay);
  border:1px solid var(--dsw-alias-border-l2);
  box-shadow:0 8px 26px rgba(0,0,0,.16);
  display:flex; flex-wrap:wrap; gap:6px;
}
/* The overflow menu is a vertical list, not a swatch grid. */
.dmm-menu-list {
  flex-direction:column; flex-wrap:nowrap; gap:2px;
  min-width:180px; padding:6px;
}
.dmm-menu-head {
  font-size:11.5px; font-weight:600;
  color:var(--dsw-alias-label-dimmed);
  padding:2px 8px 6px;
}
.dmm-menu-row {
  display:flex; align-items:center;
  height:30px; padding:0 8px; border-radius:6px;
  border:0; background:transparent;
  color:var(--dsw-alias-label-primary);
  font:inherit; font-size:12.5px; text-align:left; cursor:pointer;
  white-space:nowrap;
}
.dmm-menu-row:hover:not(:disabled) { background:var(--dsw-alias-bg-layer-2); }
.dmm-menu-row:disabled { opacity:.4; cursor:default; }
.dmm-menu-sep {
  height:1px; margin:5px 4px;
  background:var(--dsw-alias-border-l1);
}
.dmm-swatch {
  width:20px; height:20px; padding:0; border-radius:6px;
  border:1px solid var(--dsw-alias-border-l2); cursor:pointer;
}
.dmm-swatch:hover { transform:scale(1.08); }
.dmm-swatch[data-current="1"] { border-color:var(--dsw-alias-brand-primary); }

/* ── turn-tail chips ────────────────────────────────────────────────────── */
.dmm-chip {
  display:inline-flex; align-items:center; gap:6px;
  height:28px; padding:0 11px; border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-secondary);
  font:inherit; font-size:12.5px; cursor:pointer;
}
.dmm-chip:hover { color:var(--dsw-alias-label-primary); border-color:var(--dsw-alias-border-l2); }
.dmm-chip-row { display:flex; flex-wrap:wrap; gap:7px; padding:0 0 6px; }
`;

    function installStyles(ctx) {
      const styles = ctx.get('styles');
      if (styles && typeof styles.insert === 'function') {
        const dispose = styles.insert(CSS);
        return () => {
          if (typeof dispose === 'function') dispose();
        };
      }
      const tag = document.createElement('style');
      tag.setAttribute('data-plugin-css', 'dsh-mindmap');
      tag.textContent = CSS;
      document.head.appendChild(tag);
      return () => {
        if (tag.parentNode) tag.parentNode.removeChild(tag);
      };
    }

    /* ------------------------------------------------------------------ */
    /* canvas                                                              */
    /* ------------------------------------------------------------------ */

    /**
     * The `d` attribute for one connector. Pure, so the canvas and the SVG export
     * draw byte-identical geometry instead of drifting apart.
     */
    function edgePath(edge) {
      if (edge.shape === 'elbow-v') {
        // Same direction-awareness as the horizontal elbow: a dragged child may
        // end up above its parent, so the crossing line flips around it.
        const dirY = Math.sign(edge.y2 - edge.y1) || 1;
        const spanY = Math.max(10, Math.abs(edge.y2 - edge.y1) / 2);
        const midY = edge.y1 + dirY * spanY;
        const r = Math.min(6, Math.abs(edge.x2 - edge.x1) / 2, Math.abs(edge.y2 - edge.y1) / 2);
        const dirX = Math.sign(edge.x2 - edge.x1) || 1;
        if (r > 1 && Math.abs(edge.x2 - edge.x1) > 2) {
          return (
            `M${edge.x1},${edge.y1} V${midY - dirY * r} Q${edge.x1},${midY} ${edge.x1 + dirX * r},${midY}` +
            ` H${edge.x2 - dirX * r} Q${edge.x2},${midY} ${edge.x2},${midY + dirY * r} V${edge.y2}`
          );
        }
        return `M${edge.x1},${edge.y1} V${midY} H${edge.x2} V${edge.y2}`;
      }
      if (edge.shape === 'elbow-h') {
        // Direction-aware: a freely dragged child can sit left of its parent,
        // so the vertical spine must land on the left side of the gap.
        const dirX = Math.sign(edge.x2 - edge.x1) || 1;
        const spanX = Math.max(10, Math.abs(edge.x2 - edge.x1) / 2);
        const midX = edge.x1 + dirX * spanX;
        const r = Math.min(6, Math.abs(edge.x2 - edge.x1) / 2, Math.abs(edge.y2 - edge.y1) / 2);
        const dirY = Math.sign(edge.y2 - edge.y1) || 1;
        if (r > 1 && Math.abs(edge.y2 - edge.y1) > 2) {
          return (
            `M${edge.x1},${edge.y1} H${midX - dirX * r} Q${midX},${edge.y1} ${midX},${edge.y1 + dirY * r}` +
            ` V${edge.y2 - dirY * r} Q${midX},${edge.y2} ${midX + dirX * r},${edge.y2} H${edge.x2}`
          );
        }
        return `M${edge.x1},${edge.y1} H${midX} V${edge.y2} H${edge.x2}`;
      }
      // Curve control points must point *towards* the other end. Assuming "to
      // the right" for both handles made a left-side branch bow outwards and
      // come back, which reads as a spurious kink at the node it connects to.
      const dirX = Math.sign(edge.x2 - edge.x1) || 1;
      const dx = Math.max(16, Math.abs(edge.x2 - edge.x1) / 2) * dirX;
      return `M${edge.x1},${edge.y1} C${edge.x1 + dx},${edge.y1} ${edge.x2 - dx},${edge.y2} ${edge.x2},${edge.y2}`;
    }

    /**
     * One connector path. Memoised because an edge object is reused by
     * reference while its endpoints are unchanged; only a moved node produces a
     * new edge object, so a drag repaints just the affected paths.
     */
    const EdgePath = React.memo(function EdgePath(props) {
      const { edge } = props;
      return h('path', {
        className: 'dmm-edge',
        'data-shape': edge.shape ?? 'curve',
        d: edgePath(edge),
        style: edge.color ? { stroke: edge.color } : undefined,
      });
    });

    /** The in-place node editor: uncontrolled while typing, committed on blur or Enter. */
    function NodeEditor(props) {
      const { entry, text, onCommit, onCancel } = props;
      const ref = useRef(null);
      const done = useRef(false);
      useEffect(() => {
        const element = ref.current;
        if (!element) return;
        element.focus();
        element.select?.();
      }, []);
      const commit = (value) => {
        if (done.current) return;
        done.current = true;
        onCommit(value);
      };
      return h('textarea', {
        ref,
        className: 'dmm-editor',
        defaultValue: text,
        spellCheck: false,
        rows: 1,
        style: {
          // The editor is wider than the node so a long label does not force a
          // cramped column of one-character lines while typing.
          left: (entry?.x ?? 0) - 6,
          top: (entry?.y ?? 0) - 6,
          width: Math.max(180, (entry?.w ?? 120) + 60),
          minHeight: (entry?.h ?? 30) + 12,
        },
        onBlur: (event) => commit(event.target.value),
        onInput: (event) => {
          // Grow with the content instead of clipping at one row.
          const el = event.currentTarget;
          if (!el) return;
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight || 0}px`;
        },
        onKeyDown: (event) => {
          event.stopPropagation();
          // Never commit mid-composition: an IME uses Enter to accept a
          // candidate, and committing there would eat the first character of
          // every Chinese word.
          if (event.nativeEvent?.isComposing || event.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            done.current = true;
            onCancel();
            return;
          }
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            commit(event.currentTarget.value);
          }
        },
      });
    }

    /** Escape a node id for use inside a CSS attribute selector. */
    function CSS_ESCAPE(value) {
      if (typeof CSS !== 'undefined' && CSS?.escape) return CSS.escape(String(value));
      return String(value).replace(/["\\]/g, '\\$&');
    }

    /**
     * id → DOM element for every rendered node.
     *
     * `querySelector('[data-node-id="…"]')` walks the whole tree, and the drag
     * path needed several of these per pointer move; on a 780-node map that
     * dominated the frame. NodeBox registers itself here on mount instead,
     * turning each lookup into a map hit.
     */
    const domIndex = new WeakMap();

    function indexFor(host) {
      let map = domIndex.get(host);
      if (!map) {
        map = new Map();
        domIndex.set(host, map);
      }
      return map;
    }

    /**
     * One node. Memoised on the values it actually renders, so a drag that moves
     * a single box re-renders that box and its neighbours' highlight — not all
     * 780 of them. The entry object is replaced whenever its geometry changes,
     * which is exactly when a re-render is wanted.
     */
    const NodeBox = React.memo(function NodeBox(props) {
      const { entry, selected, search, dragId, dropOk, dropBlocked, onToggleFold, foldLabel, unfoldLabel, noteLabel } = props;
      const node = entry.node;
      const color = markerColor(node);
      const folded = isFolded(node);
      const kids = (node.children ?? []).length;
      const match = search ? String(node.text).toLowerCase().includes(search.toLowerCase()) : false;
      return h(
        'div',
        {
          className: 'dmm-node',
          'data-node-id': entry.id,
          'data-depth': String(Math.min(entry.depth, 2)),
          'data-selected': selected ? '1' : '0',
          'data-match': match ? '1' : '0',
          'data-drag-source': dragId === entry.id ? '1' : '0',
          'data-drop-ok': dropOk && dragId !== entry.id ? '1' : '0',
          'data-drop-blocked': dropBlocked ? '1' : '0',
          style: {
            left: entry.x,
            top: entry.y,
            width: entry.w,
            minHeight: entry.h,
            ...(color ? { borderLeft: `3px solid ${color}` } : null),
            ...(entry.depth === 0 && color
              ? { background: `color-mix(in srgb, ${color} 16%, var(--dsw-alias-bg-layer-2))` }
              : null),
          },
          title: node.text,
        },
        entry.depth === 0 && !color
          ? h('span', {
              style: {
                position: 'absolute',
                inset: 0,
                borderRadius: 8,
                pointerEvents: 'none',
                background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent)',
              },
            })
          : null,
        // One text node instead of one div per line: the same rows, rendered by
        // `white-space:pre`, and far fewer DOM nodes to create on mount.
        h('div', { className: 'dmm-node-text' }, (entry.lines ?? [node.text]).join('\n')),
        node.note ? h('span', { className: 'dmm-note-dot', title: noteLabel }) : null,
        kids
          ? h(
              'button',
              {
                type: 'button',
                className: 'dmm-fold',
                title: folded ? unfoldLabel : foldLabel,
                onPointerDown: (event) => event.stopPropagation(),
                onClick: (event) => {
                  event.stopPropagation();
                  onToggleFold(entry.id);
                },
              },
              folded ? String(kids) : '−',
            )
          : null,
      );
    }, (prev, next) => {
      // Compare the values that actually reach the DOM. The entry object is
      // rebuilt whenever the node list is rebuilt (a drag commit, a fold), but
      // an untouched node keeps the same geometry — skipping it there is what
      // keeps a 780-node map from repainting everything on one small change.
      const a = prev.entry;
      const b = next.entry;
      return (
        a.id === b.id &&
        a.x === b.x &&
        a.y === b.y &&
        a.w === b.w &&
        a.h === b.h &&
        a.lines === b.lines &&
        a.node === b.node &&
        prev.selected === next.selected &&
        prev.search === next.search &&
        prev.dragId === next.dragId &&
        prev.dropOk === next.dropOk &&
        prev.dropBlocked === next.dropBlocked
      );
    });

    function MapCanvas(props) {
      const { tree, structure, selected, onSelect, onEdit, onToggleFold, onMove, onKeyDown, search, editing, onCommitEdit, onCancelEdit } = props;
      /** Per-node free-position offsets, so a dragged node keeps where it was put. */
      const [offsets, setOffsets] = useState({});
      // A structure change re-computes every position, so a free-drag offset
      // recorded against the old layout would drag a node off its new branch.
      // Clearing them is part of switching structure, not a separate action.
      const previousStructure = useRef(structure);
      useEffect(() => {
        if (previousStructure.current === structure) return;
        previousStructure.current = structure;
        setOffsets({});
      }, [structure]);
      // The computed tree position, then every pushed node shifted by its own
      // offset. A free drag writes that offset instead of fighting the layout.
      const base = useMemo(() => layoutMap(tree, structure), [tree, structure]);
      const layout = useMemo(() => {
        const keys = Object.keys(offsets);
        if (!keys.length) return base;
        // Shift the boxes, then patch only the connectors that actually touch a
        // moved node. Rebuilding every edge on each pointer move is what made a
        // large map drag at single-digit fps; the untouched edges are reused by
        // reference because their endpoints did not change.
        const shifted = new Map();
        const nodes = base.nodes.map((entry) => {
          const off = offsets[entry.id];
          if (!off) return entry;
          const moved = { ...entry, x: entry.x + off.dx, y: entry.y + off.dy };
          shifted.set(entry.id, moved);
          return moved;
        });
        if (!shifted.size) return { ...base, nodes };
        // Index the node entries so an edge can be rebuilt from its two ids.
        const byId = new Map(nodes.map((entry) => [entry.id, entry]));
        const edges = base.edges.map((edge) => {
          const [fromId, toId] = edge.id.split('>');
          if (!shifted.has(fromId) && !shifted.has(toId)) return edge;
          const from = byId.get(fromId);
          const to = byId.get(toId);
          if (!from || !to) return edge;
          return rebuildEdge(edge, from, to, structure);
        });
        return { ...base, nodes, edges };
      }, [base, offsets, structure]);
      const [view, setView] = useState({ x: 0, y: 0, scale: 1 });
      const [panning, setPanning] = useState(false);
      // Drag feedback: which node is moving, which one would receive it, whether
      // that drop is legal, and where the pointer is in screen space.
      const [drag, setDrag] = useState(undefined);
      const rootRef = useRef(null);
      const dragRef = useRef(null);
      /** The last node press, used to recognise a double press without `dblclick`. */
      const lastPress = useRef(undefined);
      /** Mount point for the drag hint, which is painted outside React. */
      const hintHostRef = useRef(null);

      /**
       * Would moving `fromId` onto `toId` create a cycle?
       *
       * A move is illegal exactly when the drop target is a *descendant* of the
       * node being moved: re-parenting a node under its own child would detach
       * that subtree from the tree. Dropping a node back onto an ancestor —
       * including its own parent — is legal and must be allowed.
       */
      const wouldCycle = useCallback(
        (fromId, toId) => {
          // Walk *up* from the drop target. If the node being moved appears in
          // its ancestor chain, the target lives inside that node's subtree.
          const parents = new Map();
          const walk = (node, parent) => {
            parents.set(node.id, parent);
            for (const kid of node.children ?? []) walk(kid, node);
          };
          walk(tree, undefined);
          let cursor = parents.get(toId);
          let guard = 0;
          while (cursor && guard < 5000) {
            if (cursor.id === fromId) return true;
            cursor = parents.get(cursor.id);
            guard += 1;
          }
          return false;
        },
        [tree],
      );

      const fit = useCallback(
        (width, height) => {
          const host = rootRef.current;
          if (!host) return;
          const box = host.getBoundingClientRect();
          const scale = Math.min(1.1, Math.max(0.22, Math.min(box.width / Math.max(1, width), box.height / Math.max(1, height)) * 0.92));
          setView({
            x: (box.width - width * scale) / 2,
            y: (box.height - height * scale) / 2,
            scale,
          });
        },
        [],
      );

      // Re-centre on the *layout's* extent, not the offset-shifted one: a free
      // drag changes the visible bounds every frame, and re-fitting on that
      // made the canvas jump around while dragging. Structure switches and
      // content changes still get a fresh fit.
      useEffect(() => {
        fit(base.width, base.height);
      }, [fit, base.width, base.height, structure]);
      void layout;

      const screenToWorld = useCallback(
        (clientX, clientY) => {
          const host = rootRef.current;
          if (!host) return { x: 0, y: 0 };
          const box = host.getBoundingClientRect();
          return {
            x: (clientX - box.left - view.x) / view.scale,
            y: (clientY - box.top - view.y) / view.scale,
          };
        },
        [view],
      );

      const onWheel = (event) => {
        event.preventDefault();
        const host = rootRef.current;
        if (!host) return;
        const box = host.getBoundingClientRect();
        const px = event.clientX - box.left;
        const py = event.clientY - box.top;
        const factor = Math.exp(-event.deltaY * 0.0016);
        setView((prev) => {
          const scale = Math.min(2.6, Math.max(0.18, prev.scale * factor));
          const ratio = scale / prev.scale;
          return { scale, x: px - (px - prev.x) * ratio, y: py - (py - prev.y) * ratio };
        });
      };

      useEffect(() => {
        const host = rootRef.current;
        if (!host) return undefined;
        host.addEventListener('wheel', onWheel, { passive: false });
        return () => host.removeEventListener('wheel', onWheel);
      });

      /** The laid-out box of one node, by id. */
      const entryOf = useCallback((id) => layout.nodes.find((entry) => entry.id === id), [layout]);

      const onPointerDown = (event) => {
        if (event.button === 1 || event.button === 2) return;
        const target = event.target;
        // Controls floating over the canvas (the zoom bar, the drag hint) own
        // their own gestures: without this check a press on them also starts
        // a pan or a node drag, which is the "grabbed the wrong thing" bug.
        if (target?.closest?.('[data-canvas-ui]')) return;
        // The editor lives inside the canvas, so pressing in it reaches this
        // handler too. Focusing the canvas there blurred the textarea, whose
        // blur handler commits and closes it — the reason a freshly opened
        // editor vanished on the first click.
        if (target?.closest?.('.dmm-editor')) return;
        const nodeEl = target.closest?.('[data-node-id]');
        const host = rootRef.current;
        if (!host) return;
        host.focus({ preventScroll: true });
        if (nodeEl) {
          const id = nodeEl.getAttribute('data-node-id');
          // Detect a double press here rather than on `dblclick`: the canvas
          // captures the pointer below, so the browser retargets the second
          // click to the canvas and `event.target.closest('[data-node-id]')`
          // never matches. Timing it ourselves keeps editing reachable.
          const now = Date.now();
          const last = lastPress.current;
          const isDouble = last && last.id === id && now - last.at < 420;
          lastPress.current = { id, at: now };
          if (isDouble) {
            lastPress.current = undefined;
            dragRef.current = null;
            onEdit(id);
            return;
          }
          onSelect(id, event.shiftKey || event.metaKey || event.ctrlKey);
          const start = screenToWorld(event.clientX, event.clientY);
          dragRef.current = {
            kind: 'node',
            id,
            startX: start.x,
            startY: start.y,
            moved: false,
            node: event.currentTarget,
            // The node's own offset, so a drag can move it freely instead of
            // only re-parenting it.
            originX: entryOf(id)?.x ?? 0,
            originY: entryOf(id)?.y ?? 0,
          };
          event.currentTarget.setPointerCapture?.(event.pointerId);
          return;
        }
        setPanning(true);
        dragRef.current = { kind: 'pan', ox: view.x, oy: view.y, sx: event.clientX, sy: event.clientY, moved: false };
        host.setPointerCapture?.(event.pointerId);
      };

      const onPointerMove = (event) => {
        const drag = dragRef.current;
        if (!drag) return;
        if (drag.kind === 'pan') {
          const dx = event.clientX - drag.sx;
          const dy = event.clientY - drag.sy;
          if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
          setView((prev) => ({ ...prev, x: drag.ox + dx, y: drag.oy + dy }));
          return;
        }
        if (drag.kind === 'node') {
          const world = screenToWorld(event.clientX, event.clientY);
          const dist = Math.abs(world.x - drag.startX) + Math.abs(world.y - drag.startY);
          const moved = drag.moved || dist > 6;
          if (!moved) return;
          drag.moved = true;
          const dx = world.x - drag.startX;
          const dy = world.y - drag.startY;
          // Paint the dragged box straight into the DOM instead of round-tripping
          // through React state. A state write per pointermove re-rendered the
          // whole tree; this keeps the drag at one transform per frame and
          // commits the offset once, on release.
          const nodeEl = elementFor(drag.id);
          if (nodeEl) {
            nodeEl.style.left = `${drag.originX + dx}px`;
            nodeEl.style.top = `${drag.originY + dy}px`;
          }
          drag.pending = { dx, dy };
          // The hint is painted directly too: one element, three text states.
          // Nothing in this handler touches React state, so a pointermove costs
          // two style writes no matter how big the map is.
          const under = document.elementFromPoint(event.clientX, event.clientY);
          const overEl = under?.closest?.('[data-node-id]');
          const overId = overEl?.getAttribute('data-node-id');
          const isSelf = overId === drag.id;
          const cycle = Boolean(overId) && !isSelf && wouldCycle(drag.id, overId);
          const blockKind = cycle ? 'cycle' : isSelf ? 'self' : undefined;
          drag.lastOver = overId;
          drag.blocked = blockKind;
          paintHint(event.clientX, event.clientY, blockKind, overId);
        }
      };

      /** Write the drag hint straight into its DOM node. */
      /** id → element for the nodes currently mounted, built once per render. */
      const elementFor = useCallback(
        (id) => {
          const host = rootRef.current;
          if (!host) return null;
          let map = domIndex.get(host);
          if (!map) {
            map = new Map();
            domIndex.set(host, map);
          }
          const hit = map.get(id);
          // The cached element can be detached after a re-render; verify it is
          // still inside the canvas before trusting it.
          if (hit && host.contains(hit)) return hit;
          const found = host.querySelector(`[data-node-id="${CSS_ESCAPE(id)}"]`);
          if (found) map.set(id, found);
          return found;
        },
        [],
      );

      const paintHint = (x, y, blockKind, overId) => {
        const host = hintHostRef.current;
        if (!host) return;
        let hint = host.firstChild;
        if (!hint) {
          hint = document.createElement('div');
          host.appendChild(hint);
        }
        const blockedText = blockKind === 'cycle' ? T('dropCycle') : blockKind ? T('dropSelf') : undefined;
        const text = blockedText || (overId ? T('dropHere') : T('dropFree'));
        if (hint.textContent !== text) hint.textContent = text;
        const cls = blockKind ? 'dmm-drop dmm-drop-bad' : 'dmm-drop dmm-drop-ok';
        if (hint.className !== cls) hint.className = cls;
        hint.style.left = `${x + 14}px`;
        hint.style.top = `${y - 10}px`;
        // Target highlight lives on attributes, so it is written the same way.
        const gesture = dragRef.current;
        const canvas = rootRef.current;
        if (gesture?.highlighted && gesture.highlighted !== overId && canvas) {
          const old = elementFor(gesture.highlighted);
          if (old) {
            old.removeAttribute('data-drop-ok');
            old.removeAttribute('data-drop-blocked');
          }
        }
        if (overId && canvas) {
          const el = elementFor(overId);
          if (el) {
            if (blockKind) {
              el.removeAttribute('data-drop-ok');
              el.setAttribute('data-drop-blocked', '1');
            } else {
              el.removeAttribute('data-drop-blocked');
              el.setAttribute('data-drop-ok', '1');
            }
          }
        }
        if (gesture) gesture.highlighted = overId;
      };

      /** Remove the hint and any drop highlight when no drag is running. */
      const clearHint = () => {
        const host = hintHostRef.current;
        if (host && host.firstChild) host.firstChild.remove();
        const gesture = dragRef.current;
        const canvas = rootRef.current;
        if (gesture?.highlighted && canvas) {
          const el = elementFor(gesture.highlighted);
          if (el) {
            el.removeAttribute('data-drop-ok');
            el.removeAttribute('data-drop-blocked');
          }
        }
      };

      const finishDrag = (event) => {
        const active = dragRef.current;
        // Clear the hint while the gesture is still on `dragRef`, so the
        // highlight it remembers can be removed.
        clearHint();
        dragRef.current = null;
        setPanning(false);
        setDrag(undefined);
        if (!active) return;
        if (active.kind !== 'node' || !active.moved) return;
        const pending = active.pending;
        const target = document.elementFromPoint(event.clientX, event.clientY);
        const nodeEl = target?.closest?.('[data-node-id]');
        const toId = nodeEl?.getAttribute('data-node-id');
        if (toId && toId !== active.id && !wouldCycle(active.id, toId)) {
          // Dropped onto another node: adopt it as parent and drop the free
          // offset, otherwise the child would sit visually detached from the
          // branch it now belongs to.
          onMove(active.id, toId);
          setOffsets((prev) => {
            if (!prev[active.id]) return prev;
            const next = { ...prev };
            delete next[active.id];
            return next;
          });
          return;
        }
        // Dropped on empty canvas: commit the position the drag painted. This is
        // the only state write of the whole gesture.
        if (pending) setOffsets((prev) => ({ ...prev, [active.id]: pending }));
      };

      /** Put every node back where the layout says it belongs. */
      const tidyUp = useCallback(() => setOffsets({}), []);

      const scale = view.scale;
      return h(
        'div',
        {
          className: 'dmm-canvas',
          ref: rootRef,
          tabIndex: 0,
          'data-panning': panning ? '1' : '0',
          onPointerDown,
          onPointerMove,
          onPointerUp: finishDrag,
          onPointerCancel: finishDrag,
          onKeyDown,
          onContextMenu: (event) => event.preventDefault(),
          onDoubleClick: (event) => {
            const nodeEl = event.target.closest?.('[data-node-id]');
            if (nodeEl) onEdit(nodeEl.getAttribute('data-node-id'));
          },
        },
        h(
          'div',
          { className: 'dmm-world', style: { transform: `translate(${view.x}px, ${view.y}px) scale(${scale})` } },
          h(
            'svg',
            {
              width: layout.width,
              height: layout.height,
              style: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none', overflow: 'visible' },
            },
            layout.edges.map((edge) => h(EdgePath, { key: edge.id, edge })),
          ),
          layout.nodes.map((entry) =>
            h(NodeBox, {
              key: entry.id,
              entry,
              selected: selected.has(entry.id),
              search,
              dragId: drag?.id,
              dropOk: drag?.overId === entry.id && !drag?.blocked,
              dropBlocked: Boolean(drag?.overId === entry.id && drag.blocked),
              onToggleFold,
              foldLabel: T('fold'),
              unfoldLabel: T('unfold'),
              noteLabel: T('note'),
            }),
          ),
          editing
            ? h(NodeEditor, {
                key: `editor-${editing.id}`,
                entry: layout.nodes.find((entry) => entry.id === editing.id),
                text: editing.text,
                onCommit: onCommitEdit,
                onCancel: onCancelEdit,
              })
            : null,
        ),
        h(
          'div',
          {
            'data-canvas-ui': 'zoom',
            // The bar itself is inert: `pointer-events:none` on the container
            // means a press on the padding or the gaps between buttons falls
            // through to the canvas and drags it, while the buttons re-enable
            // themselves with `pointer-events:auto`. Previously the container
            // swallowed every press, so dragging near the corner felt broken.
            style: {
              position: 'absolute',
              right: 12,
              bottom: 12,
              display: 'flex',
              gap: 4,
              zIndex: 6,
              pointerEvents: 'none',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            },
          },
          h(
            'button',
            {
              type: 'button',
              className: 'dmm-btn dmm-iconbtn',
              title: '−',
              style: { pointerEvents: 'auto' },
              onClick: () => setView((prev) => ({ ...prev, scale: Math.max(0.18, prev.scale / 1.2) })),
            },
            '−',
          ),
          // Only meaningful once something has been dragged off-grid.
          Object.keys(offsets).length
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'dmm-btn',
                  title: T('tidyUp'),
                  style: { pointerEvents: 'auto' },
                  onClick: tidyUp,
                },
                T('tidyUp'),
              )
            : null,
          h(
            'button',
            {
              type: 'button',
              className: 'dmm-btn',
              title: `${Math.round(scale * 100)}%`,
              style: { pointerEvents: 'auto' },
              onClick: () => fit(base.width, base.height),
            },
            `${Math.round(scale * 100)}%`,
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'dmm-btn dmm-iconbtn',
              title: '+',
              style: { pointerEvents: 'auto' },
              onClick: () => setView((prev) => ({ ...prev, scale: Math.min(2.6, prev.scale * 1.2) })),
            },
            '+',
          ),
        ),
        // The drag hint is a plain DOM node owned by an effect, not part of the
        // React tree: re-rendering it per pointermove was most of the drag cost
        // on a large map. This element is only a mount point for it.
        h('div', { ref: hintHostRef, className: 'dmm-drop-host', 'aria-live': 'polite' }),
      );
    }

    /* ------------------------------------------------------------------ */
    /* export                                                              */
    /* ------------------------------------------------------------------ */

    function escapeXml(text) {
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function buildSvg(tree, structure) {
      const layout = layoutMap(tree, structure);
      const parts = [];
      parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(layout.width)}" height="${Math.round(layout.height)}" viewBox="0 0 ${Math.round(layout.width)} ${Math.round(layout.height)}">`,
      );
      parts.push('<rect width="100%" height="100%" fill="#ffffff"/>');
      for (const edge of layout.edges) {
        parts.push(
          `<path d="${edgePath(edge)}" fill="none" stroke="${edge.color ?? '#c7c9d1'}" stroke-width="1.6"/>`,
        );
      }
      for (const entry of layout.nodes) {
        const color = markerColor(entry.node);
        const fill = entry.depth === 0 ? '#f1f2f6' : '#ffffff';
        parts.push(
          `<rect x="${entry.x}" y="${entry.y}" width="${entry.w}" height="${entry.h}" rx="8" fill="${fill}" stroke="${color ?? '#d8dae1'}" stroke-width="1.4"/>`,
        );
        const lines = entry.lines ?? wrapText(entry.node.text || '', entry.w - PAD_X * 2 - 4, FONT);
        const startY = entry.y + entry.h / 2 - ((lines.length - 1) * LINE) / 2 + 4.5;
        lines.forEach((line, index) => {
          parts.push(
            `<text x="${entry.x + entry.w / 2}" y="${startY + index * LINE}" font-family="system-ui,Segoe UI,Microsoft YaHei,sans-serif" font-size="${FONT}" fill="#1c1d22" text-anchor="middle">${escapeXml(line)}</text>`,
          );
        });
      }
      parts.push('</svg>');
      return parts.join('');
    }

    function download(filename, content, type) {
      const blob = new Blob([content], { type });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    function svgToPng(svg, width, height, filename) {
      const image = new Image();
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * 2);
        canvas.height = Math.round(height * 2);
        const context = canvas.getContext('2d');
        context.scale(2, 2);
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0);
        canvas.toBlob((png) => {
          if (!png) return;
          const link = document.createElement('a');
          link.href = URL.createObjectURL(png);
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(() => URL.revokeObjectURL(link.href), 4000);
        }, 'image/png');
        URL.revokeObjectURL(url);
      };
      image.onerror = () => URL.revokeObjectURL(url);
      image.src = url;
    }

    /* ------------------------------------------------------------------ */
    /* the tab body                                                        */
    /* ------------------------------------------------------------------ */

    /** The tab body before any document is chosen: session maps, plus a workspace browser. */
    function Picker(props) {
      const { catalogue, sessionId, onPick, onPickPath } = props;
      const [browsing, setBrowsing] = useState(false);
      // `requested` is the directory we asked for (`undefined` = the workspace
      // root); `listing` holds what came back. They are separate so writing the
      // resolved directory never re-triggers the fetch that produced it.
      const [requested, setRequested] = useState(undefined);
      const [listing, setListing] = useState({ dir: undefined, entries: undefined, error: undefined });

      useEffect(() => {
        if (!browsing || !sessionId) return undefined;
        const controller = new AbortController();
        setListing({ dir: undefined, entries: undefined, error: undefined });
        const query = requested ? `&dir=${encodeURIComponent(requested)}` : '';
        getJson(`${BASE}/list?session=${encodeURIComponent(String(sessionId))}${query}`, controller.signal)
          .then((body) => {
            if (controller.signal.aborted) return;
            if (!body?.ok) throw new Error(body?.error ?? 'list failed');
            setListing({ dir: body.dir, entries: Array.isArray(body.entries) ? body.entries : [], error: undefined });
          })
          .catch((failure) => {
            if (controller.signal.aborted) return;
            setListing({ dir: undefined, entries: [], error: String(failure?.message ?? failure) });
          });
        return () => controller.abort();
      }, [browsing, requested, sessionId]);

      if (browsing) {
        const { dir, entries, error } = listing;
        return h(
          'div',
          { className: 'dmm-root' },
          h(
            'div',
            { className: 'dmm-bar' },
            h('button', { type: 'button', className: 'dmm-btn', onClick: () => setBrowsing(false) }, `← ${T('back')}`),
            dir
              ? h('button', { type: 'button', className: 'dmm-btn', onClick: () => setRequested(undefined) }, T('browseParent'))
              : null,
            h('span', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-dimmed)', overflow: 'hidden', textOverflow: 'ellipsis' } }, dir ?? ''),
          ),
          h(
            'div',
            { className: 'dmm-picker' },
            error ? h('div', { className: 'dmm-empty' }, error) : null,
            entries === undefined
              ? h('div', { className: 'dmm-empty' }, T('pickerLoading'))
              : entries.length === 0
                ? h('div', { className: 'dmm-empty' }, T('browseEmpty'))
                : entries.map((entry) =>
                    h(
                      'div',
                      { key: entry.path, className: 'dmm-card', onClick: () => onPickPath(entry.path) },
                      h(
                        'div',
                        { className: 'dmm-card-main' },
                        h('div', { className: 'dmm-card-title' }, entry.name),
                        h('div', { className: 'dmm-card-sub' }, entry.path),
                      ),
                      h('span', { className: 'dmm-badge' }, entry.name.toLowerCase().endsWith('.xmind') ? 'XMind' : 'MD'),
                    ),
                  ),
          ),
        );
      }

      return h(
        'div',
        { className: 'dmm-root' },
        h(
          'div',
          { className: 'dmm-bar' },
          h('span', { className: 'dmm-picker-title' }, T('picker')),
          h('span', { className: 'dmm-bar-spacer' }),
          h('button', { type: 'button', className: 'dmm-btn', onClick: () => setBrowsing(true) }, T('browse')),
        ),
        h(
          'div',
          { className: 'dmm-picker' },
          catalogue.loading
            ? h('div', { className: 'dmm-empty' }, T('pickerLoading'))
            : catalogue.docs.length === 0
              ? h('div', { className: 'dmm-empty' }, T('pickerEmpty'))
              : catalogue.docs.map((entry) =>
                  h(
                    'div',
                    { key: entry.id, className: 'dmm-card', onClick: () => onPick(entry) },
                    h(
                      'div',
                      { className: 'dmm-card-main' },
                      h('div', { className: 'dmm-card-title' }, entry.title || entry.path || 'mindmap'),
                      h(
                        'div',
                        { className: 'dmm-card-sub' },
                        entry.format === 'xmind' ? 'XMind' : 'Markdown',
                        entry.nodes ? ` · ${entry.nodes} ${T('nodeCount')}` : '',
                        entry.path ? ` · ${entry.path}` : '',
                      ),
                    ),
                    h('span', { className: 'dmm-badge' }, entry.kind === 'inline' ? T('fromMessage') : T('fromFile')),
                  ),
                ),
        ),
      );
    }

    function MapTab(props) {
      const { sessionId } = props;
      const useTabInfo = props.useTabInfo;
      const tabInfo = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
      const params = tabInfo?.tab?.navigation?.params ?? {};
      // `params` is a fresh object on every render in some hosts, so the source
      // is adopted only when the navigation revision actually stepped. Adopting
      // it per render would refetch the document and clobber in-progress edits.
      const revision = tabInfo?.tab?.navigation?.revision;
      const [source, setSource] = useState(() => ({
        docId: params.docId ?? undefined,
        path: params.path ?? undefined,
      }));
      const { docId, path: docPath } = source;
      const [doc, setDoc] = useState(undefined);
      const [tree, setTree] = useState(undefined);
      const [error, setError] = useState(undefined);
      const [nonce, setNonce] = useState(0);
      const [structure, setStructure] = useState(() => {
        try {
          return localStorage.getItem('dsh-mindmap.structure') ?? 'mindmap';
        } catch {
          return 'mindmap';
        }
      });
      const [selected, setSelected] = useState(() => new Set());
      const [editing, setEditing] = useState(undefined);
      const [showOutline, setShowOutline] = useState(false);
      const [search, setSearch] = useState('');
      const [toast, setToast] = useState(undefined);
      const [colorMenu, setColorMenu] = useState(false);
      const [moreMenu, setMoreMenu] = useState(false);
      const [saveAs, setSaveAs] = useState(undefined);
      const [openBusy, setOpenBusy] = useState(false);
      const catalogue = useCatalogue(sessionId, nonce);

      useEffect(() => {
        if (revision === undefined) return;
        setSource((prev) => {
          // `{ picker: true }` is the explicit "show the chooser" intent (the
          // header button); otherwise a missing field keeps what is open.
          if (params.picker === true) return { docId: undefined, path: undefined };
          const nextId = params.docId ?? (params.path ? undefined : prev.docId);
          const nextPath = params.path ?? (params.docId ? undefined : prev.path);
          if (nextId === prev.docId && nextPath === prev.path) return prev;
          return { docId: nextId, path: nextPath };
        });
      }, [revision]);

      useEffect(() => {
        if (!docId && !docPath) {
          setDoc(undefined);
          setTree(undefined);
          return undefined;
        }
        const controller = new AbortController();
        const query = docPath
          ? `path=${encodeURIComponent(docPath)}`
          : `doc=${encodeURIComponent(docId)}`;
        setError(undefined);
        getJson(`${BASE}/doc?session=${encodeURIComponent(String(sessionId))}&${query}`, controller.signal)
          .then((body) => {
            if (controller.signal.aborted) return;
            if (!body?.ok || !body.doc) throw new Error(body?.error ?? 'no document');
            setDoc(body.doc);
            setTree(cloneTree(body.doc.root));
            setSelected(new Set());
          })
          .catch((failure) => {
            if (controller.signal.aborted) return;
            setError(String(failure?.message ?? failure));
          });
        return () => controller.abort();
      }, [docId, docPath, sessionId, nonce]);

      const notify = useCallback((message) => {
        setToast(message);
        setTimeout(() => setToast(undefined), 2600);
      }, []);

      const readOnly = Boolean(doc?.readOnly);
      const commit = useCallback(
        (mutator) => {
          setTree((prev) => {
            if (!prev) return prev;
            const copy = cloneTree(prev);
            mutator(copy);
            return copy;
          });
        },
        [],
      );

      const selectedIds = useMemo(() => [...selected], [selected]);
      const primaryId = selectedIds.length ? selectedIds[selectedIds.length - 1] : undefined;

      const onSelect = useCallback((id, additive) => {
        setSelected((prev) => {
          if (!additive) return new Set([id]);
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }, []);

      const addChild = useCallback(() => {
        if (!tree || readOnly) return;
        const parentId = primaryId ?? tree.id;
        const child = newChild(T('addChild') === 'Child' ? 'New node' : '新节点');
        commit((root) => {
          const hit = findNode(root, parentId);
          if (!hit) return;
          (hit.node.children ??= []).push(child);
          hit.node.markers = (hit.node.markers ?? []).filter((marker) => String(marker).trim() !== 'fold');
        });
        setSelected(new Set([child.id]));
        setEditing({ id: child.id, text: child.text });
      }, [commit, primaryId, readOnly, tree]);

      const addSibling = useCallback(() => {
        if (!tree || readOnly || !primaryId || primaryId === tree.id) return;
        const sibling = newChild('新节点');
        commit((root) => {
          const hit = findNode(root, primaryId);
          if (!hit || !hit.parent) return;
          const list = hit.parent.children ?? [];
          const index = list.findIndex((kid) => kid.id === primaryId);
          list.splice(index + 1, 0, sibling);
        });
        setSelected(new Set([sibling.id]));
        setEditing({ id: sibling.id, text: sibling.text });
      }, [commit, primaryId, readOnly, tree]);

      const removeSelected = useCallback(() => {
        if (readOnly || !selectedIds.length) return;
        commit((root) => {
          for (const id of selectedIds) {
            if (id === root.id) continue;
            const hit = findNode(root, id);
            if (!hit || !hit.parent) continue;
            hit.parent.children = (hit.parent.children ?? []).filter((kid) => kid.id !== id);
          }
        });
        setSelected(new Set());
      }, [commit, readOnly, selectedIds]);

      const toggleFold = useCallback(
        (id) => {
          commit((root) => {
            const hit = findNode(root, id);
            if (!hit) return;
            const markers = hit.node.markers ?? [];
            const folded = markers.some((marker) => String(marker).trim() === 'fold');
            hit.node.markers = folded
              ? markers.filter((marker) => String(marker).trim() !== 'fold')
              : [...markers, 'fold'];
          });
        },
        [commit],
      );

      const setColor = useCallback(
        (color) => {
          if (readOnly || !selectedIds.length) return;
          commit((root) => {
            for (const id of selectedIds) {
              const hit = findNode(root, id);
              if (!hit) continue;
              const keep = (hit.node.markers ?? []).filter((marker) => {
                const token = String(marker).trim();
                if (token.startsWith('#')) return false;
                if (token.startsWith('color:')) return false;
                const head = token.split(/[=\s]/)[0].toLowerCase();
                return !['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink', 'gray'].includes(head);
              });
              hit.node.markers = color ? [...keep, color] : keep;
            }
          });
          setColorMenu(false);
        },
        [commit, readOnly, selectedIds],
      );

      const onMove = useCallback(
        (fromId, toId) => {
          if (readOnly) return;
          commit((root) => {
            const source = findNode(root, fromId);
            const target = findNode(root, toId);
            if (!source || !target || !source.parent) return;
            // Dropping onto the current parent is a no-op; doing the
            // remove-then-append dance would silently reorder the siblings.
            if (source.parent.id === toId) return;
            // Refuse a move into its own subtree.
            let cursor = target.node;
            let guard = 0;
            while (cursor && guard < 4000) {
              if (cursor.id === fromId) return;
              const next = findNode(root, cursor.id);
              cursor = next?.parent;
              guard += 1;
            }
            source.parent.children = (source.parent.children ?? []).filter((kid) => kid.id !== fromId);
            (target.node.children ??= []).push(source.node);
            target.node.markers = (target.node.markers ?? []).filter((marker) => String(marker).trim() !== 'fold');
          });
        },
        [commit, readOnly],
      );

      const reorder = useCallback(
        (direction) => {
          if (readOnly || !primaryId) return;
          commit((root) => {
            const hit = findNode(root, primaryId);
            if (!hit || !hit.parent) return;
            const list = hit.parent.children ?? [];
            const index = list.findIndex((kid) => kid.id === primaryId);
            if (direction === 'up' || direction === 'down') {
              const swap = direction === 'up' ? index - 1 : index + 1;
              if (swap < 0 || swap >= list.length) return;
              [list[index], list[swap]] = [list[swap], list[index]];
              return;
            }
            if (direction === 'promote') {
              const grand = findNode(root, hit.parent.id)?.parent;
              if (!grand) return;
              const parentList = grand.children ?? [];
              const parentIndex = parentList.findIndex((kid) => kid.id === hit.parent.id);
              hit.parent.children = list.filter((kid) => kid.id !== primaryId);
              parentList.splice(parentIndex + 1, 0, hit.node);
              return;
            }
            if (direction === 'demote') {
              if (index <= 0) return;
              const newParent = list[index - 1];
              list.splice(index, 1);
              (newParent.children ??= []).push(hit.node);
            }
          });
        },
        [commit, primaryId, readOnly],
      );

      const onKeyDown = useCallback(
        (event) => {
          const meta = event.metaKey || event.ctrlKey;
          if (meta && event.key.toLowerCase() === 's') {
            event.preventDefault();
            save();
            return;
          }
          if (meta && event.key.toLowerCase() === 'f') {
            event.preventDefault();
            document.querySelector?.('.dmm-search')?.focus?.();
            return;
          }
          if (event.key === 'Tab') {
            event.preventDefault();
            addChild();
            return;
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            if (primaryId) setEditing({ id: primaryId, text: findNode(tree, primaryId)?.node?.text ?? '' });
            return;
          }
          if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            removeSelected();
            return;
          }
          if (event.key === '/') {
            event.preventDefault();
            if (primaryId) toggleFold(primaryId);
            return;
          }
          if (event.key === 'Alt' && false) return;
          if (event.altKey) {
            const map = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'promote', ArrowRight: 'demote' };
            const action = map[event.key];
            if (action) {
              event.preventDefault();
              reorder(action);
              return;
            }
          }
          if (event.key.startsWith('Arrow')) {
            event.preventDefault();
            stepSelection(event.key);
          }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [addChild, primaryId, removeSelected, reorder, selected, toggleFold, tree],
      );

      const stepSelection = useCallback(
        (key) => {
          if (!tree) return;
          const flat = [];
          const walkFlat = (node, parent) => {
            flat.push({ node, parent });
            for (const kid of node.children ?? []) walkFlat(kid, node);
          };
          walkFlat(tree, undefined);
          const index = flat.findIndex((entry) => entry.node.id === primaryId);
          if (index < 0) {
            setSelected(new Set([tree.id]));
            return;
          }
          const current = flat[index];
          if (key === 'ArrowUp' || key === 'ArrowDown') {
            const siblings = current.parent ? current.parent.children ?? [] : [tree];
            const at = siblings.findIndex((kid) => kid.id === current.node.id);
            const next = siblings[at + (key === 'ArrowUp' ? -1 : 1)];
            if (next) setSelected(new Set([next.id]));
            return;
          }
          if (key === 'ArrowRight') {
            const kid = (current.node.children ?? [])[0];
            if (kid) setSelected(new Set([kid.id]));
            return;
          }
          if (key === 'ArrowLeft') {
            if (current.parent) setSelected(new Set([current.parent.id]));
          }
        },
        [primaryId, tree],
      );

      const save = useCallback(async () => {
        if (!tree || readOnly) return;
        try {
          const body = await postJson(`${BASE}/save`, {
            session: sessionId,
            path: doc?.path ?? docPath,
            doc: { ...doc, root: tree, title: doc?.title ?? tree.text },
          });
          invalidateCatalogue(sessionId);
          notify(`${T('saved')} ${body.path ?? ''}`);
        } catch (failure) {
          setSaveAs({ title: doc?.title ?? tree.text ?? 'mindmap', error: String(failure?.message ?? failure) });
        }
      }, [doc, docPath, notify, readOnly, sessionId, tree]);

      const doSaveAs = useCallback(
        async (name) => {
          if (!tree) return;
          try {
            const body = await postJson(`${BASE}/saveas`, {
              session: sessionId,
              title: name,
              doc: { ...doc, root: tree, title: name },
            });
            setSource({ docId: undefined, path: body.path });
            setSaveAs(undefined);
            invalidateCatalogue(sessionId);
            notify(`${T('saved')} ${body.path ?? ''}`);
          } catch (failure) {
            setSaveAs({ title: name, error: String(failure?.message ?? failure) });
          }
        },
        [doc, notify, sessionId, tree],
      );

      const copyMarkdown = useCallback(async () => {
        if (!tree) return;
        try {
          await navigator.clipboard.writeText(renderMarkdown(tree));
          notify(T('copied'));
        } catch {
          notify(T('saveFailed'));
        }
      }, [notify, tree]);

      const exportMap = useCallback(
        (kind) => {
          if (!tree) return;
          const svg = buildSvg(tree, structure);
          const name = `${(doc?.title ?? tree.text ?? 'mindmap').replace(/[\\/:*?"<>|]/g, '-') || 'mindmap'}`;
          if (kind === 'svg') {
            download(`${name}.svg`, svg, 'image/svg+xml');
            return;
          }
          const box = layoutMap(tree, structure);
          svgToPng(svg, box.width, box.height, `${name}.png`);
        },
        [doc?.title, structure, tree],
      );

      /**
       * Hand the current note to the operating system's default handler — the
       * same thing a double-click in Explorer does. Inline maps have no file
       * yet, so the click saves first; a file-backed map goes straight out.
       */
      const openWithDefaultApp = useCallback(async () => {
        const target = doc?.path ?? docPath;
        if (!target) {
          notify(T('obsidianNeedsSave'));
          await save();
          return;
        }
        setOpenBusy(true);
        try {
          await postJson(`${BASE}/open`, { session: sessionId, path: target });
          notify(T('obsidianNoVault'));
        } catch (failure) {
          notify(`${T('obsidianFailed')}: ${String(failure?.message ?? failure)}`);
        } finally {
          setOpenBusy(false);
        }
      }, [doc?.path, docPath, notify, save, sessionId]);

      const expandAll = useCallback(() => {
        commit((root) => {
          walk(root, (node) => {
            node.markers = (node.markers ?? []).filter((marker) => String(marker).trim() !== 'fold');
          });
        });
      }, [commit]);

      const collapseToLevel = useCallback(
        (level) => {
          commit((root) => {
            const recurse = (node, depth) => {
              const kids = node.children ?? [];
              const markers = (node.markers ?? []).filter((marker) => String(marker).trim() !== 'fold');
              node.markers = depth >= level && kids.length ? [...markers, 'fold'] : markers;
              if (depth < level) for (const kid of kids) recurse(kid, depth + 1);
            };
            recurse(root, 0);
          });
        },
        [commit],
      );

      const outline = useMemo(() => {
        if (!tree) return [];
        const rows = [];
        const recurse = (node, depth) => {
          rows.push({ id: node.id, text: node.text, depth });
          if (isFolded(node)) return;
          for (const kid of node.children ?? []) recurse(kid, depth + 1);
        };
        recurse(tree, 0);
        return rows;
      }, [tree]);

      /* picker: no document selected yet */
      if (!docId && !docPath) {
        return h(Picker, {
          catalogue,
          sessionId,
          onPick: (entry) => setSource({ docId: entry.id, path: entry.path }),
          onPickPath: (target) => setSource({ docId: undefined, path: target }),
        });
      }

      if (error) {
        return h(
          'div',
          { className: 'dmm-root' },
          h('div', { className: 'dmm-bar' }, h('span', { style: { fontSize: 12, fontWeight: 600 } }, T('tabTitle'))),
          h('div', { className: 'dmm-empty' }, `${T('saveFailed')}: ${error}`),
        );
      }
      if (!tree) {
        return h(
          'div',
          { className: 'dmm-root' },
          h('div', { className: 'dmm-empty' }, T('pickerLoading')),
        );
      }

      return h(
        'div',
        { className: 'dmm-root' },
        h(
          'div',
          { className: 'dmm-bar' },
          // Structure
          h(
            'div',
            { className: 'dmm-group' },
            h(
              'select',
              {
                className: 'dmm-select',
                value: structure,
                onChange: (event) => {
                  setStructure(event.target.value);
                  try {
                    localStorage.setItem('dsh-mindmap.structure', event.target.value);
                  } catch {
                    /* ignore */
                  }
                },
                title: T('structure'),
              },
              h('option', { value: 'mindmap' }, T('mindmap')),
              h('option', { value: 'logic-right' }, T('logicRight')),
              h('option', { value: 'org-down' }, T('orgDown')),
              h('option', { value: 'tree-right' }, T('treeRight')),
            ),
          ),
          // Node operations
          h(
            'div',
            { className: 'dmm-group' },
            h(
              'button',
              { type: 'button', className: 'dmm-btn dmm-iconbtn', title: T('addChild'), 'aria-label': T('addChild'), onClick: addChild, disabled: readOnly },
              '+',
            ),
            h(
              'button',
              { type: 'button', className: 'dmm-btn dmm-iconbtn', title: T('addSibling'), 'aria-label': T('addSibling'), onClick: addSibling, disabled: readOnly || !primaryId },
              '↵',
            ),
            h(
              'button',
              { type: 'button', className: 'dmm-btn dmm-iconbtn', title: T('color'), onClick: () => setColorMenu((prev) => !prev), disabled: readOnly || !primaryId },
              '🎨',
            ),
            h(
              'button',
              { type: 'button', className: 'dmm-btn dmm-iconbtn', title: T('deleteNode'), onClick: removeSelected, disabled: readOnly || !primaryId },
              '🗑',
            ),
          ),
          h('span', { className: 'dmm-bar-spacer' }),
          // View: icons only — the bar has to fit one row in a narrow column.
          h(
            'div',
            { className: 'dmm-group' },
            h('input', {
              className: 'dmm-search',
              placeholder: T('search'),
              value: search,
              onChange: (event) => setSearch(event.target.value),
              title: T('search'),
            }),
            h(
              'button',
              {
                type: 'button',
                className: 'dmm-btn dmm-iconbtn',
                'data-on': showOutline ? '1' : '0',
                title: T('outline'),
                'aria-label': T('outline'),
                onClick: () => setShowOutline((prev) => !prev),
              },
              '☰',
            ),
            h(
              'button',
              { type: 'button', className: 'dmm-btn dmm-iconbtn', onClick: () => setNonce((prev) => prev + 1), title: T('reload') },
              '⟳',
            ),
          ),
          // File: save is the one action always on the surface.
          h(
            'div',
            { className: 'dmm-group' },
            h(
              'button',
              { type: 'button', className: 'dmm-btn', onClick: save, disabled: readOnly, title: readOnly ? T('readOnly') : T('save') },
              T('save'),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'dmm-btn dmm-iconbtn',
                'data-on': moreMenu ? '1' : '0',
                title: T('more'),
                'aria-expanded': moreMenu ? 'true' : 'false',
                'aria-haspopup': 'menu',
                onClick: () => setMoreMenu((prev) => !prev),
              },
              '⋯',
            ),
          ),
        ),
        // Everything that is not part of the core editing loop lives here.
        moreMenu
          ? h(
              'div',
              { className: 'dmm-menu dmm-menu-list', style: { right: 14, top: 46 } },
              h('div', { className: 'dmm-menu-head' }, T('more')),
              h('button', { type: 'button', className: 'dmm-menu-row', onClick: expandAll, disabled: readOnly }, T('expandAll')),
              h('button', { type: 'button', className: 'dmm-menu-row', onClick: () => collapseToLevel(2), disabled: readOnly }, T('level2')),
              h('div', { className: 'dmm-menu-sep' }),
              h('button', { type: 'button', className: 'dmm-menu-row', onClick: copyMarkdown }, T('copyMd')),
              h('button', { type: 'button', className: 'dmm-menu-row', onClick: () => exportMap('png') }, T('exportPng')),
              h('button', { type: 'button', className: 'dmm-menu-row', onClick: () => exportMap('svg') }, T('exportSvg')),
              h('div', { className: 'dmm-menu-sep' }),
              h('button', {
                type: 'button',
                className: 'dmm-menu-row',
                onClick: () => {
                  setMoreMenu(false);
                  setSaveAs({ title: doc?.title ?? tree.text ?? 'mindmap' });
                },
              }, T('saveAsHint')),
              h('button', {
                type: 'button',
                className: 'dmm-menu-row',
                onClick: () => {
                  setMoreMenu(false);
                  openWithDefaultApp();
                },
                disabled: openBusy,
              }, openBusy ? T('obsidianOpening') : T('openInObsidian')),
              h('button', {
                type: 'button',
                className: 'dmm-menu-row',
                onClick: () => {
                  setMoreMenu(false);
                  setSource({ docId: undefined, path: undefined });
                },
              }, T('switchDoc')),
            )
          : null,
        colorMenu
          ? h(
              'div',
              { className: 'dmm-menu', style: { left: 130, top: 42 } },
              COLORS.map((color) =>
                h('button', {
                  key: color || 'none',
                  type: 'button',
                  className: 'dmm-swatch',
                  title: color || 'none',
                  style: { background: color ? HEX_COLOR[color] ?? color : 'transparent' },
                  onClick: () => setColor(color || ''),
                }),
              ),
            )
          : null,
        saveAs
          ? h(
              'div',
              { className: 'dmm-menu', style: { left: 12, top: 42, width: 260, flexDirection: 'column' } },
              h('div', { style: { fontSize: 11.5, color: 'var(--dsw-alias-label-secondary)', padding: '2px 4px' } }, T('saveName')),
              h('input', {
                className: 'dmm-search',
                style: { width: '100%' },
                defaultValue: saveAs.title,
                autoFocus: true,
                onKeyDown: (event) => {
                  if (event.key === 'Enter') doSaveAs(event.currentTarget.value || 'mindmap');
                  if (event.key === 'Escape') setSaveAs(undefined);
                },
                id: 'dmm-saveas-input',
              }),
              h(
                'div',
                { style: { display: 'flex', gap: 6, paddingTop: 4 } },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'dmm-btn',
                    onClick: () => {
                      const input = document.getElementById('dmm-saveas-input');
                      doSaveAs(input?.value || 'mindmap');
                    },
                  },
                  T('confirmSaveAs'),
                ),
                h('button', { type: 'button', className: 'dmm-btn', onClick: () => setSaveAs(undefined) }, T('cancel')),
              ),
              saveAs.error
                ? h('div', { style: { fontSize: 11, color: 'var(--dsw-alias-state-error-primary)', paddingTop: 4 } }, saveAs.error)
                : null,
            )
          : null,
        h(
          'div',
          { className: 'dmm-body' },
          showOutline
            ? h(
                'div',
                { className: 'dmm-outline' },
                outline.map((row) =>
                  h(
                    'div',
                    {
                      key: row.id,
                      className: 'dmm-outline-row',
                      'data-selected': selected.has(row.id) ? '1' : '0',
                      'data-depth': String(Math.min(row.depth, 1)),
                      style: { paddingLeft: 6 + row.depth * 13 },
                      onClick: () => setSelected(new Set([row.id])),
                    },
                    h('span', { className: 'dmm-outline-dot' }),
                    h('span', { className: 'dmm-outline-text' }, row.text),
                  ),
                ),
              )
            : null,
          h(MapCanvas, {
            tree,
            structure,
            selected,
            search,
            editing,
            onSelect,
            onEdit: (id) => {
              const hit = findNode(tree, id);
              if (hit) setEditing({ id, text: hit.node.text });
            },
            onCommitEdit: (value) => {
              if (editing) {
                commit((root) => {
                  const hit = findNode(root, editing.id);
                  if (hit) hit.node.text = String(value).replace(/\n+$/, '') || '未命名';
                });
              }
              setEditing(undefined);
            },
            onCancelEdit: () => setEditing(undefined),
            onToggleFold: toggleFold,
            onMove,
            onKeyDown,
          }),
        ),
        readOnly
          ? h('div', { className: 'dmm-toast' }, T('readOnly'))
          : toast
            ? h('div', { className: 'dmm-toast' }, toast)
            : null,
      );
    }

    /* ------------------------------------------------------------------ */
    /* entries                                                             */
    /* ------------------------------------------------------------------ */

    function MapIcon(props) {
      const size = props?.size ?? 16;
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, 'aria-hidden': true, style: { display: 'block' } },
        h('rect', { key: 'r', x: 1.5, y: 9, width: 6.5, height: 6, rx: 1.6, fill: 'currentColor', opacity: 0.9 }),
        h('circle', { key: 'a', cx: 18.5, cy: 4.6, r: 2.6, fill: 'currentColor' }),
        h('circle', { key: 'b', cx: 18.5, cy: 12, r: 2.6, fill: 'currentColor' }),
        h('circle', { key: 'c', cx: 18.5, cy: 19.4, r: 2.6, fill: 'currentColor' }),
        h('path', {
          key: 'l',
          d: 'M8 12h3.2c1.3 0 2.2-.9 2.2-2.2V6.8M8 12h3.2c1.3 0 2.2.9 2.2 2.2v3M8 12h6.4',
          stroke: 'currentColor',
          strokeWidth: 1.4,
          fill: 'none',
          opacity: 0.75,
        }),
      );
    }

    /** Turn-tail chips: every mind map produced inside this completed Turn. */
    function TurnTailEntry(props) {
      const { sessionId, turn, seq } = props;
      const [nonce] = useState(0);
      const catalogue = useCatalogue(sessionId, nonce);
      const turnNumber = useMemo(() => {
        if (typeof turn === 'number') return turn;
        if (!turn || typeof turn !== 'object') return undefined;
        for (const key of ['number', 'index', 'turn', 'id', 'seq']) {
          if (typeof turn[key] === 'number') return turn[key];
        }
        return undefined;
      }, [turn]);

      const docs = useMemo(() => {
        if (!catalogue.docs.length) return [];
        return catalogue.docs.filter((entry) => {
          if (!Number.isFinite(entry.seq)) return false;
          if (typeof turnNumber === 'number' && typeof entry.turn === 'number') return entry.turn === turnNumber;
          return typeof seq === 'number' ? entry.seq <= seq && entry.seq > seq - 4000 : false;
        });
      }, [catalogue.docs, seq, turnNumber]);

      if (!docs.length) return null;
      return h(
        'div',
        { className: 'dmm-chip-row' },
        docs.slice(0, 6).map((entry) =>
          h(
            'button',
            {
              key: entry.id,
              type: 'button',
              className: 'dmm-chip',
              title: `${T('open')} · ${entry.title ?? ''}`,
              onClick: () => openMap({ docId: entry.id, path: entry.path }),
            },
            h(MapIcon, { size: 13 }),
            h('span', null, entry.title || entry.path || T('tabTitle')),
            h('span', { style: { opacity: 0.6 } }, entry.format === 'xmind' ? 'XMind' : 'MD'),
          ),
        ),
      );
    }

    /** Header utility: open the tab on the current Session, or straight to the map. */
    function HeaderButton(props) {
      const { sessionId } = props;
      const [busy, setBusy] = useState(false);
      return h(
        'button',
        {
          type: 'button',
          className: 'dmm-btn dmm-iconbtn',
          title: T('headerButton'),
          'aria-label': T('headerButton'),
          onClick: async () => {
            if (busy) return;
            setBusy(true);
            // Open the picker first: it can always render, and it fills in from
            // the session catalogue without blocking the tab on a fetch.
            openMap({ picker: true });
            setTimeout(() => setBusy(false), 600);
          },
          style: { width: 28, height: 26 },
        },
        h(MapIcon, { size: 15 }),
      );
    }

    /* ------------------------------------------------------------------ */
    /* plugin                                                              */
    /* ------------------------------------------------------------------ */

    function scheduleTimeout(callback, delay) {
      if (typeof window === 'undefined' || typeof window.setTimeout !== 'function') return 0;
      return window.setTimeout(callback, delay);
    }

    function clearScheduled(id) {
      if (!id) return;
      if (typeof window === 'undefined' || typeof window.clearTimeout !== 'function') return;
      window.clearTimeout(id);
    }

    function installTabType(ctx) {
      if (!ctx?.slots || typeof ctx.slots.inject !== 'function') return null;
      return ctx.slots.inject(SLOT_TAB, () => {
        let disposed = false;
        let poll = 0;
        let disposers = [];
        const cleanup = () => {
          disposed = true;
          clearScheduled(poll);
          poll = 0;
          for (const dispose of disposers) {
            try {
              dispose();
            } catch {
              /* ignore */
            }
          }
          disposers = [];
          if (controller) controller = undefined;
        };
        const attempt = () => {
          if (disposed) return;
          const tabs = typeof ctx.get === 'function' ? ctx.get('sidebarRightTabs') : undefined;
          const ctrl = typeof ctx.get === 'function' ? ctx.get('sidebarRight') : undefined;
          if (!tabs || typeof tabs.register !== 'function' || !ctrl || typeof ctrl.openTab !== 'function') {
            poll = scheduleTimeout(attempt, 250);
            return;
          }
          try {
            disposers.push(
              tabs.register({
                id: TAB_ID,
                kind: KIND,
                keepMounted: false,
                title: () => T('tabTitle'),
                guide: [
                  {
                    id: 'map',
                    order: 20,
                    title: () => T('guideTitle'),
                    description: () => T('guideDesc'),
                    icon: (iconProps) => h(MapIcon, { size: iconProps?.size ?? 18 }),
                  },
                ],
              }),
            );
            disposers.push(
              ctx.slots.register({ name: SLOT_TAB, key: TAB_ID }, MapTab),
            );
            controller = ctrl;
            if (openParams) {
              try {
                ctrl.openTab(KIND, { params: openParams });
              } catch {
                /* the panel may not be expanded yet */
              }
              openParams = undefined;
            }
          } catch {
            for (const dispose of disposers) {
              try {
                dispose();
              } catch {
                /* ignore */
              }
            }
            disposers = [];
          }
        };
        attempt();
        return cleanup;
      });
    }

    function installControllerPoll(ctx) {
      let disposed = false;
      let poll = 0;
      const attempt = () => {
        if (disposed) return;
        const ctrl = typeof ctx.get === 'function' ? ctx.get('sidebarRight') : undefined;
        if (!ctrl || typeof ctrl.openTab !== 'function') {
          poll = scheduleTimeout(attempt, 400);
          return;
        }
        controller = ctrl;
      };
      attempt();
      return () => {
        disposed = true;
        clearScheduled(poll);
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const readLocale = (snapshot) => {
          const active = String(snapshot?.active ?? '');
          if (active) localeId = active.toLowerCase().startsWith('zh') ? 'zh' : 'en';
        };
        try {
          const locale = ctx.get('locale');
          readLocale(locale?.getLocale?.() ?? locale?.getSnapshot?.());
          if (locale && typeof locale.subscribe === 'function') {
            ctx.effect(() => locale.subscribe((next) => readLocale(next)), 'dsh-mindmap locale');
          }
        } catch {
          /* keep the default locale */
        }

        ctx.effect(() => installStyles(ctx), 'dsh-mindmap styles');
        ctx.effect(() => installControllerPoll(ctx), 'dsh-mindmap controller');
        ctx.effect(() => installTabType(ctx), 'dsh-mindmap tab type');

        ctx.effect(
          () =>
            ctx.slots.inject(SLOT_TURN_TAIL, () =>
              ctx.slots.register({ name: SLOT_TURN_TAIL, id: 'dsh-mindmap', order: 26, label: () => T('entryBadge') }, TurnTailEntry),
            ),
          'dsh-mindmap turn tail',
        );

        ctx.effect(
          () =>
            ctx.slots.inject(SLOT_HEADER, () =>
              ctx.slots.register(
                { name: SLOT_HEADER, id: 'dsh-mindmap', order: 6, label: () => T('headerButton') },
                HeaderButton,
              ),
            ),
          'dsh-mindmap header button',
        );
      },
    };
  },
});
