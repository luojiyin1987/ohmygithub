# 多账号管理与切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** auth.json 升级为多账号 v2 格式(自动迁移 v1),支持保存多个 OAuth/PAT 账号;登录页与 User Panel 均可一键切换账号(软重载,不闪白屏);退出登录只删除当前账号并回到登录页。

**Architecture:** main 进程新增纯函数模块 `auth-store.ts`(v1→v2 迁移、按 viewer.id upsert/remove/setActive,vitest 覆盖),`auth.ts` 只保留 fs/IPC 编排;renderer 新增 Pinia store `stores/auth.ts`(唯一响应式 AuthState 源)与 `useAuthActions` composable(切换/登录/退出统一走 `isSwitching` 门控:先卸载 `<RouterView v-if>` → 整体移除 `['github']` 查询缓存条目 → 导航 → 重挂载)。spec 见 `docs/superpowers/specs/2026-07-06-multi-account-design.md`。

**Tech Stack:** Electron main + preload(contextBridge/IPC)、Vue 3 `<script setup>` + TypeScript、Pinia + Pinia Colada 1.3.1(`getEntries`/`remove`)、vue-i18n(en/zh)、vitest、pnpm workspace。

## Global Constraints

- 每个 Task 结束必须通过:`pnpm --filter @oh-my-github/client typecheck`;含测试的 Task 还要 `pnpm --filter @oh-my-github/client test`。
- i18n:新文案必须同时进 `en.json` 和 `zh.json`,且保持各对象内 key 的字母序;文案里的 `@` 必须写成 `{'@'}`(`locales.test.ts` 守护)。
- 图标一律 `lucide-vue-next`。
- Commit 用 conventional commits,消息末尾加 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`;直接提交到 main,不建分支。
- 提交前先 `git branch --show-current` 确认在 main;用户可能并行提交,提交前查看 `git status` 只 add 本任务文件。
- 用户本地跑着 HMR dev 实例;UI 改动直接改,不做额外的自动化 UI 验证。
- token 永不跨 IPC:`AuthState.auth` 与 `AuthState.accounts` 均不得含 `accessToken`。

---

### Task 1: main 纯函数模块 auth-store.ts(TDD)

**Files:**
- Create: `packages/client/src/main/auth-store.ts`
- Test: `packages/client/src/main/auth-store.test.ts`

**Interfaces:**
- Consumes: `GitHubAuthViewer`(`@oh-my-github/api`,`{ id: number; login: string; name: string | null; avatarUrl: string }`)
- Produces(Task 2 依赖,签名逐字):
  - `type AuthMethod = 'oauth_device' | 'personal_token'`
  - `interface StoredAccount { method: AuthMethod; accessToken: string; tokenType: string; scopes: string[]; viewer: GitHubAuthViewer; createdAt: string; updatedAt: string }`
  - `interface StoredAuthFile { schemaVersion: 2; activeAccountId: number | null; accounts: StoredAccount[] }`
  - `interface AccountSummary { id: number; login: string; name: string | null; avatarUrl: string; method: AuthMethod }`
  - `createEmptyAuthFile(): StoredAuthFile`
  - `normalizeStoredAuthFile(raw: unknown): StoredAuthFile | null`(v1 对象→迁移为 v2;损坏→null)
  - `upsertAccount(file: StoredAuthFile, input: { method: AuthMethod; accessToken: string; tokenType: string; scopes: string[]; viewer: GitHubAuthViewer }, now: string): StoredAuthFile`
  - `removeAccount(file: StoredAuthFile, accountId: number): StoredAuthFile`
  - `setActiveAccount(file: StoredAuthFile, accountId: number): StoredAuthFile`(未知 id 抛错)
  - `getActiveAccount(file: StoredAuthFile | null): StoredAccount | null`
  - `toAccountSummaries(file: StoredAuthFile | null): AccountSummary[]`

- [ ] **Step 1: 写失败测试**

创建 `packages/client/src/main/auth-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  createEmptyAuthFile,
  getActiveAccount,
  normalizeStoredAuthFile,
  removeAccount,
  setActiveAccount,
  toAccountSummaries,
  upsertAccount,
  type StoredAuthFile,
} from './auth-store'

const NOW = '2026-07-06T00:00:00.000Z'
const LATER = '2026-07-06T12:00:00.000Z'

function makeViewer(id: number, login: string) {
  return { id, login, name: `Name ${login}`, avatarUrl: `https://avatars.example/${login}` }
}

function makeInput(id: number, login: string) {
  return {
    method: 'oauth_device' as const,
    accessToken: `token-${login}`,
    tokenType: 'bearer',
    scopes: ['repo'],
    viewer: makeViewer(id, login),
  }
}

function makeFile(): StoredAuthFile {
  let file = createEmptyAuthFile()
  file = upsertAccount(file, makeInput(1, 'alice'), NOW)
  file = upsertAccount(file, makeInput(2, 'bob'), NOW)
  return file
}

