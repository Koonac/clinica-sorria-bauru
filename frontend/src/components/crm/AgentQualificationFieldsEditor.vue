<script setup lang="ts">
import { ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import type { AgentQualificationField } from '@/api/crm/agents'

const fields = defineModel<AgentQualificationField[]>({ default: () => [] })
const keyLocked = ref<boolean[]>([])

watch(
  fields,
  (next) => {
    if (keyLocked.value.length === next.length) {
      return
    }
    keyLocked.value = next.map((field, index) => {
      return keyLocked.value[index] ?? Boolean(field.key && field.label)
    })
  },
  { immediate: true },
)

const inputClass =
  'w-full rounded-xl border border-brand-ink/15 bg-white px-3 py-2 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25'

function slugifyKey(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .replace(/^[^a-z]+/, '')
    .slice(0, 40)

  return slug || 'campo'
}

function uniqueKey(base: string, exceptIndex: number): string {
  const used = new Set(
    fields.value.map((f, i) => (i === exceptIndex ? '' : f.key)).filter(Boolean),
  )
  if (!used.has(base)) return base
  for (let n = 2; n < 100; n++) {
    const candidate = `${base.slice(0, 37)}_${n}`.slice(0, 40)
    if (!used.has(candidate)) return candidate
  }
  return `${base.slice(0, 32)}_${Date.now().toString(36)}`.slice(0, 40)
}

function syncLocks(length: number) {
  if (keyLocked.value.length === length) return
  keyLocked.value = Array.from({ length }, (_, i) => keyLocked.value[i] ?? false)
}

function addField() {
  fields.value = [
    ...fields.value,
    { key: uniqueKey('campo', -1), label: '', instruction: '' },
  ]
  keyLocked.value = [...keyLocked.value, false]
}

function removeField(index: number) {
  fields.value = fields.value.filter((_, i) => i !== index)
  keyLocked.value = keyLocked.value.filter((_, i) => i !== index)
}

function moveField(index: number, delta: number) {
  const next = index + delta
  if (next < 0 || next >= fields.value.length) return
  const copy = [...fields.value]
  const [item] = copy.splice(index, 1)
  if (!item) return
  copy.splice(next, 0, item)
  fields.value = copy
  const locks = [...keyLocked.value]
  const [lock] = locks.splice(index, 1)
  locks.splice(next, 0, lock ?? false)
  keyLocked.value = locks
}

function onLabelInput(index: number, label: string) {
  const current = fields.value[index]
  if (!current) return
  syncLocks(fields.value.length)
  const next = [...fields.value]
  next[index] = {
    ...current,
    label,
    key: keyLocked.value[index] ? current.key : uniqueKey(slugifyKey(label), index),
  }
  fields.value = next
}

function onKeyInput(index: number, key: string) {
  const current = fields.value[index]
  if (!current) return
  syncLocks(fields.value.length)
  const next = [...fields.value]
  next[index] = {
    ...current,
    key: key
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 40),
  }
  fields.value = next
  const locks = [...keyLocked.value]
  locks[index] = true
  keyLocked.value = locks
}

function onInstructionInput(index: number, instruction: string) {
  const current = fields.value[index]
  if (!current) return
  const next = [...fields.value]
  next[index] = { ...current, instruction }
  fields.value = next
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-xl border border-brand-ink/10 p-4">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <h3 class="text-sm font-medium text-brand-ink">Informações a descobrir</h3>
        <p class="mt-0.5 text-xs leading-snug text-brand-ink/55">
          A IA tenta obter esses dados na conversa e grava no cartão do lead no kanban.
        </p>
      </div>
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-brand-ink/70 hover:bg-[#f4f6f8]"
        @click="addField"
      >
        <Icon icon="lucide:plus" class="size-3.5" />
        Campo
      </button>
    </div>

    <p v-if="fields.length === 0" class="text-sm text-brand-ink/45">
      Nenhum campo ainda. Ex.: “Funcionários” com a instrução “Descubra quantos funcionários o lead
      tem”.
    </p>

    <article
      v-for="(field, index) in fields"
      :key="index"
      class="rounded-xl border border-brand-ink/10 bg-[#f8fafb] p-3"
    >
      <div class="mb-2 flex items-center justify-between gap-2">
        <span class="text-xs font-medium text-brand-ink/50">Campo {{ index + 1 }}</span>
        <div class="flex items-center gap-0.5">
          <button
            type="button"
            class="rounded-md p-1 text-brand-ink/35 hover:bg-white hover:text-brand-ink disabled:opacity-30"
            :disabled="index === 0"
            aria-label="Mover para cima"
            @click="moveField(index, -1)"
          >
            <Icon icon="lucide:chevron-up" class="size-4" />
          </button>
          <button
            type="button"
            class="rounded-md p-1 text-brand-ink/35 hover:bg-white hover:text-brand-ink disabled:opacity-30"
            :disabled="index === fields.length - 1"
            aria-label="Mover para baixo"
            @click="moveField(index, 1)"
          >
            <Icon icon="lucide:chevron-down" class="size-4" />
          </button>
          <button
            type="button"
            class="rounded-md p-1 text-brand-ink/35 hover:bg-white hover:text-red-600"
            aria-label="Remover campo"
            @click="removeField(index)"
          >
            <Icon icon="lucide:trash-2" class="size-4" />
          </button>
        </div>
      </div>

      <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-brand-ink/70">Rótulo</span>
          <input
            :value="field.label"
            type="text"
            maxlength="80"
            placeholder="Funcionários"
            :class="inputClass"
            @input="onLabelInput(index, ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs font-medium text-brand-ink/70">Chave</span>
          <input
            :value="field.key"
            type="text"
            maxlength="40"
            placeholder="funcionarios"
            :class="[inputClass, 'font-mono']"
            @input="onKeyInput(index, ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="flex flex-col gap-1 sm:col-span-2">
          <span class="text-xs font-medium text-brand-ink/70">Instrução para a IA</span>
          <textarea
            :value="field.instruction"
            rows="2"
            maxlength="500"
            placeholder="Descubra quantos funcionários o lead tem"
            :class="[inputClass, 'resize-y']"
            @input="onInstructionInput(index, ($event.target as HTMLTextAreaElement).value)"
          />
        </label>
      </div>
    </article>
  </section>
</template>
