<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import WhatsappSettingsPanel from '@/components/whatsapp/WhatsappSettingsPanel.vue'

type SettingsSection = 'geral' | 'whatsapp' | 'senha'

const open = defineModel<boolean>('open', { default: false })

const auth = useAuthStore()

const section = ref<SettingsSection>('geral')
const currentPassword = ref('')
const password = ref('')
const passwordConfirmation = ref('')
const showCurrent = ref(false)
const showPassword = ref(false)
const showConfirmation = ref(false)
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const panelRef = ref<HTMLElement | null>(null)

const sections = computed(() => {
  const items: { id: SettingsSection; label: string; icon: string }[] = [
    { id: 'geral', label: 'Geral', icon: 'lucide:sliders-horizontal' },
  ]
  if (auth.isAdmin) {
    items.push({ id: 'whatsapp', label: 'WhatsApp', icon: 'lucide:message-circle' })
  }
  items.push({ id: 'senha', label: 'Alteração de senha', icon: 'lucide:key-round' })
  return items
})

const canSubmit = computed(
  () =>
    currentPassword.value.length > 0 &&
    password.value.length > 0 &&
    passwordConfirmation.value.length > 0 &&
    !loading.value,
)

function resetForm() {
  currentPassword.value = ''
  password.value = ''
  passwordConfirmation.value = ''
  showCurrent.value = false
  showPassword.value = false
  showConfirmation.value = false
  loading.value = false
  errorMessage.value = ''
  successMessage.value = ''
}

function close() {
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.preventDefault()
    close()
  }
}

watch(open, (isOpen) => {
  if (isOpen) {
    section.value = 'geral'
    resetForm()
  }
})

watch(section, (next) => {
  if (next === 'senha') {
    resetForm()
    requestAnimationFrame(() => {
      panelRef.value?.querySelector<HTMLInputElement>('input')?.focus()
    })
  }
})

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

