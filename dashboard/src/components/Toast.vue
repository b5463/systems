<script setup>
import { useToast } from '../composables/useToast'

const { toasts, dismiss, pause, resume } = useToast()
</script>

<template>
  <div class="toast-stack">
    <transition-group name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="`toast-${t.type}`"
        role="status"
        @mouseenter="pause(t.id)"
        @mouseleave="resume(t.id)"
      >
        <span class="toast-dot"></span>
        <span class="toast-msg">{{ t.message }}</span>
        <button class="toast-x" aria-label="Dismiss" @click="dismiss(t.id)">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
/* Bottom-right on desktop (near where work happens); full-width bottom on mobile. */
.toast-stack {
  position: fixed;
  bottom: 0;
  right: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  padding: 0 16px calc(16px + var(--safe-bottom, 0px));
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 420px;
  padding: 11px 12px 11px 14px;
  border-radius: var(--radius);
  background: var(--bg-elevated);
  color: var(--text);
  border: 1px solid var(--border);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  font-size: 14px;
}
.toast-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--accent);
}
.toast-msg { min-width: 0; flex: 1; }
.toast-x {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-muted);
  border-radius: var(--radius-xs);
  cursor: pointer;
}
.toast-x:hover { color: var(--text); background: var(--bg-hover); }

.toast-success { border-color: rgba(69, 194, 103, 0.4); }
.toast-success .toast-dot { background: var(--ok); }
.toast-error { border-color: rgba(239, 91, 81, 0.45); }
.toast-error .toast-dot { background: var(--danger); }
.toast-warn { border-color: rgba(214, 162, 60, 0.45); }
.toast-warn .toast-dot { background: var(--warn); }
.toast-info .toast-dot { background: var(--accent); }

.toast-enter-active,
.toast-leave-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.toast-enter-from,
.toast-leave-to { opacity: 0; transform: translateY(12px); }

@media (max-width: 560px) {
  .toast-stack { left: 0; align-items: stretch; padding: 0 12px calc(12px + var(--safe-bottom, 0px)); }
  .toast { max-width: none; }
}
@media (prefers-reduced-motion: reduce) {
  .toast-enter-active,
  .toast-leave-active { transition: opacity 0.2s ease; }
  .toast-enter-from,
  .toast-leave-to { transform: none; }
}
</style>
