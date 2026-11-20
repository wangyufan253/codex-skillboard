# Codex Skillboard

**让安装过的 Skill，进入真正需要它的对话。**

A local-first skill workbench for Codex. Discover installed skills, browse recommendations, select skills per conversation, and inspect delivery and read evidence.

面向 macOS Codex 的本地 Skill 工作台。按「项目 → 对话」管理 Skill 选择，通过紧凑分类卡片查看个人安装项、推荐、全局候选开关、使用记录和来源仓库 Stars。界面目前使用简体中文；推荐在本机运行，无需 OpenAI API Key。

这是独立开源项目，不隶属于 OpenAI。当前版本为早期版本，主要在 macOS 验证。

## 可以做什么

- **发现**：扫描个人安装的 Skill，排除内置项和插件缓存，按设计、开发、研究、文档等分类。
- **选用**：为指定对话保存一组 Skill，下一条消息通过 Hook 提供说明，其他对话不继承。
- **辨别状态**：区分「允许自动选用」「本对话已选」「说明已交付」「观察到读取」。
- **比较**：按选用次数、观察到读取次数或来源仓库 Stars 排序，未知数据保持未知。
- **对话内查询**：通过 MCP 查询、推荐、读取 Skill，并打开完整工作台。

## 启动

需要 Node.js 24 或更新版本，以及 PATH 中可执行的 `codex`。已验证 Codex CLI `0.165.0-alpha.1.2`；使用了 `skills/config/write`、`project/list`、`thread/list` 与 Hooks，后续宿主接口变化可能需要适配。其他系统尚未验证。

```sh
git clone https://github.com/wangyufan253/codex-skillboard.git
cd codex-skillboard
npm ci
npm start
```

启动后，打开终端输出的本机地址。服务只监听本机，不同电脑之间互不占用端口；如果本机端口冲突，可设置 `SKILL_WORKBENCH_PORT` 换用一个空闲端口。安装 MCP／Hook 接入时使用相同的端口设置，安装程序会保存该设置。

## 接入 Codex

```sh
npm run install:codex
```

安装程序会：

- 注册 `skill-workbench` 本地 MCP 服务。
- 在 `$CODEX_HOME/hooks.json` 中追加消息提交与读取观测两个 Hook，保留已有 Hook。
- 在项目 `.local/backups/` 中备份原有全局配置和 Hook 文件。
- 启动本地管理服务；以后 MCP 查询或消息 Hook 运行时会按需启动它。

安装前可先浏览界面和源码。安装命令会写入用户全局 Codex 配置；普通 `npm ci` 不会注册 MCP 或 Hook。安装后请保持仓库路径稳定，移动仓库需要重新核对注册路径。

**需要在 Codex 中完成一次宿主信任操作**：选择输入框附近的 **Review hooks**，或打开 **设置 > Hooks**，查看并信任工作台新增的两个 Hook。MCP 通常需要新聊天或重启 Codex 才加载。安装程序不会篡改 Hook 信任记录。

安装完之后，在 Codex 中可以说：

> 用 skill-workbench 查询适合当前任务的 Skill，打开当前对话的工作台。

自动 Hook 会为每条消息登记真实对话 ID、检索新候选，并提供绑定本对话的工作台链接。不要用另一个聊天的 ID 保存当前聊天的选择。

## 能力和状态含义

| 功能 | 行为 |
|---|---|
| 扫描 | 仅读取 `~/.agents/skills` 与 `$CODEX_HOME/skills` 的个人安装项；排除隐藏系统目录与插件缓存。支持目录链接，按真实文件路径去重；同名不同路径保留。不会执行 Skill 脚本。 |
| 发现状态 | 用官方 `skills/list` 在新运行时中核对。与磁盘存在、全局配置、当前聊天是否已加载分别展示。 |
| 分类 | 根据名称和用途初步归类为设计、开发、研究、文档、其他；可在详情里手动修正。 |
| 推荐 | 本地词项匹配、中文用途词扩展和分类匹配；不给出伪造的“准确率百分比”。候选与全局状态无关，方便重新发现禁用项；不会自动勾选。 |
| 对话选择 | 保存到本机数据库。受信任的 UserPromptSubmit Hook 在该聊天下一条消息中提供选定的完整说明；其他聊天不继承。超出说明预算的项会要求通过 `load_skill` 完整读取，不静默截断。 |
| 临时选用 | 不改全局配置，即使该 Skill 全局禁用，也可通过本对话的 Hook 或 MCP 提供说明。不会把开关短暂打开后再恢复。 |
| 清除选择 | 停止在后续消息中继续提供说明；无法抹除已经进入模型上下文的说明。 |
| 全局启停 | 官方 `skills/config/write` 写入用户全局配置，并核对保存结果，保留备份。已有聊天的上下文不会因此自动撤回，界面不声称即时生效。 |
| 使用频次 | 分开记录明确选用、Hook 输出说明、可观察加载。加载仅包括 MCP 返回完整说明以及 Hook 可确认的成功文件读取；不是成功执行次数，也不声称覆盖所有使用。 |
| Stars | 来源仓库的 GitHub Stars，按仓库共享和缓存 24 小时。来源依据来自安装锁文件、显式仓库元数据、Skill 自身 Git origin 或手动输入；不会从正文中的任意 GitHub 链接推断。失败保留已有缓存，未知不记作 0。 |

