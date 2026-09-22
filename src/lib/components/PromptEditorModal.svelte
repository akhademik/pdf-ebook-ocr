<script lang="ts">
  import { X, Save, RotateCcw, Sparkles, Check, FileText } from '@lucide/svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  let promptText = $state('');
  let defaultPrompt = $state('');
  let isCustom = $state(false);
  let isLoading = $state(false);
  let isSaving = $state(false);
  let saveSuccess = $state(false);

  $effect(() => {
    if (isOpen) {
      loadPrompt();
    }
  });

  async function loadPrompt() {
    isLoading = true;
    saveSuccess = false;
    try {
      const res = await fetch('/api/prompt');
      if (res.ok) {
        const data = await res.json();
        promptText = data.prompt || data.defaultPrompt || '';
        defaultPrompt = data.defaultPrompt || '';
        isCustom = data.isCustom;
      }
    } catch {
      // ignore
    } finally {
      isLoading = false;
    }
  }

  async function handleSave() {
    isSaving = true;
    saveSuccess = false;
    try {
      const res = await fetch('/api/prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText }),
      });
      if (res.ok) {
        const data = await res.json();
        promptText = data.prompt;
        isCustom = data.isCustom;
        saveSuccess = true;
        setTimeout(() => {
          saveSuccess = false;
        }, 3000);
      }
    } catch {
      // ignore
    } finally {
      isSaving = false;
    }
  }

  function handleResetDefault() {
    promptText = defaultPrompt;
  }
</script>

{#if isOpen}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
    <div
      class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
    >
      <!-- Modal Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2.5">
          <div
            class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400"
          >
            <Sparkles class="w-4 h-4" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-white">Chỉnh sửa Prompt OCR Gemini</h2>
            <p class="text-xs text-slate-400">
              Tùy biến chỉ dẫn cho Gemini Vision khi trích xuất văn bản từ hình ảnh scan
            </p>
          </div>
        </div>

        <button
          onclick={onClose}
          aria-label="Đóng"
          class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
        >
          <X class="w-4 h-4" />
        </button>
      </div>

      <!-- Modal Body -->
      <div class="p-5 flex-1 flex flex-col overflow-hidden space-y-4">
        <div class="flex items-center justify-between text-xs">
          <div class="flex items-center gap-2">
            <FileText class="w-3.5 h-3.5 text-slate-400" />
            <span class="text-slate-300 font-medium">Trạng thái Prompt:</span>
            {#if isCustom}
              <span
                class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
              >
                Tùy chỉnh của người dùng
              </span>
            {:else}
              <span
                class="px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
              >
                Mặc định (10 quy tắc OCR tiếng Việt)
              </span>
            {/if}
          </div>

          <button
            onclick={handleResetDefault}
            type="button"
            class="px-2.5 py-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md border border-slate-700/60 flex items-center gap-1.5 transition cursor-pointer"
          >
            <RotateCcw class="w-3 h-3" />
            <span>Nạp lại mặc định</span>
          </button>
        </div>

        <div class="flex-1 flex flex-col">
          <textarea
            bind:value={promptText}
            rows={14}
            disabled={isLoading || isSaving}
            placeholder="Nhập nội dung prompt chỉ dẫn OCR..."
            class="w-full flex-1 p-3 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500/60 leading-relaxed resize-none"
          ></textarea>
        </div>

        {#if saveSuccess}
          <div
            class="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2"
          >
            <Check class="w-4 h-4 text-emerald-400" />
            <span>Đã cập nhật prompt OCR thành công. Các tác vụ OCR tiếp theo sẽ áp dụng prompt này.</span>
          </div>
        {/if}
      </div>

      <!-- Modal Footer -->
      <div class="px-5 py-3.5 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
        <span class="text-[11px] text-slate-500">
          Lưu ý: Nếu để trống, hệ thống sẽ tự động dùng prompt mặc định 10 quy tắc.
        </span>

        <div class="flex items-center gap-2.5">
          <button
            onclick={onClose}
            type="button"
            class="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 transition cursor-pointer"
          >
            Đóng
          </button>

          <button
            onclick={handleSave}
            disabled={isSaving}
            type="button"
            class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 shadow-xs"
          >
            <Save class="w-3.5 h-3.5" />
            <span>{isSaving ? 'Đang lưu...' : 'Lưu Prompt'}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
{/if}
