/**
 * Notification “bang” when a chat is transferred to the current attendant.
 * Web Audio (no binary asset). Call unlockTransferSound() after a user gesture.
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
    master.gain.exponentialRampToValueAtTime(0.35, now + 0.01)
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.42)
    master.connect(ctx.destination)

    // Percussive “bang” + short high ping
    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.08), ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuf
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.9, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08)
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 900
    noiseFilter.Q.value = 0.8
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(master)
    noise.start(now)

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(1318.5, now + 0.02)
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.28)
    gain.gain.setValueAtTime(0.0001, now + 0.02)
    gain.gain.exponentialRampToValueAtTime(1, now + 0.04)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32)
    osc.connect(gain)
    gain.connect(master)
    osc.start(now + 0.02)
    osc.stop(now + 0.35)
  })()
}