async function onSubmit() {
  if (!canSubmit.value) return

  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''

  try {
    await auth.changePassword(
      currentPassword.value,
      password.value,
      passwordConfirmation.value,
    )
    successMessage.value = 'Senha alterada com sucesso.'
    currentPassword.value = ''
    password.value = ''
    passwordConfirmation.value = ''
  } catch (error) {
    if (error instanceof ApiError) {
      const details = error.details
      errorMessage.value =
        details?.current_password?.[0] ||
        details?.password?.[0] ||
        details?.password_confirmation?.[0] ||
        error.message ||
        'Não foi possível alterar a senha.'
    } else {
      errorMessage.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-sm sm:p-6"
      role="presentation"
      @click.self="close"
    >
      <div
        ref="panelRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
        class="flex h-[min(90vh,900px)] w-full max-w-[min(1100px,96vw)] flex-col overflow-hidden rounded-2xl border border-brand-ink/10 bg-white shadow-2xl"
        @click.stop
      >
        <header
          class="flex shrink-0 items-start justify-between gap-3 border-b border-brand-ink/10 px-5 pt-5 pb-4 sm:px-6"
        >
          <div class="min-w-0">
            <p class="mb-1 text-[0.65rem] font-medium tracking-[0.22em] text-brand-cyan-ink uppercase">
              Conta
            </p>
            <h2
              id="settings-modal-title"
              class="text-xl font-semibold tracking-tight text-brand-ink"
            >
              Configurações
            </h2>
          </div>
          <button
            type="button"
            class="inline-flex cursor-pointer size-8 items-center justify-center rounded-full text-brand-ink/55 transition hover:bg-[#f4f6f8] hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
            aria-label="Fechar"
            @click="close"
          >
            <Icon icon="lucide:x" class="size-[18px]" aria-hidden="true" />
          </button>
        </header>

        <div class="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav
            class="w-full shrink-0 space-y-1 overflow-y-auto border-b border-brand-ink/10 p-3 sm:w-56 sm:border-r sm:border-b-0 sm:p-4"
            aria-label="Seções de configuração"
          >
            <button
              v-for="item in sections"
              :key="item.id"
              type="button"
              class="flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-blue"
              :class="
                section === item.id
                  ? 'bg-brand-cyan text-brand-ink'
                  : 'text-brand-ink/65 hover:bg-[#f4f6f8] hover:text-brand-ink'
              "
              @click="section = item.id"
            >
              <Icon :icon="item.icon" class="size-[18px] shrink-0" aria-hidden="true" />
              <span class="truncate">{{ item.label }}</span>
            </button>
          </nav>

          <div class="min-h-0 min-w-0 flex-1 overflow-y-auto p-5 sm:p-6">
            <div v-if="section === 'geral'" class="max-w-lg space-y-2">
              <h3 class="text-lg font-semibold text-brand-ink">Geral</h3>
              <p class="text-sm leading-relaxed text-brand-ink/65">
                Configurações gerais em breve.
              </p>
            </div>

            <WhatsappSettingsPanel v-else-if="section === 'whatsapp' && auth.isAdmin" />

            <form
              v-else-if="section === 'senha'"
              class="mx-auto flex max-w-lg flex-col gap-4"
              @submit.prevent="onSubmit"
            >
              <div>
                <h3 class="text-lg font-semibold text-brand-ink">Alteração de senha</h3>
                <p class="mt-1 text-sm leading-relaxed text-brand-ink/65">
                  Altere a senha da sua conta. As demais sessões web serão encerradas.
                </p>
              </div>

              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-brand-ink/80">Senha atual</span>
                <div class="relative">
                  <input
                    v-model="currentPassword"
                    :type="showCurrent ? 'text' : 'password'"
                    name="current_password"
                    autocomplete="current-password"
                    required
                    class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 pr-11 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
                  />
                  <button
                    type="button"
                    class="absolute top-1/2 right-3 grid -translate-y-1/2 cursor-pointer place-items-center text-brand-ink/55 transition hover:text-brand-cyan-ink"
                    :aria-label="showCurrent ? 'Ocultar senha atual' : 'Mostrar senha atual'"
                    @click="showCurrent = !showCurrent"
                  >
                    <Icon :icon="showCurrent ? 'lucide:eye-off' : 'lucide:eye'" class="size-5" />
                  </button>
                </div>
              </label>

              <hr class="my-4 border-brand-ink/10" />

              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-brand-ink/80">Nova senha</span>
                <div class="relative">
                  <input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    name="password"
                    autocomplete="new-password"
                    required
                    class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 pr-11 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
                  />
                  <button
                    type="button"
                    class="absolute top-1/2 right-3 grid -translate-y-1/2 cursor-pointer place-items-center text-brand-ink/55 transition hover:text-brand-cyan-ink"
                    :aria-label="showPassword ? 'Ocultar nova senha' : 'Mostrar nova senha'"
                    @click="showPassword = !showPassword"
                  >
                    <Icon :icon="showPassword ? 'lucide:eye-off' : 'lucide:eye'" class="size-5" />
                  </button>
                </div>
              </label>

              <label class="flex flex-col gap-1.5">
                <span class="text-sm font-medium text-brand-ink/80">Confirmar nova senha</span>
                <div class="relative">
                  <input
                    v-model="passwordConfirmation"
                    :type="showConfirmation ? 'text' : 'password'"
                    name="password_confirmation"
                    autocomplete="new-password"
                    required
                    class="w-full rounded-xl border border-brand-ink/15 bg-white px-4 py-3 pr-11 text-base text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
                  />
                  <button
                    type="button"
                    class="absolute top-1/2 right-3 grid -translate-y-1/2 cursor-pointer place-items-center text-brand-ink/55 transition hover:text-brand-cyan-ink"
                    :aria-label="showConfirmation ? 'Ocultar confirmação' : 'Mostrar confirmação'"
                    @click="showConfirmation = !showConfirmation"
                  >
                    <Icon
                      :icon="showConfirmation ? 'lucide:eye-off' : 'lucide:eye'"
                      class="size-5"
                    />
                  </button>
                </div>
              </label>

              <p
                v-if="errorMessage"
                class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
                role="alert"
              >
                {{ errorMessage }}
              </p>

              <p
                v-if="successMessage"
                class="rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
                role="status"
              >
                {{ successMessage }}
              </p>

              <button
                type="submit"
                :disabled="!canSubmit"
                class="mt-1 w-full cursor-pointer rounded-full bg-brand-cyan px-5 py-3.5 text-base font-semibold text-brand-ink transition hover:-translate-y-px hover:brightness-105 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand-blue disabled:cursor-not-allowed disabled:opacity-55 sm:w-auto sm:self-start sm:px-8"
              >
                <span v-if="loading">Salvando…</span>
                <span v-else>Alterar senha</span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