当前对话的选择会持续到替换或清除。已选 Skill 与 Codex 自身的自动选择机制共存。

顶部按「项目 → 对话」选择管理对象：通过本机 Codex 的 `project/list`、`thread/list` 获取项目名和未归档的交互对话标题，仅读取元数据，不拉取完整聊天。接口要求本地连接声明 `experimentalApi` 能力。列表每 30 秒重新读取，点击「刷新目录」可立即刷新。优先使用明确项目归属，否则按最长匹配的项目目录归组；无匹配项目的目录单列为「未归属项目」。ID 和归组依据收在「对话信息」内。

项目只是分组，不保存项目级 Skill 选择。切换项目后需明确选择对话，未保存的勾选按各自对话保留。新选择的本地对话可先保存 Skill；需在该对话再发一条消息，Hook 才会交付说明。项目或标题接口不可用时会提示，并保留已知对话供查询；不会把别的对话自动当作当前对话。

项目—对话管理区不展示当前任务或消息摘要，也不使用消息内容兜底对话名称；来源未返回名称时标为「未命名对话」。手动检索用途只放在「本对话推荐 → 手动查询推荐」中，默认折叠、留空；自动推荐仍依据对话消息进行。

卡片上的「允许自动选用」是全局候选开关，不代表已经加载；Skill 自身的调用策略仍生效。左上角勾选要保存后才算「本对话已选」，未保存时标为「待保存选用／移除」。卡片和底部单独展示本对话的说明交付、读取观测记录，并与所有对话累计次数分开；这些记录不受排行榜时间筛选影响。

「说明已交付」表示本对话中 Hook 曾输出完整说明，或 MCP 曾返回完整说明；「观察到读取」表示 MCP 返回说明或 Hook 确认过成功文件读取。两者均不代表执行成功，未观察到也不能证明未使用。清除选择不会撤回历史交付。推荐输入会剔除 Codex 自动附带的 `in-app-browser-context` 区块；历史任务在展示和推荐前同样清理。

## 数据与恢复

数据保存在项目的 `.local/` 中，数据库目录限制为当前用户访问，且被 Git 忽略。内容包括聊天绑定、当前任务片段、选择、统计证据、分类和仓库缓存。不会上传聊天或 Skill 内容；联网请求只查询已确认的 GitHub 仓库标识。

可设置 `SKILL_WORKBENCH_HOME` 更换数据目录，`SKILL_WORKBENCH_PORT` 更换端口，`SKILL_WORKBENCH_CODEX` 指定 Codex 可执行路径。`CODEX_HOME` 遵循 Codex 的默认约定。

```sh
npm run uninstall:codex
```

卸载只移除本工作台注册的 MCP 与 Hook，不删除原有配置、Skill 文件或统计数据。恢复全局配置前，可以查阅 `.local/backups/`；不要在其他程序仍修改配置时直接覆盖整个文件。

## 验证

```sh
npm test
```

测试覆盖 YAML 解析、目录过滤和去重、配置优先级、中文推荐、聊天隔离、禁用项临时选用、证据去重、GitHub 缓存、HTTP 写入校验、MCP stdio 调用和安装/卸载幂等性。真实 Codex 配置写入测试使用独立临时 `CODEX_HOME`，不会修改使用者的配置，也不会调用模型。

集成依据：[Codex App Server](https://learn.chatgpt.com/docs/app-server)、[Hooks 与信任机制](https://learn.chatgpt.com/docs/hooks)。

## 开发与反馈

`npm run dev` 启动开发服务。`npm test` 包含需要本机 Codex CLI 的隔离集成测试。浏览器回归测试的运行方式见 [开发测试说明](docs/testing.md)。

欢迎提交 [Issue](https://github.com/wangyufan253/codex-skillboard/issues) 或 Pull Request。提交问题时请附 Node、Codex 和操作系统版本，并删除日志里的聊天、个人路径与凭据。涉及私密信息时参见 [安全与隐私说明](SECURITY.md)。

## 许可证

[MIT](LICENSE)。仓库不包含用户安装的第三方 Skill、用户数据库或 Codex 配置备份。运行时依赖及安装的 Skill 分别遵循各自许可证。
