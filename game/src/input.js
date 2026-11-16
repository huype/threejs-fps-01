// Keyboard + mouse input with pointer lock. The game never reads a key twice:
// `pressed` is an edge set the main loop drains once per frame, and `look` is a
// mouse delta accumulator the loop drains once per frame.
export function createInput(canvas, onLockChange) {
  const keys = new Set();
  const pressed = new Set();
  const look = { x: 0, y: 0 };
  let firing = false;
  let locked = false;

  function isGameKey(code) {
    return code.startsWith('Key') || code.startsWith('Digit') || code === 'Space' ||
      code === 'ShiftLeft' || code === 'ControlLeft' || code === 'KeyE' || code === 'KeyG' ||
      code === 'KeyR' || code === 'KeyQ' || code === 'Enter' || code === 'Tab';
  }

  window.addEventListener('keydown', (event) => {
    if (!isGameKey(event.code)) return;
    if (event.code === 'Tab') event.preventDefault();
    if (!event.repeat) pressed.add(event.code);
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => {
    keys.delete(event.code);
  });
  window.addEventListener('blur', () => {
    keys.clear();
    firing = false;
  });
  document.addEventListener('mousemove', (event) => {
    if (!locked) return;
    look.x += event.movementX || 0;
    look.y += event.movementY || 0;
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) firing = true;
  });
  window.addEventListener('mouseup', (event) => {
    if (event.button === 0) firing = false;
  });
  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === canvas;
    onLockChange(locked);
  });
  document.addEventListener('pointerlockerror', () => {
    locked = false;
    onLockChange(false);
  });

  return {
    keys,
    pressed,
    look,
    get firing() { return firing; },
    get locked() { return locked; },
    // Ask the browser for pointer lock; in headless captures this rejects quietly.
    requestLock() {
      try {
        const result = canvas.requestPointerLock();
        if (result && result.catch) result.catch(() => {});
      } catch { /* headless or denied: the debug handle still drives the game */ }
    },
    releaseLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // Drain the frame's mouse delta (called once per rendered frame).
    takeLook() {
      const out = { x: look.x, y: look.y };
      look.x = 0;
      look.y = 0;
      return out;
    },
    // Drain the frame's edge presses (called once per rendered frame).
    takePressed() {
      const out = new Set(pressed);
      pressed.clear();
      return out;
    },
  };
}
