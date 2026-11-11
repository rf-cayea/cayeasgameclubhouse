import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FARKLE_AUDIO, FarkleAudio, parseFarkleAudioSettings } from '../src/lib/farkle-audio';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('Quintsee audio preferences and availability', () => {
  it('restores independent music and dice choices and clamps volume safely', () => {
    expect(parseFarkleAudioSettings({ music: false, effects: true, musicVolume: -3, effectsVolume: 2, muted: true })).toEqual({ music: false, effects: true, musicVolume: 0, effectsVolume: 1, muted: true });
    expect(parseFarkleAudioSettings({ music: 'yes', effects: 0, musicVolume: NaN, effectsVolume: Infinity, muted: 'false' })).toEqual(DEFAULT_FARKLE_AUDIO);
    for (const value of [undefined, null, [], 'invalid']) expect(parseFarkleAudioSettings(value)).toEqual(DEFAULT_FARKLE_AUDIO);
  });
  it('leaves the game usable when Web Audio is unavailable', async () => {
    vi.stubGlobal('AudioContext', undefined); vi.stubGlobal('webkitAudioContext', undefined);
    const status = vi.fn(), audio = new FarkleAudio(DEFAULT_FARKLE_AUDIO, status);
    expect(await audio.unlock()).toBe(false);
    expect(status).toHaveBeenLastCalledWith('unavailable');
    expect(() => { audio.roll([false, false, false, false, false]); audio.hold(true); audio.score(50); audio.quintsee(); audio.dispose(); }).not.toThrow();
  });
  it('does not create a sound context when muted, both channels are off, or the tab is hidden', async () => {
    const Constructor = vi.fn(); vi.stubGlobal('AudioContext', Constructor);
    const muted = new FarkleAudio({ ...DEFAULT_FARKLE_AUDIO, muted: true });
    expect(await muted.unlock()).toBe(false);
    const off = new FarkleAudio({ ...DEFAULT_FARKLE_AUDIO, music: false, effects: false });
    expect(await off.unlock()).toBe(false);
    const hidden = new FarkleAudio(DEFAULT_FARKLE_AUDIO); hidden.setVisible(false);
    expect(await hidden.unlock()).toBe(false);
    expect(Constructor).not.toHaveBeenCalled();
    muted.dispose(); off.dispose(); hidden.dispose();
  });
  it('handles an audio-device failure without rejecting a game action', async () => {
    const Constructor = vi.fn(function () { throw new Error('No audio device'); });
    vi.stubGlobal('AudioContext', Constructor);
    const status = vi.fn(), audio = new FarkleAudio(DEFAULT_FARKLE_AUDIO, status);
    await expect(audio.unlock()).resolves.toBe(false);
    expect(status).toHaveBeenLastCalledWith('blocked');
    audio.dispose();
    await expect(audio.unlock()).resolves.toBe(false);
    expect(Constructor).toHaveBeenCalledTimes(1);
  });
});
