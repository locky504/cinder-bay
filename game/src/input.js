// Cinder Bay — keyboard and mouse input. One place owns the key set and the
// camera-drag state; gameplay reads G.keys and the drag deltas.
import { G } from './state.js';

const KEYMAP = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'brake',
  KeyE: 'interact',
  KeyF: 'steal',
  KeyR: 'restart',
  KeyM: 'mute',
  KeyP: 'pause', Escape: 'pause',
  KeyJ: 'job',
};

export function initInput(canvas, callbacks) {
  window.addEventListener('keydown', (e) => {
    const action = KEYMAP[e.code];
    if (action) {
      if (['up', 'down', 'left', 'right', 'brake'].includes(action)) e.preventDefault();
      if (!G.keys[action]) callbacks.onPress(action, e);
      G.keys[action] = true;
    }
    if (e.code === 'KeyM') callbacks.onMute();
  });
  window.addEventListener('keyup', (e) => {
    const action = KEYMAP[e.code];
    if (action) G.keys[action] = false;
  });
  window.addEventListener('blur', () => { G.keys = {}; });

  canvas.addEventListener('mousedown', (e) => {
    G.mouseDown = true; G.lastMouseX = e.clientX; G.lastMouseY = e.clientY;
    if (G.mode === 'playing' && G.player.onFoot) callbacks.onShootStart();
  });
  window.addEventListener('mouseup', () => {
    G.mouseDown = false;
    callbacks.onShootEnd();
  });
  window.addEventListener('mousemove', (e) => {
    if (!G.mouseDown) return;
    const dx = e.clientX - G.lastMouseX;
    const dy = e.clientY - G.lastMouseY;
    G.lastMouseX = e.clientX; G.lastMouseY = e.clientY;
    G.camYaw -= dx * 0.005;
    G.camPitch = Math.max(0.05, Math.min(1.1, G.camPitch + dy * 0.003));
    G.dragYaw = 1.5; // fresh manual orbit: stop auto-align for a while
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
