# Repository Settings 阶段 3(Access 页)Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans。沿用阶段 2 的四层管线模式(api module → main IPC → preload/env.d.ts → composable → UI),此计划只列增量与接口契约;实现细节以阶段 2 已落地的同型代码为准。

**Goal:** `settingsAccess` 分类页原生化:Collaborators(含邀请)/ Teams(org 仓库)/ Moderation(interaction limits),页内 TabSwitcher 与 URL `sub` 参数双向同步;Code review limits 与 Reported content 保持 ↗ 外链。

## Global Constraints

同阶段 2(测试/typecheck 门槛、i18n en/zh、`@`→`{'@'}`、bordered 只放列表行、Select 用 reka-ui、env.d.ts 手工副本、commit 加 Co-Authored-By、完成后需重启 dev 实例)。

### Task 1: api 模块 `repository-settings.access.ts`(TDD)

- 新类型(api types.ts + env.d.ts 副本):
  - `GitHubRepositoryCollaborator { login: string; avatarUrl: string; roleName: string; htmlUrl: string }`
  - `GitHubRepositoryInvitation { id: number; inviteeLogin: string | null; inviteeAvatarUrl: string | null; permissions: string; createdAt: string | null; htmlUrl: string }`
  - `GitHubRepositoryTeamAccess { slug: string; name: string; permission: string; org: string }`
  - `GitHubRepositoryAccessOverview { ownerType: 'User' | 'Organization'; collaborators: GitHubRepositoryCollaborator[]; invitations: GitHubRepositoryInvitation[]; teams: GitHubRepositoryTeamAccess[] }`
  - `GitHubRepositoryCollaboratorRole = 'pull' | 'triage' | 'push' | 'maintain' | 'admin'`
- `RepositorySettingsAccessApi`(挂到 GitHubApi 为 `repositorySettingsAccess`):
  - `getAccessOverview(o)`:并行 `GET /users/{owner}`(取 ownerType)、`GET /repos/{o}/{r}/collaborators?affiliation=direct&per_page=100`、`GET /repos/{o}/{r}/invitations?per_page=100`、`GET /repos/{o}/{r}/teams?per_page=100`(User 仓库该项容错为 [])
  - `addCollaborator(o & {username, permission})` → `PUT .../collaborators/{username}`(201=invited/204=added,返回 `'invited' | 'added'`)
  - `updateCollaborator` 同 PUT;`removeCollaborator` → DELETE
  - `updateInvitation(o & {invitationId, permissions})` → PATCH;`cancelInvitation` → DELETE
  - `addOrUpdateTeam({org, teamSlug, owner, repo, permission})` → `PUT /orgs/{org}/teams/{team_slug}/repos/{owner}/{repo}`;`removeTeam` → DELETE 同路径
  - `getInteractionLimits(o)` → `GET /repos/{o}/{r}/interaction-limits`(空对象→null,复用 `GitHubInteractionLimits` 类型);`setInteractionLimits(o & {limit, expiry?})` → PUT;`clearInteractionLimits(o)` → DELETE
- 测试:路由/参数/201 vs 204 分支/空 interaction-limits → null/teams 404 容错。

### Task 2: main IPC + preload + env.d.ts

- `repository-settings:access-*` 通道 ×9,加进 `main/repository-settings.ts`;preload `repositorySettings.access.*`;env.d.ts 桥类型与全局类型副本。

### Task 3: composable 扩展 `use-repository-settings.ts`

- `useRepositoryAccessOverviewQuery(owner, repo, enabled)`(key `[... 'settings','access', owner, repo]`,staleTime 30s)
- `useRepositoryInteractionLimitsQuery(owner, repo, enabled)`
- 平凡透传函数 ×9 + `invalidateAccessOverview` / `invalidateInteractionLimits`。

### Task 4: UI `settings/access/`

- `access-section.vue`:TabSwitcher(collaborators | teams | moderation;User 仓库隐藏 teams),`v-model:activeTab` 与 props `settingsSub` / emit `update:settingsSub` 同步。
- `collaborators-panel.vue`:框外添加表单(username Input + role Select + 添加按钮;201 → toast invited);bordered 列表 = 协作者行(avatar+login+role Select 即改+移除按钮)、其后 pending invitations 行(标注 Pending、permissions Select、取消按钮)。
- `teams-panel.vue`:框外添加表单(team slug + permission Select);bordered 列表 = team 行(name/slug + permission Select 即改 + 移除)。org 取 owner。
- `moderation-panel.vue`:interaction limits 单选组(off/existing_users/contributors_only/collaborators_only)+ expiry Select + Save(仿 Settings 窗口 interaction-limits-settings.vue 的交互,409 → 就地提示 org/user 级限制已生效);底部 Code review limits ↗ `/settings/review_limits`、Reported content ↗ `/settings/reported_content`。
- `settings/section.vue` 分流 `settingsAccess` → AccessSection 并透传 sub;`settings-links.ts` 删 `settingsAccess` 键。
- **URL sub 接线**(一次性,所有分类共用):`SettingsSection` 增加 props `settingsSub?: string`、emit `update:settingsSub`;repository-page 传 `props.tab.repositorySettingsSub`,收到事件后 `emit('replaceActiveUrl', createRepositoryWorkspaceUrl(owner, repo, activeSection, sub))`。

### Task 5: i18n(`repository.settings.access.*`)en/zh + 验证

- 自动化验证:playwright 脚本导航 `?tab=settings-access`,断言 collaborators 列表渲染、TabSwitcher 存在、切 tab 后 URL sub 变化;截图。
- 不在真实仓库执行写操作(添加/移除协作者等由单测覆盖)。
