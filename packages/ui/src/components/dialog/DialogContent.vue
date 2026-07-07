<script setup lang="ts">
import type { DialogContentEmits, DialogContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { reactiveOmit } from '@vueuse/core'
import {
  DialogContent,
  DialogPortal,
  useForwardPropsEmits,
} from 'reka-ui'
import { cn } from '#/lib/utils'
import DialogCloseButton from './DialogCloseButton.vue'
import DialogOverlay from './DialogOverlay.vue'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<DialogContentProps & {
  class?: HTMLAttributes['class']
  showCloseButton?: boolean
}>(), {
  showCloseButton: true,
})
const emits = defineEmits<DialogContentEmits>()

const delegatedProps = reactiveOmit(props, 'class')

const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <DialogPortal>
    <!--
      Center via grid on the overlay, NOT translate(-50%,-50%) on the panel. The
      old translate-centering blocked promoting the panel to its own compositing
      layer: a fractional translate lands the 1px hairline on a half-pixel and
      blurs it. Integer grid-centering keeps the panel crisp, so the overlay can
      safely carry a will-change:transform compositing hint.

      That hint is the actual bug fix: the PR page's overflow-auto scroll section
      is a PERMANENT GPU layer, while the modal panel was only TRANSIENTLY
      composited during its open animation and then de-promoted. In the
      de-promotion window Chromium intermittently composited the scroll layer
      ABOVE the panel, so background text bled through the opaque card. A stable
      composited overlay pins the modal above the scroll layer for good.
    -->
    <DialogOverlay class="grid place-items-center [will-change:transform]">
      <DialogContent
        data-slot="dialog-content"
        v-bind="{ ...$attrs, ...forwarded }"
        :class="
          cn(
            // Same modal edge as CommandDialog (--border-menu-elevated): LIGHT mode has
            // NO border (the card already separates from the dark scrim by luminance + the
            // shadow; a dark hairline the same darkness as the scrim only muddies it), DARK
            // mode keeps a white hairline so a dark card stays detached from a dark scrim.
            'bg-card border border-[color:var(--border-menu-elevated)]',
            // Enter/exit aligned with CommandDialog: a fast (100ms) fade + a subtle 2%
            // zoom so every modal surface opens with the same snappy motion.
            'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-[0.98] data-[state=open]:zoom-in-[0.98]',
            'relative z-50 grid w-full max-w-[calc(100%-2rem)] gap-4 rounded-xl p-6 shadow-[var(--shadow-modal)] duration-100 sm:max-w-md',
            props.class,
          )"
      >
        <slot />

        <DialogCloseButton v-if="showCloseButton" />
      </DialogContent>
    </DialogOverlay>
  </DialogPortal>
</template>
