// SoundManager.js
// Small Web Audio synthesizer for game sound effects. No audio assets needed —
// every sound is generated procedurally, so it adds zero load time.
const MUTE_STORAGE_KEY = 'gridtanks-muted';

class SoundManager {
    constructor() {
        this.ctx = null;
        this.muted = false;
        try {
            this.muted = localStorage.getItem(MUTE_STORAGE_KEY) === 'true';
        } catch {
            // localStorage unavailable (private mode etc.) — default to unmuted.
        }
    }

    // AudioContext must be created/resumed after a user gesture; the game only
    // starts after a click, so lazily creating it on first sound is safe.
    getContext() {
        if (this.muted) {
            return null;
        }

        if (!this.ctx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextClass) {
                return null;
            }
            try {
                this.ctx = new AudioContextClass();
            } catch {
                return null;
            }
        }

        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }

        return this.ctx;
    }

    setMuted(muted) {
        this.muted = Boolean(muted);
        try {
            localStorage.setItem(MUTE_STORAGE_KEY, String(this.muted));
        } catch {
            // Persisting the preference is best-effort.
        }
    }

    toggleMuted() {
        this.setMuted(!this.muted);
        return this.muted;
    }

    // A single oscillator sweep with an exponential volume decay.
    tone({ startFreq, endFreq, duration, type = 'square', volume = 0.15, delay = 0 }) {
        const ctx = this.getContext();
        if (!ctx) {
            return;
        }

        const start = ctx.currentTime + delay;
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(startFreq, start);
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(endFreq, 1), start + duration);

        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        oscillator.connect(gain);
        gain.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + duration);
    }

    // A white-noise burst through a lowpass filter — the base of every explosion.
    noiseBurst({ duration, filterFreq = 1000, volume = 0.2, delay = 0 }) {
        const ctx = this.getContext();
        if (!ctx) {
            return;
        }

        const start = ctx.currentTime + delay;
        const sampleCount = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < sampleCount; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(filterFreq, start);
        filter.frequency.exponentialRampToValueAtTime(Math.max(filterFreq * 0.15, 40), start + duration);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start(start);
    }

    shoot() {
        this.tone({ startFreq: 320, endFreq: 160, duration: 0.09, type: 'triangle', volume: 0.12 });
    }

    fireShoot() {
        this.tone({ startFreq: 520, endFreq: 220, duration: 0.08, type: 'sawtooth', volume: 0.09 });
    }

    bounce() {
        this.tone({ startFreq: 950, endFreq: 700, duration: 0.05, type: 'sine', volume: 0.1 });
    }

    bulletPop() {
        this.noiseBurst({ duration: 0.06, filterFreq: 2200, volume: 0.08 });
    }

    explosion() {
        this.noiseBurst({ duration: 0.35, filterFreq: 900, volume: 0.22 });
        this.tone({ startFreq: 110, endFreq: 40, duration: 0.3, type: 'sine', volume: 0.18 });
    }

    playerDeath() {
        this.noiseBurst({ duration: 0.6, filterFreq: 700, volume: 0.28 });
        this.tone({ startFreq: 220, endFreq: 45, duration: 0.55, type: 'sawtooth', volume: 0.12 });
    }

    levelCleared() {
        this.tone({ startFreq: 523, endFreq: 523, duration: 0.12, type: 'square', volume: 0.08 });
        this.tone({ startFreq: 659, endFreq: 659, duration: 0.12, type: 'square', volume: 0.08, delay: 0.12 });
        this.tone({ startFreq: 784, endFreq: 784, duration: 0.2, type: 'square', volume: 0.08, delay: 0.24 });
    }

    levelStart() {
        this.tone({ startFreq: 392, endFreq: 392, duration: 0.08, type: 'triangle', volume: 0.08 });
        this.tone({ startFreq: 523, endFreq: 523, duration: 0.12, type: 'triangle', volume: 0.08, delay: 0.09 });
    }
}

export const soundManager = new SoundManager();
