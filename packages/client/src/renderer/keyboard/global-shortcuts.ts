import { onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { registerKeyboardShortcutHandler } from './shortcut-runtime'

export function useGlobalKeyboardShortcuts(): void {
  const router = useRouter()
  let unregister: (() => void) | undefined

  onMounted(() => {
    unregister = registerKeyboardShortcutHandler(
      'settings.open',
      () => {
        const route = router.currentRoute.value
        if (route.name === 'auth' || route.name === 'settings') {
          return false
        }

        void router.push({
          path: '/settings',
        })

        return true
      },
    )
  })

  onBeforeUnmount(() => {
    unregister?.()
  })
}
