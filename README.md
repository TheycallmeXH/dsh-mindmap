# dsh-mindmap

XMind 风格的思维导图，长在 DeepSeek Harness 右侧栏里。Markdown 是唯一真相：
标题层级和列表缩进就是节点，右侧栏只是同一份文件的另一个编辑器。改写自
[gogoga-mindmap](https://github.com/JackWeiGogoga/gogoga-mindmap)（Obsidian 插件，MIT）
的核心思路——Markdown ⇄ 树的无损互转、`%%…%%` 标记、`.xmind` 读入——重做成 DSH 的
Host/Client 插件。

> 一个 DSH 插件，把对话里的 Markdown 大纲变成可编辑的思维导图。

## 安装

```bash
# 从 GitHub 装进当前 profile
plugin_manager install_bundle https://github.com/TheycallmeXH/dsh-mindmap

# 或先克隆再指向本地目录
git clone https://github.com/TheycallmeXH/dsh-mindmap
plugin_manager install_bundle <克隆出来的目录>
```

装完重启（或让 HMR 重新加载）后：右栏「开始」页出现「思维导图」卡片，会话标题栏
出现图标按钮，对话末尾出现胶囊。

本包零运行时依赖；测试用的 react/jsdom 从外部借用，不在依赖里。

## 三个入口

| 入口 | 位置 | 作用 |
|---|---|---|
| 右侧栏「开始」页的卡片 | `sidebar.right.pane.tab` / guide | 主入口，点开就是画布 |
| 会话标题栏按钮 | `conversation.session.header.utilities` | 一键打开当前会话的导图选择器 |
| 每轮对话末尾的小胶囊 | `conversation.chat.turnTail` | 这一轮产出的导图，一点直达 |

## 对话里的导图从哪来

Host 半读当前会话的日志（`~/.dsh/sessions/…/session.vN.jsonl.zstd`），认三种来源：

- **对话内联**：`assistant/message` 里的 ```` ```mindmap ```` 代码块，或一段连续、
  看起来像层级的标题/嵌套列表（≥4 个条目、≥2 层才算）。
- **交付文件**：`deliverables/presented` 里的 `.md` / `.markdown` / `.xmind`。
- **写文件**：`write` / `edit` 工具调用写出的 `.md`（至少 3 个节点、2 层才会入列）和 `.xmind`。

会话里没有导图时，选择器提供「浏览工作区文件」，直接列当前工作目录下的 `.md` / `.xmind`。

## 编辑

- 双击就地改名；回车提交，Esc 取消。
- `Tab` 加子节点，`Enter` 加同级，`Delete` 删子树，`/` 折叠或展开。
- 拖动节点到另一个节点上换父级（拖到自己的子树里会被拒绝）。
- `Alt+↑↓` 同级换序，`Alt+←→` 升降级。
- 方向键在节点间移动；`Ctrl/Cmd+S` 保存，`Ctrl/Cmd+F` 聚焦搜索。
- 节点配色、备注、折叠状态都写回 `%%…%%` 标记，Markdown 侧可读。
- 四种结构：左右思维导图、向右逻辑图、向下组织图、向右树形图（结构选择记在 localStorage）。

## 格式支持

- 标题 `H1…H4` → 节点，`H5` 以下自动转列表缩进。
- `-`/`*`/`+`/`1.` 列表，按缩进嵌套。
- `%%fold%%`、`%%left%%`、`%%red%%`、`%%#hex%%`、`%%callout "…"%%` 等标记原样保留。
- 节点下的段落/代码块 → 该节点的备注（写回时贴在节点下面）。
- `.xmind`：内置 zip 读取（`content.json` 走 XMind Zen/2020+，`content.xml` 走 XMind 8），
  只读打开，可用「另存为 Markdown」在旁边生成 `.md`。
- 导出 PNG（2×）和 SVG，导出用的是布局引擎算好的换行，跟屏幕一致。

## 保存

`POST /dsh-mindmap/save` 把树写回原 `.md`（整篇按本插件的格式重写，含
`--- mindmap: true ---` 头部）；目标是 `.xmind` 或路径缺失时自动转「另存为 Markdown」。
路径被限制在会话工作目录内（`confine()`），越界直接报错。

## 用默认程序打开

工具栏最后一颗按钮「用默认程序打开」，等价于在资源管理器里双击这个文件：交给系统的
文件关联去开。你 `.md` 关联的是 Obsidian，它就开 Obsidian；换成别的编辑器也一样。

插件本身**不知道、也不关心**目标程序是谁：

- 不读 Obsidian 的 vault 注册表，不搜 exe，不拼 `obsidian://` URL。
- Windows 走 shell 自己的 `FileProtocolHandler`（`rundll32.exe url.dll,FileProtocolHandler <path>`），
  macOS 走 `open`，Linux 走 `xdg-open`。
- 路径作为独立 argv 元素传入，不拼 shell 字符串。
- 只接受**会话工作区内**的路径；工作区外（包括 vault 内）一律拒绝并报
  `path is outside the session workspace`。这条约束与关联用什么程序无关。
- 对话内联的导图还没有文件，点它会先保存（走「另存为 Markdown」），再打开。

这样也不会再出现「为了打开一个工作区笔记，去动 Obsidian 自己的 vault 配置」这种事。

## 路由

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/dsh-mindmap/health` | 存活探针 |
| GET | `/dsh-mindmap/session?session=` | 会话目录（cwd）+ 导图清单 |
| GET | `/dsh-mindmap/doc?session=&doc=` 或 `&path=` | 读一份导图 |
| POST | `/dsh-mindmap/save` | 写回原文件 |
| POST | `/dsh-mindmap/saveas` | 另存为 Markdown |
| GET | `/dsh-mindmap/list?session=&dir=` | 目录内的 `.md` / `.xmind` |
| GET | `/dsh-mindmap/open?session=&path=` | 解析并校验路径（不启动） |
| POST | `/dsh-mindmap/open` | 用系统默认程序打开该文件 |

## 测试

```bash
node test/wrap.test.cjs     # 布局度量：不出孤字、不溢出、单行不硬拆
node test/render.test.cjs   # jsdom + 真 Host + 真 React：45 条断言
```

`render.test.cjs` 用隔壁 `session-ref-board/node_modules` 里的 react/jsdom，所以本包
本身零依赖。测试只改 `test/.tmp/fixture.md` 的副本，不碰仓库里的真实笔记。

## 安装

```bash
# 在 DSH 里
plugin_manager install_bundle  C:\Users\12159\123\dsh-mindmap
```

装完重启（或让 HMR 重新加载）后：右栏「开始」页出现「思维导图」卡片，会话标题栏
出现图标按钮，对话末尾出现胶囊。

## 已知边界

- `.xmind` 只读，写入走「另存为 Markdown」——与 gogoga 的 Convert to Markdown 同策略。
- 保存是整篇重写，不是逐行 patch：原文件的空行细节、代码块外的自定义排版不会被保留。
  需要逐字节保真时用 gogoga 的 Obsidian 版本。
- `.xmind` 的备注、边界、摘要、关系线目前不入树，只取主题文本与备注纯文本。
- 结构、缩放不跨设备同步（结构存 localStorage，缩放只在当前面板内）。
- 不提供撤销栈；撤销靠文件的版本控制或重新读取。
- 「用默认程序打开」不碰 vault 内容；vault 内的路径不在会话工作区里，因此会被拒绝——
  这是刻意的边界，不是缺陷。工作区里的笔记会交给你 `.md` 关联的那个程序。

## 许可

MIT。思路与 Markdown 映射规则来自 gogoga-mindmap（MIT，JackWei）。
