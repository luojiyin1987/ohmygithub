# Repository Settings 阶段 4(Code & automation 页)Implementation Plan

> 沿用阶段 2/3 已落地的四层管线与 UI 模式(TabSwitcher + sub 路由已通)。本计划为契约级;实现以既有同型代码为准。REQUIRED SUB-SKILL: superpowers:executing-plans。

**Goal:** `settingsAutomation` 原生化,页内 tab:Branches | Rules | Actions | Runners | Webhooks | Environments | Pages | Custom properties(+ Codespaces↗ / Copilot↗ 作为外链 tab 行为:点击直接开浏览器,不切内容)。

## Task 1: api `repository-settings.automation.ts`(TDD,一个模块承载全部,方法按域分组)

类型(api types.ts + env.d.ts 副本):
- `GitHubBranchProtectionSummary { branch: string; requiredReviews: number | null; requireCodeOwnerReviews: boolean; requiredStatusChecks: string[] | null; strictStatusChecks: boolean; enforceAdmins: boolean; requiredLinearHistory: boolean; allowForcePushes: boolean; allowDeletions: boolean; requiredConversationResolution: boolean; lockBranch: boolean; requiredSignatures: boolean }`
- `GitHubRepositoryRuleset { id: number; name: string; target: string; enforcement: 'active' | 'evaluate' | 'disabled'; rules: string[]; refConditions: string[] }`
- `GitHubActionsSettings { enabled: boolean; allowedActions: 'all' | 'local_only' | 'selected' | null; shaPinningRequired: boolean | null; defaultWorkflowPermissions: 'read' | 'write' | null; canApprovePullRequestReviews: boolean | null; accessLevel: 'none' | 'user' | 'organization' | null; retentionDays: number | null; selectedActions: { githubOwnedAllowed: boolean; verifiedAllowed: boolean; patternsAllowed: string[] } | null }`(各子端点容错为 null)
- `GitHubSelfHostedRunner { id: number; name: string; os: string; status: string; busy: boolean; labels: string[] }`
- `GitHubRepositoryWebhook { id: number; url: string; contentType: string; insecureSsl: boolean; events: string[]; active: boolean; lastResponseStatus: string | null }` + `UpsertRepositoryWebhookInput { url; contentType: 'json' | 'form'; secret?: string; insecureSsl: boolean; events: string[]; active: boolean }`
- `GitHubEnvironmentSettings { name: string; waitTimer: number; preventSelfReview: boolean; reviewers: Array<{ type: 'User' | 'Team'; id: number; name: string }>; branchPolicy: 'protected' | 'custom' | 'all'; customPolicies: Array<{ id: number; name: string; type: 'branch' | 'tag' }> }`
- `GitHubPagesSettings { enabled: boolean; buildType: 'legacy' | 'workflow' | null; sourceBranch: string | null; sourcePath: string | null; cname: string | null; httpsEnforced: boolean; url: string | null; latestBuildStatus: string | null }`
- `GitHubRepositoryCustomPropertyValue { propertyName: string; value: string | string[] | null }`

