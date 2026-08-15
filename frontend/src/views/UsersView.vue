<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Icon } from '@iconify/vue'
import { ApiError } from '@/api/client'
import { deleteUser, listUsers } from '@/api/users'
import Button from '@/components/Buttons/Button.vue'
import PageView from '@/components/Layout/PageView.vue'
import UserFormModal from '@/components/Modals/UserFormModal.vue'
import { useAuthStore, type AuthUser } from '@/stores/auth'

const auth = useAuthStore()

const users = ref<AuthUser[]>([])
const loading = ref(false)
const listError = ref('')
const search = ref('')
const formOpen = ref(false)
const editingUser = ref<AuthUser | null>(null)
const deletingUser = ref<AuthUser | null>(null)
const deleteLoading = ref(false)
const deleteError = ref('')
const flash = ref('')

const totalLabel = computed(() => {
  const n = users.value.length
  return n === 1 ? '1 usuário' : `${n} usuários`
})

function roleLabel(role: AuthUser['role']) {
  return role === 'admin' ? 'Administrador' : 'Funcionário'
}

function openCreate() {
  editingUser.value = null
  formOpen.value = true
}

function openEdit(user: AuthUser) {
  editingUser.value = user
  formOpen.value = true
}

function askDelete(user: AuthUser) {
  deletingUser.value = user
  deleteError.value = ''
}

function closeDelete() {
  if (deleteLoading.value) return
  deletingUser.value = null
  deleteError.value = ''
}

function onDeleteKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && deletingUser.value) {
    event.preventDefault()
    closeDelete()
  }
}

async function loadUsers() {
  loading.value = true
  listError.value = ''
  try {
    const page = await listUsers({
      search: search.value.trim() || undefined,
    })
    users.value = page.data
  } catch (error) {
    if (error instanceof ApiError) {
      listError.value = error.message || 'Não foi possível carregar os usuários.'
    } else {
      listError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    loading.value = false
  }
}

function onSearchSubmit() {
  void loadUsers()
}

function onSaved(user: AuthUser) {
  flash.value = editingUser.value
    ? `Usuário ${user.username} atualizado.`
    : `Usuário ${user.username} cadastrado.`
  void loadUsers()
}

async function confirmDelete() {
  const target = deletingUser.value
  if (!target || deleteLoading.value) return

  deleteLoading.value = true
  deleteError.value = ''

  try {
    await deleteUser(target.id)
    flash.value = `Usuário ${target.username} excluído.`
    deletingUser.value = null
    await loadUsers()
  } catch (error) {
    if (error instanceof ApiError) {
      deleteError.value = error.message || 'Não foi possível excluir o usuário.'
    } else {
      deleteError.value = 'Servidor indisponível. Tente novamente.'
    }
  } finally {
    deleteLoading.value = false
  }
}

onMounted(() => {
  document.addEventListener('keydown', onDeleteKeydown)
  void loadUsers()
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDeleteKeydown)
})
</script>

