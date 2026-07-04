# New 入口 + New Repository Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 侧边栏 Inbox 下新增 "New" 下拉入口：Repository 打开应用内 `new-repository` Tab（完整建仓表单，对齐 github.com/new）；Organization 跳系统浏览器（GitHub 未开放建组织 API）。

**Architecture:** 沿既有五层链路（`packages/api` module → client facade/mock → main IPC handler → preload bridge → renderer composable）新增 createRepository 与模板列表；`new-repository` 作为 internal tab type（同 inbox/reviews 模式，type 名与 URL 段一致，parse 零改动）；页面表单照 `profile-settings.vue` 模式。

**Tech Stack:** Electron + Vue 3 + TypeScript, octokit REST, @pinia/colada, @oh-my-github/ui (shadcn-vue), vue-i18n, vitest。

**Spec:** `docs/superpowers/specs/2026-07-05-new-repo-org-design.md`

## Global Constraints

- pnpm monorepo；测试命令：`pnpm --filter @oh-my-github/api test`、`pnpm --filter @oh-my-github/client test`；typecheck：`pnpm --filter @oh-my-github/api typecheck`、`pnpm --filter @oh-my-github/client typecheck`
- i18n：en.json / zh.json 必须同步添加相同 key（`locales.test.ts` 强制 parity）；locale 字符串里裸 `@` 要写成 `{'@'}`（本计划文案没有 @）
- UI 约定：表单不套圆角边框卡片（bordered 容器只放列表行）
- tab type 名为 `new-repository`（与 URL 段 `/new-repository` 一致，这样 `INTERNAL_TYPES` 机制零解析改动）
- renderer 全局类型是 ambient 的（`env.d.ts`），composable 里不 import api 包类型
- 每个任务结束都要 commit

---

### Task 1: packages/api — createRepository + 模板列表（TDD）

**Files:**
- Modify: `packages/api/src/types.ts`（~272 行 `GitHubForkedRepository` 附近加结果类型；~1389 行 `GitHubClient` 接口加方法；~1962 行 `ForkRepositoryOptions` 附近加 options 类型）
- Modify: `packages/api/src/modules/repositories.ts`（`fork()` 方法之后加三个方法）
- Modify: `packages/api/src/client.ts`（142 行 `forkRepository` 附近加三条 facade 转发）
- Modify: `packages/api/src/mock.ts`（~1512 行 `forkRepository` 附近加三个 mock 实现）
- Test: `packages/api/src/modules/repositories.mutations.test.ts`

**Interfaces:**
- Consumes: 现有 `RepositoriesApi`、`RepositoryResponse`（repositories.ts 内已有，fork() 在用）、测试文件底部的 `createApi()` mock helper
- Produces（后续任务依赖的确切签名）:
  - `RepositoriesApi.create(options: CreateRepositoryOptions): Promise<GitHubCreatedRepository>`
  - `RepositoriesApi.listGitignoreTemplates(): Promise<string[]>`
  - `RepositoriesApi.listLicenses(): Promise<GitHubLicenseTemplate[]>`
  - facade 名：`createRepository` / `listGitignoreTemplates` / `listLicenses`
  - `CreateRepositoryOptions { organization?: string | null; name: string; description?: string | null; visibility: 'public' | 'private'; autoInit?: boolean; gitignoreTemplate?: string | null; licenseTemplate?: string | null }`
  - `GitHubCreatedRepository { owner: string; name: string; nameWithOwner: string; url: string }`
  - `GitHubLicenseTemplate { key: string; name: string }`

- [ ] **Step 1: 写失败测试**

在 `repositories.mutations.test.ts` 末尾（`createApi` 定义之前）新增：

```ts
describe('RepositoriesApi create', () => {
  it('creates a personal repository via POST /user/repos', async () => {
    const { api, request } = createApi()

    const created = await api.create({
      name: 'hello-world',
      description: 'My first repo',
      visibility: 'private',
      autoInit: true,
      gitignoreTemplate: 'Node',
      licenseTemplate: 'mit',
    })

    expect(request).toHaveBeenCalledWith('POST /user/repos', {
      name: 'hello-world',
      description: 'My first repo',
      private: true,
      auto_init: true,
      gitignore_template: 'Node',
      license_template: 'mit',
    })
    expect(created).toEqual({
      owner: 'octocat',
      name: 'hello-world',
      nameWithOwner: 'octocat/hello-world',
      url: 'https://github.com/octocat/hello-world',
    })
  })

  it('creates an organization repository via POST /orgs/{org}/repos', async () => {
    const { api, request } = createApi()

    const created = await api.create({
      organization: 'octo-org',
      name: 'hello-world',
      visibility: 'public',
    })

    expect(request).toHaveBeenCalledWith('POST /orgs/{org}/repos', {
      org: 'octo-org',
      name: 'hello-world',
      private: false,
      auto_init: false,
    })
    expect(created.nameWithOwner).toBe('octo-org/hello-world')
  })

  it('omits empty optional fields', async () => {
    const { api, request } = createApi()

    await api.create({ name: 'bare', description: '  ', visibility: 'public' })

    expect(request).toHaveBeenCalledWith('POST /user/repos', {
      name: 'bare',
      private: false,
      auto_init: false,
    })
  })
})

describe('RepositoriesApi templates', () => {
  it('lists gitignore templates', async () => {
    const { api } = createApi()

    await expect(api.listGitignoreTemplates()).resolves.toEqual(['Node', 'Python'])
  })

  it('lists licenses as key/name pairs', async () => {
    const { api } = createApi()

    await expect(api.listLicenses()).resolves.toEqual([
      { key: 'mit', name: 'MIT License' },
    ])
  })
})
```