方法:
- Branches:`listProtectedBranches`(`GET /branches?protected=true` → 逐个 `GET .../{branch}/protection` 汇总 summary,单个失败跳过)、`deleteBranchProtection(branch)`
- Rules:`listRulesets`(GET /rulesets)、`setRulesetEnforcement(id, enforcement)`(GET 单条 → PUT 原样回传仅改 enforcement;PUT body 需带 name/target 等必填字段)、`deleteRuleset(id)`
- Actions:`getActionsSettings`(并行 permissions / selected-actions(仅 selected)/ workflow / access(私有仓库,404 容错)/ artifact-and-log-retention,各自 catch → null 字段)、`updateActionsPermissions({enabled, allowedActions?})`、`updateSelectedActions(input)`、`updateWorkflowPermissions({defaultWorkflowPermissions, canApprovePullRequestReviews})`、`updateAccessLevel(level)`、`updateRetention(days)`
- Runners:`listRunners`、`deleteRunner(id)`
- Webhooks:`listWebhooks`(GET /hooks;lastResponseStatus 取 `last_response.status`)、`createWebhook(input)`、`updateWebhook(id, input)`(secret 为空不发)、`deleteWebhook(id)`、`pingWebhook(id)`
- Environments:`listEnvironmentSettings`(GET /environments → map 保护规则与 branch policy;custom policies 需 `GET .../deployment-branch-policies`)、`upsertEnvironment(name, input)`(PUT;reviewers ≤6)、`deleteEnvironment(name)`、`listEnvironmentBranchPolicies(name)`、`createEnvironmentBranchPolicy(name, {name, type})`、`deleteEnvironmentBranchPolicy(name, id)`(环境名 encodeURIComponent)
- Pages:`getPagesSettings`(GET /pages 404→disabled;latest build 容错)、`enablePages({buildType, sourceBranch, sourcePath})`(POST)、`updatePages(input)`(PUT:cname/https_enforced/build_type/source)、`disablePages`(DELETE)、`requestPagesBuild`(POST /builds)
- Custom properties:`getCustomPropertyValues`(GET /properties/values)、`updateCustomPropertyValues(values)`(PATCH)

测试覆盖:路由与 body 映射、protected 分支多分支汇总与单分支失败跳过、ruleset enforcement 回传、actions 子端点容错 null、webhook secret 省略、pages 404→disabled、env 名 encode。

## Task 2: IPC + preload + env.d.ts(`repository-settings:automation-*`,preload `repositorySettings.automation.*`)

## Task 3: composable(`useRepositoryAutomationQuery` 按 tab 拆:branches/rulesets/actions/runners/webhooks/environments/pages/custom-properties 各一个 query + invalidate;透传函数)

## Task 4: UI `settings/automation/`

- `automation-section.vue`:TabSwitcher 8 内部 tab + codespaces/copilot 两个 ↗ 项(点击 openExternal 不切换);sub 同步(`REPOSITORY_SETTINGS_SUBPAGES.settingsAutomation` 已含 8 个 id)。
- `branches-panel.vue`:受保护分支列表行(分支名 + 摘要 chips)→ 展开只读详情;删除保护(普通确认对话框);「新建/编辑」↗ `/settings/branches`;提示通配符规则需网页查看。
- `rules-panel.vue`:ruleset 行(name/target/enforcement Select 即改/规则数)+ 删除(确认)+ 只读详情展开;「新建/编辑」↗ `/settings/rules`。
- `actions-panel.vue`:permissions 表单(enabled 开关、allowed_actions Select、selected 时 patterns 编辑 + github_owned/verified 开关)、workflow 默认权限(radio read/write + PR 审批开关,409 → 「组织已锁定」提示)、access level Select(仅私有仓库,null 隐藏)、retention 天数 NumberField/Input + Save。
- `runners-panel.vue`:列表(名称/OS/状态/labels chips)+ 删除;「New runner」↗ `/settings/actions/runners/new`。
- `webhooks-panel.vue`:列表行(url、事件 chips、active 点、last response)+ 编辑/删除/ping;框外「添加 webhook」表单或 Dialog(url、content type Select、secret[留空不改]、SSL 开关、events tags-input 或常用事件多选、active 开关)。
- `environments-panel.vue`:环境行(名称、reviewers 数、wait timer、branch policy)+ 编辑 Dialog(wait timer、prevent self review、branch policy radio:all/protected/custom + custom 时 policy 列表增删)+ 删除;环境级 secrets/variables 留到阶段 5 的 Secrets 面板统一处理(本页放说明 + 跳转)。
- `pages-panel.vue`:未启用 → 启用表单(build type、branch+path);已启用 → 状态卡(url、latest build)+ https_enforced 开关 + cname 输入 + Save + 触发构建 + 禁用(确认);可见性 ↗。
- `custom-properties-panel.vue`:属性值行(名称 + 值编辑:string→Input,array→tags,null→清除)+ Save;无属性 → 空态。
- `settings/section.vue` 分流 settingsAutomation;settings-links 删该键。

## Task 5: i18n(`repository.settings.automation.*`)en/zh + playwright 验证(tab 渲染、切 tab sub 变化、webhooks 列表加载)。
