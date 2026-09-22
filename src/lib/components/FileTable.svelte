<script lang="ts">
  import { FileText, Play, Eye, AlertCircle, CheckCircle2, Clock, Search, Folder, Send } from '@lucide/svelte';
  import type { SheetRecord } from '$lib/types/ocr.js';

  interface Props {
    records: SheetRecord[];
    onSelectRecord: (record: SheetRecord) => void;
    onRunSingleOcr: (fileId: string) => void;
    processingFileId: string | null;
  }

  let { records, onSelectRecord, onRunSingleOcr, processingFileId }: Props = $props();

  let searchQuery = $state('');
  let filterStatus = $state<string>('all');
  let filterBook = $state<string>('all');

  let booksList = $derived([
    ...new Set(records.map((r) => r.bookName || 'Default').filter(Boolean)),
  ]);

  let filteredRecords = $derived(
    records.filter((r) => {
      const fileName = r.fileName || '';
      const ocrText = r.ocrText || '';
      const bookName = r.bookName || 'Default';
      const matchSearch =
        fileName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ocrText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bookName.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = filterStatus === 'all' || r.status === filterStatus;
      const matchBook = filterBook === 'all' || bookName === filterBook;
      return matchSearch && matchStatus && matchBook;
    }),
  );

  function getPageNum(fileName: string): number {
    const match = fileName.match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  }
</script>

<div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
  <div
    class="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
  >
    <div class="flex items-center gap-2">
      <FileText class="w-4 h-4 text-indigo-400" />
      <h2 class="text-sm font-semibold text-white">
        Danh sách trang & Kết quả OCR ({records.length})
      </h2>
    </div>

    <div class="flex flex-wrap items-center gap-2.5">
      {#if booksList.length > 1}
        <select
          bind:value={filterBook}
          aria-label="Lọc theo cuốn sách"
          class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
        >
          <option value="all">Tất cả sách ({booksList.length})</option>
          {#each booksList as b}
            <option value={b}>📚 {b}</option>
          {/each}
        </select>
      {/if}

      <div class="relative">
        <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Tìm file, text, sách..."
          class="pl-8 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 w-44"
        />
      </div>

      <select
        bind:value={filterStatus}
        aria-label="Lọc theo trạng thái"
        class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
      >
        <option value="all">Tất cả trạng thái</option>
        <option value="done">Done (Thành công)</option>
        <option value="batch_submitted">Batch Submitted</option>
        <option value="batching">Batching (Đang gom)</option>
        <option value="pending">Pending (Chờ)</option>
        <option value="processing">Processing (Đang chạy)</option>
        <option value="error">Error (Lỗi)</option>
      </select>
    </div>
  </div>

  <div class="overflow-x-auto">
    <table class="w-full text-left text-xs text-slate-300">
      <thead class="bg-slate-950/60 text-slate-400 font-medium border-b border-slate-800">
        <tr>
          <th class="px-4 py-3 w-16 text-center">Trang</th>
          <th class="px-4 py-3">Tên file ảnh (fileName)</th>
          <th class="px-4 py-3">Cuốn sách (bookName)</th>
          <th class="px-4 py-3">Trạng thái</th>
          <th class="px-4 py-3">Trích đoạn OCR</th>
          <th class="px-4 py-3 text-right">Thao tác</th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-800/60">
        {#if filteredRecords.length === 0}
          <tr>
            <td colspan="6" class="px-4 py-8 text-center text-slate-500">
              Không có dữ liệu phù hợp
            </td>
          </tr>
        {:else}
          {#each filteredRecords as rec}
            <tr class="hover:bg-slate-800/30 transition">
              <td class="px-4 py-3 text-center font-mono font-bold text-indigo-400">
                #{getPageNum(rec.fileName)}
              </td>
              <td
                class="px-4 py-3 font-medium text-slate-200 max-w-[180px] truncate"
                title={rec.fileName}
              >
                {rec.fileName}
              </td>
              <td class="px-4 py-3 text-slate-400 max-w-[140px] truncate">
                <span class="inline-flex items-center gap-1">
                  <Folder class="w-3 h-3 text-slate-500" />
                  <span>{rec.bookName || 'Default'}</span>
                </span>
              </td>
              <td class="px-4 py-3">
                {#if rec.status === 'done'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  >
                    <CheckCircle2 class="w-3 h-3" /> Done
                  </span>
                {:else if rec.status === 'batch_submitted'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20"
                    title={rec.batchId ? `Batch ID: ${rec.batchId}` : 'Đã submit'}
                  >
                    <Send class="w-3 h-3" /> Batch Sent
                  </span>
                {:else if rec.status === 'batching'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  >
                    <Clock class="w-3 h-3 animate-spin" /> Batching
                  </span>
                {:else if rec.status === 'processing'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  >
                    <Clock class="w-3 h-3 animate-spin" /> Processing
                  </span>
                {:else if rec.status === 'error'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20"
                    title={rec.errorMessage}
                  >
                    <AlertCircle class="w-3 h-3" /> Error
                  </span>
                {:else}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700"
                  >
                    Pending
                  </span>
                {/if}
              </td>
              <td class="px-4 py-3 max-w-[280px] truncate text-slate-400">
                {#if rec.ocrText}
                  {rec.ocrText.slice(0, 100)}...
                {:else if rec.errorMessage}
                  <span class="text-rose-400 text-[11px]">{rec.errorMessage}</span>
                {:else}
                  <span class="text-slate-600 italic">Chưa có text</span>
                {/if}
              </td>
              <td class="px-4 py-3 text-right whitespace-nowrap">
                <div class="flex items-center justify-end gap-1.5">
                  <button
                    onclick={() => onSelectRecord(rec)}
                    type="button"
                    class="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-md border border-slate-700 transition cursor-pointer"
                    title="Xem chi tiết / Preview ảnh"
                  >
                    <Eye class="w-3.5 h-3.5" />
                  </button>

                  <button
                    onclick={() => onRunSingleOcr(rec.driveFileId)}
                    disabled={processingFileId === rec.driveFileId || !rec.driveFileId}
                    type="button"
                    class="p-1.5 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 rounded-md transition cursor-pointer disabled:opacity-50"
                    title="Chạy OCR riêng file này (Realtime)"
                  >
                    <Play
                      class="w-3.5 h-3.5 {processingFileId === rec.driveFileId ? 'animate-spin' : ''}"
                    />
                  </button>
                </div>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</div>
