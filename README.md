# My Earth 建图 · `dsh-plugin-my-earth`

**公开测试版 `v0.1.0`** ｜ [English](#english) ｜ [完整示例](#完整例子把这五家日本古董吉他店做成一张地图)

把地点数据变成一张可分享的 My Earth 交互地图。跟 agent 说一句话，它调用 `create_map`，
插件把标题和地点列表发到公开的 My Earth API，拿回**地图链接**和**1200×630 封面图链接**。

- 一张地图 = 一个分享链接，拿到链接的人直接打开，不需要账号或 API key。
- 封面图生成失败时，**仍然返回可用的地图链接**（`coverStatus: "failed"`），不会整单失败。
- API 地址是可配置项，默认使用 `me-my-earth` 公开 [`docs/API.md`](https://github.com/junyisunme/me-my-earth/blob/main/docs/API.md) 里验证过的建图预览地址。
- 安装包只依赖**公开 API**和**公开示例**：没有私有服务、没有私有依赖、没有构建脚本。

## 它做什么

| 项 | 值 |
| --- | --- |
| 工具名 | `create_map` |
| 输入 | 符合公开 API 合约的地图数据：`title` + `events`（每个事件含 `source` 与 1–30 个 `locations`） |
| 输出 | `shareUrl`、`previewImageUrl`、`coverStatus`，外加 `mapId`、`coverError` 和 `eventCount`/`countryCount`/`cityCount` |
| 副作用 | 向配置里的公开 API 发一次 `POST /api/maps`；插件不在本地保存任何副本 |
| 关闭插件后 | `create_map` 工具从会话里消失，已生成的地图不受影响 |

## 安装

需要 DeepSeek Harness。本版本在 **DSH `0.2.2-rc.3`** 上实测通过；包是纯 ESM，无运行时依赖、无 build 脚本，所以 git 安装不需要 `allowBuilds` 授权。

### 方式一：在 Plugins 页面添加（推荐）

打开 **Plugins** → **Add plugin**，粘贴：

```
github:junyisunme/dsh-plugin-my-earth#v0.1.0
```

### 方式二：让 agent 安装

```
用 plugin_manager 安装 github:junyisunme/dsh-plugin-my-earth#v0.1.0
```

### 方式三：命令行

```sh
dsh plugin --profile <profile> add github:junyisunme/dsh-plugin-my-earth#v0.1.0
```

`#v0.1.0` 是发布标签。要按不可变提交安装（推荐，避免后续 push 改变实际执行的代码），
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

## 完整例子：把这五家日本古董吉他店做成一张地图

示例数据就是仓库里的 [`examples/guitar-five.json`](examples/guitar-five.json)，
与 `me-my-earth` 仓库的公开示例一致（东京 3 家 + 大阪 2 家）。

**第 1 步**，把这个文件放到工作目录，或者让 agent 直接读仓库里的那份。

**第 2 步**，对 agent 说：

> 把这五家日本古董吉他店做成一张地图

**第 3 步**，agent 会调用 `create_map`（参数就是上面的字段结构），拿回：

<!-- VERIFIED-RESULT -->

**第 4 步**，打开 `shareUrl` 就是交互地图；`previewImageUrl` 是同一张地图的 1200×630 封面图，
可以直接贴到聊天、文档或社交媒体。封面返回 `failed` 时只把 `shareUrl` 发出去就行。

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
- 请求体上限 **512 KB**，最多 **100 个事件**，每个事件最多 **30 个地点**。
- 公开 API 会拒绝未知国家 ID、重复事件 ID、未知或不匹配的 `placeId`、非法坐标和控制字符；这类错误会带着具体字段路径返回给 agent，方便它改完重试。
- 封面生成是尽力而为：失败不影响地图本身。
- 插件本身不缓存、不落地任何地图数据。

## 兼容性

- 实测环境：DeepSeek Harness `0.2.2-rc.3`。
- 纯 ESM、零依赖、无 `prepare`/`build` 脚本，git 安装不需要 pnpm 的 build 授权。
- 只用到 DSH 的公开扩展点：`ctx.tools.register()`（Host 侧工具注册）与 loader 补丁。

## English

**My Earth map builder — public beta `v0.1.0`.**

A DeepSeek Harness bundle that registers one tool, `create_map`. Give it place data
(a map `title` plus `events` with `source` and 1–30 `locations`, matching the public
My Earth map contract) and it posts that document to a configurable public My Earth API,
returning a shareable `shareUrl`, a public 1200×630 `previewImageUrl`, and `coverStatus`.
If the cover cannot be generated the map still exists, so the tool returns the working
link with `coverStatus: "failed"` instead of failing.

Install from GitHub — **Plugins** → **Add plugin**:

```
github:junyisunme/dsh-plugin-my-earth#v0.1.0
```

or `dsh plugin --profile <profile> add github:junyisunme/dsh-plugin-my-earth#v0.1.0`.
Then start a new session and ask: *“Turn these five vintage guitar shops in Japan into a map.”*
`examples/guitar-five.json` is the complete example input. Configuration: `apiBaseUrl`
(defaults to the verified public preview base URL) and `timeoutMs` (45000).
Maps are shared by link and are public; the plugin keeps no local copy, needs no account,
and has no dependencies or build step. Requires DSH 0.2.2-rc.3 or newer (tested there).

## 来源与许可

- 插件代码：[MIT](LICENSE)，© 2026 junyisunme。
- `examples/guitar-five.json` 来自公开仓库 [junyisunme/me-my-earth](https://github.com/junyisunme/me-my-earth) 的 `examples/`，
  属于该仓库允许复用的公开 API 调用示例。
- API 合约见 [me-my-earth `docs/API.md`](https://github.com/junyisunme/me-my-earth/blob/main/docs/API.md)。
- 图标与详情插图为本项目原创绘制。
