export interface FarkleAudioSettings {
  music: boolean; effects: boolean; musicVolume: number; effectsVolume: number; muted: boolean;
}
export const FARKLE_AUDIO_KEY = 'clubhouse-farkle-audio-v1';
export const DEFAULT_FARKLE_AUDIO: FarkleAudioSettings = { music: true, effects: true, musicVolume: .4, effectsVolume: .65, muted: false };
export function parseFarkleAudioSettings(value: unknown): FarkleAudioSettings {
  const data = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const volume = (key: 'musicVolume' | 'effectsVolume') => typeof data[key] === 'number' && Number.isFinite(data[key]) ? Math.max(0, Math.min(1, data[key])) : DEFAULT_FARKLE_AUDIO[key];
  return { music: typeof data.music === 'boolean' ? data.music : true, effects: typeof data.effects === 'boolean' ? data.effects : true, musicVolume: volume('musicVolume'), effectsVolume: volume('effectsVolume'), muted: typeof data.muted === 'boolean' ? data.muted : false };
}
export type FarkleAudioStatus = 'idle' | 'ready' | 'blocked' | 'unavailable';
type BrowserAudio = typeof globalThis & { webkitAudioContext?: typeof AudioContext };
const audioConstructor = () => globalThis.AudioContext ?? (globalThis as BrowserAudio).webkitAudioContext;
export const farkleAudioSupported = () => Boolean(audioConstructor());
const frequency = (note: number) => 440 * 2 ** ((note - 69) / 12);

// Original 16-bar lounge theme: soft electric keys, a bell melody, and a warm bass.
// Notes are scheduled locally, so music never needs an external audio download.
const HARMONY = [
  { bass: 36, chord: [60, 64, 67, 71], melody: [76, 79, 74, 71] },
  { bass: 33, chord: [60, 64, 67, 71], melody: [72, 76, 71, 69] },
  { bass: 29, chord: [57, 60, 64, 67], melody: [69, 72, 76, 74] },
  { bass: 31, chord: [59, 62, 65, 69], melody: [71, 74, 77, 74] },
  { bass: 28, chord: [55, 59, 62, 67], melody: [71, 74, 79, 76] },
  { bass: 33, chord: [57, 60, 64, 67], melody: [76, 72, 71, 69] },
  { bass: 26, chord: [57, 60, 64, 65], melody: [69, 72, 74, 77] },
  { bass: 31, chord: [55, 59, 64, 65], melody: [76, 74, 71, 74] },
] as const;
const STEP = 60 / 78 / 2;
interface Voice { source: AudioScheduledSourceNode; nodes: AudioNode[]; }

export class FarkleAudio {
  private context: AudioContext | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private impacts: AudioBuffer[] = [];
  private drums: AudioBuffer[] = [];
  private musicVoices = new Set<Voice>();
  private effectVoices = new Set<Voice>();
  private rollVoices = new Set<Voice>();
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;
  private step = 0;
  private nextNote = 0;
  private visible = true;
  private disposed = false;
  private options: FarkleAudioSettings;
  constructor(options: FarkleAudioSettings, private status: (status: FarkleAudioStatus) => void = () => {}, private theme: 'lounge' | 'yacht' = 'lounge') { this.options = options; }

