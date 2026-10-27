---
title: "双击关标签"
summary: "Chrome / Edge 扩展：在页面内容区双击关闭当前标签页，自动跳过输入框、代码编辑器与选中文字等场景。"
status: "released"
stack: ["Chrome Extensions", "Manifest V3", "JavaScript", "Chrome DevTools Protocol", "Pillow"]
featured: true
repo: "https://github.com/YiWeiLai233/chrome-dblclick-close-tab"
---

双击关标签是一个 Chrome / Edge 通用（Manifest V3）的浏览器扩展：在网页内容区双击，直接关掉当前标签页。当前版本 1.1.0，仓库公开在 [YiWeiLai233/chrome-dblclick-close-tab](https://github.com/YiWeiLai233/chrome-dblclick-close-tab)，Releases 里提供打包好的 zip 供直接加载。

## 项目定位

这个扩展解决的是一件很小但每天都会重复几十次的事：关标签要伸鼠标去点那个小叉。

起点是一句需要先说清楚的事实——**Chrome 扩展拿不到标签栏（tab strip）上的鼠标事件**。Firefox 有原生的 `browser.tabs.closeTabByDblclick`，Chrome 至今没有对应 API，也没有权限去监听浏览器 UI 区域。所以「在标签栏上双击关闭」用纯扩展做不到，任何声称做到的方案都在骗人。

既然最近的路走不通，就换成两条等效通道：**双击页面主体区域**关闭标签，以及**浏览器级快捷键**关闭标签。前者是扩展能看见的唯一真实鼠标事件来源，后者由浏览器自己派发、页面脚本拦不住。

## 核心能力

默认是「智能」模式，只在确定用户不是在干别的事情时才关：

- 普通正文、空白处双击：关闭当前标签。
- 落在输入框、下拉框、视频、canvas 上：不关，双击在那里是选词或控件自身语义。
- 落在链接、按钮、tab、复选框等可交互元素上：不关，双击有页面自己的含义。
- 落在富文本或代码编辑器（`contenteditable`、Monaco、CodeMirror）：不关。
- 双击开始前已经选中了文字：不关。
- 按住 Ctrl / Shift / Alt / Cmd 双击：不关，视为刻意操作。
- 窗口只剩最后一个标签：不关，底部弹一条提示（`keepLastTab` 保护）。

想更激进可以切到「任何位置」模式，只要不在输入控件里，双击哪儿都关。

其余能力：

- **快捷键通道**：`Alt+Shift+W` 关闭当前标签页，键位可在 `chrome://extensions/shortcuts` 修改，设置页会显示当前实际生效的键位。
- **站点豁免**：一行一个域名，写主域名即覆盖子域（`example.com` 也管 `docs.example.com`）。
- **未触发原因提示**：排查看不懂为什么没关时打开，双击后页面底部直接说明是命中了编辑器、有选中文字、站点被豁免，还是只剩最后一个标签。
- **设置即时生效**：配置存在 `chrome.storage.sync`，改完不用刷新页面。

## 技术结构

职责切得很干净：`content.js` 只判断「这一次双击该不该算」，`background.js` 才真正执行关闭，内容脚本不碰 `chrome.tabs`。

内容脚本只在**捕获阶段**监听 `dblclick`，页面自己的处理器藏不掉这个事件。判断逻辑必须放在内容脚本里，因为只有它能看见 DOM——焦点在哪个输入框、有没有选中文字，后台都无从得知。

`background.js` 作为 service worker 负责两件事：判断「是不是最后一个标签」并关闭，以及在安装/更新时把 `content.js` 补注入到所有已打开的 http/https 标签。没有这一步补注入，扩展装好之前就开着的页面双击毫无反应，用户会直接认定「这扩展是坏的」。

清单层面只申请 `storage` 和 `scripting` 两项权限，加上 http/https 的 host 权限，最低支持 Chrome 96，没有多余的东西。

图标由 `tools/make_icons.py` 用 Pillow 超采样后缩放生成，产物在 `icons/`。

## 值得复盘的地方

**一是「有选中文字就不关」这条规则有个反直觉的坑。** 双击本身就会选中一个词——浏览器在第二次 `mousedown` 时已经把选区做好了，等到 `dblclick` 阶段再查 `getSelection()` 永远非空，规则就变成「双击永不关闭」。正确做法是在第一次 `mousedown`（`detail === 1`）上取一次快照，拿的是「双击开始之前」的状态。这类时序问题在代码里看不出来，只有真按一次才暴露。

**二是扩展更新后双击失灵，根因是防重复注入的旧写法。** 最初用 `if (window.__x) return` 挡住重复注入，结果扩展点「重新加载」后，旧的内容脚本还挂在页面上但 `chrome.runtime` 已失效，消息发不出去；后台补注入新脚本，新脚本看到旧标记就提前退出——页面上只剩一个死监听，双击彻底没反应。改成「找到上一实例、调它的 `destroy()` 拆掉、再装新的」才正确。

**三是 Chrome 137+ 正式版会直接忽略 `--load-extension`。** stderr 里只写一句 `--load-extension is not allowed in Google Chrome, ignoring.`，扩展压根不加载，端到端测试会静默地全绿或全红，两种结果都不代表真实情况。所以 `tools/e2e.mjs` 改用浏览器级 CDP 命令 `Extensions.loadUnpacked` 来装载扩展。

**四是测「保留最后一个标签」必须真的只剩一个标签。** 只断开 WebSocket 并不会关标签，前一个用例的页面还开着，测出来的根本不是单标签场景，用例会假通过。

## 端到端测试

```powershell
node tools/e2e.mjs
```

真的启动一个 Chrome、真的装扩展、用 CDP 派发真实鼠标事件，然后检查标签到底关没关，9 条用例覆盖行为表里的每一项。扩展这类「只有真按一下才知道对不对」的东西，靠单元测试测不出价值。

## 后续维护方向

- 补充「按站点启用不同模式」，目前豁免是全局一刀切。
- 双击后的短暂视觉反馈（右下角轻提示），让用户确认扩展确实识别到了这次操作。
- 继续观察 Chrome 对标签栏 UI 的 API 开放情况，一旦有 `tabs` 级事件就补上真正的双击关闭。
