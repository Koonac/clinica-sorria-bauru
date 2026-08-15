/// <reference types="vite/client" />

declare module 'emoji-mart-vue-fast/src' {
  import type { DefineComponent } from 'vue'

  export class EmojiIndex {
    constructor(data: unknown, options?: Record<string, unknown>)
  }

  export const Picker: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
}

declare module 'emoji-mart-vue-fast/data/all.json' {
  const data: unknown
  export default data
}

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
