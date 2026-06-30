# Issue / PR Label Colors — 设计文档

- 日期：2026-06-30
- 范围：让标签（label）在 issue 详情侧栏、PR 详情侧栏、issue/PR 列表行显示**真实的 GitHub 颜色**。暗色模式按 GitHub 原版算法渲染（半透明底 + 提亮文字 + 描边），无颜色时回退到现有中性 badge。**纯展示，不含任何 mutation。**
- 明确不做：标签的增删改（label picker / 写操作）属于后续子项目 C；Projects/Type/Relationships 等其它侧栏区块属于子项目 B/C/D，本期不碰。

## 0. 背景：这是一个系列工程的第一步

issue 右侧栏要"对齐 GitHub 截图 + 不是假的"，整体被拆成 4 个互相独立、各自一份 spec→plan→PR 的子项目：

- **A（本文）**：Label 颜色。纯展示，全站受益。
- **B**：补齐只读结构区块（Type、Relationships、Development 接真实数据、Projects/Priority **只读展示**）。
- **C**：核心字段可编辑（Assignees / Labels / Milestone / Type，新增 mutation 层 + picker UI）。
- **D**：Subscribe + 操作菜单（Lock / Pin / Transfer / Delete / Convert）。
- 明确跳过：Projects v2 自定义字段的**可编辑**形态（只在 B 里做只读展示）。

## 1. 目标与决策

1. 标签携带颜色。数据形状从 `labels: string[]` 升级为 `labels: GitHubLabel[]`，其中 `GitHubLabel = { name: string; color: string; description: string | null }`，`color` 是不带 `#` 的 6 位 hex（GitHub GraphQL `Label.color` 的原样）。
2. **上色方案：CSS 变量 + GitHub 原版公式**。JS 只负责把 hex 解析成 `--label-r/g/b/h/s/l` 这几个 CSS 自定义属性内联到元素上，真正的明暗配色交给一段 CSS，用现成的 `.dark` 祖先类切换。好处：与 GitHub 暗色标签逐像素一致、切主题零成本自动重算、JS 不需要监听主题。
3. **渲染收敛到一个组件 `LabelBadge`**。当前标签在 3 处各画各的（`WorkItemLabelList` + `issues/row.vue` + `pulls/row.vue`），后两处还假设 label 是字符串。统一为单个 `LabelBadge`（吃一个 `GitHubLabel`），消除重复并修掉字符串假设。
4. 无颜色（如 inbox 用 `notification.reason` 合成的伪标签、或 mock 缺色）→ 回退到现有中性 badge 样式。
5. `description` 通过原生 `title` 属性做悬浮提示（廉价收益）。
6. **不动 CI runner 标签**：`GitHubActionJob.labels`（如 `ubuntu-latest`）是另一个概念，保持 `string[]`。

## 2. 架构与数据流

沿用现有标签链路，只是把"名字字符串"换成"对象"，并在渲染端新增上色：

```
api/modules/{issues,pulls,inbox}.ts  (GraphQL fragment 加 color/description)
  -> work-items.ts: mapLabels()  (string[] -> GitHubLabel[])
  -> types.ts: GitHubLabel + 各 work-item 类型的 labels 字段
  -> client.ts (真实) / mock.ts (mock)
  -> renderer/env.d.ts  (全局类型镜像)
  -> components/work-item/{types.ts, LabelBadge.vue, work-item-label-list.vue}
  -> 渲染端：issue-sidebar / pull-request-sidebar / issues row / pulls row
```

### 2.1 API 层（`packages/api`）

**`types.ts` 新增类型：**

```ts
export interface GitHubLabel {
  name: string
  color: string                 // 6 位 hex，不带 '#'；未知/合成标签为 ''
  description: string | null
}
```

**`labels: string[]` → `GitHubLabel[]`（5 处，逐一改）：**

- `GitHubPullRequest.labels`（types.ts:520）
- `GitHubIssue.labels`（types.ts:605）
- `GitHubIssueDetail.labels`（types.ts:694）
- `GitHubPullRequestDetail.labels`（types.ts:795）
- `GitHubWorkspaceItem.labels`（types.ts:863）
- **不改**：`GitHubActionJob.labels`（types.ts:430，CI runner 标签）

**`work-items.ts`：**