并在 `createApi()` 的 `request` mock 里（`POST /repos/{owner}/{repo}/forks` 分支旁）新增路由：

```ts
    if (route === 'POST /user/repos') {
      const name = params?.name as string

      return {
        data: {
          name,
          full_name: `octocat/${name}`,
          owner: { login: 'octocat' },
          html_url: `https://github.com/octocat/${name}`,
        },
      }
    }

    if (route === 'POST /orgs/{org}/repos') {
      const org = params?.org as string
      const name = params?.name as string

      return {
        data: {
          name,
          full_name: `${org}/${name}`,
          owner: { login: org },
          html_url: `https://github.com/${org}/${name}`,
        },
      }
    }

    if (route === 'GET /gitignore/templates') {
      return { data: ['Node', 'Python'] }
    }

    if (route === 'GET /licenses') {
      return { data: [{ key: 'mit', name: 'MIT License', spdx_id: 'MIT' }] }
    }
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @oh-my-github/api test repositories.mutations`
Expected: FAIL — `api.create is not a function`

- [ ] **Step 3: 实现**

`packages/api/src/types.ts`：

在 `GitHubForkedRepository`（~272 行）后加：

```ts
export interface GitHubCreatedRepository {
  owner: string
  name: string
  nameWithOwner: string
  url: string
}

export interface GitHubLicenseTemplate {
  key: string
  name: string
}
```

在 `ForkRepositoryOptions`（~1962 行）后加：

```ts
export interface CreateRepositoryOptions {
  organization?: string | null
  name: string
  description?: string | null
  visibility: 'public' | 'private'
  autoInit?: boolean
  gitignoreTemplate?: string | null
  licenseTemplate?: string | null
}
```

在 `GitHubClient` 接口 `forkRepository`（~1389 行）后加：

```ts
  createRepository(options: CreateRepositoryOptions): Promise<GitHubCreatedRepository>
  listGitignoreTemplates(): Promise<string[]>
  listLicenses(): Promise<GitHubLicenseTemplate[]>
```

`packages/api/src/modules/repositories.ts`：`fork()` 方法后加（同时在文件顶部 type import 里补 `CreateRepositoryOptions`、`GitHubCreatedRepository`、`GitHubLicenseTemplate`）：

```ts
  async create(options: CreateRepositoryOptions): Promise<GitHubCreatedRepository> {
    const organization = options.organization?.trim() || null
    const name = options.name.trim()
    const description = options.description?.trim() || null
    const payload = {
      name,
      ...(description ? { description } : {}),
      private: options.visibility === 'private',
      auto_init: options.autoInit ?? false,
      ...(options.gitignoreTemplate ? { gitignore_template: options.gitignoreTemplate } : {}),
      ...(options.licenseTemplate ? { license_template: options.licenseTemplate } : {}),
    }
    const response = organization
      ? await this.octokit.request('POST /orgs/{org}/repos', { org: organization, ...payload })
      : await this.octokit.request('POST /user/repos', payload)
    const repository = response.data as RepositoryResponse
    const owner = repository.owner?.login ?? organization ?? ''
    const createdName = repository.name ?? name

    return {
      owner,
      name: createdName,
      nameWithOwner: repository.full_name ?? `${owner}/${createdName}`,
      url: repository.html_url ?? `https://github.com/${owner}/${createdName}`,
    }
  }

  async listGitignoreTemplates(): Promise<string[]> {
    const response = await this.octokit.request('GET /gitignore/templates')

    return response.data as string[]
  }

  async listLicenses(): Promise<GitHubLicenseTemplate[]> {
    const response = await this.octokit.request('GET /licenses')
    const licenses = response.data as Array<{ key: string, name: string }>

    return licenses.map((license) => ({ key: license.key, name: license.name }))
  }
