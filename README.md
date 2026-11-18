# My Earth 建图 · `dsh-plugin-my-earth`

**公开测试版 `v0.1.1`** ｜ [English](#english) ｜ [完整示例](#完整例子把这五家日本古董吉他店做成一张地图并生成公开分享链接) ｜ [v0.1.1 变更](#v011-变更)

把地点数据变成一张可分享的 My Earth 交互地图。跟 agent 说一句话，它调用 `create_map`，
插件把标题和地点列表发到公开的 My Earth API，拿回**地图链接**和**1200×630 封面图链接**。

- 一张地图 = 一个分享链接，拿到链接的人直接打开，不需要账号或 API key。
- 封面图生成失败时，**仍然返回可用的地图链接**（`coverStatus: "failed"`），不会整单失败。
- API 地址是可配置项，默认使用 `me-my-earth` 公开 [`docs/API.md`](https://github.com/junyisunme/me-my-earth/blob/main/docs/API.md) 里验证过的建图预览地址。
- 安装包只依赖**公开 API**和**公开示例**：没有私有服务、没有私有依赖、没有构建脚本。

## 草稿还是发布？

`create_map` 只在用户明确要求发布时调用。**一次工具调用只会发出一次 `POST /api/maps`。**

| 用户说 | Agent 应该做 | POST 次数 |
| --- | --- | --- |
| 「整理去年全家去过的地方」「先给我看看」「给我 JSON」 | 用文件能力写一份本地 JSON 草稿，把路径和内容交给用户 | **0** |
| 「发布这份草稿」「生成公开分享链接」 | 调用 `create_map` 一次，返回地图链接和封面 | **1** |

发布后的地图是**公开链接**：拿到链接的人都能打开，并查看每个地点的来源。不要替用户把草稿直接发布。

## 它做什么

| 项 | 值 |
| --- | --- |
| 工具名 | `create_map` |
| 输入 | 符合公开 API 合约的地图数据：`title` + `events`（每个事件含 `source` 与 1–30 个 `locations`） |
| 输出 | `shareUrl`、`previewImageUrl`、`coverStatus`，外加 `mapId`、`coverError` 和 `eventCount`/`countryCount`/`cityCount` |
| 副作用 | 只在用户明确要求发布时，向配置里的公开 API 发一次 `POST /api/maps`；草稿不调用 |
| 关闭插件后 | `create_map` 工具从会话里消失，已生成的地图不受影响 |

## 安装

需要 DeepSeek Harness。本版本在 **DSH `0.2.2-rc.3`** 上实测通过；包是纯 ESM，无运行时依赖、无 build 脚本，所以 git 安装不需要 `allowBuilds` 授权。

### 方式一：在 Plugins 页面添加（推荐）

打开 **Plugins** → **Add plugin**，粘贴：

```
github:junyisunme/dsh-plugin-my-earth#v0.1.1
```

### 方式二：让 agent 安装

```
用 plugin_manager 安装 github:junyisunme/dsh-plugin-my-earth#v0.1.1
```

### 方式三：命令行

```sh
dsh plugin --profile <profile> add github:junyisunme/dsh-plugin-my-earth#v0.1.1
```

`#v0.1.1` 是发布标签。要按不可变提交安装（推荐，避免后续 push 改变实际执行的代码），
把标签换成 Release 说明里给出的 40 位 commit SHA：

```
github:junyisunme/dsh-plugin-my-earth#<40 位 commit SHA>
```

安装后新开一个会话（或刷新页面），`create_map` 就会出现在可用工具里。插件默认启用；
在 **Plugins** 里可以随时关掉。

## 配置

两项都可选，不写就用默认值：

| 配置项 | 默认值 | 说明 |
| --- | --- | --- |
| `apiBaseUrl` | `https://6afc8b581813239311ea1a4d--me-interest-globe.netlify.app` | 公开建图 API 的基地址（`POST <apiBaseUrl>/api/maps`）。公开测试版用的是预览域名，正式域名可在此切换。 |
| `timeoutMs` | `45000` | 单次建图请求（含封面生成）的超时毫秒数。 |

在自己的 profile `cordis.patch.yml` 里覆盖。注意 DSH 的补丁**整段替换**一行的 `config`，
所以要把两个键都写全：

```yaml
- id: my-earth
  name: 'dsh-plugin-my-earth'
  config:
    apiBaseUrl: https://your-stable-domain.example
    timeoutMs: 45000
```

## 输入字段

`create_map` 的参数就是公开 API 的文档结构，只是省掉了 `schemaVersion`（插件固定填 `1`）：

```jsonc
{
  "title": "日本中古电吉他店 5 选（东京・大阪）",        // 1–120 字
  "events": [
    {
      "id": "kurosawa-gclub-tokyo",                    // 唯一，1–80 字：字母 数字 . _ : -
      "title": "クロサワ楽器 G-CLUB TOKYO（御茶ノ水）",   // 1–300 字
      "summary": "四层楼里同时摆着 vintage Gibson 与 Fender……", // 1–3000 字，纯文本
      "publishedDate": null,                            // YYYY-MM-DD 或 null；不知道就别填
      "eventDate": null,                                // 同上
      "source": { "name": "店名或来源", "url": "https://…" }, // url 必须是直接的 http(s) 页面
      "locations": [
        {
          "countryId": "JPN",                           // ME 国家/地区 ID，如 JPN / USA / GBR
          "precision": "city",                          // country | city | point
          "label": "东京 · 御茶ノ水（神田小川町3-8）",     // 1–160 字
          "reason": "店址在千代田区神田小川町，属于御茶ノ水乐器街。", // 1–500 字
          "placeId": "jpn-tokyo",                       // 可选：已知城市 ID
          "lat": 35.658327,                             // city / point 精度必需
          "lng": 139.718789
        }
      ]
    }
  ]
}
```

三种 `precision` 的区别：

- `country`：只做国家级关联，`placeId`、`lat`、`lng` 会被忽略。
- `city`：用已知 `placeId`，或者给出城市区位的经纬度。
- `point`：给精确的标记点，比如店面位置。点只是标记，不会画任何边界。

## 完整例子：把这五家日本古董吉他店做成一张地图，并生成公开分享链接

示例数据就是仓库里的 [`examples/guitar-five.json`](examples/guitar-five.json)，
与 `me-my-earth` 仓库的公开示例一致（东京 3 家 + 大阪 2 家）。

**第 1 步**，把这个文件放到工作目录，或者让 agent 直接读仓库里的那份。

**第 2 步**，对 agent 说：

> 把这五家日本古董吉他店做成一张地图，并生成公开分享链接

这句话明确要求发布，所以 agent 会调用 `create_map` 一次。

**第 3 步**，agent 会调用 `create_map`（参数就是上面的字段结构），拿回：

实测结果（v0.1.0，2026-11-18，DSH `0.2.2-rc.3`，公开 API 预览域名；v0.1.1 未改输出字段）：

| 字段 | 实测值 |
| --- | --- |
| `shareUrl` | [`?map=JeAy_0lLEciHT7Yf48GURBqj`](https://6afc8b581813239311ea1a4d--me-interest-globe.netlify.app/?map=JeAy_0lLEciHT7Yf48GURBqj) |
| `previewImageUrl` | [`/api/covers/v2/JeAy_0lLEciHT7Yf48GURBqj.png`](https://6afc8b581813239311ea1a4d--me-interest-globe.netlify.app/api/covers/v2/JeAy_0lLEciHT7Yf48GURBqj.png) |
| `coverStatus` | `ready`（封面 PNG 实测 `200 image/png`，74 KB） |
| `mapId` | `JeAy_0lLEciHT7Yf48GURBqj` |
| `eventCount` / `countryCount` / `cityCount` | `5` / `1` / `2` |

工具在会话里直接渲染成：

```text
My Earth map: https://6afc8b581813239311ea1a4d--me-interest-globe.netlify.app/?map=JeAy_0lLEciHT7Yf48GURBqj
Cover (1200×630 PNG): https://6afc8b581813239311ea1a4d--me-interest-globe.netlify.app/api/covers/v2/JeAy_0lLEciHT7Yf48GURBqj.png
Contents: 5 events, 1 country, 2 places.
```

**第 4 步**，打开 `shareUrl` 就是交互地图；`previewImageUrl` 是同一张地图的 1200×630 封面图，
可以直接贴到聊天、文档或社交媒体。封面返回 `failed` 时只把 `shareUrl` 发出去就行。

如果用户只想要草稿，说「先把这五家店整理成草稿」；agent 应该写本地 JSON，不调用 `create_map`。

## 超时、断线或缺少 shareUrl

工具把以下情况视为**创建结果未确认**：

- 请求超时；
- 连接中断；
- API 返回成功（2xx）但响应没有 `shareUrl`。

这时地图可能已经保存。工具会提示「创建结果未确认，地图可能已保存」，并且**不自动重发**。Agent 也不应该在同一个任务里再调用一次 `create_map`；先让用户确认结果，只有用户明确要求重试时才重新提交。

已返回 `shareUrl` 但 `coverStatus` 为 `failed`：照常交付地图链接，这次创建仍然只发过 1 次 POST。

服务端明确拒绝（如 400/429）时，错误里保留 API 的 `message` 和 `issues` 字段路径，方便用户修改数据。

## 返回字段

| 字段 | 说明 |
| --- | --- |
| `shareUrl` | 可分享的交互地图链接。**核心交付物**，封面失败时也一定存在。 |
| `previewImageUrl` | 公开的 1200×630 PNG 封面，无需登录即可读取；封面失败时为 `null`。 |
| `coverStatus` | `ready` 表示封面已生成，`failed` 表示只有地图链接。 |
| `coverError` | 封面失败时服务给出的说明，可能为 `null`。 |
| `mapId` | 地图 ID，可用于公开读取接口 `GET /api/maps/<mapId>`。 |
| `eventCount` / `countryCount` / `cityCount` | 地图里的事件数、国家/地区数、地点数。 |

## 限制与边界

- **公开测试版**：默认 API 是公开预览域名，随时可能切换到正式域名；链接域名变化时用 `apiBaseUrl` 覆盖即可，不需要重装插件。
- **地图是公开的**：生成的地图存在公开服务上，任何拿到链接的人都能打开。不要提交隐私信息、未公开地址或敏感数据。
- **草稿不发布**：「整理」「生成草稿」「先给我看看」「给我 JSON」只写本地文件，不调用 `create_map`；只有明确要求发布时才发一次 POST。
- 请求体上限 **512 KB**，最多 **100 个事件**，每个事件最多 **30 个地点**。
- 公开 API 会拒绝未知国家 ID、重复事件 ID、未知或不匹配的 `placeId`、非法坐标和控制字符；这类错误会带着具体字段路径返回给 agent，方便它改完重试。
- 封面生成是尽力而为：失败不影响地图本身。
- 插件本身不缓存、不落地任何地图数据。

## 兼容性

- 实测环境：DeepSeek Harness `0.2.2-rc.3`。
- 纯 ESM、零依赖、无 `prepare`/`build` 脚本，git 安装不需要 pnpm 的 build 授权。
- 只用到 DSH 的公开扩展点：`ctx.tools.register()`（Host 侧工具注册）与 loader 补丁。

## v0.1.1 变更

- `create_map` 的说明明确草稿与发布边界：草稿由 Agent 用文件能力交付，**0 次 POST**；只有用户明确要求发布时才调用，**一次调用只发一次 POST**。
- 请求超时、连接中断、2xx 响应缺少 `shareUrl` 时统一提示「创建结果未确认，地图可能已保存」，工具和 Agent 都不自动重发。
- 已返回 `shareUrl` 但封面失败时仍交付地图链接；服务端明确拒绝时保留 `message` 和字段路径。
- README、locale（zh/en）和详情文案同步；吉他示例改为「…并生成公开分享链接」。

### v0.1.1 验收（2026-11-19）

在 DSH `0.2.2-rc.3` 的真实 headless 会话里接计数 mock API：

| 场景 | 结果 |
| --- | --- |
| 先给旅行草稿 | **0 次 POST**，写出本地 JSON |
| 发布同一份草稿 | **1 次 POST** |
| 成功 2xx 但缺少 `shareUrl` | 1 次 POST，返回「未确认」，不重发 |
| 请求超时 | 1 次 POST，返回「未确认」，不重发 |
| 封面失败的成功响应 | 1 次 POST，仍交付可用 `shareUrl` |
| 400 / 429 | 工具层测试保留 API `message` 和字段路径，不重发 |

mock 返回的链接是 `127.0.0.1`，只用于验收；真实公开链接由配置的 API 域名生成。

## English

**My Earth map builder — public beta `v0.1.1`.**

A DeepSeek Harness bundle that registers one tool, `create_map`. Call it only when the user
explicitly asks to publish a draft or create a public share link. One call sends exactly one
`POST /api/maps`. For an organize, draft, “show me first” or “give me JSON” request, the agent
builds a local JSON draft with the file tools and does **not** POST. A published map is public
by link: anyone with the URL can open it and follow its sources.

If the request times out, the connection breaks, or a 2xx response has no `shareUrl`, the tool
reports that the creation result is unconfirmed and the map may already be saved. It does not
retry, and the agent must not POST again automatically. If a `shareUrl` is returned with
`coverStatus: "failed"`, deliver the link. Server rejections keep the API message and field
paths.

Install from GitHub — **Plugins** → **Add plugin**:

```
github:junyisunme/dsh-plugin-my-earth#v0.1.1
```

or `dsh plugin --profile <profile> add github:junyisunme/dsh-plugin-my-earth#v0.1.1`.
Then start a new session and ask: *“Turn these five vintage guitar shops in Japan into a map
and generate a public share link.”* `examples/guitar-five.json` is the complete example input.
Configuration: `apiBaseUrl` (defaults to the verified public preview base URL) and `timeoutMs`
(45000). The plugin keeps no local copy, needs no account, and has no dependencies or build
step. Requires DSH 0.2.2-rc.3 or newer (tested there).

## 来源与许可

- 插件代码：[MIT](LICENSE)，© 2026 junyisunme。
- `examples/guitar-five.json` 来自公开仓库 [junyisunme/me-my-earth](https://github.com/junyisunme/me-my-earth) 的 `examples/`，
  属于该仓库允许复用的公开 API 调用示例。
- API 合约见 [me-my-earth `docs/API.md`](https://github.com/junyisunme/me-my-earth/blob/main/docs/API.md)。
- 图标与详情插图为本项目原创绘制。
