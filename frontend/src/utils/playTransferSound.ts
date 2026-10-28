/**
 * Alerta sonoro (chat transferido / aviso novo). Chime suave de duas notas, estilo notificação
 * de mensageiro: senoides com decaimento natural, sem ruído nem onda quadrada.
 * Web Audio (sem asset binário). Chamar unlockTransferSound() após gesto do usuário.
 */

let sharedCtx: AudioContext | null = null

function audioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  if (!sharedCtx) sharedCtx = new Ctx()
  return sharedCtx
}

export async function unlockTransferSound(): Promise<void> {
  const ctx = audioContext()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      // ignore until next gesture
    }
  }
}

/**
 * Uma nota tipo "sino": fundamental + parcial suave uma oitava acima, ataque rápido e
 * decaimento exponencial (sem corte seco no fim).
 */
function chimeNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
) {
  const partials: { ratio: number; gain: number }[] = [
    { ratio: 1, gain: 1 },
    { ratio: 2, gain: 0.18 },
  ]

  for (const partial of partials) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency * partial.ratio, start)

    const level = peak * partial.gain
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(level, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

    osc.connect(gain)
    gain.connect(destination)
    osc.start(start)
    osc.stop(start + duration + 0.05)
  }
}

export function playTransferSound(): void {
  const ctx = audioContext()
  if (!ctx) return

  void (async () => {
    try {
      if (ctx.state === 'suspended') await ctx.resume()
    } catch {
      return
    }

    const now = ctx.currentTime

    // Filtro passa-baixa tira o "brilho" agudo que cansa; volume moderado.
    const tone = ctx.createBiquadFilter()
    tone.type = 'lowpass'
    tone.frequency.value = 3200
    const master = ctx.createGain()
    master.gain.value = 0.35
    tone.connect(master)
    master.connect(ctx.destination)

    // Intervalo de quinta ascendente (Mi5 → Si5): consonante e reconhecível sem ser estridente.
    chimeNote(ctx, tone, 659.25, now, 0.45, 0.6)
    chimeNote(ctx, tone, 987.77, now + 0.12, 0.7, 0.5)
  })()
}