- `GraphQLLabelConnection`（:6-8）的 node 形状加 `color`、`description`：
  ```ts
  export interface GraphQLLabelConnection {
    nodes?: Array<{ name: string; color?: string | null; description?: string | null } | null> | null
  }
  ```
- `mapLabels`（:49-51）返回 `GitHubLabel[]`：
  ```ts
  export function mapLabels(labels: GraphQLLabelConnection | null | undefined): GitHubLabel[] {
    return (labels?.nodes ?? []).flatMap((label) =>
      label?.name
        ? [{ name: label.name, color: label.color ?? '', description: label.description ?? null }]
        : []
    )
  }
  ```

**GraphQL fragment：`nodes { name }` → `nodes { name color description }`（4 处）：**

- `issues.ts:184-188`（`IssueFields`，list + detail 共用）
- `pulls.ts:317-321`（PR fragment，list + detail 共用）
- `inbox.ts:60-64`（inbox PRs）
- `inbox.ts:83-87`（inbox issues）

**inbox.ts 两个特殊点：**

- `:135` `labels: [notification.reason]` → `labels: [{ name: notification.reason, color: '', description: null }]`
- `:183` 的 inline map（未走 `mapLabels`）→ 改为产出 `GitHubLabel` 对象（与 `mapLabels` 一致）。

### 2.2 颜色工具（纯函数，新建）

新建 `packages/client/src/renderer/components/work-item/label-color.ts`（或同目录合适位置），导出：

```ts
interface LabelColorVars {
  '--label-r': number; '--label-g': number; '--label-b': number
  '--label-h': number; '--label-s': number; '--label-l': number
}
// 解析 6 位 hex -> RGB + HSL 的 CSS 变量；非法/空返回 null（调用方回退中性样式）
export function labelColorVars(color: string): LabelColorVars | null
```

- 输入容错：去掉可能的 `#`、校验 `^[0-9a-fA-F]{6}$`，否则返回 `null`。
- HSL 取整到合理精度，供 CSS `hsl()/hsla()` 使用。

### 2.3 `LabelBadge.vue`（新建，渲染核心）

`packages/client/src/renderer/components/work-item/label-badge.vue`，props：`label: GitHubLabel`。

- 调用 `labelColorVars(label.color)`：
  - 有效 → 渲染一个带 `:style`（内联 6 个 CSS 变量）+ 上色 class 的 pill；`:title="label.description ?? undefined"`。
  - 无效/空 → 回退到现有 `<Badge variant="secondary" size="sm">`（与今天观感一致）。
- 上色 class 的 CSS 实现 GitHub 原版公式（明/暗各一套，用 `.dark` 祖先变体切换）。参照 GitHub/Primer 已公开的 label CSS：

  明色：背景 `rgb(--label-r,g,b)`，文字按感知亮度取黑/白，描边浅。

  暗色（关键差异）：
  ```
  --lightness-threshold: 0.6;
  --background-alpha: 0.18;
  --border-alpha: 0.3;
  --perceived-lightness: calc((var(--label-r)*0.2126 + var(--label-g)*0.7152 + var(--label-b)*0.0722) / 255);
  --lightness-switch: max(0, min(calc((1/(var(--lightness-threshold) - var(--perceived-lightness)))), 1));
  --lighten-by: calc(((var(--lightness-threshold) - var(--perceived-lightness)) * 100) * var(--lightness-switch));

  background: rgba(var(--label-r), var(--label-g), var(--label-b), var(--background-alpha));
  color:        hsl(var(--label-h), calc(var(--label-s)*1%), calc((var(--label-l) + var(--lighten-by))*1%));
  border-color: hsla(var(--label-h), calc(var(--label-s)*1%), calc((var(--label-l) + var(--lighten-by))*1%), var(--border-alpha));
  ```
  实现时以**实际 GitHub 暗色渲染为准**做视觉对照，常量按需校准（截图里的 `feat` 是标准参照）。CSS 落点遵循现有约定：放进 `packages/ui/src/style.css` 或 client 的 `app.css`（实现时按就近原则定，优先 ui 包以便复用）。

### 2.4 渲染端接入（`packages/client`）

