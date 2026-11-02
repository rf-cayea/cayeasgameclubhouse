import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { KeyboardSensorProps } from '@dnd-kit/core';

// Model the dependency's documented next-tick listener installation. The tests
// assert user key counts and cancellation, independent of visual card geometry.
vi.mock('@dnd-kit/core', () => ({ KeyboardSensor: class {
  static activators = [];
  constructor(props: KeyboardSensorProps) {
    const doc = props.activeNode.node.current!.ownerDocument;
    const receive = (event: Event) => {
      if ((event as KeyboardEvent).code === 'ArrowRight') { event.preventDefault(); props.onMove({ x: 1, y: 0 }); }
      if ((event as KeyboardEvent).code === 'Escape') { doc.removeEventListener('keydown', receive); props.onCancel(); }
    };
    setTimeout(() => doc.addEventListener('keydown', receive), 0);
  }
} }));
import { CardKeyboardSensor } from '../src/lib/card-keyboard-sensor';

class Key extends Event {
  code: string; key: string;
  altKey = false; ctrlKey = false; metaKey = false; shiftKey = false;
  constructor(type: string, options: { code?: string; key?: string; cancelable?: boolean } = {}) {
    super(type, options); this.code = options.code ?? ''; this.key = options.key ?? this.code;
  }
}
function setup() {
  const doc = Object.assign(new EventTarget(), { defaultView: { KeyboardEvent: Key } });
  const onMove = vi.fn(), onCancel = vi.fn();
  new CardKeyboardSensor({ activeNode: { node: { current: { ownerDocument: doc } } }, onMove, onCancel, onEnd: vi.fn() } as unknown as KeyboardSensorProps);
  const press = (code: string) => doc.dispatchEvent(new Key('keydown', { code, cancelable: true }));
  return { press, onMove, onCancel };
}
beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
describe('first keyboard drag key', () => {
  it('preserves an arrow pressed before the native listener exists and never doubles a handled arrow', () => {
    const { press, onMove } = setup();
    press('ArrowRight'); expect(onMove).not.toHaveBeenCalled();
    vi.runAllTimers(); expect(onMove).toHaveBeenCalledTimes(1);
    press('ArrowRight'); vi.runAllTimers(); expect(onMove).toHaveBeenCalledTimes(2);
  });
  it('cancels pending work when Escape ends the drag', () => {
    const { press, onMove, onCancel } = setup(); vi.runAllTimers();
    press('ArrowRight'); press('Escape'); vi.runAllTimers();
    expect(onMove).toHaveBeenCalledTimes(1); expect(onCancel).toHaveBeenCalledTimes(1);
    press('ArrowRight'); vi.runAllTimers(); expect(onMove).toHaveBeenCalledTimes(1);
  });
});
