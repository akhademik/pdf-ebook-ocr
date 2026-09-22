<script lang="ts">
  import { RefreshCw, Download, Layers, Sparkles, Cpu, Send, CheckCircle2 } from '@lucide/svelte';
  import type { SyncSummary } from '$lib/types/ocr.js';
  import type { GeminiModelInfo } from '$lib/types/config.js';

  interface Props {
    isSyncing: boolean;
    isScanning?: boolean;
    lastSyncSummary: SyncSummary | null;
    lastSyncTime: string | null;
    pollIntervalMinutes: number;
    maxConcurrency: number;
    geminiModel: string;
    availableModels: GeminiModelInfo[];
    useBatchMode: boolean;
    batchPollIntervalMinutes: number;
    isPolling?: boolean;
    onModelChange: (model: string) => void;
    onScanDrive?: () => void;
    onRunSync: () => void;
    onPollBatches?: () => void;
    onExportMarkdown: () => void;
  }

  let {
    isSyncing,
    isScanning = false,
    lastSyncSummary,
    lastSyncTime,
    pollIntervalMinutes,
    maxConcurrency,
    geminiModel,
    availableModels,
    useBatchMode,
    batchPollIntervalMinutes,
    isPolling = false,
    onModelChange,
    onScanDrive,
    onRunSync,
    onPollBatches,
    onExportMarkdown,
  }: Props = $props();

  let formattedTime = $derived(
    lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('vi-VN') : 'Chưa chạy',
  );
</script>

<div
  class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xs flex flex-col justify-between"
>
  <div>
    <div class="flex items-center justify-between pb-4 border-b border-slate-800">
      <div class="flex items-center gap-2.5">
        <div
          class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400"
        >
          <Layers class="w-4 h-4" />
        </div>
        <div>
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-white">Điều khiển & Đồng bộ</h2>
            {#if useBatchMode}
              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/30"
              >
                Batch API Mode (50% Cost)
              </span>
            {:else}
              <span
                class="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
              >
                Direct Realtime Mode
              </span>
            {/if}
          </div>
          <p class="text-xs text-slate-400">
            Quét Drive (theo thư mục sách) &rarr; OCR Gemini &rarr; Lưu Sheet &rarr; Tải ZIP
          </p>
        </div>
      </div>
    </div>

    <div class="mt-4 grid grid-cols-2 gap-3 text-xs">
      <div class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 col-span-2">
        <div class="flex items-center justify-between">
          <span class="text-slate-400 flex items-center gap-1.5 font-medium">
            <Cpu class="w-3.5 h-3.5 text-indigo-400" />
            Model Gemini OCR:
          </span>
          <select
            value={geminiModel}
            onchange={(e) => onModelChange((e.target as HTMLSelectElement).value)}
            aria-label="Chọn Model Gemini OCR"
            class="bg-slate-900 border border-slate-700 text-xs font-semibold text-indigo-300 rounded px-2 py-1 focus:outline-hidden cursor-pointer"
          >
            {#if availableModels.length === 0}
              <option value={geminiModel}>{geminiModel}</option>
            {:else}
              {#each availableModels as m}
                <option value={m.id}>
                  ⚡ {m.displayName || m.name || m.id}
                </option>
              {/each}
            {/if}
          </select>
        </div>
      </div>

      <div class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
        <p class="text-slate-500">Chu kỳ quét Drive / Submit:</p>
        <p class="font-medium text-slate-200 mt-0.5">{pollIntervalMinutes} phút/lần</p>
      </div>

      <div class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
        {#if useBatchMode}
          <p class="text-slate-500">Chu kỳ kiểm tra Batch:</p>
          <p class="font-medium text-slate-200 mt-0.5">{batchPollIntervalMinutes} phút/lần</p>
        {:else}
          <p class="text-slate-500">Số luồng đồng thời:</p>
          <p class="font-medium text-slate-200 mt-0.5">{maxConcurrency} file</p>
        {/if}
      </div>

      <div class="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800 col-span-2">
        <p class="text-slate-500">Lần chạy gần nhất:</p>
        <p class="font-medium text-slate-200 mt-0.5">{formattedTime}</p>
      </div>
    </div>

    {#if lastSyncSummary}
      <div
        class="mt-3 p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/20 text-xs text-slate-300"
      >
        <div class="flex items-center gap-1.5 text-indigo-400 font-medium mb-1">
          <Sparkles class="w-3.5 h-3.5" />
          <span>Kết quả gần nhất:</span>
        </div>
        <p class="text-[11px] text-slate-400">
          Mới tìm: <span class="text-white font-medium">{lastSyncSummary.discovered}</span> |
          Thành công: <span class="text-emerald-400 font-medium">{lastSyncSummary.succeeded}</span>
          | Lỗi: <span class="text-rose-400 font-medium">{lastSyncSummary.failed}</span> | Bỏ qua:
          <span class="text-slate-300 font-medium">{lastSyncSummary.skipped}</span>
        </p>
      </div>
    {/if}
  </div>

  <div class="mt-5 pt-4 border-t border-slate-800 flex flex-wrap items-center gap-2.5">
    {#if onScanDrive}
      <button
        onclick={onScanDrive}
        disabled={isScanning || isSyncing}
        type="button"
        class="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-semibold rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        title="Quét Google Drive tìm ảnh mới và lưu vào Sheet (chưa chạy OCR)"
      >
        <RefreshCw class="w-3.5 h-3.5 {isScanning ? 'animate-spin text-indigo-400' : 'text-indigo-400'}" />
        <span>{isScanning ? 'Đang quét Drive...' : 'Quét Google Drive'}</span>
      </button>
    {/if}

    <button
      onclick={onRunSync}
      disabled={isSyncing || isScanning}
      type="button"
      class="flex-1 px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-2 transition cursor-pointer disabled:opacity-50 shadow-xs min-w-[140px]"
    >
      {#if useBatchMode}
        <Send class="w-4 h-4 {isSyncing ? 'animate-bounce' : ''}" />
        <span>{isSyncing ? 'Đang gửi batch...' : 'Gom & Gửi Tất Cả Sách'}</span>
      {:else}
        <RefreshCw class="w-4 h-4 {isSyncing ? 'animate-spin' : ''}" />
        <span>{isSyncing ? 'Đang OCR...' : 'Chạy OCR Ngay'}</span>
      {/if}
    </button>

    {#if useBatchMode && onPollBatches}
      <button
        onclick={onPollBatches}
        disabled={isPolling || isSyncing}
        type="button"
        class="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
        title="Kiểm tra trạng thái các batch job đang chờ trên Gemini"
      >
        <RefreshCw class="w-3.5 h-3.5 {isPolling ? 'animate-spin' : ''}" />
        <span>Check Batch</span>
      </button>
    {/if}

    <button
      onclick={onExportMarkdown}
      type="button"
      class="px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium rounded-lg border border-slate-700 flex items-center justify-center gap-2 transition cursor-pointer"
      title="Tải toàn bộ kết quả OCR dạng tệp .zip (chứa page1.md, page2.md...)"
    >
      <Download class="w-4 h-4" />
      <span>Tải ZIP</span>
    </button>
  </div>
</div>
