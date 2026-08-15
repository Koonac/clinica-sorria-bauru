import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createClinic, listClinics, type Clinic } from '@/api/clinics'
import { useAuthStore } from '@/stores/auth'

const CLINIC_KEY = 'sorria.activeClinicId'

export const useClinicsStore = defineStore('clinics', () => {
  const clinics = ref<Clinic[]>([])
  const activeClinicId = ref<number | null>(null)
  const loading = ref(false)
  const loaded = ref(false)
  const error = ref('')

  const activeClinic = computed(
    () => clinics.value.find((c) => c.id === activeClinicId.value) ?? null,
  )

  function persistActive(id: number | null) {
    activeClinicId.value = id
    try {
      if (id != null) {
        localStorage.setItem(CLINIC_KEY, String(id))
      } else {
        localStorage.removeItem(CLINIC_KEY)
      }
    } catch {
      // ignore
    }
  }

  function readStoredId(): number | null {
    try {
      const raw = localStorage.getItem(CLINIC_KEY)
      if (!raw) return null
      const id = Number(raw)
      return Number.isFinite(id) ? id : null
    } catch {
      return null
    }
  }

  async function bootstrap() {
    const auth = useAuthStore()
    if (!auth.isAuthenticated) {
      clinics.value = []
      persistActive(null)
      loaded.value = false
      return
    }

    loading.value = true
    error.value = ''
    try {
      const list = await listClinics({ active: true })
      clinics.value = list

      if (auth.user?.role === 'funcionario' && auth.user.clinic_id) {
        persistActive(auth.user.clinic_id)
      } else {
        const stored = readStoredId()
        const match = stored != null ? list.find((c) => c.id === stored) : null
        persistActive(match?.id ?? list[0]?.id ?? null)
      }

      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Não foi possível carregar as clínicas.'
      clinics.value = []
      loaded.value = false
    } finally {
      loading.value = false
    }
  }

  function setActiveClinic(id: number) {
    if (!clinics.value.some((c) => c.id === id)) return
    persistActive(id)
  }

  async function createClinicAndSelect(payload: { name: string; slug?: string }) {
    const clinic = await createClinic(payload)
    clinics.value = [...clinics.value, clinic].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
    persistActive(clinic.id)
    return clinic
  }

  function clear() {
    clinics.value = []
    persistActive(null)
    loaded.value = false
    error.value = ''
  }

  return {
    clinics,
    activeClinicId,
    activeClinic,
    loading,
    loaded,
    error,
    bootstrap,
    setActiveClinic,
    createClinic: createClinicAndSelect,
    clear,
  }
})
