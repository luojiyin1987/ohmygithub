<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Mail, Search, ShieldAlert, Trash2, UserPlus, UserRound, Users } from 'lucide-vue-next'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  Label,
  NativeSelect,
  NativeSelectOption,
  Skeleton,
  Spinner,
} from '@oh-my-github/ui'
import AppPagination from '@/components/navigation/app-pagination.vue'
import TabSwitcher, { type TabSwitcherItem } from '@/components/navigation/tab-switcher.vue'
import {
  cancelOrganizationInvitation,
  inviteOrganizationMember,
  removeOrganizationMember,
  setOrganizationMemberRole,
  setOrganizationMembershipVisibility,
  useOrganizationInvitationsQuery,
  useOrganizationPeopleInvalidation,
  useOrganizationPeopleQuery,
} from '@/composables/github/use-organization-people'
import { useToast } from '@/composables/use-toast'

const props = defineProps<{
  login: string
  viewerLogin: string | null
}>()

const emit = defineEmits<{
  selectAccount: [login: string]
}>()

type PeopleTabId = 'members' | 'invitations'
type RoleFilter = 'all' | 'admin' | 'member'

const PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 300

const { t } = useI18n()
const toast = useToast()
const { invalidatePeople, invalidateInvitations } = useOrganizationPeopleInvalidation()

const activeTab = ref<PeopleTabId>('members')
const membersPage = ref(1)
const searchInput = ref('')
const search = ref('')
const roleFilter = ref<RoleFilter>('all')
const busyLogin = ref<string | null>(null)
const busyInvitationId = ref<number | null>(null)
const removingMember = ref<GitHubOrganizationMember | null>(null)
const isRemoving = ref(false)
const isInviteOpen = ref(false)
const inviteIdentifier = ref('')
const inviteRole = ref<GitHubOrganizationMemberRole>('member')
const isInviting = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

const hasLogin = computed(() => props.login.trim().length > 0)
const peopleQuery = useOrganizationPeopleQuery(() => props.login, hasLogin)
const people = computed(() => peopleQuery.data.value ?? null)
const canAdminister = computed(() =>
  Boolean(people.value?.viewerCanAdminister) && (people.value?.missingAdminScopes ?? []).length === 0
)
const missingAdminScopes = computed(() =>
  people.value?.viewerCanAdminister ? people.value.missingAdminScopes : []
)
const invitationsQuery = useOrganizationInvitationsQuery(
  () => props.login,
  () => hasLogin.value && canAdminister.value,
)
const invitations = computed(() => invitationsQuery.data.value ?? [])

const filteredMembers = computed(() => {
  const members = people.value?.members ?? []
  const terms = search.value.toLowerCase()
  return members.filter((member) => {
    if (roleFilter.value !== 'all' && member.role !== roleFilter.value) return false
    if (!terms) return true
    return member.login.toLowerCase().includes(terms)
      || (member.name ?? '').toLowerCase().includes(terms)
  })
})
const pagedMembers = computed(() => {
  const offset = (membersPage.value - 1) * PER_PAGE
  return filteredMembers.value.slice(offset, offset + PER_PAGE)
})
const isLoading = computed(() => peopleQuery.isLoading.value)
const hasError = computed(() => Boolean(peopleQuery.error.value))
const tabs = computed<TabSwitcherItem[]>(() => {
  const entries: TabSwitcherItem[] = [{
    id: 'members',
    icon: Users,
    label: t('account.people.tabs.members'),
    count: people.value?.totalCount ?? null,
  }]

  if (canAdminister.value) {
    entries.push({
      id: 'invitations',
      icon: Mail,
      label: t('account.people.tabs.invitations'),
      count: invitationsQuery.data.value ? invitations.value.length : null,
    })
  }

  return entries
})

watch(
  () => props.login,
  () => {
    activeTab.value = 'members'
    membersPage.value = 1
    searchInput.value = ''
    search.value = ''
    roleFilter.value = 'all'
  },
)

