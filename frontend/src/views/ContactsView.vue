<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { ApiError } from '@/api/client'
import { listContacts } from '@/api/crm/contacts'
import type { Contact } from '@/api/crm/types'
import PageView from '@/components/Layout/PageView.vue'
import ContactDetailModal from '@/components/Modals/ContactDetailModal.vue'
import CrmContactsPanel from '@/components/crm/CrmContactsPanel.vue'
import { useClinicsStore } from '@/stores/clinics'

const clinics = useClinicsStore()

const contacts = ref<Contact[]>([])
const loading = ref(true)
const error = ref('')
const search = ref('')
const contactOpen = ref(false)
const selectedContact = ref<Contact | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const page = await listContacts({
      search: search.value.trim() || undefined,
    })
    contacts.value = page.data
  } catch (e) {
    error.value =
      e instanceof ApiError ? e.message : 'Não foi possível carregar os contatos.'
  } finally {
    loading.value = false
  }
}

function openContact(contact: Contact) {
  selectedContact.value = contact
  contactOpen.value = true
}

watch(
  () => clinics.activeClinicId,
  () => {
    void load()
  },
)

onMounted(() => {
  void load()
})
</script>

<template>
  <PageView title="Contatos">
    <CrmContactsPanel
      v-model:search="search"
      :contacts="contacts"
      :loading="loading"
      :error="error"
      @search="load"
      @open="openContact"
    />

    <ContactDetailModal v-model:open="contactOpen" :contact="selectedContact" />
  </PageView>
</template>
