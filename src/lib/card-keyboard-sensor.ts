import { KeyboardSensor, type KeyboardSensorProps } from '@dnd-kit/core';

/** Preserve a fast first arrow while dnd-kit installs its deferred key listener. */
export class CardKeyboardSensor {
  static activators = KeyboardSensor.activators;
  autoScrollEnabled = false;
  constructor(props: KeyboardSensorProps) {
    const doc = props.activeNode.node.current?.ownerDocument ?? document;
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const forwarded = new WeakSet<Event>();
    let ended = false;
    const cleanup = () => {
      ended = true;
      doc.removeEventListener('keydown', preserveFirstArrow);
      for (const timer of pending) clearTimeout(timer);
      pending.clear();
    };
    function preserveFirstArrow(event: KeyboardEvent) {
      if (forwarded.has(event) || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.code)) return;
      const timer = setTimeout(() => {
        pending.delete(timer);
        // A handled event must never move a card a second time.
        if (ended || event.defaultPrevented || !doc.defaultView) return;
        const copy = new doc.defaultView.KeyboardEvent('keydown', { key: event.key, code: event.code, bubbles: true, cancelable: true,
          altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey });
        forwarded.add(copy);
        doc.dispatchEvent(copy);
      }, 0);
      pending.add(timer);
    }
    doc.addEventListener('keydown', preserveFirstArrow);
    // Delegate movement, cancellation, scrolling, and cleanup to the public sensor.
    new KeyboardSensor({ ...props,
      onEnd: () => { cleanup(); props.onEnd(); },
      onCancel: () => { cleanup(); props.onCancel(); },
    });
  }
}