- `work-item-label-list.vue`（:36-44）：循环体 `<Badge>` 换成 `<LabelBadge :label="...">`；props 类型从 `WorkItemLabelInput[]` 收敛为 `GitHubLabel[]`（见 §2.5）。
- `issues/row.vue`（:80-91）：`v-for="label in issue.labels"` 的内联 `<Badge variant="outline">{{ label }}</Badge>` → `<LabelBadge :key="label.name" :label="label">`，修掉 `:key="label"` / `{{ label }}` 的字符串假设。
- `pulls/row.vue`（:108-118）：同上。
- `issue-sidebar.vue`：删掉 `labelNames`（:44），改为把规范化后的完整 `GitHubLabel[]` 传给 `WorkItemLabelList`；`normalizeLabels`（:121-132）保留以兼容历史 string 输入，但补上 `color: ''`。
- `pull-request-sidebar.vue`（:40,189-191）：已是透传，类型升级后自动生效。

### 2.5 类型收敛（`work-item/types.ts`）

当前 `WorkItemLabelInput = string | WorkItemLabel`（`{ id?, name }`）。为承载颜色：

- 让组件契约直接用 API 的 `GitHubLabel`（`{ name, color, description }`）。`WorkItemLabelList`、`LabelBadge` 的 props 用 `GitHubLabel[]` / `GitHubLabel`。
- `normalizeLabels`（issue-sidebar）继续负责把任何历史 `string | 对象` 输入补成完整 `GitHubLabel`，保证渲染端只见对象。

### 2.6 `env.d.ts` 镜像

`packages/client/src/renderer/env.d.ts` 手工镜像同步：

- 新增全局 `GitHubLabel` 类型。
- 将 `labels: string[]` → `GitHubLabel[]`：PR(:564)、Issue(:659)、IssueDetail(:757)、PullRequestDetail(:871)。
- （`GitHubActionJob` 的 labels 不动。）

### 2.7 Mock（`packages/api/src/mock.ts`）

- 8 处标签数组改为带真实颜色的对象（:70,82,94,105,1584,1601,1647,1895）。颜色取 GitHub 常见值（如 `bug`→`d73a4a`、`good first issue`→`7057ff`、`triage`→`fbca04` 等），含一个 `description` 样例。
- 过滤逻辑：`pr.labels.includes('review')`（:586）、`issue.labels.includes('triage')`（:673）→ `.some(l => l.name === 'review'/'triage')`。
- timeline `labeled` 事件：`issue?.labels[0] ?? 'triage'`（:1954）→ 取 `.name`。
- 不动：`labels: ['ubuntu-latest']`（:1515，CI runner）。

## 3. 错误处理与边界

- `color` 为空字符串、非 6 位 hex、含非法字符 → `labelColorVars` 返回 `null` → `LabelBadge` 回退中性样式，绝不报错。
- 标签名为空 → `mapLabels` / 渲染层照旧过滤掉。
- 主题切换（auto/light/dark）由 `.dark` 祖先类驱动，CSS 自动重算，组件无需感知。

## 4. 测试

- **`labelColorVars` 单测**（纯函数）：正常 hex（带/不带 `#`、大小写）、空串、非法长度、非法字符 → 期望的 RGB/HSL 或 `null`；几个已知颜色的 HSL 取值快照。
- **`mapLabels` 单测**：含 color/description、缺 color、空 nodes、name 为空被过滤。
- **`LabelBadge` 组件测试**（若仓库已有组件测试设施，planning 阶段确认）：有色 → 渲染内联 CSS 变量 + title；无色 → 回退中性 badge。
- **视觉核对**：对照 GitHub 暗色实际渲染校准常量（`feat` 标签为基准参照）。

## 5. 影响面小结

- API：`types.ts`(+1 类型/5 字段改)、`work-items.ts`(2)、`issues.ts`/`pulls.ts`/`inbox.ts`(fragment + inbox 2 特殊点)、`mock.ts`(8 + 3 处逻辑)。
- Client：新增 `label-color.ts` + `label-badge.vue`；改 `work-item-label-list.vue`、`work-item/types.ts`、`issues/row.vue`、`pulls/row.vue`、`issue-sidebar.vue`、`env.d.ts`；新增上色 CSS（ui 包优先）。
- 全站收益：issue/PR 列表、两个详情侧栏的标签一并上色。