describe('normalizeStoredAuthFile', () => {
  it('migrates a v1 single-account file to v2', () => {
    const v1 = {
      schemaVersion: 1,
      method: 'personal_token',
      accessToken: 'token-alice',
      tokenType: 'bearer',
      scopes: [],
      viewer: makeViewer(1, 'alice'),
      createdAt: NOW,
      updatedAt: NOW,
    }

    const file = normalizeStoredAuthFile(v1)

    expect(file).toEqual({
      schemaVersion: 2,
      activeAccountId: 1,
      accounts: [
        {
          method: 'personal_token',
          accessToken: 'token-alice',
          tokenType: 'bearer',
          scopes: [],
          viewer: makeViewer(1, 'alice'),
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })
  })

  it('parses a v2 file and drops invalid account entries', () => {
    const file = normalizeStoredAuthFile({
      schemaVersion: 2,
      activeAccountId: 2,
      accounts: [
        { method: 'oauth_device', accessToken: '', viewer: makeViewer(1, 'alice') },
        {
          method: 'oauth_device',
          accessToken: 'token-bob',
          tokenType: 'bearer',
          scopes: ['repo'],
          viewer: makeViewer(2, 'bob'),
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })

    expect(file?.accounts.map((account) => account.viewer.login)).toEqual(['bob'])
    expect(file?.activeAccountId).toBe(2)
  })

  it('nulls activeAccountId when it matches no account', () => {
    const file = normalizeStoredAuthFile({
      schemaVersion: 2,
      activeAccountId: 99,
      accounts: [
        {
          method: 'oauth_device',
          accessToken: 'token-alice',
          tokenType: 'bearer',
          scopes: [],
          viewer: makeViewer(1, 'alice'),
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    })

    expect(file?.activeAccountId).toBeNull()
  })

  it('returns null for corrupt input', () => {
    expect(normalizeStoredAuthFile(null)).toBeNull()
    expect(normalizeStoredAuthFile('nope')).toBeNull()
    expect(normalizeStoredAuthFile({ schemaVersion: 1 })).toBeNull()
    expect(normalizeStoredAuthFile({ schemaVersion: 1, accessToken: 'x' })).toBeNull()
  })
})

describe('upsertAccount', () => {
  it('appends a new account and makes it active', () => {
    const file = upsertAccount(createEmptyAuthFile(), makeInput(1, 'alice'), NOW)

    expect(file.activeAccountId).toBe(1)
    expect(file.accounts).toHaveLength(1)
    expect(file.accounts[0]).toMatchObject({ createdAt: NOW, updatedAt: NOW })
  })

  it('updates an existing account in place, preserving createdAt', () => {
    const first = upsertAccount(createEmptyAuthFile(), makeInput(1, 'alice'), NOW)
    const second = upsertAccount(
      first,
      { ...makeInput(1, 'alice'), accessToken: 'token-rotated', method: 'personal_token' },
      LATER
    )

    expect(second.accounts).toHaveLength(1)
    expect(second.accounts[0]).toMatchObject({
      accessToken: 'token-rotated',
      method: 'personal_token',
      createdAt: NOW,
      updatedAt: LATER,
    })
    expect(second.activeAccountId).toBe(1)
  })
})

describe('removeAccount', () => {
  it('removes the active account and nulls the active pointer', () => {
    const file = removeAccount({ ...makeFile(), activeAccountId: 1 }, 1)

    expect(file.accounts.map((account) => account.viewer.id)).toEqual([2])
    expect(file.activeAccountId).toBeNull()
  })

  it('keeps the active pointer when removing another account', () => {
    const file = removeAccount({ ...makeFile(), activeAccountId: 2 }, 1)

    expect(file.accounts.map((account) => account.viewer.id)).toEqual([2])
    expect(file.activeAccountId).toBe(2)
  })
})

describe('setActiveAccount', () => {
  it('switches the active pointer to a stored account', () => {
    const file = setActiveAccount({ ...makeFile(), activeAccountId: 2 }, 1)

    expect(file.activeAccountId).toBe(1)
  })

  it('throws for an unknown account id', () => {
    expect(() => setActiveAccount(makeFile(), 99)).toThrowError()
  })
})

describe('getActiveAccount / toAccountSummaries', () => {
  it('resolves the active account and returns null otherwise', () => {
    expect(getActiveAccount(null)).toBeNull()
    expect(getActiveAccount({ ...makeFile(), activeAccountId: null })).toBeNull()
    expect(getActiveAccount({ ...makeFile(), activeAccountId: 2 })?.viewer.login).toBe('bob')
  })

  it('summarizes accounts without leaking tokens', () => {
    const summaries = toAccountSummaries(makeFile())

    expect(summaries).toEqual([
      { id: 1, login: 'alice', name: 'Name alice', avatarUrl: 'https://avatars.example/alice', method: 'oauth_device' },
      { id: 2, login: 'bob', name: 'Name bob', avatarUrl: 'https://avatars.example/bob', method: 'oauth_device' },
    ])
    expect(toAccountSummaries(null)).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @oh-my-github/client test -- auth-store`
Expected: FAIL,报 `Cannot find module './auth-store'`(或等价的模块缺失错误)

- [ ] **Step 3: 实现 auth-store.ts**

创建 `packages/client/src/main/auth-store.ts`:

```ts
import type { GitHubAuthViewer } from '@oh-my-github/api'

export type AuthMethod = 'oauth_device' | 'personal_token'

export interface StoredAccount {
  method: AuthMethod
  accessToken: string
  tokenType: string
  scopes: string[]
  viewer: GitHubAuthViewer
  createdAt: string
  updatedAt: string
}

export interface StoredAuthFile {
  schemaVersion: 2
  activeAccountId: number | null
  accounts: StoredAccount[]
}

export interface AccountSummary {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  method: AuthMethod
}

export function createEmptyAuthFile(): StoredAuthFile {
  return { schemaVersion: 2, activeAccountId: null, accounts: [] }
}

export function normalizeStoredAuthFile(raw: unknown): StoredAuthFile | null {
  if (typeof raw !== 'object' || raw === null) return null

  const record = raw as Record<string, unknown>

  if (record.schemaVersion === 2) {
    const accounts = Array.isArray(record.accounts)
      ? record.accounts
          .map((entry) => normalizeStoredAccount(entry))
          .filter((account): account is StoredAccount => account !== null)
      : []
    const activeAccountId = typeof record.activeAccountId === 'number' ? record.activeAccountId : null

    return {
      schemaVersion: 2,
      activeAccountId: accounts.some((account) => account.viewer.id === activeAccountId)
        ? activeAccountId
        : null,
      accounts
    }
  }

  // v1(schemaVersion: 1 或缺失):账号字段直接在顶层,迁移为单账号的 v2 文件。
  const account = normalizeStoredAccount(record)

  if (!account) return null

  return { schemaVersion: 2, activeAccountId: account.viewer.id, accounts: [account] }
}

export function upsertAccount(
  file: StoredAuthFile,
  input: {
    method: AuthMethod
    accessToken: string
    tokenType: string
    scopes: string[]
    viewer: GitHubAuthViewer
  },
  now: string
): StoredAuthFile {
  const existing = file.accounts.find((account) => account.viewer.id === input.viewer.id)
  const account: StoredAccount = {
    method: input.method,
    accessToken: input.accessToken,
    tokenType: input.tokenType,
    scopes: input.scopes,
    viewer: input.viewer,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  }

  return {
    schemaVersion: 2,
    activeAccountId: input.viewer.id,
    accounts: existing
      ? file.accounts.map((entry) => (entry.viewer.id === input.viewer.id ? account : entry))
      : [...file.accounts, account]
  }
}

export function removeAccount(file: StoredAuthFile, accountId: number): StoredAuthFile {
  return {
    schemaVersion: 2,
    activeAccountId: file.activeAccountId === accountId ? null : file.activeAccountId,
    accounts: file.accounts.filter((account) => account.viewer.id !== accountId)
  }
}

export function setActiveAccount(file: StoredAuthFile, accountId: number): StoredAuthFile {
  if (!file.accounts.some((account) => account.viewer.id === accountId)) {
    throw new Error('GitHub account was not found')
  }

  return { ...file, activeAccountId: accountId }
}

export function getActiveAccount(file: StoredAuthFile | null): StoredAccount | null {
  if (!file || file.activeAccountId === null) return null

  return file.accounts.find((account) => account.viewer.id === file.activeAccountId) ?? null
}

export function toAccountSummaries(file: StoredAuthFile | null): AccountSummary[] {
  if (!file) return []

  return file.accounts.map((account) => ({
    id: account.viewer.id,
    login: account.viewer.login,
    name: account.viewer.name,
    avatarUrl: account.viewer.avatarUrl,
    method: account.method
  }))
}

function normalizeStoredAccount(raw: unknown): StoredAccount | null {
  if (typeof raw !== 'object' || raw === null) return null

  const record = raw as Record<string, unknown>
  const viewer = (typeof record.viewer === 'object' && record.viewer !== null ? record.viewer : {}) as Record<
    string,
    unknown
  >
  const accessToken = typeof record.accessToken === 'string' ? record.accessToken : ''
  const login = typeof viewer.login === 'string' ? viewer.login : ''
  const id = Number(viewer.id)

  if (!accessToken || !login || !Number.isFinite(id)) return null

  const now = new Date().toISOString()

  return {
    method: record.method === 'personal_token' ? 'personal_token' : 'oauth_device',
    accessToken,
    tokenType: typeof record.tokenType === 'string' ? record.tokenType : 'bearer',
    scopes: Array.isArray(record.scopes)
      ? record.scopes.filter((scope): scope is string => typeof scope === 'string')
      : [],
    viewer: {
      id,
      login,
      name: typeof viewer.name === 'string' ? viewer.name : null,
      avatarUrl: typeof viewer.avatarUrl === 'string' ? viewer.avatarUrl : ''
    },
    createdAt: typeof record.createdAt === 'string' ? record.createdAt : now,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : now
  }
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @oh-my-github/client test -- auth-store`
Expected: PASS(全部用例)

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/main/auth-store.ts packages/client/src/main/auth-store.test.ts
git commit -m "feat(auth): add multi-account auth store with v1 migration

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 重写 main/auth.ts 到 v2(切换/退出 IPC)

**Files:**
- Modify: `packages/client/src/main/auth.ts`(全量替换,原文件 350 行)

**Interfaces:**
- Consumes: Task 1 的全部导出。
- Produces(Task 3/4 依赖):
  - `AuthState` 新形状:`{ isAuthenticated: boolean; path: string; auth: Omit<StoredAccount, 'accessToken'> | null; accounts: AccountSummary[]; hasGitHubClientId: boolean }`
  - 新 IPC channel `auth:switch-account`,参数 `accountId: number`,返回 `AuthState`;账号不存在时抛错。
  - `auth:logout` 新语义:仅删除 active 条目并置 `activeAccountId = null`,保留其余账号与文件。
  - 对 main 其余模块保持不变的导出:`initializeAuth`、`registerAuthIpc`、`getAuthenticatedAccessToken`、`getAuthenticatedViewerLogin`、`getAuthenticatedAuthMetadata`(返回类型改为 `Pick<StoredAccount, 'method' | 'scopes'> | null`,形状不变)。

- [ ] **Step 1: 全量替换 auth.ts**

用以下内容替换 `packages/client/src/main/auth.ts` 全文(设备流/轮询/工具函数逻辑不变,存取层换成 auth-store):

```ts
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { AuthApi, defaultGitHubOAuthScopes, type GitHubAuthViewer } from '@oh-my-github/api'
import { clipboard, ipcMain, shell } from 'electron'
import {
  createEmptyAuthFile,
  getActiveAccount,
  normalizeStoredAuthFile,
  removeAccount,
  setActiveAccount,
  toAccountSummaries,
  upsertAccount,
  type AccountSummary,
  type AuthMethod,
  type StoredAccount,
  type StoredAuthFile
} from './auth-store'
import { resolveGitHubProxyUrl } from './proxy'

export type { AccountSummary, AuthMethod, StoredAccount } from './auth-store'

export interface AuthState {
  isAuthenticated: boolean
  path: string
  auth: Omit<StoredAccount, 'accessToken'> | null
  accounts: AccountSummary[]
  hasGitHubClientId: boolean
}

export interface DeviceFlowResult {
  auth: AuthState
  sessionId: string
  userCode: string
  verificationUri: string
  verificationUriComplete?: string
}

const authPath = join(homedir(), '.oh-my-github', 'auth.json')
const pendingDeviceFlows = new Map<
  string,
  {
    clientId: string
    deviceCode: string
    expiresIn: number
    interval: number
    userCode: string
    verificationUri: string
    verificationUriComplete?: string
  }
>()

export function initializeAuth(): AuthState {
  return getAuthState()
}

export function getAuthenticatedAccessToken(): string {
  const account = getActiveAccount(readAuthFile())

  if (!account?.accessToken) {
    throw new Error('GitHub authentication is required')
  }

  return account.accessToken
}

export function getAuthenticatedViewerLogin(): string {
  const account = getActiveAccount(readAuthFile())

  if (!account?.viewer.login) {
    throw new Error('GitHub authentication is required')
  }

  return account.viewer.login
}

export function getAuthenticatedAuthMetadata(): Pick<StoredAccount, 'method' | 'scopes'> | null {
  const account = getActiveAccount(readAuthFile())

  if (!account) return null

  return {
    method: account.method,
    scopes: [...account.scopes]
  }
}

export function registerAuthIpc(): void {
  ipcMain.handle('auth:get', () => getAuthState())
  ipcMain.handle('auth:start-device-flow', () => startDeviceFlow())
  ipcMain.handle('auth:complete-device-flow', (_event, sessionId: string) =>
    completeDeviceFlow(sessionId)
  )
  ipcMain.handle('auth:copy-code-and-open-device-flow', (_event, sessionId: string) =>
    copyCodeAndOpenDeviceFlow(sessionId)
  )
  ipcMain.handle('auth:save-personal-token', (_event, token: string) => savePersonalToken(token))
  ipcMain.handle('auth:switch-account', (_event, accountId: number) => switchToAccount(accountId))
  ipcMain.handle('auth:logout', () => logoutActiveAccount())
}

function switchToAccount(accountId: number): AuthState {
  const file = readAuthFile()

  if (!file) {
    throw new Error('GitHub account was not found')
  }

  writeAuthFile(setActiveAccount(file, accountId))
  return getAuthState()
}

function logoutActiveAccount(): AuthState {
  const file = readAuthFile()

  if (file && file.activeAccountId !== null) {
    writeAuthFile(removeAccount(file, file.activeAccountId))
  }

  return getAuthState()
}

async function startDeviceFlow(): Promise<DeviceFlowResult> {
  const clientId = getGitHubClientId()

  if (!clientId) {
    throw new Error('OAUTH_CLIENT_ID is not configured')
  }

  const authApi = await createAuthApi()
  const authorization = await authApi.startDeviceAuthorization({
    clientId,
    scopes: [...defaultGitHubOAuthScopes]
  })

  const sessionId = randomUUID()
  pendingDeviceFlows.set(sessionId, {
    clientId,
    deviceCode: authorization.deviceCode,
    expiresIn: authorization.expiresIn,
    interval: authorization.interval,
    userCode: authorization.userCode,
    verificationUri: authorization.verificationUri,
    verificationUriComplete: authorization.verificationUriComplete
  })

  return {
    auth: getAuthState(),
    sessionId,
    userCode: authorization.userCode,
    verificationUri: authorization.verificationUri,
    verificationUriComplete: authorization.verificationUriComplete
  }
}

async function copyCodeAndOpenDeviceFlow(sessionId: string): Promise<void> {
  const flow = pendingDeviceFlows.get(sessionId)

  if (!flow) {
    throw new Error('GitHub device flow session was not found')
  }

  clipboard.writeText(flow.userCode)
  await shell.openExternal(flow.verificationUri)
}

async function completeDeviceFlow(sessionId: string): Promise<DeviceFlowResult> {
  const flow = pendingDeviceFlows.get(sessionId)

  if (!flow) {
    throw new Error('GitHub device flow session was not found')
  }

  try {
    const authApi = await createAuthApi()
    const token = await pollForToken({
      clientId: flow.clientId,
      deviceCode: flow.deviceCode,
      expiresIn: flow.expiresIn,
      interval: flow.interval,
      authApi
    })
    const viewer = await authApi.getViewer(token.accessToken)

    persistAccount({
      method: 'oauth_device',
      accessToken: token.accessToken,
      tokenType: token.tokenType,
      scopes: token.scopes.length > 0 ? token.scopes : [...defaultGitHubOAuthScopes],
      viewer
    })

    return {
      auth: getAuthState(),
      sessionId,
      userCode: flow.userCode,
      verificationUri: flow.verificationUri,
      verificationUriComplete: flow.verificationUriComplete
    }
  } finally {
    pendingDeviceFlows.delete(sessionId)
  }
}

async function savePersonalToken(token: string): Promise<AuthState> {
  const normalizedToken = token.trim()

  if (!normalizedToken) {
    throw new Error('GitHub token is required')
  }

  const authApi = await createAuthApi()
  const viewer = await authApi.getViewer(normalizedToken)

  persistAccount({
    method: 'personal_token',
    accessToken: normalizedToken,
    tokenType: 'bearer',
    scopes: [],
    viewer
  })

  return getAuthState()
}

function persistAccount(input: {
  method: AuthMethod
  accessToken: string
  tokenType: string
  scopes: string[]
  viewer: GitHubAuthViewer
}): void {
  const file = readAuthFile() ?? createEmptyAuthFile()
  writeAuthFile(upsertAccount(file, input, new Date().toISOString()))
}

function getAuthState(): AuthState {
  const file = readAuthFile()
  const active = getActiveAccount(file)

  return {
    isAuthenticated: Boolean(active),
    path: authPath,
    auth: active ? sanitizeAccount(active) : null,
    accounts: toAccountSummaries(file),
    hasGitHubClientId: Boolean(getGitHubClientId())
  }
}

function readAuthFile(): StoredAuthFile | null {
  let raw: string

  try {
    raw = readFileSync(authPath, 'utf8')
  } catch (error) {
    if (isMissingFileError(error)) {
      return null
    }

    throw error
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(raw)
  } catch {
    // 手工损坏的文件视为未登录;不主动删除,等下次登录写入时覆盖。
    return null
  }

  const file = normalizeStoredAuthFile(parsed)

  // v1 → v2 迁移后立刻写回,让磁盘与内存保持一致。
  if (file && (parsed as { schemaVersion?: unknown }).schemaVersion !== 2) {
    writeAuthFile(file)
  }

  return file
}

function writeAuthFile(file: StoredAuthFile): void {
  mkdirSync(dirname(authPath), { recursive: true })
  writeFileSync(authPath, `${JSON.stringify(file, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  })
  trySetPrivatePermissions()
}

function sanitizeAccount(account: StoredAccount): Omit<StoredAccount, 'accessToken'> {
  const { accessToken: _accessToken, ...safeAccount } = account
  return safeAccount
}

async function pollForToken(options: {
  clientId: string
  deviceCode: string
  expiresIn: number
  interval: number
  authApi: AuthApi
}): Promise<{ accessToken: string; tokenType: string; scopes: string[] }> {
  const expiresAt = Date.now() + options.expiresIn * 1000
  let interval = Math.max(options.interval, 1)

  while (Date.now() < expiresAt) {
    await delay(interval * 1000)

    const result = await options.authApi.pollDeviceAccessToken({
      clientId: options.clientId,
      deviceCode: options.deviceCode
    })

    if (result.status === 'success') {
      return {
        accessToken: result.accessToken,
        tokenType: result.tokenType,
        scopes: result.scopes
      }
    }

    if (result.status === 'failure') {
      throw new Error(result.description ?? result.reason)
    }

    if (result.reason === 'slow_down') {
      interval += result.interval ?? 5
    }
  }

  throw new Error('GitHub device authorization expired')
}

async function createAuthApi(): Promise<AuthApi> {
  return new AuthApi({ proxyUrl: await resolveGitHubProxyUrl() })
}

function getGitHubClientId(): string {
  return process.env.OAUTH_CLIENT_ID?.trim() ?? ''
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function trySetPrivatePermissions(): void {
  try {
    chmodSync(authPath, 0o600)
  } catch {
    // Best effort only; Windows and some filesystems may not support POSIX modes.
  }
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'ENOENT'
  )
}
```

- [ ] **Step 2: typecheck + 全量测试**

Run: `pnpm --filter @oh-my-github/client typecheck && pnpm --filter @oh-my-github/client test`
Expected: 均通过(main 其余模块只 import 未变的函数名,不应报错)

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/main/auth.ts
git commit -m "feat(auth): store multiple accounts in auth.json v2 with switch and per-account logout

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: preload bridge 与 renderer 类型

**Files:**
- Modify: `packages/client/src/preload/index.ts`(auth 段,约 370-381 行)
- Modify: `packages/client/src/renderer/env.d.ts`(`AuthState` 类型约 2007-2020 行;bridge auth 段约 2533-2551 行;`AuthViewer` 附近约 29-34 行)

**Interfaces:**
- Consumes: Task 2 的 `auth:switch-account` channel 与新 `AuthState` 形状。
- Produces(Task 4/5/6 依赖):
  - `window.ohMyGithub.auth.switchAccount(accountId: number): Promise<AuthState>`
  - 全局类型 `AuthAccountSummary = { id: number; login: string; name: string | null; avatarUrl: string; method: 'oauth_device' | 'personal_token' }`
  - 全局 `AuthState` 增加 `accounts: AuthAccountSummary[]`,`auth` 对象去掉 `schemaVersion` 字段。

- [ ] **Step 1: preload 增加 switchAccount**

`packages/client/src/preload/index.ts` auth 对象中,在 `savePersonalToken` 与 `logout` 之间插入:

```ts
    savePersonalToken: (token: string) => ipcRenderer.invoke('auth:save-personal-token', token),
    switchAccount: (accountId: number) => ipcRenderer.invoke('auth:switch-account', accountId),
    logout: () => ipcRenderer.invoke('auth:logout')
```

- [ ] **Step 2: env.d.ts 更新类型**

在 `AuthViewer` 类型定义之后新增:

```ts
type AuthAccountSummary = {
  id: number
  login: string
  name: string | null
  avatarUrl: string
  method: 'oauth_device' | 'personal_token'
}
```

将 `AuthState` 类型整体替换为:

```ts
type AuthState = {
  isAuthenticated: boolean
  path: string
  hasGitHubClientId: boolean
  accounts: AuthAccountSummary[]
  auth: {
    method: 'oauth_device' | 'personal_token'
    tokenType: string
    scopes: string[]
    viewer: AuthViewer
    createdAt: string
    updatedAt: string
  } | null
}
```

bridge 类型的 auth 段,在 `savePersonalToken` 一行后新增:

```ts
      switchAccount: (accountId: number) => Promise<AuthState>
```

- [ ] **Step 3: typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: 无错误(renderer 无代码读取 `auth.schemaVersion`,已确认)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/preload/index.ts packages/client/src/renderer/env.d.ts
git commit -m "feat(auth): expose account list and switch-account over the preload bridge

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: renderer auth store、useAuthActions 与软重载门控

**Files:**
- Create: `packages/client/src/renderer/stores/auth.ts`
- Create: `packages/client/src/renderer/composables/use-auth-actions.ts`
- Modify: `packages/client/src/renderer/app.vue`
- Modify: `packages/client/src/renderer/router.ts`(beforeEach 中 authenticated→auth 的重定向)

**Interfaces:**
- Consumes: Task 3 的 bridge 与全局类型。
- Produces(Task 5/6 依赖):
  - `useAuthStore()`(pinia setup store,id `'auth'`):`state: Ref<AuthState | null>`、`isLoaded`、`isSwitching: Ref<boolean>`、`isAuthenticated: ComputedRef<boolean>`、`viewer: ComputedRef<AuthViewer | null>`、`activeAccountId: ComputedRef<number | null>`、`accounts: ComputedRef<AuthAccountSummary[]>`、`otherAccounts: ComputedRef<AuthAccountSummary[]>`、`refresh(): Promise<AuthState | null>`、`applyState(next: AuthState | null): void`
  - `useAuthActions()`:`switchAccount(accountId: number): Promise<void>`、`completeLogin(next: AuthState, redirectPath: string): Promise<void>`、`logout(): Promise<void>`
  - 路由行为:已认证访问 `/auth?add=1` 不再被重定向回工作区。

- [ ] **Step 1: 创建 stores/auth.ts**

```ts
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export const useAuthStore = defineStore('auth', () => {
  const state = ref<AuthState | null>(null)
  const isLoaded = ref(false)
  const isSwitching = ref(false)

  const isAuthenticated = computed(() => Boolean(state.value?.isAuthenticated))
  const viewer = computed(() => state.value?.auth?.viewer ?? null)
  const activeAccountId = computed(() => viewer.value?.id ?? null)
  const accounts = computed(() => state.value?.accounts ?? [])
  const otherAccounts = computed(() =>
    accounts.value.filter((account) => account.id !== activeAccountId.value)
  )

  async function refresh(): Promise<AuthState | null> {
    try {
      state.value = (await window.ohMyGithub?.auth?.get?.()) ?? null
    } catch {
      state.value = null
    }
    isLoaded.value = true
    return state.value
  }

  function applyState(next: AuthState | null): void {
    state.value = next
    isLoaded.value = true
  }

  return {
    state,
    isLoaded,
    isSwitching,
    isAuthenticated,
    viewer,
    activeAccountId,
    accounts,
    otherAccounts,
    refresh,
    applyState,
  }
})
```

- [ ] **Step 2: 创建 composables/use-auth-actions.ts**

```ts
import { useQueryCache } from '@pinia/colada'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Account transitions (switch / login / logout) share one soft-reload gate:
 * unmount the whole RouterView first (app.vue v-if), drop every cached
 * GitHub query, then navigate and remount with the new account's identity.
 * Removing entries (instead of invalidating) prevents the new account from
 * briefly seeing the previous account's stale data.
 */
export function useAuthActions() {
  const router = useRouter()
  const queryCache = useQueryCache()
  const authStore = useAuthStore()

  function clearGitHubQueryCache(): void {
    for (const entry of queryCache.getEntries({ key: ['github'] })) {
      queryCache.remove(entry)
    }
  }

  async function switchAccount(accountId: number): Promise<void> {
    if (authStore.isSwitching || accountId === authStore.activeAccountId) return

    authStore.isSwitching = true
    try {
      const next = await window.ohMyGithub?.auth?.switchAccount?.(accountId)

      if (!next) return

      clearGitHubQueryCache()
      authStore.applyState(next)
      await router.replace({ name: 'workspace-root' })
    } finally {
      authStore.isSwitching = false
    }
  }

  async function completeLogin(next: AuthState, redirectPath: string): Promise<void> {
    authStore.isSwitching = true
    try {
      clearGitHubQueryCache()
      authStore.applyState(next)
      await router.replace(redirectPath)
    } finally {
      authStore.isSwitching = false
    }
  }

  async function logout(): Promise<void> {
    if (authStore.isSwitching) return

    authStore.isSwitching = true
    try {
      const next = await window.ohMyGithub?.auth?.logout?.()
      clearGitHubQueryCache()
      authStore.applyState(next ?? null)
      await router.replace({ name: 'auth' })
    } finally {
      authStore.isSwitching = false
    }
  }

  return { switchAccount, completeLogin, logout }
}
```

- [ ] **Step 3: app.vue 挂门控 + 启动时加载 store**

`packages/client/src/renderer/app.vue` script 中新增(紧邻 `useSettingsStore` 的用法):

```ts
import { useAuthStore } from './stores/auth'
```

```ts
const authStore = useAuthStore()
void authStore.refresh()
```

template 中 `<RouterView />` 替换为:

```vue
<RouterView v-if="!authStore.isSwitching" />
```

- [ ] **Step 4: router.ts 放行 /auth?add=1**

`router.beforeEach` 中的:

```ts
  if (auth?.isAuthenticated && to.name === 'auth') {
    return { name: 'workspace-root' }
  }
```

改为:

```ts
  if (auth?.isAuthenticated && to.name === 'auth' && to.query.add !== '1') {
    return { name: 'workspace-root' }
  }
```

- [ ] **Step 5: typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: 无错误

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/renderer/stores/auth.ts packages/client/src/renderer/composables/use-auth-actions.ts packages/client/src/renderer/app.vue packages/client/src/renderer/router.ts
git commit -m "feat(auth): add reactive auth store and soft-reload account actions

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 登录页 — 返回按钮 + 账号列表

**Files:**
- Modify: `packages/client/src/renderer/pages/auth/auth-page.vue`(全量替换,原文件 233 行)
- Modify: `packages/client/src/renderer/i18n/locales/en.json`(auth 段)
- Modify: `packages/client/src/renderer/i18n/locales/zh.json`(auth 段)

**Interfaces:**
- Consumes: Task 4 的 `useAuthStore` / `useAuthActions`。
- Produces: 无(叶子 UI)。行为:返回按钮仅 `authStore.isAuthenticated` 时显示;账号列表 `accounts` 非空时显示,active 行禁用 + Check 标记;点击其余行走 `switchAccount`。

- [ ] **Step 1: i18n 新增 key(en + zh,保持字母序)**

`en.json` 的 `auth` 对象(146 行起)内插入三个 key,插入后该对象为:

```json
  "auth": {
    "activeAccount": "Current account",
    "back": "Back",
    "browserOpened": "Copy this code, then open GitHub to authorize the app.",
    "copyCodeAndOpenGitHub": "Copy code and open GitHub",
    "electronRequired": "Authentication is only available in the desktop app window.",
    "errors": {
      "unknown": "Something went wrong."
    },
    "loginWithGitHub": "Login with GitHub",
    "missingClientId": "OAUTH_CLIENT_ID is not configured. Add it to your .env file or use a personal token.",
    "saveToken": "Save token",
    "subtitle": "Connect your GitHub account to start triage.",
    "switchAccount": "Switch account",
    "title": "Sign in",
    "tokenPlaceholder": "Personal GitHub token",
    "useOAuth": "Login with GitHub",
    "usePersonalToken": "Login with personal GitHub token",
    "waitingForAuthorization": "Waiting for authorization at"
  },
```

`zh.json` 的 `auth` 对象同位置插入,插入后为:

```json
  "auth": {
    "activeAccount": "当前账号",
    "back": "返回",
    "browserOpened": "复制这个代码，然后打开 GitHub 授权应用。",
    "copyCodeAndOpenGitHub": "复制代码并打开 GitHub",
    "electronRequired": "身份验证只能在桌面应用窗口中使用。",
    "errors": {
      "unknown": "发生了一些问题。"
    },
    "loginWithGitHub": "使用 GitHub 登录",
    "missingClientId": "还没有配置 OAUTH_CLIENT_ID。请把它加入 .env，或使用个人 token。",
    "saveToken": "保存 token",
    "subtitle": "连接 GitHub 账号后开始处理工作项。",
    "switchAccount": "切换账号",
    "title": "登录",
    "tokenPlaceholder": "个人 GitHub token",
    "useOAuth": "使用 GitHub 登录",
    "usePersonalToken": "使用个人 GitHub token 登录",
    "waitingForAuthorization": "正在等待授权："
  },
```

- [ ] **Step 2: 全量替换 auth-page.vue**

```vue
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, Check, Copy, Github } from 'lucide-vue-next'
import {
  Alert,
  AlertDescription,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Card,
  CardContent,
  Input,
  Spinner,
} from '@oh-my-github/ui'
import { useAuthActions } from '@/composables/use-auth-actions'
import { useAuthStore } from '@/stores/auth'

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const { completeLogin, switchAccount } = useAuthActions()

const deviceSessionId = ref('')
const deviceCode = ref('')
const verificationUri = ref('')
const errorMessage = ref('')
const token = ref('')
const showTokenForm = ref(false)
const oauthStatus = ref<'idle' | 'opening' | 'waiting' | 'success'>('idle')
const tokenStatus = ref<'idle' | 'saving'>('idle')
const switchingAccountId = ref<number | null>(null)

const isOAuthLoading = computed(() => oauthStatus.value === 'opening' || oauthStatus.value === 'waiting')
const isTokenSaving = computed(() => tokenStatus.value === 'saving')
const hasAuthBridge = computed(() => Boolean(window.ohMyGithub?.auth))
const canUseOAuth = computed(() => Boolean(authStore.state?.hasGitHubClientId))

onMounted(async () => {
  await authStore.refresh()
  if (!authStore.state) {
    errorMessage.value = t('auth.electronRequired')
  }
})

async function loginWithGitHub(): Promise<void> {
  if (!window.ohMyGithub?.auth || !canUseOAuth.value || isOAuthLoading.value) {
    return
  }

  errorMessage.value = ''
  deviceSessionId.value = ''
  deviceCode.value = ''
  verificationUri.value = ''
  oauthStatus.value = 'opening'

  try {
    const result = await window.ohMyGithub.auth.startDeviceFlow((details) => {
      deviceSessionId.value = details.sessionId
      deviceCode.value = details.userCode
      verificationUri.value = details.verificationUri
      oauthStatus.value = 'waiting'
    })
    oauthStatus.value = 'success'
    await completeLogin(result.auth, resolveRedirectPath())
  } catch (error) {
    oauthStatus.value = 'idle'
    errorMessage.value = resolveErrorMessage(error)
  }
}

async function copyCodeAndOpenGitHub(): Promise<void> {
  if (!window.ohMyGithub?.auth || !deviceSessionId.value) {
    return
  }

  errorMessage.value = ''

  try {
    await window.ohMyGithub.auth.copyCodeAndOpenDeviceFlow(deviceSessionId.value)
  } catch (error) {
    errorMessage.value = resolveErrorMessage(error)
  }
}

async function savePersonalToken(): Promise<void> {
  if (!window.ohMyGithub?.auth || isTokenSaving.value) {
    return
  }

  errorMessage.value = ''
  tokenStatus.value = 'saving'

  try {
    const next = await window.ohMyGithub.auth.savePersonalToken(token.value)
    token.value = ''
    await completeLogin(next, resolveRedirectPath())
  } catch (error) {
    errorMessage.value = resolveErrorMessage(error)
  } finally {
    tokenStatus.value = 'idle'
  }
}

async function onSelectAccount(accountId: number): Promise<void> {
  if (switchingAccountId.value !== null) return

  errorMessage.value = ''
  switchingAccountId.value = accountId

  try {
    await switchAccount(accountId)
  } catch (error) {
    errorMessage.value = resolveErrorMessage(error)
  } finally {
    switchingAccountId.value = null
  }
}

function goBack(): void {
  if (window.history.state?.back) {
    router.back()
  } else {
    void router.replace({ name: 'workspace-root' })
  }
}

function toggleTokenForm(): void {
  showTokenForm.value = !showTokenForm.value
  errorMessage.value = ''
}

function accountPrimaryLabel(account: AuthAccountSummary): string {
  return account.name?.trim() || account.login
}

function accountFallback(account: AuthAccountSummary): string {
  return accountPrimaryLabel(account).slice(0, 2).toUpperCase()
}

function resolveRedirectPath(): string {
  const redirect = route.query.redirect

  if (typeof redirect === 'string' && redirect && redirect !== '/auth') {
    return redirect
  }

  return '/'
}

function resolveErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message
  }

  return t('auth.errors.unknown')
}
</script>

<template>
  <main class="auth-page relative grid min-h-full place-items-center bg-background px-6 py-12">
    <Button
      v-if="authStore.isAuthenticated"
      :aria-label="t('auth.back')"
      class="auth-no-drag absolute left-4 top-12"
      size="icon-sm"
      type="button"
      variant="ghost"
      @click="goBack"
    >
      <ArrowLeft class="size-4" />
    </Button>

    <div class="grid w-full max-w-sm gap-4">
      <Card class="auth-no-drag">
        <CardContent class="grid gap-4">
          <div class="grid gap-2 text-center">
            <h1 class="select-none text-title font-semibold text-foreground">{{ t('auth.title') }}</h1>
            <p class="select-none text-body text-muted-foreground">{{ t('auth.subtitle') }}</p>
          </div>

          <Button
            v-if="!showTokenForm"
            :disabled="!canUseOAuth"
            :loading="isOAuthLoading"
            block
            loading-mode="manual"
            size="lg"
            type="button"
            @click="loginWithGitHub"
          >
            <Spinner v-if="isOAuthLoading" />
            <Github v-else class="size-4" />
            {{ t('auth.loginWithGitHub') }}
          </Button>

          <p
            v-if="!showTokenForm && authStore.isLoaded && hasAuthBridge && !canUseOAuth"
            class="text-center text-body text-muted-foreground"
          >
            {{ t('auth.missingClientId') }}
          </p>

          <div
            v-if="!showTokenForm && deviceCode"
            class="grid gap-2 rounded-lg border border-border bg-card p-4 text-center"
          >
            <p class="select-none text-body text-muted-foreground">{{ t('auth.browserOpened') }}</p>
            <div class="select-text rounded-md bg-accent px-3 py-2 text-title font-semibold text-foreground">
              {{ deviceCode }}
            </div>
            <Button
              block
              type="button"
              variant="secondary"
              @click="copyCodeAndOpenGitHub"
            >
              <Copy class="size-4" />
              {{ t('auth.copyCodeAndOpenGitHub') }}
            </Button>
            <p class="text-body text-muted-foreground">
              {{ t('auth.waitingForAuthorization') }}
              <span v-if="verificationUri">{{ verificationUri }}</span>
            </p>
          </div>

          <form
            v-if="showTokenForm"
            class="grid gap-3"
            @submit.prevent="savePersonalToken"
          >
            <Input
              v-model="token"
              autocomplete="off"
              :placeholder="t('auth.tokenPlaceholder')"
              type="password"
            />
            <Button
              :disabled="!token.trim()"
              :loading="isTokenSaving"
              block
              type="submit"
              variant="secondary"
            >
              {{ t('auth.saveToken') }}
            </Button>
          </form>

          <Button
            class="justify-self-center"
            size="text"
            type="button"
            variant="link"
            @click="toggleTokenForm"
          >
            {{ showTokenForm ? t('auth.useOAuth') : t('auth.usePersonalToken') }}
          </Button>

          <Alert v-if="errorMessage" variant="destructive">
            <AlertDescription>{{ errorMessage }}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <section
        v-if="authStore.accounts.length > 0"
        class="auth-no-drag grid gap-2"
      >
        <h2 class="select-none px-1 text-caption font-medium text-muted-foreground">
          {{ t('auth.switchAccount') }}
        </h2>
        <div class="overflow-hidden rounded-lg border border-border bg-card">
          <button
            v-for="account in authStore.accounts"
            :key="account.id"
            class="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
            :disabled="account.id === authStore.activeAccountId || switchingAccountId !== null"
            type="button"
            @click="onSelectAccount(account.id)"
          >
            <Avatar class="size-8">
              <AvatarImage
                v-if="account.avatarUrl"
                :alt="accountPrimaryLabel(account)"
                :src="account.avatarUrl"
              />
              <AvatarFallback class="text-caption">
                {{ accountFallback(account) }}
              </AvatarFallback>
            </Avatar>
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-body font-medium text-foreground">
                {{ accountPrimaryLabel(account) }}
              </span>
              <span class="truncate text-caption text-muted-foreground">
                {{ account.login }}
              </span>
            </span>
            <Spinner
              v-if="switchingAccountId === account.id"
              class="size-4 text-muted-foreground"
            />
            <Check
              v-else-if="account.id === authStore.activeAccountId"
              :aria-label="t('auth.activeAccount')"
              class="size-4 text-muted-foreground"
            />
          </button>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
/* The window uses titleBarStyle: 'hiddenInset', so there is no native title bar
   to drag. Make the empty login canvas draggable and keep interactive areas
   (card, back button, account list) clickable. */
.auth-page {
  -webkit-app-region: drag;
}

.auth-no-drag {
  -webkit-app-region: no-drag;
}
</style>
```

要点:
- 原 `authState` 本地 ref / `isAuthLoaded` 全部换成 `authStore`;登录成功统一走 `completeLogin`(软重载门控 + 清缓存)。
- 返回按钮 `top-12` 避开 macOS hiddenInset 红绿灯区;`auth-no-drag` 保证可点。
- active 行禁用并显示 Check;切换中在对应行显示 Spinner 并禁用所有行。

- [ ] **Step 3: 测试 + typecheck**

Run: `pnpm --filter @oh-my-github/client test && pnpm --filter @oh-my-github/client typecheck`
Expected: 均通过(locales.test.ts 校验双语 key 同构)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/renderer/pages/auth/auth-page.vue packages/client/src/renderer/i18n/locales/en.json packages/client/src/renderer/i18n/locales/zh.json
git commit -m "feat(auth): add back button and stored-account switch list to the sign-in page

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: User Panel — 账号切换列表 + Add Account

**Files:**
- Modify: `packages/client/src/renderer/pages/workspace/components/workspace-user-panel.vue`
- Modify: `packages/client/src/renderer/i18n/locales/en.json`(workspace.userMenu 段,约 2682 行)
- Modify: `packages/client/src/renderer/i18n/locales/zh.json`(同段)

**Interfaces:**
- Consumes: Task 4 的 `useAuthStore().otherAccounts` 与 `useAuthActions().switchAccount/logout`。
- Produces: 无(叶子 UI)。菜单顺序:Profile / Settings / Appearance → 分隔线 → 其他账号(无则不渲染行)→ Add Account → 分隔线 → Log Out。

- [ ] **Step 1: i18n 新增 addAccount(en + zh,字母序在最前)**

`en.json` `workspace.userMenu`:

```json
    "userMenu": {
      "addAccount": "Add Account",
      "appearance": "Appearance",
      "logout": "Log Out",
      "profile": "Profile",
      "settings": "Settings"
    },
```

`zh.json` `workspace.userMenu`:

```json
    "userMenu": {
      "addAccount": "添加账号",
      "appearance": "外观",
      "logout": "退出登录",
      "profile": "个人资料",
      "settings": "设置"
    },
```

- [ ] **Step 2: 改造 workspace-user-panel.vue**

script 部分:

1. lucide 导入行改为:

```ts
import { LogOut, Palette, Settings, UserCircle, UserPlus } from 'lucide-vue-next'
```

2. 在现有 import 之后新增:

```ts
import { useAuthActions } from '@/composables/use-auth-actions'
import { useAuthStore } from '@/stores/auth'
```

3. 在 `const isLoggingOut = ref(false)` 附近新增:

```ts
const authStore = useAuthStore()
const { logout: performLogout, switchAccount } = useAuthActions()
const otherAccounts = computed(() => authStore.otherAccounts)
```

4. `logout` 函数替换为(路由跳转已由 `useAuthActions.logout` 负责):

```ts
async function logout(): Promise<void> {
  if (isLoggingOut.value) return

  isLoggingOut.value = true
  try {
    await performLogout()
  } finally {
    isLoggingOut.value = false
  }
}
```

5. 新增两个函数与两个 helper:

```ts
function onSwitchAccount(accountId: number): void {
  void switchAccount(accountId)
}

function addAccount(): void {
  void router.push({ name: 'auth', query: { add: '1' } })
}

function accountPrimaryLabel(account: AuthAccountSummary): string {
  return account.name?.trim() || account.login
}

function accountFallback(account: AuthAccountSummary): string {
  return accountPrimaryLabel(account).slice(0, 2).toUpperCase()
}
```

template 部分:Appearance 的 `DropdownMenuItem` 之后、原 `DropdownMenuSeparator` + Log Out 之前,替换为:

```vue
      <DropdownMenuSeparator />
      <DropdownMenuItem
        v-for="account in otherAccounts"
        :key="account.id"
        @select="onSwitchAccount(account.id)"
      >
        <Avatar class="size-6">
          <AvatarImage
            v-if="account.avatarUrl"
            :alt="accountPrimaryLabel(account)"
            :src="account.avatarUrl"
          />
          <AvatarFallback class="text-[10px]">
            {{ accountFallback(account) }}
          </AvatarFallback>
        </Avatar>
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="truncate">{{ accountPrimaryLabel(account) }}</span>
          <span
            v-if="account.name?.trim()"
            class="truncate text-caption text-muted-foreground"
          >
            {{ account.login }}
          </span>
        </span>
      </DropdownMenuItem>
      <DropdownMenuItem @select="addAccount">
        <UserPlus />
        <span>{{ t('workspace.userMenu.addAccount') }}</span>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        :disabled="isLoggingOut"
        variant="destructive"
        @select.prevent="logout"
      >
        <LogOut />
        <span>{{ t('workspace.userMenu.logout') }}</span>
      </DropdownMenuItem>
```

- [ ] **Step 3: 测试 + typecheck**

Run: `pnpm --filter @oh-my-github/client test && pnpm --filter @oh-my-github/client typecheck`
Expected: 均通过

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/renderer/pages/workspace/components/workspace-user-panel.vue packages/client/src/renderer/i18n/locales/en.json packages/client/src/renderer/i18n/locales/zh.json
git commit -m "feat(workspace): add account switcher and add-account entry to the user panel

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: 全量验证 + 手动走查

**Files:**
- 无代码改动(必要时修复发现的问题)

- [ ] **Step 1: 全仓校验**

Run: `pnpm -r typecheck && pnpm --filter @oh-my-github/client test && pnpm --filter @oh-my-github/api test`
Expected: 全部通过

- [ ] **Step 2: 手动走查(用户本地 HMR dev 实例;main 改动需等 electron-vite 重启主进程)**

先备份真实凭据:`cp ~/.oh-my-github/auth.json ~/.oh-my-github/auth.json.bak`

按序验证并逐项确认:

1. **v1 迁移**:带旧 v1 auth.json 启动 → 直接进入工作区,`cat ~/.oh-my-github/auth.json` 显示 schemaVersion 2、单账号、activeAccountId 正确。
2. **Add Account**:User Panel → Add Account → 登录页左上角有返回按钮,下方账号列表显示当前账号(Check 标记、不可点);返回按钮可回工作区。
3. **添加第二账号**(PAT 或 OAuth)→ 登录成功直接进入新账号工作区,侧边栏头像/通知等全部为新账号数据。
4. **User Panel 切换**:面板 Appearance 下方列出另一账号 → 点击 → 短暂空白后回到工作区首页,身份为该账号,无旧账号数据残留。
5. **登录页切换**:Add Account 进登录页 → 点非当前账号行 → 行内 Spinner → 进入该账号工作区。
6. **退出登录**:Log Out → 回登录页,无返回按钮,列表只剩余下账号;auth.json 中对应条目已删除、activeAccountId 为 null。
7. **删空账号**:逐个退出全部账号 → 登录页呈首次使用态(无返回按钮、无账号列表)。
8. **重复登录去重**:重新登录已存在账号 → accounts 不新增条目,token 更新,该账号变为 active。

走查完成后恢复各自账号或保留测试结果,删除备份:`rm ~/.oh-my-github/auth.json.bak`(或按需还原)。

- [ ] **Step 3: 收尾**

如走查发现问题,修复并按 conventional commits 单独提交;全部通过后本计划完成,进入 superpowers:finishing-a-development-branch(main 直develop 场景下仅确认工作区干净)。
