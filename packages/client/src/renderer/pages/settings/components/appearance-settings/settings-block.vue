<script setup lang="ts">
withDefaults(defineProps<{
  description?: string
  label: string
}>(), {
  description: ''
})
</script>

<template>
  <div class="mx-4 border-b border-border py-3 last:border-b-0">
    <div class="flex min-h-9 items-center justify-between gap-4">
      <div class="min-w-0">
        <div class="text-control font-medium text-foreground">
          {{ label }}
        </div>
        <p
          v-if="description"
          class="mt-0.5 text-body text-muted-foreground"
        >
          {{ description }}
        </p>
      </div>
      <div
        v-if="$slots.actions"
        class="shrink-0"
      >
        <slot name="actions" />
      </div>
    </div>
    <div
      v-if="$slots.default"
      class="mt-3"
    >
      <slot />
    </div>
  </div>
</template>
