---
title: "托盘图标不出现，跟图标本身一点关系都没有"
date: 2026-11-01
summary: "把 B 站收藏夹做成 Electron 播放器的过程里，最贵的三个坑都不在代码里：一个沙箱导致的启动即崩、一个跟图标无关的托盘失效、一个打包后 __dirname 变只读。顺带记下 playurl 加错参数会把纯音频打回音视频合一。"
tags: ["Electron", "B 站 API", "调试记录", "打包"]
category: "开发日志"
draft: false
---

想把自己 B 站收藏夹里的音乐当播放器用：扫码登录、点开就听、缩到托盘继续放。整个项目最终 5000 多行、十套测试脚本，仓库在 [YiWeiLai233/BiliMusic](https://github.com/YiWeiLai233/BiliMusic)，项目档案另开了一篇。

这篇只讲那些**花时间最多、但最后发现跟最初怀疑的地方毫无关系**的部分。

## 一、加两个参数，纯音频就没了

做播放器第一步是拿到音频地址。`/x/player/wbi/playurl` 返回 DASH 数据，音频流是独立的一条音轨，跟画面分开。这条路本来是对的。

后来我在参数里加了 `platform=html5&high_quality=1`，想着网页端能播，加个来源标识总没坏处。结果接口返回的结构变了：

```
dash: false, audio: 0, size: 10516124
```

一条音视频合一的单文件 mp4，10 MB。`dash` 变成 false 之后，`data.dash.audio` 这个数组直接不存在了，我原来取音轨的代码全部落空——但**它不报错**，因为我在取不到时回退到了 `data.durl`，而 durl 确实存在，恰好装着那个 10 MB 的合体文件。

判据是拿四组参数各跑一次，对比返回结构：

| 参数 | 结果 |
|---|---|
| 光 `bvid` + `cid` + `fnval:16` | 3 条音轨（30280 / 30232 / 30216） |
| 加 `web_location` | 同上，3 条 |
| 加 `fourk:1` + `fnver:0` | 同上，3 条 |
| 加 `platform=html5&high_quality=1` | 1 条 durl，合体 mp4 |

只保留 `bvid`/`cid`/`fnval:16`/`fnver:0`/`fourk:1` 就稳定返回三条独立音轨，每档还带两个备用 URL。三档分别是 43 KB/s、102 KB/s、203 KB/s，最高那档是 `mp4a.40.2`。

顺带验了一件原本没底的事：这套 fMP4 分片音频能不能在 Chromium 里直接解码、能不能拖进度。答案是可以，不需要 ffmpeg、不需要转码、不需要落盘。`loadedmetadata` 拿到 `duration=212.308833`，拖到 200 秒后 `currentTime` 是 200，播 1.3 秒变 201.33。这条验证通过之后，整个「边下边播」才敢往下写。

## 二、启动即崩，崩在 Chromium 子进程初始化

Electron 一启动就退，`exit=-1073741819`（0xC0000005 访问冲突），没有任何输出。

这中间有两次误判值得记：

第一次，环境变量里 `ELECTRON_RUN_AS_NODE=1`，Electron 以 Node 模式跑，永远不会进主进程。用 `cmd /c "set ELECTRON_RUN_AS_NODE=&& ..."` 清掉之后才真正启动。**这个变量在我这台机器上默认就是 1**，后面每次启动都得清。

第二次才是真问题。清了变量之后还是崩。写了个极简脚本逐行打日志，发现 `require('electron')` 正常、`app.commandLine.appendSwitch` 正常、脚本完整执行到底——但 `app.whenReady()` 永不 resolve。也就是崩在 Chromium 子进程初始化，主进程代码本身没问题。

根因是 Electron 默认把 `userData` 放在 `%APPDATA%`，那个路径被文件沙箱拦住了。改成显式指定：

```js
const DATA_DIR = path.join(__dirname, '.userdata');
app.setPath('userData', DATA_DIR);
app.setPath('sessionData', path.join(DATA_DIR, 'session'));
```

再加 `--no-sandbox --disable-gpu --disable-crash-reporter`，窗口就出来了。

还有一条调试手法上的教训：**pwsh 直接调 `electron.exe` 抓不到任何 stdout**，日志被吞。必须用 `.bat` 包一层重定向到文件才看得见。`Start-Process -RedirectStandardOutput` 反而报 Access is denied。这类环境限制会让人误以为「程序什么都没做」，实际它做了很多然后崩了。

## 三、托盘图标不出现，跟图标没关系

用户报的第一句话是「缩小到托盘没有图标」。这是个典型的分层误导：话里有两个词——「托盘」和「图标」——但真相跟这两个都不沾边。

我先验图标：`assets/tray.png` 是合法 32×32 RGBA，1024 个像素里 940 个不透明；`nativeImage.createFromPath` 返回非空、`toBitmap()` 读得出来。甚至用 zlib + CRC 在代码里手工合成了一张纯色 PNG，结果一样。图标不可能有问题。

日志里有一堆 `libpng warning: iCCP: known incorrect sRGB profile`，看着很可疑。写脚本剥 iCCP 块，结果是 `removed iCCP: 0`——三张 PNG 里根本没有这个块，警告来自别的库。**这条线索是假的，白花了时间。**

真正的判据是 `tray.getBounds()`：

- 不工作时恒为 `{"x":0,"y":0,"width":0,"height":0}`
- 工作时是 `{"x":1432,"y":1019,"width":32,"height":49}`

有这条硬指标，才能变成可判定实验，而不是靠截图猜。顺带纠正一个我自己犯的误判：任务栏上那个粉色音符图标位于物理 x≈1855–2020，而托盘区在 x≥2150——那是**任务栏的窗口运行按钮**，不是托盘图标。截图看起来「明明有」，实际是两回事。

接着做机器对照：用 PowerShell 的 `System.Windows.Forms.NotifyIcon` 造一个纯洋红色的图标，UI Automation 展开托盘溢出区，列表里立刻多出 `MAGENTA-PROBE`（15 → 16）。**这台机器的托盘链路完全正常**，问题百分之百在 Electron 侧。

第一层根因：**Electron 33.2.0 在 Windows 11 build 26200 上有托盘 bug**。同一个脚本换 Electron 43.3.0 跑，bounds 立刻真实。

但升级之后仍然失败。于是做路径矩阵——把同一份 dist 原样复制到不同位置：

| exe 位置 | bounds |
|---|---|
| `D:\bilibiliMusicPlayer\node_modules\electron\dist` | 恒 0 |
| `D:\bilibiliMusicPlayer\e43test` | 恒 0 |
| `D:\bilibiliMusicPlayer2` | 正常 |
| `D:\new777\bilibiliMusicPlayer` | 正常 |
| `D:\e43test`、`C:\e43test`、`%LOCALAPPDATA%\e43test` | 正常 |

结论非常反直觉：**只要 `electron.exe` 位于 `D:\bilibiliMusicPlayer` 这棵树下面，Windows 托盘注册就一定失败**。同名的兄弟目录、同名的嵌套目录都正常，唯独这一棵。

沿着这条路我把能排除的全排了：目录 ACL（`Everyone` 带 Delete 拒绝 + 沙箱 SID 授权，在别的盘复刻一模一样的 ACE 仍正常）、所有者、NTFS 卷、subst、junction、`restrict` 的 exe 内容（把验证过可用的 dist 复制进来还是 0）、`schtasks` 用普通 token 启动（排除父进程 token）、`setAppUserModelId`、直接 P/Invoke `Shell_NotifyIcon(NIM_ADD)`（返回 True、err=0，Electron 的托盘照样不出）。

`HKCU:\Control Panel\NotifyIconSettings` 给了最干净的证据：所有能用的路径都有一条注册表条目，而项目树下的 exe **从来没有过**。

解法是绕开：把 Electron 运行时复制到项目外，用外部 exe 带 `cwd` 启动。

```js
const RUNTIME = path.join(os.homedir(), 'AppData', 'Local', 'BiliMusicRuntime');
// 比对两边 version 文件，不一致才重新复制
// spawn(RUNTIME/electron.exe, ['.', '--no-sandbox', ...], { cwd: ROOT, env: 去掉 ELECTRON_RUN_AS_NODE })
```

`npm start` 现在走 `scripts/launch.js` 做这件事。实测展开托盘溢出区，列表里有 `Bili Music`，这是之前从未出现过的。

**我没能查清这棵目录为什么特殊。** 这不是一个让人满意的结论——如果有大把时间应该继续挖，但作为一个要交付的工具，「绕开并且能验证绕开有效」比「查清但不确定什么时候复发」更实用。我把这条写进了 README 的已知问题，没有假装它已经修好。

## 四、打包之后 `__dirname` 是只读的

开发态数据目录是 `path.join(__dirname, '.userdata')`，全部测试在这个前提下跑绿。打进 asar 之后，`__dirname` 指向 asar 内部，写不进去——一启动就退。

改成按优先级探测：

```js
function pickDataDir() {
  if (!app.isPackaged) return path.join(__dirname, '.userdata');
  const candidates = [
    path.join(app.getPath('appData'), 'BiliMusic'),
    path.join(app.getPath('userData'), '..', 'BiliMusic'),
    path.join(app.getPath('temp'), 'BiliMusic'),
    path.join(path.dirname(app.getPath('exe')), 'BiliMusic-data'),
  ];
  for (const dir of candidates) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, '.write-probe');
      fs.writeFileSync(probe, 'ok');   // 真写，不信 mkdir 的返回值
      fs.rmSync(probe, { force: true });
      return dir;
    } catch { /* 换下一个 */ }
  }
  return path.join(app.getPath('temp'), 'BiliMusic');
}
```

关键是**真写一个探针文件再删掉**，而不是只看 `mkdirSync` 有没有抛。因为这台机器上出过一个更细的坑：目录能建，但 Chromium 在它下面创建 `session\Network` 时被拒——

```
ERROR:content\browser\network_sandbox.cc:478] Failed to create network context data directory ... 拒绝访问。(0x5)
```

`mkdir` 成功不代表 Chromium 的写入循环能成功，两层权限模型不一样。

## 五、安装包不提权，用户装到 D 盘就报没权限

用户报「安装的时候没有写入权限」，并且说明「我手动改到自定义目录（比如 D:\）后报错」。

先验盘：`D:\` 根目录 ACL 是 `Authenticated Users:(M)`、`Users:(RX)`，`mkdir` 手动建目录成功。盘没问题。

然后读安装包的 PE manifest：

```
requestedExecutionLevel level="asInvoker" uiAccess="false"
```

`asInvoker` 意味着安装器以普通用户权限启动，**根本不提权**。根因在 electron-builder 的模板里：`installer.nsi:20-28`，`INSTALL_MODE_PER_ALL_USERS` 未定义时走 `RequestExecutionLevel user`；而 `package.json` 里 `nsis.perMachine` 默认就是 `false`。改一个配置：

```json
"nsis": { "perMachine": true, "allowElevation": true, "oneClick": false }
```

重新打包后 manifest 变成 `requireAdministrator`。注意应用本体 `Bili Music.exe` 仍是 `asInvoker`——这是对的，不该让播放器每次启动都要管理员。

另一个报的是 SmartScreen：「Windows 已保护你的电脑」。这个**改代码解决不了**：`Get-AuthenticodeSignature` 返回 `NotSigned`，文件也没有下载来源标记，Windows 只能按「无法识别的应用」处理。自签名同样会被拦，只会把「未签名」变成「签名了但不认识」。要根治只能买代码签名证书，我把这条如实写进了回复，没有假装已经修好。

## 六、多 P 视频把单键当主键，会互相覆盖

收藏夹里有 4P 的 MV，B 站返回的每一条收藏都是一个 `bvid` 加一个 `pages` 数组。我最初的曲目模型用 `bvid` 当唯一键，四个分 P 塞进去就只剩最后一个——后写覆盖先写，而且**不报错**。

改成身份键带分 P 后缀：

- 收藏夹拆出来的分 P：`${bvid}:p${page}`
- 单 P 视频：仍然是裸 `bvid`
- 库里导入的多 P 曲目：存 `id` 字段，`keyOf` 优先读它

这样每个分 P 能各自播放、各自标记、各自进歌单。

连带一个显示问题：B 站的分 P 名经常把整个视频标题重复一遍。真实数据里 P2 直接是 `日-《绝区零》菲欧妮EP | 1% Battery Girl 低电量女孩`，拼起来标题整段出现两次。写了个 `cleanPartName(part, title)`，把与总标题重复的子串剥掉再修剪两端分隔符，清洗后变成 `…低电量女孩 · P1`、`… · P2 日`、`… · P3 英`、`… · P4 韩`。

这个函数在 `src/bili.js` 和 `renderer/app.js` 各有一份——渲染进程不能 `require` 主进程模块。同一份逻辑有两份实现是我的明确取舍：多一个同步点，换掉一个打包后必然出问题的跨进程依赖。

## 收尾

三个最大的坑（沙箱崩、托盘失效、打包只读）没有一个在业务逻辑里，全在「程序怎么被运行」这一层。共同点是它们的报错要么没有、要么指向错误的方向：崩在 Chromium 初始化让人以为是图形问题，托盘不出让人以为是图标问题，装到 D 盘报权限让人以为是磁盘问题。**找到一条可判定的硬指标（`getBounds()` 的四个数字、PE manifest 的那一行）比读十篇文档有用。**

还有一条：这台机器上 `npx` 是坏的（`Cannot find module ...\npx-cli.js`），`npm.ps1` 被执行策略禁掉，`gh api --jq` 会因为 PowerShell 的引号解析反复失败，`gh api` 的输出是 UTF-16LE。每个都得单独绕。这些不属于项目本身，但确实占了相当比例的时间，值得记下来省下一次。