watch(searchInput, (value) => {
  clearSearchTimer()

  searchTimer = setTimeout(() => {
    search.value = value.trim()
    membersPage.value = 1
    searchTimer = null
  }, SEARCH_DEBOUNCE_MS)
})

watch([roleFilter], () => {
  membersPage.value = 1
})

watch(canAdminister, (value) => {
  if (!value && activeTab.value === 'invitations') {
    activeTab.value = 'members'
  }
})

onBeforeUnmount(() => {
  clearSearchTimer()
})

function clearSearchTimer(): void {
  if (!searchTimer) return

  clearTimeout(searchTimer)
  searchTimer = null
}

function fallbackInitials(login: string): string {
  return login.slice(0, 2).toUpperCase()
}

function isViewerRow(member: GitHubOrganizationMember): boolean {
  return Boolean(props.viewerLogin && member.login.toLowerCase() === props.viewerLogin.toLowerCase())
}

async function changeRole(member: GitHubOrganizationMember, role: string): Promise<void> {
  const nextRole = role === 'admin' ? 'admin' : 'member'
  if (nextRole === member.role || busyLogin.value) return

  busyLogin.value = member.login

  try {
    await setOrganizationMemberRole({ org: props.login, login: member.login, role: nextRole })
    toast.success(t('account.people.toasts.roleUpdated', { login: member.login }))
    invalidatePeople(props.login)
  } catch (error) {
    toast.error(t('account.people.toasts.errorTitle'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    busyLogin.value = null
  }
}

async function toggleVisibility(member: GitHubOrganizationMember): Promise<void> {
  if (busyLogin.value) return

  busyLogin.value = member.login

  try {
    await setOrganizationMembershipVisibility({
      org: props.login,
      login: member.login,
      publicized: !member.isPublic,
    })
    toast.success(t(member.isPublic
      ? 'account.people.toasts.visibilityPrivate'
      : 'account.people.toasts.visibilityPublic'))
    invalidatePeople(props.login)
  } catch (error) {
    toast.error(t('account.people.toasts.errorTitle'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    busyLogin.value = null
  }
}

async function confirmRemove(): Promise<void> {
  const member = removingMember.value
  if (!member || isRemoving.value) return

  isRemoving.value = true

  try {
    await removeOrganizationMember({ org: props.login, login: member.login })
    toast.success(t('account.people.toasts.removed', { login: member.login }))
    removingMember.value = null
    invalidatePeople(props.login)
  } catch (error) {
    toast.error(t('account.people.toasts.errorTitle'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isRemoving.value = false
  }
}

function openInvite(): void {
  inviteIdentifier.value = ''
  inviteRole.value = 'member'
  isInviteOpen.value = true
}

async function submitInvite(): Promise<void> {
  const identifier = inviteIdentifier.value.trim()
  if (!identifier || isInviting.value) return

  isInviting.value = true

  try {
    await inviteOrganizationMember({ org: props.login, identifier, role: inviteRole.value })
    toast.success(t('account.people.invite.success', { identifier }))
    isInviteOpen.value = false
    invalidateInvitations(props.login)
  } catch (error) {
    toast.error(t('account.people.toasts.errorTitle'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    isInviting.value = false
  }
}

async function cancelInvitation(invitation: GitHubOrganizationInvitation): Promise<void> {
  if (busyInvitationId.value) return

  busyInvitationId.value = invitation.id

  try {
    await cancelOrganizationInvitation({ org: props.login, invitationId: invitation.id })
    toast.success(t('account.people.invitations.canceled'))
    invalidateInvitations(props.login)
  } catch (error) {
    toast.error(t('account.people.toasts.errorTitle'), {
      description: resolveErrorMessage(error),
    })
  } finally {
    busyInvitationId.value = null
  }
}

function invitationTitle(invitation: GitHubOrganizationInvitation): string {
  return invitation.login ?? invitation.email ?? ''
}

function invitationRoleLabel(role: GitHubOrganizationInvitationRole): string {
  if (role === 'admin') return t('account.people.role.admin')
  if (role === 'billing_manager') return t('account.people.role.billingManager')
  return t('account.people.role.member')
}

function formatDate(value: string | null): string {
  if (!value) return ''

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value))
}

function resolveErrorMessage(error: unknown): string | undefined {
  if (!(error instanceof Error)) return undefined

  const message = error.message
    .replace(/^Error invoking remote method '[^']+':\s*/, '')
    .replace(/^Error:\s*/, '')
    .trim()

  return message || undefined
}
</script>

<template>
  <section class="grid gap-3">
    <div class="flex min-w-0 flex-wrap items-center justify-between gap-2">
      <TabSwitcher
        :active-id="activeTab"
        :navigation-label="t('account.people.tabsLabel')"
        :tabs="tabs"
        @update:active-id="activeTab = $event as PeopleTabId"
      />

      <Button
        v-if="canAdminister"
        size="sm"
        type="button"
        @click="openInvite"
      >
        <UserPlus class="size-3.5" />
        {{ t('account.people.actions.invite') }}
      </Button>
    </div>

    <div
      v-if="missingAdminScopes.length > 0"
      class="rounded-lg border border-warning/30 bg-warning/10 p-3 text-body text-muted-foreground"
    >
      {{ t('account.people.missingAdminScope', { scopes: missingAdminScopes.join(', ') }) }}
    </div>

    <template v-if="activeTab === 'members'">
      <div class="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <NativeSelect
          v-model="roleFilter"
          :aria-label="t('account.people.roleFilter.label')"
          size="sm"
        >
          <NativeSelectOption value="all">
            {{ t('account.people.roleFilter.all') }}
          </NativeSelectOption>
          <NativeSelectOption value="admin">
            {{ t('account.people.role.admin') }}
          </NativeSelectOption>
          <NativeSelectOption value="member">
            {{ t('account.people.role.member') }}
          </NativeSelectOption>
        </NativeSelect>
        <InputGroup
          class="w-full sm:max-w-xs"
          size="sm"
        >
          <InputGroupAddon>
            <Search class="size-3.5 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            v-model="searchInput"
            :placeholder="t('account.people.searchPlaceholder')"
            type="search"
          />
        </InputGroup>
      </div>

      <div
        v-if="isLoading && !people"
        class="grid gap-2"
      >
        <Skeleton
          v-for="index in 6"
          :key="index"
          class="h-16 rounded-lg"
        />
      </div>

      <Empty
        v-else-if="hasError"
        class="min-h-[18rem] border border-border bg-card"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('account.people.error.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('account.people.error.description') }}
          </EmptyDescription>
          <Button
            class="justify-self-center"
            size="sm"
            type="button"
            variant="outline"
            @click="peopleQuery.refetch()"
          >
            {{ t('account.error.retry') }}
          </Button>
        </EmptyHeader>
      </Empty>

      <Empty
        v-else-if="filteredMembers.length === 0"
        class="min-h-[18rem] border border-border bg-card"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('account.people.empty.members.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('account.people.empty.members.description') }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <template v-else>
        <p
          v-if="people?.truncated"
          class="text-body text-muted-foreground"
        >
          {{ t('account.people.truncated') }}
        </p>

        <ul class="grid gap-2">
          <li
            v-for="member in pagedMembers"
            :key="member.login"
          >
            <div class="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
              <Avatar
                class="size-10 shrink-0 cursor-pointer"
                @click="emit('selectAccount', member.login)"
              >
                <AvatarImage
                  :alt="member.login"
                  :src="member.avatarUrl"
                />
                <AvatarFallback class="text-label">
                  {{ fallbackInitials(member.login) }}
                </AvatarFallback>
              </Avatar>

              <div class="grid min-w-0 flex-1 gap-0.5">
                <div class="flex min-w-0 items-center gap-2">
                  <button
                    class="truncate text-label font-medium text-foreground underline-offset-4 hover:underline"
                    type="button"
                    @click="emit('selectAccount', member.login)"
                  >
                    {{ member.name || member.login }}
                  </button>
                  <span class="truncate text-body text-muted-foreground">
                    {{ member.login }}
                  </span>
                  <ShieldAlert
                    v-if="member.hasTwoFactorEnabled === false"
                    :aria-label="t('account.people.twoFactorDisabled')"
                    class="size-3.5 shrink-0 text-warning"
                  />
                </div>
                <div class="flex min-w-0 items-center gap-1.5">
                  <Badge :variant="member.role === 'admin' ? 'info' : 'secondary'">
                    {{ t(member.role === 'admin' ? 'account.people.role.admin' : 'account.people.role.member') }}
                  </Badge>
                  <Badge variant="outline">
                    {{ t(member.isPublic ? 'account.people.visibility.public' : 'account.people.visibility.private') }}
                  </Badge>
                </div>
              </div>

              <div class="flex shrink-0 items-center gap-1.5">
                <Button
                  v-if="isViewerRow(member)"
                  :disabled="busyLogin !== null"
                  size="sm"
                  type="button"
                  variant="outline"
                  @click="toggleVisibility(member)"
                >
                  <Spinner
                    v-if="busyLogin === member.login"
                    class="size-3.5"
                  />
                  <UserRound
                    v-else
                    class="size-3.5"
                  />
                  {{ t(member.isPublic
                    ? 'account.people.visibility.makePrivate'
                    : 'account.people.visibility.makePublic') }}
                </Button>

                <template v-if="canAdminister">
                  <NativeSelect
                    :aria-label="t('account.people.roleSelectLabel', { login: member.login })"
                    :disabled="busyLogin !== null"
                    :model-value="member.role"
                    size="sm"
                    @update:model-value="changeRole(member, String($event))"
                  >
                    <NativeSelectOption value="member">
                      {{ t('account.people.role.member') }}
                    </NativeSelectOption>
                    <NativeSelectOption value="admin">
                      {{ t('account.people.role.admin') }}
                    </NativeSelectOption>
                  </NativeSelect>
                  <Button
                    :aria-label="t('account.people.actions.remove', { login: member.login })"
                    :disabled="busyLogin !== null"
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                    @click="removingMember = member"
                  >
                    <Trash2 class="size-3.5 text-destructive" />
                  </Button>
                </template>
              </div>
            </div>
          </li>
        </ul>

        <AppPagination
          v-model:page="membersPage"
          :disabled="isLoading"
          hide-when-single-page
          :max-total="Math.max(filteredMembers.length, PER_PAGE)"
          :per-page="PER_PAGE"
          summary-key="account.people.pagination.summary"
          :total-count="filteredMembers.length"
        />
      </template>
    </template>

    <template v-else>
      <div
        v-if="invitationsQuery.isLoading.value && invitations.length === 0"
        class="grid gap-2"
      >
        <Skeleton
          v-for="index in 4"
          :key="index"
          class="h-16 rounded-lg"
        />
      </div>

      <Empty
        v-else-if="Boolean(invitationsQuery.error.value)"
        class="min-h-[18rem] border border-border bg-card"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('account.people.error.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('account.people.error.description') }}
          </EmptyDescription>
          <Button
            class="justify-self-center"
            size="sm"
            type="button"
            variant="outline"
            @click="invitationsQuery.refetch()"
          >
            {{ t('account.error.retry') }}
          </Button>
        </EmptyHeader>
      </Empty>

      <Empty
        v-else-if="invitations.length === 0"
        class="min-h-[18rem] border border-border bg-card"
      >
        <EmptyHeader>
          <EmptyTitle>
            {{ t('account.people.empty.invitations.title') }}
          </EmptyTitle>
          <EmptyDescription>
            {{ t('account.people.empty.invitations.description') }}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>

      <ul
        v-else
        class="grid gap-2"
      >
        <li
          v-for="invitation in invitations"
          :key="invitation.id"
        >
          <div class="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card p-3">
            <div class="grid size-10 shrink-0 place-items-center rounded-full bg-muted">
              <Mail class="size-4 text-muted-foreground" />
            </div>

            <div class="grid min-w-0 flex-1 gap-0.5">
              <div class="flex min-w-0 items-center gap-2">
                <span class="truncate text-label font-medium text-foreground">
                  {{ invitationTitle(invitation) }}
                </span>
                <Badge variant="secondary">
                  {{ invitationRoleLabel(invitation.role) }}
                </Badge>
              </div>
              <p class="truncate text-body text-muted-foreground">
                {{ t('account.people.invitations.meta', {
                  date: formatDate(invitation.createdAt),
                  inviter: invitation.inviterLogin ?? '—',
                }) }}
              </p>
            </div>

            <Button
              :disabled="busyInvitationId !== null"
              size="sm"
              type="button"
              variant="outline"
              @click="cancelInvitation(invitation)"
            >
              <Spinner
                v-if="busyInvitationId === invitation.id"
                class="size-3.5"
              />
              {{ t('account.people.invitations.cancel') }}
            </Button>
          </div>
        </li>
      </ul>
    </template>

    <Dialog
      :open="removingMember !== null"
      @update:open="(open) => { if (!open && !isRemoving) removingMember = null }"
    >
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('account.people.remove.title', { login: removingMember?.login ?? '' }) }}</DialogTitle>
          <DialogDescription>
            {{ t('account.people.remove.description', { login: removingMember?.login ?? '', org: login }) }}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            :disabled="isRemoving"
            size="sm"
            type="button"
            variant="outline"
            @click="removingMember = null"
          >
            {{ t('account.people.remove.cancel') }}
          </Button>
          <Button
            :disabled="isRemoving"
            size="sm"
            type="button"
            variant="destructive"
            @click="confirmRemove"
          >
            <Spinner
              v-if="isRemoving"
              class="size-3.5"
            />
            {{ t('account.people.remove.confirm') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog
      :open="isInviteOpen"
      @update:open="(open) => { if (!isInviting) isInviteOpen = open }"
    >
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t('account.people.invite.title') }}</DialogTitle>
          <DialogDescription>
            {{ t('account.people.invite.description') }}
          </DialogDescription>
        </DialogHeader>
        <div class="grid gap-3">
          <div class="grid gap-1.5">
            <Label for="invite-identifier">{{ t('account.people.invite.identifierLabel') }}</Label>
            <Input
              id="invite-identifier"
              v-model="inviteIdentifier"
              :placeholder="t('account.people.invite.identifierPlaceholder')"
              type="text"
              @keydown.enter.prevent="submitInvite"
            />
          </div>
          <div class="grid gap-1.5">
            <Label for="invite-role">{{ t('account.people.invite.roleLabel') }}</Label>
            <NativeSelect
              id="invite-role"
              v-model="inviteRole"
              size="sm"
            >
              <NativeSelectOption value="member">
                {{ t('account.people.role.member') }}
              </NativeSelectOption>
              <NativeSelectOption value="admin">
                {{ t('account.people.role.admin') }}
              </NativeSelectOption>
            </NativeSelect>
          </div>
        </div>
        <DialogFooter>
          <Button
            :disabled="isInviting"
            size="sm"
            type="button"
            variant="outline"
            @click="isInviteOpen = false"
          >
            {{ t('account.people.invite.cancel') }}
          </Button>
          <Button
            :disabled="isInviting || inviteIdentifier.trim().length === 0"
            size="sm"
            type="button"
            @click="submitInvite"
          >
            <Spinner
              v-if="isInviting"
              class="size-3.5"
            />
            {{ t('account.people.invite.submit') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
</template>
