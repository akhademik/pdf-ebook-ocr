<script lang="ts">
  import { Bot, RefreshCw, Settings } from '@lucide/svelte';

  interface Props {
    isRefreshing: boolean;
    onRefresh: () => void;
    onOpenPromptEditor: () => void;
  }

  let {
    isRefreshing,
    onRefresh,
    onOpenPromptEditor,
  }: Props = $props();
</script>

<header class="bg-slate-900/80 border-b border-slate-800 backdrop-blur-md sticky top-0 z-40">
  <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
        <Bot class="w-6 h-6" />
      </div>
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-base font-bold text-white tracking-tight">Docker OCR</h1>
          <span class="px-2 py-0.5 text-[11px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-full">
            Apps Script + Gemini Vision
          </span>
        </div>
        <p class="text-xs text-slate-400">Tự động hoá OCR và lưu Google Sheet</p>
      </div>
    </div>

    <div class="flex items-center gap-2.5">
      <button
        onclick={onOpenPromptEditor}
        type="button"
        class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
        title="Chỉnh sửa Prompt OCR Gemini"
      >
        <Settings class="w-3.5 h-3.5 text-indigo-400" />
        <span class="hidden sm:inline">Sửa Prompt</span>
      </button>

      <button
        onclick={onRefresh}
        disabled={isRefreshing}
        type="button"
        class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-2 transition cursor-pointer disabled:opacity-50"
      >
        <RefreshCw class="w-3.5 h-3.5 {isRefreshing ? 'animate-spin' : ''}" />
        <span class="hidden sm:inline">Làm mới</span>
      </button>
    </div>
  </div>
</header>