  private makeContext() {
    if (this.context) return this.context;
    const Constructor = audioConstructor();
    if (!Constructor || this.disposed) return null;
    const context = new Constructor({ latencyHint: 'interactive' });
    this.context = context;
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -14; compressor.ratio.value = 3; compressor.knee.value = 18;
    compressor.connect(context.destination);
    this.musicGain = context.createGain(); this.musicGain.gain.value = 0;
    const warmth = context.createBiquadFilter(); warmth.type = 'lowpass'; warmth.frequency.value = 2400; warmth.Q.value = .3;
    this.musicGain.connect(warmth); warmth.connect(compressor);
    this.effectsGain = context.createGain(); this.effectsGain.gain.value = 0; this.effectsGain.connect(compressor);
    this.impacts = [0, 1, 2, 3].map(variant => {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .09), context.sampleRate), samples = buffer.getChannelData(0);
      let seed = variant + 17, previous = 0;
      for (let i = 0; i < samples.length; i++) {
        const time = i / context.sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = (seed >>> 0) / 0x100000000 * 2 - 1, click = noise - previous * .65;
        previous = noise;
        samples[i] = Math.min(1, time / .0008) * (.27 * click * Math.exp(-time * 120) + .32 * Math.sin(2 * Math.PI * (460 + variant * 95) * time) * Math.exp(-time * 85) + .12 * Math.sin(2 * Math.PI * 175 * time) * Math.exp(-time * 70));
      }
      return buffer;
    });
    if (this.theme === 'yacht') this.drums = [0, 1, 2].map(kind => {
      const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * .3), context.sampleRate), data = buffer.getChannelData(0);
      let seed = kind + 71, last = 0;
      for (let i = 0; i < data.length; i++) {
        const t = i / context.sampleRate;
        seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
        const noise = (seed >>> 0) / 0x100000000 * 2 - 1, high = noise - last; last = noise;
        const attack = Math.min(1, t / .0015);
        data[i] = attack * (kind === 0 ? .8 * Math.sin(2 * Math.PI * (48 * t + 18 * (1 - Math.exp(-t * 25)) / 25)) * Math.exp(-t * 19)
          : kind === 1 ? (.24 * high + .22 * Math.sin(2 * Math.PI * 185 * t)) * Math.exp(-t * 26)
          : .14 * high * Math.exp(-t * 85));
      }
      return buffer;
    });
    return context;
  }
  async unlock(): Promise<boolean> {
    if (this.disposed || !this.visible || !this.audible()) return false;
    try {
      const context = this.makeContext();
      if (!context) { this.status('unavailable'); return false; }
      if (this.suspendTimer) clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
      await context.resume();
      if (this.disposed || !this.visible) return false;
      if (context.state !== 'running') { this.status('blocked'); return false; }
      this.status('ready'); this.sync(); return true;
    } catch { if (!this.disposed) this.status(farkleAudioSupported() ? 'blocked' : 'unavailable'); return false; }
  }
  private audible() {
    return !this.options.muted && (this.options.music && this.options.musicVolume > 0 || this.options.effects && this.options.effectsVolume > 0);
  }
  setOptions(options: FarkleAudioSettings) { this.options = options; this.sync(); }
  setVisible(visible: boolean) {
    this.visible = visible;
    if (!visible) {
      this.stopMusic(); this.stopEffects();
      void this.context?.suspend().catch(() => {});
    } else if (this.context && this.audible()) void this.unlock();
  }
  private sync() {
    const context = this.context;
    if (!context || this.disposed) return;
    const now = context.currentTime, music = this.visible && !this.options.muted && this.options.music, effects = this.visible && !this.options.muted && this.options.effects;
    for (const [gain, value] of [[this.musicGain!, music ? this.options.musicVolume ** 2 * .75 : 0], [this.effectsGain!, effects ? this.options.effectsVolume ** 2 * .9 : 0]] as const) {
      gain.gain.cancelScheduledValues(now); gain.gain.setTargetAtTime(value, now, .025);
    }
    if (!effects || this.options.effectsVolume === 0) this.stopEffects();
    if (music && this.options.musicVolume > 0 && context.state === 'running') {
      if (!this.musicTimer) { this.nextNote = now + .06; this.scheduleMusic(); this.musicTimer = setInterval(() => this.scheduleMusic(), 50); }
    } else this.stopMusic();
    if (!this.audible()) {
      if (this.suspendTimer) clearTimeout(this.suspendTimer);
      this.suspendTimer = setTimeout(() => { this.suspendTimer = null; void context.suspend().catch(() => {}); }, 100);
    } else if (this.suspendTimer) { clearTimeout(this.suspendTimer); this.suspendTimer = null; }
  }
  private track(source: AudioScheduledSourceNode, nodes: AudioNode[], target: Set<Voice>) {
    const voice = { source, nodes }; target.add(voice);
    source.onended = () => { target.delete(voice); this.rollVoices.delete(voice); nodes.forEach(node => node.disconnect()); };
    return voice;
  }
  private stop(voices: Set<Voice>) {
    for (const voice of voices) { try { voice.source.stop(); } catch { /* A voice may already have ended. */ } voice.nodes.forEach(node => node.disconnect()); }
    voices.clear();
  }
  private tone(note: number, when: number, duration: number, level: number, kind: 'keys' | 'bass' | 'bell', target: Set<Voice>, output: GainNode) {
    const context = this.context!;
    const harmonics = kind === 'bass' ? [1, .2] : kind === 'keys' ? [1, .28, .08] : [1, .17, .06];
    harmonics.forEach((weight, index) => {
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency(note) * (index + 1);
      gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(level * weight, when + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, when + duration);
      oscillator.connect(gain); gain.connect(output);
      this.track(oscillator, [oscillator, gain], target);
      oscillator.start(when); oscillator.stop(when + duration + .03);
    });
  }
  private scheduleMusic() {
    const context = this.context;
    if (!context || context.state !== 'running' || !this.visible || this.disposed) return;
    if (this.nextNote < context.currentTime) this.nextNote = context.currentTime + .03;
    while (this.nextNote < context.currentTime + .18) {
      if (this.theme === 'yacht') {
        this.yachtStep(this.step, this.nextNote);
        this.step = (this.step + 1) % 128; this.nextNote += 60 / 94 / 2;
        continue;
      }
      const bar = Math.floor(this.step / 8), beat = this.step % 8, chord = HARMONY[bar % HARMONY.length]!, time = this.nextNote;
      if (beat === 0 || beat === 4) {
        this.tone(chord.bass + (beat === 4 ? 7 : 0), time, 1.25, .22, 'bass', this.musicVoices, this.musicGain!);
        chord.chord.slice(1).forEach((note, i) => this.tone(note, time + i * .018, 1.8, .075, 'keys', this.musicVoices, this.musicGain!));
      }
      const melodyIndex = [0, 2, 5, 7].indexOf(beat);
      if (melodyIndex >= 0) {
        const note = chord.melody[bar >= 8 ? (melodyIndex + 1) % 4 : melodyIndex]!;
        this.tone(note, time + (beat % 2 ? .025 : 0), .95, .13, 'bell', this.musicVoices, this.musicGain!);
      }
      this.step = (this.step + 1) % 128; this.nextNote += STEP;
    }
  }
  private yachtStep(step: number, time: number) {
    // Original soft-rock arrangement: major-seventh electric keys, syncopated
    // guitar-like plucks, melodic bass, and a relaxed kick/snare/hat backbeat.
    const progression = [
      { bass: 41, keys: [57,60,64,67], lead: [72,76,74,72] },
      { bass: 40, keys: [55,59,62,64], lead: [71,74,76,79] },
      { bass: 38, keys: [57,60,64,65], lead: [77,76,72,69] },
      { bass: 43, keys: [59,62,64,69], lead: [71,74,76,74] },
      { bass: 36, keys: [55,59,62,64], lead: [76,79,81,79] },
      { bass: 33, keys: [55,60,64,67], lead: [76,72,71,69] },
      { bass: 38, keys: [57,60,64,65], lead: [69,72,74,77] },
      { bass: 43, keys: [55,59,64,65], lead: [76,74,71,74] },
    ];
    const bar = Math.floor(step / 8), beat = step % 8, chord = progression[bar % 8]!;
    const drum = (kind: number, level: number) => {
      const source = this.context!.createBufferSource(), gain = this.context!.createGain();
      source.buffer = this.drums[kind]!; gain.gain.value = level;
      source.connect(gain); gain.connect(this.musicGain!); this.track(source,[source,gain],this.musicVoices); source.start(time);
    };
    drum(2, beat % 2 ? .18 : .26);
    if (beat === 0 || beat === 4 || beat === 7 && bar % 2) drum(0,.42);
    if (beat === 2 || beat === 6) drum(1,.31);
    if (beat === 0 || beat === 3 || beat === 4 || beat === 7) this.tone(chord.bass + (beat === 3 || beat === 7 ? 7 : 0), time, .5, .2, 'bass', this.musicVoices, this.musicGain!);
    if (beat === 0 || beat === 4) chord.keys.forEach((note,i)=>this.tone(note,time+i*.008,1.3,.06,'keys',this.musicVoices,this.musicGain!));
    if (beat === 1 || beat === 5) chord.keys.slice(1).forEach((note,i)=>this.tone(note+12,time+i*.016,.24,.035,'keys',this.musicVoices,this.musicGain!));
    if ([0,2,5,7].includes(beat) && bar % 4 !== 3) {
      const index = [0,2,5,7].indexOf(beat), note = chord.lead[(index + (bar >= 8 ? 1 : 0)) % 4]!;
      this.tone(note,time+.015,.68,.09,'keys',this.musicVoices,this.musicGain!);
    }
  }
  private stopMusic() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; this.stop(this.musicVoices); }
  private canEffect() { return this.context?.state === 'running' && this.visible && !this.disposed && !this.options.muted && this.options.effects && this.options.effectsVolume > 0; }
  roll(held: readonly boolean[]) {
    if (!this.canEffect()) return;
    this.stopRoll();
    const context = this.context!, now = context.currentTime + .01;
    held.forEach((kept, index) => {
      if (kept) return;
      [.015, .16, .33, .49, .62].forEach((offset, bounce) => {
        const source = context.createBufferSource(), gain = context.createGain();
        source.buffer = this.impacts[(index + bounce) % this.impacts.length]!;
        source.playbackRate.value = .86 + index * .06 + bounce * .025;
        gain.gain.value = [.62, .8, .58, .4, .23][bounce]!;
        source.connect(gain); gain.connect(this.effectsGain!);
        this.rollVoices.add(this.track(source, [source, gain], this.effectVoices));
        source.start(now + offset + index * .014);
      });
    });
  }
  hold(held: boolean) {
    if (!this.canEffect()) return;
    const context = this.context!, source = context.createBufferSource(), gain = context.createGain();
    source.buffer = this.impacts[held ? 2 : 0]!; source.playbackRate.value = held ? 1.4 : .85; gain.gain.value = .45;
    source.connect(gain); gain.connect(this.effectsGain!); this.track(source, [source, gain], this.effectVoices); source.start();
  }
  score(points: number) {
    if (!this.canEffect()) return;
    const now = this.context!.currentTime;
    [72, points > 0 ? 79 : 72].forEach((note, index) => this.tone(note, now + index * .075, .3, .065, 'bell', this.effectVoices, this.effectsGain!));
  }
  quintsee() {
    if (!this.canEffect()) return;
    const now = this.context!.currentTime;
    // An original rising sparkle, ending in a warm major chord.
    [72, 76, 79, 84, 88, 91, 96].forEach((note, index) => this.tone(note, now + index * .085, .7, .11, 'bell', this.effectVoices, this.effectsGain!));
    [60, 64, 67, 72].forEach(note => this.tone(note, now + .6, 1.2, .07, 'keys', this.effectVoices, this.effectsGain!));
  }
  farkle() {
    if (!this.canEffect()) return;
    const now = this.context!.currentTime;
    [67, 63, 58, 48].forEach((note, index) => this.tone(note, now + index * .11, .55, .12, 'keys', this.effectVoices, this.effectsGain!));
  }
  fanfare() {
    if (!this.canEffect()) return;
    const now = this.context!.currentTime;
    [72, 76, 79, 84].forEach((note, index) => this.tone(note, now + index * .115, .65, .12, 'bell', this.effectVoices, this.effectsGain!));
  }
  stopRoll() {
    for (const voice of this.rollVoices) { try { voice.source.stop(); } catch { /* Already ended. */ } voice.nodes.forEach(node => node.disconnect()); this.effectVoices.delete(voice); }
    this.rollVoices.clear();
  }
  stopEffects() { this.stopRoll(); this.stop(this.effectVoices); }
  dispose() {
    this.disposed = true;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.stopMusic(); this.stopEffects();
    const context = this.context; this.context = null;
    if (context) void context.close().catch(() => {});
  }
}
