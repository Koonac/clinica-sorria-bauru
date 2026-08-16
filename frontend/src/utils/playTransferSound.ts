/**
 * Alerta sonoro quando um chat é transferido para o atendente atual.
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
    const master = ctx.createGain()
    master.gain.setValueAtTime(0.0001, now)
    master.gain.exponentialRampToValueAtTime(0.95, now + 0.008)
    master.gain.setValueAtTime(0.95, now + 0.55)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.72)
    master.connect(ctx.destination)

    // Impacto percussivo forte
    const noiseDur = 0.12
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(1, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur)
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 1400
    noiseFilter.Q.value = 0.55
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(master)
    noise.start(now)
    noise.stop(now + noiseDur + 0.02)

    // Sirene curta: sobe e desce em frequência aguda (square = mais cortante)
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.frequency.setValueAtTime(880, now)
    osc.frequency.exponentialRampToValueAtTime(1760, now + 0.18)
    osc.frequency.exponentialRampToValueAtTime(1174, now + 0.38)
    osc.frequency.exponentialRampToValueAtTime(2093, now + 0.55)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.9, now + 0.02)
    gain.gain.setValueAtTime(0.9, now + 0.5)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.68)
    osc.connect(gain)
    gain.connect(master)
    osc.start(now)
    osc.stop(now + 0.7)

    // Harmônico agudo por cima, para “furar” o ambiente
    const ping = ctx.createOscillator()
    const pingGain = ctx.createGain()
    ping.type = 'sawtooth'
    ping.frequency.setValueAtTime(2637, now + 0.02)
    ping.frequency.exponentialRampToValueAtTime(1975, now + 0.45)
    pingGain.gain.setValueAtTime(0.0001, now + 0.02)
    pingGain.gain.exponentialRampToValueAtTime(0.45, now + 0.04)
    pingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    ping.connect(pingGain)
    pingGain.connect(master)
    ping.start(now + 0.02)
    ping.stop(now + 0.52)
  })()
}
