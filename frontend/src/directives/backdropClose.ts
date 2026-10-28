import type { Directive } from 'vue'

type BackdropHandler = () => void

type BackdropElement = HTMLElement & {
  __backdropClose?: {
    handler: BackdropHandler
    onPointerDown: (event: PointerEvent) => void
    onClick: (event: MouseEvent) => void
  }
}

/**
 * Fecha o modal ao clicar no fundo (overlay) — mas só se o clique COMEÇOU e TERMINOU no fundo.
 * Com `@click.self`, selecionar texto num input e soltar o mouse fora do painel disparava o click
 * no overlay e fechava o modal.
 *
 * Uso: `<div class="fixed inset-0 …" v-backdrop-close="close">`
 */
export const vBackdropClose: Directive<BackdropElement, BackdropHandler> = {
  mounted(el, binding) {
    let pressedOnBackdrop = false

    const state = {
      handler: binding.value,
      onPointerDown(event: PointerEvent) {
        pressedOnBackdrop = event.target === el
      },
      onClick(event: MouseEvent) {
        const shouldClose = pressedOnBackdrop && event.target === el
        pressedOnBackdrop = false
        if (shouldClose) state.handler()
      },
    }

    el.__backdropClose = state
    el.addEventListener('pointerdown', state.onPointerDown)
    el.addEventListener('click', state.onClick)
  },
  updated(el, binding) {
    if (el.__backdropClose) el.__backdropClose.handler = binding.value
  },
  beforeUnmount(el) {
    const state = el.__backdropClose
    if (!state) return
    el.removeEventListener('pointerdown', state.onPointerDown)
    el.removeEventListener('click', state.onClick)
    delete el.__backdropClose
  },
}

declare module 'vue' {
  interface GlobalDirectives {
    vBackdropClose: typeof vBackdropClose
  }
}
