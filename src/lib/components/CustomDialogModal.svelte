<script lang="ts">
  import {
    AlertCircle,
    CheckCircle2,
    AlertTriangle,
    Info,
    Trash2,
    X,
  } from '@lucide/svelte';
  import type { DialogOptions } from '$lib/types/modal.js';

  interface Props {
    dialog: DialogOptions;
    onClose: () => void;
  }

  let { dialog, onClose }: Props = $props();

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
      if (dialog.variant === 'confirm') {
        dialog.onCancel?.();
      }
      onClose();
    }
  }

  async function handleConfirm() {
    if (dialog.onConfirm) {
      await dialog.onConfirm();
    }
    onClose();
  }

  function handleCancel() {
    if (dialog.onCancel) {
      dialog.onCancel();
    }
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      handleCancel();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if dialog.isOpen}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs transition-opacity duration-200"
    role="dialog"
    aria-modal="true"
    tabindex="-1"
    onclick={handleBackdropClick}
    onkeydown={(e) => {
      if (e.key === 'Escape') handleCancel();
    }}
  >
    <!-- Dialog Card -->
    <div
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all duration-200 scale-100 animate-in fade-in zoom-in-95"
    >
      <!-- Header / Icon -->
      <div class="p-6 pb-4">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-start gap-3.5">
            {#if dialog.variant === 'confirm'}
              <div
                class="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0"
              >
                <Trash2 class="w-5 h-5" />
              </div>
            {:else}
              <div
                class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border {dialog.variant === 'error'
                  ? 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                  : dialog.variant === 'warning'
                    ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                    : dialog.variant === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                      : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'}"
              >
                {#if dialog.variant === 'error'}
                  <AlertCircle class="w-5 h-5" />
                {:else if dialog.variant === 'warning'}
                  <AlertTriangle class="w-5 h-5" />
                {:else if dialog.variant === 'success'}
                  <CheckCircle2 class="w-5 h-5" />
                {:else}
                  <Info class="w-5 h-5" />
                {/if}
              </div>
            {/if}

            <div class="space-y-1">
              <h3 class="text-base font-semibold text-white tracking-tight">
                {dialog.title}
              </h3>
              <p class="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                {dialog.message}
              </p>
            </div>
          </div>

          <button
            onclick={handleCancel}
            type="button"
            class="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            aria-label="Đóng hộp thoại"
          >
            <X class="w-4 h-4" />
          </button>
        </div>

        {#if dialog.bullets && dialog.bullets.length > 0}
          <div class="mt-4 p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 space-y-1.5">
            {#each dialog.bullets as b}
              <div class="text-xs text-slate-300 flex items-start gap-2">
                <span class="text-indigo-400 font-bold">•</span>
                <span class="leading-relaxed">{b}</span>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <!-- Actions -->
      <div class="px-6 py-4 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-end gap-2.5">
        {#if dialog.variant === 'confirm'}
          <button
            onclick={handleCancel}
            type="button"
            class="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition cursor-pointer"
          >
            {dialog.cancelText || 'Hủy bỏ'}
          </button>
          <button
            onclick={handleConfirm}
            type="button"
            class="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold rounded-lg shadow-sm transition cursor-pointer flex items-center gap-1.5"
          >
            <Trash2 class="w-3.5 h-3.5" />
            <span>{dialog.confirmText || 'Xác nhận xóa'}</span>
          </button>
        {:else}
          <button
            onclick={handleConfirm}
            type="button"
            class="px-4 py-2 text-white text-xs font-medium rounded-lg shadow-sm transition cursor-pointer {dialog.variant === 'error'
              ? 'bg-rose-600 hover:bg-rose-500'
              : 'bg-indigo-600 hover:bg-indigo-500'}"
          >
            {dialog.confirmText || 'Đã hiểu'}
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}
