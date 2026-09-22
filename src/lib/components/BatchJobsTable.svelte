<script lang="ts">
  import { Layers, RefreshCw, CheckCircle2, Clock, AlertCircle, XCircle } from '@lucide/svelte';
  import type { BatchJobRecord } from '$lib/types/ocr.js';

  interface Props {
    batchJobs: BatchJobRecord[];
    onPollBatches: () => void;
    isPolling: boolean;
  }

  let { batchJobs, onPollBatches, isPolling }: Props = $props();
</script>

<div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
  <div
    class="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
  >
    <div class="flex items-center gap-2">
      <Layers class="w-4 h-4 text-indigo-400" />
      <div>
        <h2 class="text-sm font-semibold text-white">
          Tiến trình Batch Jobs ({batchJobs.length})
        </h2>
        <p class="text-xs text-slate-400">
          Theo dõi các lô ảnh gửi xử lý bất đồng bộ qua Gemini Batch API
        </p>
      </div>
    </div>

    <button
      onclick={onPollBatches}
      disabled={isPolling}
      type="button"
      class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
    >
      <RefreshCw class="w-3.5 h-3.5 {isPolling ? 'animate-spin' : ''}" />
      <span>{isPolling ? 'Đang kiểm tra...' : 'Kiểm tra trạng thái Batch'}</span>
    </button>
  </div>

  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs text-slate-300">
      <thead class="bg-slate-950/60 text-slate-400 font-medium border-b border-slate-800">
        <tr>
          <th class="px-4 py-3">Batch ID</th>
          <th class="px-4 py-3">Cuốn sách</th>
          <th class="px-4 py-3">Số lượng ảnh</th>
          <th class="px-4 py-3">Trạng thái</th>
          <th class="px-4 py-3">Thời điểm gửi</th>
          <th class="px-4 py-3">Lần check cuối</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800/60">
        {#if batchJobs.length === 0}
          <tr>
            <td colspan="6" class="px-4 py-6 text-center text-slate-500">
              Chưa có batch job nào được tạo. Khi chạy chế độ Batch, hệ thống sẽ tự động gom ảnh và hiển thị tại đây.
            </td>
          </tr>
        {:else}
          {#each batchJobs as job}
            <tr class="hover:bg-slate-800/30 transition">
              <td class="px-4 py-3 font-mono font-medium text-slate-200 max-w-[200px] truncate" title={job.batchId}>
                {job.batchId}
              </td>
              <td class="px-4 py-3 font-medium text-slate-300">
                📚 {job.bookName || 'Default'}
              </td>
              <td class="px-4 py-3 font-mono text-indigo-400 font-semibold">
                {job.totalImages} trang
              </td>
              <td class="px-4 py-3">
                {#if job.status === 'completed'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  >
                    <CheckCircle2 class="w-3 h-3" /> Completed
                  </span>
                {:else if job.status === 'running'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20"
                  >
                    <Clock class="w-3 h-3 animate-spin" /> Running
                  </span>
                {:else if job.status === 'failed'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    title={job.errorMessage}
                  >
                    <AlertCircle class="w-3 h-3" /> Failed
                  </span>
                {:else if job.status === 'expired'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  >
                    <XCircle class="w-3 h-3" /> Expired
                  </span>
                {:else}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700"
                  >
                    Pending
                  </span>
                {/if}
              </td>
              <td class="px-4 py-3 text-slate-400 text-[11px]">
                {job.submittedAt ? new Date(job.submittedAt).toLocaleTimeString('vi-VN') + ' ' + new Date(job.submittedAt).toLocaleDateString('vi-VN') : '-'}
              </td>
              <td class="px-4 py-3 text-slate-500 text-[11px]">
                {job.lastCheckedAt ? new Date(job.lastCheckedAt).toLocaleTimeString('vi-VN') : '-'}
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