```

`packages/api/src/client.ts`：`forkRepository` 转发（142 行）后加：

```ts
    createRepository: (options) => repositories.create(options),
    listGitignoreTemplates: () => repositories.listGitignoreTemplates(),
    listLicenses: () => repositories.listLicenses(),
```

`packages/api/src/mock.ts`：`forkRepository`（~1512 行）后加（顶部 type import 补三个新类型）：

```ts
  async createRepository(options: CreateRepositoryOptions): Promise<GitHubCreatedRepository> {
    const owner = options.organization?.trim() || 'octocat'
    const name = options.name.trim()

    return {
      owner,
      name,
      nameWithOwner: `${owner}/${name}`,
      url: `https://github.com/${owner}/${name}`,
    }
  }

  async listGitignoreTemplates(): Promise<string[]> {
    return ['Node', 'Python', 'Go']
  }

  async listLicenses(): Promise<GitHubLicenseTemplate[]> {
    return [
      { key: 'mit', name: 'MIT License' },
      { key: 'apache-2.0', name: 'Apache License 2.0' },
    ]
  }
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @oh-my-github/api test repositories.mutations && pnpm --filter @oh-my-github/api typecheck`
Expected: 全部 PASS，typecheck 无错误

- [ ] **Step 5: Commit**

```bash
git add packages/api
git commit -m "feat(api): add createRepository and template list endpoints"
```

---

### Task 2: main IPC handler + preload bridge + env.d.ts 类型

**Files:**
- Modify: `packages/client/src/main/repositories.ts`（`repositories:fork` handler 之后注册三个 handler；`forkRepository` 函数之后加三个函数）
- Modify: `packages/client/src/preload/index.ts`（repositories section 的 `fork:` 之后加三条）
- Modify: `packages/client/src/renderer/env.d.ts`（ambient 类型 + `ohMyGithub.repositories` bridge 签名，repositories section 在 ~1929 行）

**Interfaces:**
- Consumes: Task 1 的 `api.repositories.create/listGitignoreTemplates/listLicenses`；main 里已有的 `createAuthenticatedGitHubApi()`
- Produces（Task 3 依赖）:
  - IPC channel：`repositories:create`、`repositories:list-gitignore-templates`、`repositories:list-licenses`
  - `window.ohMyGithub.repositories.create(options) => Promise<GitHubCreatedRepository>`
  - `window.ohMyGithub.repositories.listGitignoreTemplates() => Promise<string[]>`
  - `window.ohMyGithub.repositories.listLicenses() => Promise<GitHubLicenseTemplate[]>`
  - renderer ambient 类型 `GitHubCreatedRepository`、`GitHubLicenseTemplate`

- [ ] **Step 1: main handler**

`packages/client/src/main/repositories.ts`——在 `ipcMain.handle('repositories:fork', ...)` 注册之后加：

```ts
  ipcMain.handle('repositories:create', (_event, options: CreateRepositoryIpcOptions) =>
    createRepository(options)
  )
  ipcMain.handle('repositories:list-gitignore-templates', () => listGitignoreTemplates())
  ipcMain.handle('repositories:list-licenses', () => listLicenses())
```

在 `ForkRepositoryIpcOptions` interface 旁加：

```ts
interface CreateRepositoryIpcOptions {
  organization?: string | null
  name: string
  description?: string | null
  visibility?: string
  autoInit?: boolean
  gitignoreTemplate?: string | null
  licenseTemplate?: string | null
}
```

在 `forkRepository` 函数之后加：

```ts
async function createRepository(options: CreateRepositoryIpcOptions) {
  const api = await createAuthenticatedGitHubApi()

  return api.repositories.create({
    organization: options?.organization?.trim() || null,
    name: String(options?.name ?? '').trim(),
    description: options?.description?.trim() || null,
    visibility: options?.visibility === 'private' ? 'private' : 'public',
    autoInit: options?.autoInit ?? false,
    gitignoreTemplate: options?.gitignoreTemplate?.trim() || null,
    licenseTemplate: options?.licenseTemplate?.trim() || null,
  })
}

async function listGitignoreTemplates() {
  const api = await createAuthenticatedGitHubApi()

  return api.repositories.listGitignoreTemplates()
}

async function listLicenses() {
  const api = await createAuthenticatedGitHubApi()

  return api.repositories.listLicenses()
}
```

- [ ] **Step 2: preload bridge**

`packages/client/src/preload/index.ts` repositories section，`fork:` 之后加：

```ts
    create: (options: unknown) => ipcRenderer.invoke('repositories:create', options),
    listGitignoreTemplates: () => ipcRenderer.invoke('repositories:list-gitignore-templates'),
    listLicenses: () => ipcRenderer.invoke('repositories:list-licenses')
