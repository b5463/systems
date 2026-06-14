<script setup>
import { useToast } from '../composables/useToast'

const { toasts, dismiss } = useToast()
</script>

<template>
  <div class="toast-stack">
    <transition-group name="toast">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="`toast-${t.type}`"
        @click="dismiss(t.id)"
      >
        <span class="toast-dot"></span>
        <span class="toast-msg">{{ t.message }}</span>
      </div>
    </transition-group>
  </div>
</template>

<style scoped>
.toast-stack {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 0;
  pointer-events: none;
}
.toast {
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  max-width: 460px;
  width: calc(100% - 8px);
  padding: 12px 14px;
  border-radius: 12px;
  background: #1c2128;
  color: #e6edf3;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  font-size: 14px;
  cursor: pointer;
}
.toast-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #58a6ff;
}
.toast-msg {
  min-width: 0;
  flex: 1;
}
.toast-error {
  border-color: rgba(248, 81, 73, 0.4);
}
.toast-error .toast-dot {
  background: #f85149;
}
.toast-warn {
  border-color: rgba(210, 153, 34, 0.4);
}
.toast-warn .toast-dot {
  background: #d29922;
}
.toast-info .toast-dot {
  background: #58a6ff;
}
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
</style>
