# 多账号管理与切换设计

日期:2026-07-06
状态:已确认

## 目标

支持同时保存多个 GitHub 账号(OAuth 设备流或 Personal Token)并快速切换:

- auth.json 升级为多账号格式(v2),自动迁移旧格式。
- 登录页:左上角返回按钮(仅从工作区 Add Account 进入时显示)+ 已有账号列表点击直接切换。
- User Panel:Appearance 下方新增其他账号列表(头像 + 显示名 + @login,点击切换)与 Add Account 入口。
- 退出登录:从 auth.json 删除当前账号条目,跳转登录页(登录页展示剩余账号)。

## 已确认的决策

- 退出登录后**跳转登录页**(不自动切到下一个账号),由用户在登录页手动选择。
- 书签(bookmarks.json)本次**保持全局共享**,不做账号隔离。
- 切换机制采用**软重载**(清缓存 + 路由回工作区首页 + `:key` 强制重建组件树),不做整窗 reload。
- 明文存储与 0600 权限维持现状,safeStorage 加密不在本次范围。

## 1. auth.json v2 格式与迁移

路径不变:`~/.oh-my-github/auth.json`,权限 0600。

```jsonc
{
  "schemaVersion": 2,
  "activeAccountId": 12345,          // GitHub user id;null = 未登录(accounts 可能非空)
  "accounts": [
    {
      "method": "oauth_device",      // 或 "personal_token"
      "accessToken": "gho_...",
      "tokenType": "bearer",
      "scopes": ["repo", "..."],
      "viewer": { "id": 12345, "login": "acbox", "name": "Acbox", "avatarUrl": "..." },
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

- **迁移**:读取时发现 schemaVersion 1 → 包装为 v2(`activeAccountId = viewer.id`,原条目进 accounts)并立即写回,用户无感。
- **去重**:登录成功后按 `viewer.id` 匹配已有条目;存在则原地更新(accessToken/method/tokenType/scopes/viewer/updatedAt,保留 createdAt),不存在则追加;两种情况均设为 active。
- **解析失败/未知版本**:维持现状语义,视为未登录(不删除文件)。
- config.json 的 `github.activeAccountLogin`(从未被读取)正式弃用,active 指针唯一来源为 auth.json;该字段保持原样不再维护。

## 2. 主进程(main/auth.ts)与 IPC

- `StoredAuth` 拆分为文件级 `StoredAuthFile`(v2)与条目级 `StoredAccount`;`readStoredAuth`/`writeStoredAuth`/`normalizeStoredAuth` 相应改造并承担 v1 迁移。
- `getAuthenticatedAccessToken()` / `getAuthenticatedViewerLogin()` / `getAuthenticatedAuthMetadata()` 改为取 **active 账号**;其余所有 main 模块(Octokit 构建等)零改动。
- `AuthState` 扩展:

```ts
interface AccountSummary {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  method: AuthMethod
}

interface AuthState {
  isAuthenticated: boolean            // 存在 active 账号
  path: string
  auth: Omit<StoredAccount, 'accessToken'> | null   // active 账号(去 token)
  accounts: AccountSummary[]          // 全部账号摘要,永不含 token
  hasGitHubClientId: boolean
}
```

- 新增 IPC `auth:switch-account (accountId: number)`:校验账号存在 → 更新 `activeAccountId` → 返回新 AuthState。**不做网络校验**(离线可切);token 已吊销时进入工作区后请求 401,用户在登录页重新登录同账号即覆盖修复。
- `auth:logout` 语义变更:删除 active 条目 + `activeAccountId = null`,保留其余账号;accounts 变空时保留空的 v2 结构文件。
- preload 暴露 `auth.switchAccount(accountId)`,`env.d.ts` 同步 `AuthState`/`AccountSummary`/bridge 类型。

## 3. 渲染层状态源与软重载

- 新增 Pinia store `stores/auth.ts`:持有响应式 `AuthState`,提供 `refresh()`(IPC `auth:get`)、`switchAccount(id)`、`logout()`;App 启动时加载。登录页 OAuth/PAT 成功后也经该 store 刷新。
- 路由守卫维持现状(每次导航 IPC 直读),仅新增一条:已认证访问 `/auth` 且带 `?add=1` 时**允许停留**(现状是强制弹回工作区)。
- **软重载切换流程**(store.switchAccount 内):
  1. `await` IPC `auth:switch-account`,更新 store 状态;
  2. `useQueryCache().invalidateQueries({ key: ['github'] })` 使整个 `['github']` 前缀的 Pinia Colada 查询缓存失效,不残留旧账号数据;
  3. `router.replace` 到工作区首页(workspace-root);
  4. `App.vue` 顶层 `<RouterView :key="activeAccountId">` 强制整棵组件树重建,workspace-page 的 viewer ref 等本地状态随重挂载重置。
- 未登录时 key 为 null,登录/退出同样触发重建,行为一致。

## 4. 登录页(pages/auth/auth-page.vue)

- **返回按钮**:页面左上角,仅当 `isAuthenticated`(存在 active 账号,即从工作区 Add Account 进入)时显示;点击返回工作区(`router.back()`,兜底 replace 到 workspace-root)。按钮置于标题栏拖拽区内需 `-webkit-app-region: no-drag`。首次使用或已退出(无 active 账号)不显示。
- **账号列表**:`accounts` 非空时,登录卡片下方渲染 "Switch account" 区块;每项头像 + 显示名 + @login,点击 → `store.switchAccount(id)` → 进入工作区。active 账号(若存在,即 Add Account 场景)标记为当前且不可点击。
- OAuth / PAT 表单与状态机不变;成功后写入变为"追加/更新账号并设为 active",随后同现有逻辑跳转(`?redirect=` 仍生效)。

## 5. User Panel(workspace-user-panel.vue)

菜单结构(自上而下):

1. Profile / Settings / Appearance(不变)
2. `DropdownMenuSeparator`
3. **其他账号列表**:非 active 账号,每项头像 + 显示名 + @login,点击 `store.switchAccount(id)`(active 账号已在面板触发器展示,不重复列出);无其他账号时该区块整体隐藏
4. **Add Account**(UserPlus 图标)→ `router.push('/auth?add=1')`
5. `DropdownMenuSeparator`
6. **Log Out**(不变的位置与样式)→ `store.logout()` → `router.replace('/auth')`,登录页展示剩余账号

## 6. 边界情况

- 删除最后一个账号:accounts 为空 + active null → 登录页呈首次使用态(无返回按钮、无账号列表)。
- 切到已吊销 token 的账号:界面请求报错(401),重新登录同账号覆盖即可,无专门恢复流程。
- Add Account 登录了已存在的账号:按 viewer.id 覆盖更新并切为 active,不产生重复条目。
- auth.json 手工损坏:视为未登录,不主动删文件。

## 7. i18n 与验证

- `en.json` / `zh.json` 新增:`auth.switchAccount`(区块标题)、`auth.back`(返回按钮 aria/文案)、`workspace.userMenu.addAccount` 等 key。
- 仓库无测试基建,验证方式:`pnpm typecheck` + 手动走查 —— v1 文件启动自动迁移、添加第二账号、User Panel 切换、登录页切换、退出登录回登录页并显示剩余账号、删空所有账号回首次使用态。