```

（注意给上一行 `fork:` 补逗号。）

- [ ] **Step 3: env.d.ts 类型**

`packages/client/src/renderer/env.d.ts`：

在 GitHub ambient 类型区（如 `GitHubOrganization` 附近）加：

```ts
interface GitHubCreatedRepository {
  owner: string
  name: string
  nameWithOwner: string
  url: string
}

interface GitHubLicenseTemplate {
  key: string
  name: string
}
```

在 `ohMyGithub.repositories`（~1929 行起）的 `fork:` 签名后加：

```ts
      create: (options: {
        organization: string | null
        name: string
        description: string | null
        visibility: 'public' | 'private'
        autoInit: boolean
        gitignoreTemplate: string | null
        licenseTemplate: string | null
      }) => Promise<GitHubCreatedRepository>
      listGitignoreTemplates: () => Promise<string[]>
      listLicenses: () => Promise<GitHubLicenseTemplate[]>
```

- [ ] **Step 4: typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/main/repositories.ts packages/client/src/preload/index.ts packages/client/src/renderer/env.d.ts
git commit -m "feat(client): bridge repository creation over IPC"
```

---

### Task 3: renderer composables

**Files:**
- Modify: `packages/client/src/renderer/composables/github/use-repositories.ts`（`createBranch` 等函数附近）

**Interfaces:**
- Consumes: Task 2 的 `window.ohMyGithub.repositories.create/listGitignoreTemplates/listLicenses`；文件内已有 `assertRepositoriesBridge()`、`useQuery`
- Produces（Task 5 依赖）:
  - `createRepository(options: { organization: string | null; name: string; description: string | null; visibility: 'public' | 'private'; autoInit: boolean; gitignoreTemplate: string | null; licenseTemplate: string | null }): Promise<GitHubCreatedRepository>`
  - `useGitignoreTemplatesQuery()` — key `['github', 'gitignore-templates']`
  - `useLicenseTemplatesQuery()` — key `['github', 'license-templates']`

- [ ] **Step 1: 实现**

在 `createBranch` 函数之前加：

```ts
export async function createRepository(options: {
  organization: string | null
  name: string
  description: string | null
  visibility: 'public' | 'private'
  autoInit: boolean
  gitignoreTemplate: string | null
  licenseTemplate: string | null
}): Promise<GitHubCreatedRepository> {
  assertRepositoriesBridge()

  return window.ohMyGithub.repositories.create(options)
}

export function useGitignoreTemplatesQuery() {
  return useQuery<string[]>({
    key: ['github', 'gitignore-templates'],
    query: async () => {
      assertRepositoriesBridge()

      return window.ohMyGithub.repositories.listGitignoreTemplates()
    },
  })
}

export function useLicenseTemplatesQuery() {
  return useQuery<GitHubLicenseTemplate[]>({
    key: ['github', 'license-templates'],
    query: async () => {
      assertRepositoriesBridge()

      return window.ohMyGithub.repositories.listLicenses()
    },
  })
}
```

（若文件里 `assertRepositoriesBridge` 定义在这些函数之后，保持现状即可——函数提升不影响。确认文件已 import `useQuery`，已有则不动。）

- [ ] **Step 2: typecheck**

