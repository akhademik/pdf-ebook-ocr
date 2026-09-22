<script lang="ts">
  import { X, Copy, Check, Play, LoaderCircle, Image as ImageIcon } from '@lucide/svelte';
  import type { SheetRecord } from '$lib/types/ocr.js';

  interface Props {
    record: SheetRecord | null;
    onClose: () => void;
    onRunSingleOcr: (fileId: string) => void;
    isProcessing: boolean;
  }

  let { record, onClose, onRunSingleOcr, isProcessing }: Props = $props();

  let previewUrl = $state<string | null>(null);
  let isLoadingPreview = $state(false);
  let isCopied = $state(false);

  $effect(() => {
    if (record && record.driveFileId) {
      loadPreview(record.driveFileId);
    } else {
      previewUrl = null;
    }
  });

  async function loadPreview(fileId: string) {
    isLoadingPreview = true;
    previewUrl = null;
    try {
      const res = await fetch(`/api/files/${fileId}/preview`);
      if (res.ok) {
        const data = await res.json();
        previewUrl = data.dataUrl;
      }
    } catch {
      // preview error handled gracefully
    } finally {
      isLoadingPreview = false;
    }
  }

  function handleCopy() {
    if (record?.ocrText) {
      navigator.clipboard.writeText(record.ocrText);
      isCopied = true;
      setTimeout(() => (isCopied = false), 2000);
    }
  }
</script>

{#if record}
  <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
    <div class="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
      <!-- Header -->
      <div class="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-mono font-bold text-xs border border-indigo-500/20">
            {record.fileName}
          </span>
        </div>

        <div class="flex items-center gap-2">
          <button
            onclick={() => record && record.driveFileId && onRunSingleOcr(record.driveFileId)}
            disabled={isProcessing || !record.driveFileId}
            class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            {#if isProcessing}
              <LoaderCircle class="w-3.5 h-3.5 animate-spin" />
              <span>Đang OCR...</span>
            {:else}
              <Play class="w-3.5 h-3.5" />
              <span>OCR Lại</span>
            {/if}
          </button>

          <button
            onclick={onClose}
            class="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
          >
            <X class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Body: 2 Column Split -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-0 flex-1 overflow-hidden divide-y md:divide-y-0 md:divide-x divide-slate-800">
        <!-- Image Preview -->
        <div class="p-4 flex flex-col items-center justify-center bg-slate-950/50 overflow-y-auto max-h-[50vh] md:max-h-[70vh]">
          {#if isLoadingPreview}
            <div class="flex flex-col items-center gap-2 text-slate-400 text-xs">
              <LoaderCircle class="w-6 h-6 animate-spin text-indigo-400" />
              <span>Đang tải ảnh từ Google Drive...</span>
            </div>
          {:else if previewUrl}
            <img src={previewUrl} alt={record.fileName} class="max-w-full max-h-full object-contain rounded-lg shadow-md" />
          {:else}
            <div class="flex flex-col items-center gap-2 text-slate-500 text-xs">
              <ImageIcon class="w-8 h-8 stroke-1" />
              <span>Không tải được ảnh preview</span>
            </div>
          {/if}
        </div>

        <!-- OCR Text Output -->
        <div class="p-4 flex flex-col overflow-hidden bg-slate-900 max-h-[50vh] md:max-h-[70vh]">
          <div class="flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
            <span class="text-xs font-semibold text-slate-300">Văn bản nhận diện (Markdown):</span>
            <button
              onclick={handleCopy}
              disabled={!record.ocrText}
              class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-md border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40"
            >
              {#if isCopied}
                <Check class="w-3.5 h-3.5 text-emerald-400" />
                <span class="text-emerald-400">Đã chép</span>
              {:else}
                <Copy class="w-3.5 h-3.5" />
                <span>Sao chép</span>
              {/if}
            </button>
          </div>

          <div class="flex-1 overflow-y-auto">
            {#if record.ocrText}
              <pre class="text-xs font-mono text-slate-200 whitespace-pre-wrap leading-relaxed select-text">{record.ocrText}</pre>
            {:else if record.errorMessage}
              <div class="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs">
                <p class="font-semibold mb-1">Lỗi khi chạy OCR:</p>
                <p class="font-mono text-[11px]">{record.errorMessage}</p>
              </div>
            {:else}
              <p class="text-xs text-slate-500 italic">File này đang ở trạng thái Pending. Hãy chạy Sync hoặc bấm nút "OCR Lại" để nhận diện.</p>
            {/if}
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}