<template>
  <PageView title="Usuários">
    <template #actions>
      <Button icon="lucide:user-plus" @click="openCreate">Cadastrar</Button>
    </template>

    <p class="shrink-0 text-sm text-brand-ink/50">{{ totalLabel }}</p>
    <p
      v-if="flash"
      class="shrink-0 rounded-xl border border-brand-cyan/35 bg-brand-cyan/10 px-3.5 py-2.5 text-sm leading-snug text-brand-ink"
      role="status"
    >
      {{ flash }}
    </p>

    <form
      class="flex shrink-0 flex-col gap-3 rounded-2xl border border-brand-ink/10 bg-white p-4 sm:flex-row sm:items-center"
      @submit.prevent="onSearchSubmit"
    >
      <label class="relative min-w-0 flex-1">
        <span class="sr-only">Buscar usuários</span>
        <Icon
          icon="lucide:search"
          class="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-brand-ink/40"
          aria-hidden="true"
        />
        <input
          v-model="search"
          type="search"
          name="search"
          placeholder="Buscar por nome, usuário ou e-mail"
          class="w-full rounded-xl border border-brand-ink/15 bg-white py-2.5 pr-4 pl-10 text-sm text-brand-ink outline-none transition placeholder:text-brand-ink/35 focus:border-brand-cyan focus:ring-2 focus:ring-brand-cyan/25"
        />
      </label>
      <Button
        type="submit"
        variant="secondary"
        icon="lucide:search"
        :loading="loading"
      >
        Pesquisar
      </Button>
    </form>

    <p
      v-if="listError"
      class="rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
      role="alert"
    >
      {{ listError }}
    </p>

    <p v-else-if="loading && users.length === 0" class="text-sm text-brand-ink/55">
      Carregando usuários…
    </p>

    <p v-else-if="!loading && users.length === 0" class="text-sm text-brand-ink/55">
      Nenhum usuário encontrado.
    </p>

    <div v-else class="min-h-0 flex-1 overflow-auto">
      <table class="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead class="sticky top-0 bg-[#f4f6f8] text-brand-ink/55">
          <tr class="border-b border-brand-ink/10">
            <th class="px-4 py-3 font-medium">Nome</th>
            <th class="px-4 py-3 font-medium">Usuário</th>
            <th class="px-4 py-3 font-medium">E-mail</th>
            <th class="px-4 py-3 font-medium">Perfil</th>
            <th class="px-4 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="user in users"
            :key="user.id"
            class="border-b border-brand-ink/5 transition hover:bg-white/70"
          >
            <td class="px-4 py-3 font-medium text-brand-ink">{{ user.name }}</td>
            <td class="px-4 py-3 text-brand-ink/80">{{ user.username }}</td>
            <td class="px-4 py-3 text-brand-ink/80">{{ user.email }}</td>
            <td class="px-4 py-3">
              <span
                class="inline-flex rounded-lg px-2 py-1 text-xs font-medium"
                :class="
                  user.role === 'admin'
                    ? 'bg-brand-blue/10 text-brand-blue'
                    : 'bg-brand-ink/5 text-brand-ink/70'
                "
              >
                {{ roleLabel(user.role) }}
              </span>
            </td>
            <td class="px-4 py-3">
              <div class="flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-brand-ink/20 hover:text-brand-ink"
                  title="Editar"
                  aria-label="Editar usuário"
                  @click="openEdit(user)"
                >
                  <Icon icon="lucide:pencil" class="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="inline-flex size-9 cursor-pointer items-center justify-center rounded-lg border border-brand-ink/10 bg-white text-brand-ink/60 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Excluir"
                  aria-label="Excluir usuário"
                  :disabled="user.id === auth.user?.id"
                  @click="askDelete(user)"
                >
                  <Icon icon="lucide:trash-2" class="size-4" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <UserFormModal v-model:open="formOpen" :user="editingUser" @saved="onSaved" />

    <Teleport to="body">
      <div
        v-if="deletingUser"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
        role="presentation"
        @click.self="closeDelete"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-user-title"
          class="w-full max-w-md rounded-2xl border border-brand-ink/10 bg-white p-5 shadow-2xl"
          @click.stop
        >
          <h2 id="delete-user-title" class="text-lg font-semibold text-brand-ink">
            Excluir usuário
          </h2>
          <p class="mt-2 text-sm leading-relaxed text-brand-ink/70">
            Tem certeza que deseja excluir
            <strong class="font-semibold text-brand-ink">{{ deletingUser.username }}</strong
            >? Esta ação não pode ser desfeita.
          </p>

          <p
            v-if="deleteError"
            class="mt-3 rounded-xl border border-brand-ink/10 bg-brand-ink/[0.04] px-3.5 py-2.5 text-sm text-brand-ink"
            role="alert"
          >
            {{ deleteError }}
          </p>

          <div class="mt-5 flex flex-wrap gap-2">
            <Button
              variant="danger"
              size="sm"
              :loading="deleteLoading"
              @click="confirmDelete"
            >
              Excluir
            </Button>
            <Button
              variant="secondary"
              size="sm"
              :disabled="deleteLoading"
              @click="closeDelete"
            >
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </Teleport>
  </PageView>
</template>