Run: `pnpm --filter @oh-my-github/client typecheck`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/renderer/composables/github/use-repositories.ts
git commit -m "feat(client): add repository creation composables"
```

---

### Task 4: `new-repository` tab 类型接入（TDD）

**Files:**
- Modify: `packages/client/src/renderer/pages/workspace/types.ts`（`WorkspaceTabType` union）
- Modify: `packages/client/src/renderer/pages/workspace/workspace-url.ts`（`INTERNAL_TYPES` 6 行、`VALID_TYPES` 21 行、`titleForWorkspaceTab` 311 行）
- Modify: `packages/client/src/renderer/pages/workspace/tab-presentation.ts`
- Modify: `packages/client/src/renderer/i18n/locales/en.json`、`zh.json`
- Test: `packages/client/src/renderer/pages/workspace/workspace-url.test.ts`

**Interfaces:**
- Consumes: 无新依赖
- Produces（Task 5/6 依赖）: tab type 字面量 `'new-repository'`；internal URL `/new-repository`；tab 标题 `'New Repository'`；locale key `workspace.tabs.items.newRepository`、`workspace.panel.eyebrows.create`、`workspace.panel.headings.newRepository`、`workspace.panel.descriptions.newRepository`

- [ ] **Step 1: 写失败测试**

`workspace-url.test.ts` 末尾新增：

```ts
describe('new repository workspace URLs', () => {
  it('parses /new-repository as an internal tab', () => {
    expect(normalizeWorkspaceUrl('/new-repository')).toBe('/new-repository')
    expect(createWorkspaceTabFromUrl('/new-repository')).toMatchObject({
      type: 'new-repository',
      url: '/new-repository',
      title: 'New Repository',
    })
  })

  it('does not treat new-repository as an account path', () => {
    expect(createWorkspaceTabFromUrl('/new-repository').type).not.toBe('account')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm --filter @oh-my-github/client test workspace-url`
Expected: FAIL — type 解析为 `'account'`

- [ ] **Step 3: 实现**

`types.ts`：`WorkspaceTabType` union 的 `| 'activity'` 后加一行 `| 'new-repository'`。

`workspace-url.ts`：

```ts
const INTERNAL_TYPES = new Set<WorkspaceTabType>(['inbox', 'reviews', 'activity', 'new-repository'])
```

`VALID_TYPES` 里 `'activity',` 后加 `'new-repository',`。

`titleForWorkspaceTab` 里 `if (tab.type === 'activity') ...` 后加：

```ts
  if (tab.type === 'new-repository') return 'New Repository'
```

`tab-presentation.ts`：顶部 lucide import 加 `Plus`；在 `if (tab.type === 'activity')` 块之后加：

```ts
  if (tab.type === 'new-repository') {
    return {
      tab,
      icon: Plus,
      titleKey: 'workspace.tabs.items.newRepository',
      title: tab.title,
      eyebrowKey: 'workspace.panel.eyebrows.create',
      headingKey: 'workspace.panel.headings.newRepository',
      descriptionKey: 'workspace.panel.descriptions.newRepository',
      stats: [],
      blocks: [],
    }
  }
```

i18n——`en.json`：
- `workspace.tabs.items` 加 `"newRepository": "New Repository"`
- `workspace.panel.eyebrows` 加 `"create": "Create"`
- `workspace.panel.headings` 加 `"newRepository": "Create a new repository"`
- `workspace.panel.descriptions` 加 `"newRepository": "Set up a repository under your account or an organization."`

`zh.json` 对应：
- `workspace.tabs.items` 加 `"newRepository": "新建仓库"`
- `workspace.panel.eyebrows` 加 `"create": "创建"`
- `workspace.panel.headings` 加 `"newRepository": "创建新仓库"`
- `workspace.panel.descriptions` 加 `"newRepository": "在你的账号或组织下创建仓库。"`

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm --filter @oh-my-github/client test workspace-url && pnpm --filter @oh-my-github/client test locales && pnpm --filter @oh-my-github/client typecheck`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/renderer/pages/workspace packages/client/src/renderer/i18n
git commit -m "feat(workspace): add new-repository tab type"
```

---

### Task 5: New Repository 页面

**Files:**
- Create: `packages/client/src/renderer/pages/new-repository/new-repository-page.vue`
- Modify: `packages/client/src/renderer/pages/workspace/components/workspace-panel.vue`（import + `v-else-if` 分支，放在 `InboxPage` 分支之前）
- Modify: `packages/client/src/renderer/i18n/locales/en.json`、`zh.json`（顶层 `newRepository` 命名空间，放在 `"notFound"` 之后）

**Interfaces:**
- Consumes: Task 3 的 `createRepository` / `useGitignoreTemplatesQuery` / `useLicenseTemplatesQuery`；Task 4 的 tab type；既有 `useOrganizationsQuery`（`@/composables/github/use-organizations`）、`useAccountListInvalidation().invalidateOwnedRepositories(owner)`（`@/composables/github/use-accounts`）、`resolveErrorMessage`（`@/pages/settings/components/github/github-settings-utils`）、`createRepositoryWorkspaceUrl`（`@/pages/workspace/workspace-url`）、`useToast`（`@/composables/use-toast`）
- Produces: `NewRepositoryPage` 组件，props `{ viewer: AuthViewer | null }`，emits `replaceActiveUrl: [url: string]`

- [ ] **Step 1: 页面组件**

创建 `packages/client/src/renderer/pages/new-repository/new-repository-page.vue`：

```vue
<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  Button,
  Checkbox,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
} from '@oh-my-github/ui'
import { useOrganizationsQuery } from '@/composables/github/use-organizations'
import { useAccountListInvalidation } from '@/composables/github/use-accounts'
import {
  createRepository,
  useGitignoreTemplatesQuery,
  useLicenseTemplatesQuery,
} from '@/composables/github/use-repositories'
import { useToast } from '@/composables/use-toast'
import { resolveErrorMessage } from '@/pages/settings/components/github/github-settings-utils'
import { createRepositoryWorkspaceUrl } from '@/pages/workspace/workspace-url'

const NONE_VALUE = 'none'
const REPOSITORY_NAME_PATTERN = /^[A-Za-z0-9_.-]+$/

const props = defineProps<{
  viewer: AuthViewer | null
}>()

const emit = defineEmits<{
  replaceActiveUrl: [url: string]
}>()

const { t } = useI18n()
const toast = useToast()
const { invalidateOwnedRepositories } = useAccountListInvalidation()
const organizationsQuery = useOrganizationsQuery()
const gitignoreTemplatesQuery = useGitignoreTemplatesQuery()
const licenseTemplatesQuery = useLicenseTemplatesQuery()

const viewerLogin = computed(() => props.viewer?.login ?? '')
const organizations = computed(() => organizationsQuery.data.value ?? [])
const gitignoreTemplates = computed(() => gitignoreTemplatesQuery.data.value ?? [])
const licenseTemplates = computed(() => licenseTemplatesQuery.data.value ?? [])
const templatesFailed = computed(() =>
  Boolean(gitignoreTemplatesQuery.error.value || licenseTemplatesQuery.error.value))

const form = reactive({
  owner: '',
  name: '',
  description: '',
  visibility: 'public' as 'public' | 'private',
  initReadme: false,
  gitignoreTemplate: NONE_VALUE,
  licenseTemplate: NONE_VALUE,
})
const nameError = ref('')
const isCreating = ref(false)

const selectedOwner = computed(() => form.owner || viewerLogin.value)

async function submit(): Promise<void> {
  if (isCreating.value) return

  nameError.value = ''
  const name = form.name.trim()

  if (!name) {
    nameError.value = t('newRepository.validation.nameRequired')
    return
  }

  if (!REPOSITORY_NAME_PATTERN.test(name)) {
    nameError.value = t('newRepository.validation.nameInvalid')
    return
  }

  isCreating.value = true

  try {
    const created = await createRepository({
      organization: selectedOwner.value === viewerLogin.value ? null : selectedOwner.value,
      name,
      description: form.description.trim() || null,
      visibility: form.visibility,
      autoInit: form.initReadme,
      gitignoreTemplate: form.gitignoreTemplate === NONE_VALUE ? null : form.gitignoreTemplate,
      licenseTemplate: form.licenseTemplate === NONE_VALUE ? null : form.licenseTemplate,
    })
    toast.success(t('newRepository.toasts.created', { name: created.nameWithOwner }))
    invalidateOwnedRepositories(created.owner)
    emit('replaceActiveUrl', createRepositoryWorkspaceUrl(created.owner, created.name))
  } catch (error) {
    const message = resolveErrorMessage(error)

    if (message && /already exists/i.test(message)) {
      nameError.value = message
    } else {
      toast.error(t('newRepository.toasts.createFailed'), { description: message })
    }
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <section class="min-h-full bg-background">
    <form
      class="mx-auto grid w-full max-w-2xl gap-6 px-6 py-8"
      @submit.prevent="submit"
    >
      <div class="grid gap-1">
        <h1 class="text-heading font-semibold text-foreground">
          {{ t('newRepository.title') }}
        </h1>
        <p class="text-sm text-muted-foreground">
          {{ t('newRepository.description') }}
        </p>
      </div>

      <div class="grid grid-cols-[minmax(0,220px)_minmax(0,1fr)] items-end gap-3">
        <div class="grid gap-2">
          <Label for="new-repository-owner">{{ t('newRepository.fields.owner') }}</Label>
          <Select v-model="form.owner">
            <SelectTrigger
              id="new-repository-owner"
              class="w-full"
            >
              <SelectValue :placeholder="viewerLogin" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="viewerLogin">
                {{ viewerLogin }}
              </SelectItem>
              <SelectItem
                v-for="organization in organizations"
                :key="organization.login"
                :value="organization.login"
              >
                {{ organization.login }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="grid gap-2">
          <Label for="new-repository-name">{{ t('newRepository.fields.name') }}</Label>
          <Input
            id="new-repository-name"
            v-model="form.name"
            autocomplete="off"
            :placeholder="t('newRepository.fields.namePlaceholder')"
            spellcheck="false"
          />
        </div>
      </div>
      <p
        v-if="nameError"
        class="-mt-4 text-sm text-destructive"
      >
        {{ nameError }}
      </p>

      <div class="grid gap-2">
        <Label for="new-repository-description">{{ t('newRepository.fields.description') }}</Label>
        <Input
          id="new-repository-description"
          v-model="form.description"
          autocomplete="off"
        />
      </div>

      <div class="grid gap-2">
        <Label>{{ t('newRepository.fields.visibility') }}</Label>
        <RadioGroup
          v-model="form.visibility"
          class="grid gap-2"
        >
          <label class="flex items-start gap-3">
            <RadioGroupItem
              class="mt-0.5"
              value="public"
            />
            <span class="grid gap-0.5">
              <span class="text-sm font-medium text-foreground">{{ t('newRepository.fields.public') }}</span>
              <span class="text-sm text-muted-foreground">{{ t('newRepository.fields.publicHint') }}</span>
            </span>
          </label>
          <label class="flex items-start gap-3">
            <RadioGroupItem
              class="mt-0.5"
              value="private"
            />
            <span class="grid gap-0.5">
              <span class="text-sm font-medium text-foreground">{{ t('newRepository.fields.private') }}</span>
              <span class="text-sm text-muted-foreground">{{ t('newRepository.fields.privateHint') }}</span>
            </span>
          </label>
        </RadioGroup>
      </div>

      <label class="flex items-center gap-3">
        <Checkbox v-model="form.initReadme" />
        <span class="text-sm text-foreground">{{ t('newRepository.fields.initReadme') }}</span>
      </label>

      <div class="grid grid-cols-2 gap-3">
        <div class="grid gap-2">
          <Label for="new-repository-gitignore">{{ t('newRepository.fields.gitignore') }}</Label>
          <Select v-model="form.gitignoreTemplate">
            <SelectTrigger
              id="new-repository-gitignore"
              class="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NONE_VALUE">
                {{ t('newRepository.fields.none') }}
              </SelectItem>
              <SelectItem
                v-for="template in gitignoreTemplates"
                :key="template"
                :value="template"
              >
                {{ template }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="grid gap-2">
          <Label for="new-repository-license">{{ t('newRepository.fields.license') }}</Label>
          <Select v-model="form.licenseTemplate">
            <SelectTrigger
              id="new-repository-license"
              class="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="NONE_VALUE">
                {{ t('newRepository.fields.none') }}
              </SelectItem>
              <SelectItem
                v-for="license in licenseTemplates"
                :key="license.key"
                :value="license.key"
              >
                {{ license.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <p
        v-if="templatesFailed"
        class="-mt-4 text-sm text-muted-foreground"
      >
        {{ t('newRepository.templatesError') }}
      </p>

      <div class="flex justify-end border-t border-border pt-4">
        <Button
          :disabled="isCreating"
          type="submit"
        >
          <Spinner v-if="isCreating" />
          {{ t('newRepository.actions.create') }}
        </Button>
      </div>
    </form>
  </section>
</template>
```

- [ ] **Step 2: workspace-panel 接线**

`workspace-panel.vue`：script 里加

```ts
import NewRepositoryPage from '@/pages/new-repository/new-repository-page.vue'
```

template 里 `InboxPage` 分支之前加：

```vue
  <NewRepositoryPage
    v-else-if="tab.type === 'new-repository'"
    :viewer="viewer"
    @replace-active-url="emit('replaceActiveUrl', $event)"
  />
```

- [ ] **Step 3: i18n**

`en.json` 顶层（`"notFound"` 之后）加：

```json
"newRepository": {
  "title": "Create a new repository",
  "description": "A repository contains all project files, including the revision history.",
  "fields": {
    "owner": "Owner",
    "name": "Repository name",
    "namePlaceholder": "my-new-repo",
    "description": "Description (optional)",
    "visibility": "Visibility",
    "public": "Public",
    "publicHint": "Anyone on the internet can see this repository.",
    "private": "Private",
    "privateHint": "You choose who can see and commit to this repository.",
    "initReadme": "Initialize this repository with a README",
    "gitignore": ".gitignore template",
    "license": "License",
    "none": "None"
  },
  "validation": {
    "nameRequired": "Repository name is required.",
    "nameInvalid": "Repository names can only contain letters, numbers, hyphens, underscores, and periods."
  },
  "templatesError": "Failed to load templates. You can still create the repository without them.",
  "actions": {
    "create": "Create repository"
  },
  "toasts": {
    "created": "Created {name}",
    "createFailed": "Failed to create repository"
  }
}
```

`zh.json` 对应：

```json
"newRepository": {
  "title": "创建新仓库",
  "description": "仓库包含项目的全部文件及修订历史。",
  "fields": {
    "owner": "所有者",
    "name": "仓库名称",
    "namePlaceholder": "my-new-repo",
    "description": "描述（可选）",
    "visibility": "可见性",
    "public": "公开",
    "publicHint": "互联网上的任何人都能看到这个仓库。",
    "private": "私有",
    "privateHint": "由你决定谁可以查看和提交这个仓库。",
    "initReadme": "使用 README 初始化仓库",
    "gitignore": ".gitignore 模板",
    "license": "许可证",
    "none": "无"
  },
  "validation": {
    "nameRequired": "仓库名称不能为空。",
    "nameInvalid": "仓库名称只能包含字母、数字、连字符、下划线和点。"
  },
  "templatesError": "模板加载失败，不影响创建仓库。",
  "actions": {
    "create": "创建仓库"
  },
  "toasts": {
    "created": "已创建 {name}",
    "createFailed": "创建仓库失败"
  }
}
```

- [ ] **Step 4: 验证**

Run: `pnpm --filter @oh-my-github/client test locales && pnpm --filter @oh-my-github/client typecheck`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/renderer/pages/new-repository packages/client/src/renderer/pages/workspace/components/workspace-panel.vue packages/client/src/renderer/i18n
git commit -m "feat(new-repository): add create repository page"
```

---

### Task 6: 侧边栏 New 下拉入口 + 收尾验证

**Files:**
- Modify: `packages/client/src/renderer/pages/workspace/components/workspace-sidebar.vue`（常量 ~74 行、`syncActiveItem` ~268 行、Inbox 菜单项 ~490 行之后）
- Modify: `packages/client/src/renderer/i18n/locales/en.json`、`zh.json`（`workspace.sidebar.items`）

**Interfaces:**
- Consumes: Task 4 的 `/new-repository` URL；sidebar 既有 `selectSidebarItem(url, itemId)`、`emit('openGitHubUrl', url)`（父级 workspace-page 已把该事件接到系统浏览器打开）
- Produces: 无下游依赖

- [ ] **Step 1: 实现**

`workspace-sidebar.vue`：

常量区（`INBOX_ITEM_ID` 旁）加：

```ts
const NEW_ITEM_ID = 'workspace-sidebar:new'
const NEW_ORGANIZATION_URL = 'https://github.com/account/organizations/new'
```

lucide 导入加 `Plus`、`Book`、`Building2`、`ExternalLink`（已有的不重复）；`@oh-my-github/ui` 导入加 `DropdownMenu`、`DropdownMenuContent`、`DropdownMenuItem`、`DropdownMenuTrigger`。

`isInboxActive` 旁加：

```ts
function isNewActive(): boolean {
  return activeItemId.value ? activeItemId.value === NEW_ITEM_ID : props.activeUrl === '/new-repository'
}
```

`syncActiveItem` 里的 `nextItemId` 计算改为：

```ts
  const nextItemId = props.activeUrl === '/inbox'
    ? INBOX_ITEM_ID
    : props.activeUrl === '/new-repository'
      ? NEW_ITEM_ID
      : findFirstItemIdByUrl([
        ...bookmarkItems.value,
        ...pullRequestItems.value,
        ...issueItems.value,
        ...organizationItems.value,
      ], props.activeUrl)
```

Inbox 的 `</SidebarMenuItem>` 之后加：

```vue
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger as-child>
              <SidebarMenuButton
                class="before:hidden"
                size="sm"
                :is-active="isNewActive()"
                :tooltip="t('workspace.sidebar.items.new')"
                type="button"
              >
                <Plus />
                <span>{{ t('workspace.sidebar.items.new') }}</span>
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              side="right"
            >
              <DropdownMenuItem @select="selectSidebarItem('/new-repository', NEW_ITEM_ID)">
                <Book />
                {{ t('workspace.sidebar.items.newRepository') }}
              </DropdownMenuItem>
              <DropdownMenuItem @select="emit('openGitHubUrl', NEW_ORGANIZATION_URL)">
                <Building2 />
                {{ t('workspace.sidebar.items.newOrganization') }}
                <ExternalLink class="ml-auto size-3.5 text-muted-foreground" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
```

i18n——`en.json` `workspace.sidebar.items`：

```json
"items": {
  "inbox": "Inbox",
  "new": "New",
  "newRepository": "Repository",
  "newOrganization": "Organization"
}
```

`zh.json`：

```json
"items": {
  "inbox": "收件箱",
  "new": "新建",
  "newRepository": "仓库",
  "newOrganization": "组织"
}
```

（zh 的 `inbox` 以文件中现值为准，不要覆盖已有翻译。）

- [ ] **Step 2: 全量验证**

Run: `pnpm --filter @oh-my-github/client test && pnpm --filter @oh-my-github/api test && pnpm typecheck`
Expected: 全部 PASS

- [ ] **Step 3: 手动验证（用户有 HMR 时可直接看）**

`pnpm dev` 启动后确认：侧边栏 Inbox 下出现"New"；菜单里 Repository 打开新建仓库 Tab，表单可提交（或用只读检查：owner 下拉含个人 + 组织、模板下拉有数据）；Organization 项在系统浏览器打开 github.com/account/organizations/new。

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/renderer/pages/workspace/components/workspace-sidebar.vue packages/client/src/renderer/i18n
git commit -m "feat(sidebar): add New menu with repository and organization entries"
```
