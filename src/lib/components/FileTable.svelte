<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import {
    FileText,
    Play,
    Eye,
    CircleAlert,
    CircleCheck,
    Clock,
    Search,
    Folder,
    Send,
    ChevronDown,
    Layers,
    X,
  } from '@lucide/svelte';
  import type { SheetRecord } from '$lib/types/ocr.js';

  interface Props {
    records: SheetRecord[];
    onSelectRecord: (record: SheetRecord) => void;
    onRunSingleOcr: (fileId: string) => void;
    processingFileId: string | null;
  }

  let { records, onSelectRecord, onRunSingleOcr, processingFileId }: Props = $props();

  const PAGE_CHUNK_SIZE = 20;

  let searchQuery = $state('');
  let filterStatus = $state<string>('all');
  let filterBook = $state<string>('all');
  let displayLimit = $state<number>(PAGE_CHUNK_SIZE);

  let bottomSentinel: HTMLDivElement | null = $state(null);
  let observer: IntersectionObserver | null = null;

  let booksList = $derived([
    ...new Set(records.map((r) => r.bookName || 'Default').filter(Boolean)),
  ]);

  let filteredRecords = $derived.by(() => {
    const query = searchQuery.trim().toLowerCase();
    const queryNum = query.replace('#', '');
    const isNumQuery = /^\d+$/.test(queryNum);

    return records.filter((r) => {
      const fileName = (r.fileName || '').toLowerCase();
      const ocrText = (r.ocrText || '').toLowerCase();
      const bookName = (r.bookName || 'Default').toLowerCase();

      let matchSearch = true;
      if (query) {
        const fileMatch = fileName.includes(query);
        const textMatch = ocrText.includes(query);
        const bookMatch = bookName.includes(query);
        const pageMatch = isNumQuery ? getPageNum(r.fileName).toString() === queryNum : false;
        matchSearch = fileMatch || textMatch || bookMatch || pageMatch;
      }

      const matchStatus = filterStatus === 'all' || r.status === filterStatus;
      const matchBook = filterBook === 'all' || (r.bookName || 'Default') === filterBook;

      return matchSearch && matchStatus && matchBook;
    });
  });

  let visibleRecords = $derived(filteredRecords.slice(0, displayLimit));
  let hasMore = $derived(displayLimit < filteredRecords.length);

  $effect(() => {
    // Reset display limit when filter or search changes
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    searchQuery;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    filterStatus;
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    filterBook;
    displayLimit = PAGE_CHUNK_SIZE;
  });

  function loadMore() {
    if (hasMore) {
      displayLimit += PAGE_CHUNK_SIZE;
    }
  }

  function showAll() {
    displayLimit = filteredRecords.length;
  }

  function clearSearch() {
    searchQuery = '';
  }

  function getPageNum(fileName: string): number {
    const match = fileName.match(/\d+/);
    return match ? parseInt(match[0], 10) : 1;
  }

  onMount(() => {
    if (typeof window !== 'undefined' && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && hasMore) {
            loadMore();
          }
        },
        { rootMargin: '150px' },
      );

      if (bottomSentinel) {
        observer.observe(bottomSentinel);
      }
    }
  });

  $effect(() => {
    if (observer && bottomSentinel) {
      observer.disconnect();
      if (hasMore) {
        observer.observe(bottomSentinel);
      }
    }
  });

  onDestroy(() => {
    if (observer) {
      observer.disconnect();
    }
  });
</script>

<div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
  <!-- Header bar -->
  <div
    class="p-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3"
  >
    <div class="flex items-center gap-2.5">
      <div
        class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400"
      >
        <FileText class="w-4 h-4" />
      </div>
      <div>
        <h2 class="text-sm font-semibold text-white flex items-center gap-2">
          <span>Danh sách trang & Kết quả OCR</span>
          <span
            class="px-2 py-0.5 rounded-full text-[11px] font-mono bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
          >
            {visibleRecords.length} / {filteredRecords.length} trang
          </span>
        </h2>
        <p class="text-xs text-slate-400">
          Hiển thị 20 trang đầu, tự động cuộn vô tận (Infinite Scroll) hoặc tìm nhanh theo tên file
        </p>
      </div>
    </div>

    <!-- Search & Filters -->
    <div class="flex flex-wrap items-center gap-2.5">
      {#if booksList.length > 1}
        <select
          bind:value={filterBook}
          aria-label="Lọc theo cuốn sách"
          class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
        >
          <option value="all">Tất cả sách ({booksList.length})</option>
          {#each booksList as b}
            <option value={b}>📚 {b}</option>
          {/each}
        </select>
      {/if}

      <!-- Search Box with Clear Button -->
      <div class="relative flex-1 sm:flex-initial">
        <Search class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          bind:value={searchQuery}
          placeholder="Tìm 'page123', '001', text..."
          class="pl-8 pr-7 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 w-full sm:w-56"
        />
        {#if searchQuery}
          <button
            onclick={clearSearch}
            type="button"
            class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition cursor-pointer"
            aria-label="Xóa tìm kiếm"
          >
            <X class="w-3.5 h-3.5" />
          </button>
        {/if}
      </div>

      <select
        bind:value={filterStatus}
        aria-label="Lọc theo trạng thái"
        class="px-2.5 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500 cursor-pointer"
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

  <!-- Table Content -->
  <div class="overflow-x-auto max-h-[70vh] overflow-y-auto">
    <table class="w-full text-left text-xs text-slate-300">
      <thead class="bg-slate-950 text-slate-400 font-medium border-b border-slate-800 sticky top-0 z-10">
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
        {#if visibleRecords.length === 0}
          <tr>
            <td colspan="6" class="px-4 py-12 text-center text-slate-500">
              <div class="flex flex-col items-center justify-center gap-2">
                <Search class="w-6 h-6 text-slate-600" />
                <p>Không tìm thấy trang nào phù hợp với bộ lọc</p>
                {#if searchQuery}
                  <button
                    onclick={clearSearch}
                    type="button"
                    class="mt-1 text-indigo-400 hover:underline text-xs"
                  >
                    Xóa từ khóa "{searchQuery}"
                  </button>
                {/if}
              </div>
            </td>
          </tr>
        {:else}
          {#each visibleRecords as rec (rec.driveFileId || rec.fileName)}
            <tr class="hover:bg-slate-800/30 transition">
              <td class="px-4 py-3 text-center font-mono font-bold text-indigo-400">
                #{getPageNum(rec.fileName)}
              </td>
              <td
                class="px-4 py-3 font-medium text-slate-200 max-w-[180px] truncate font-mono text-[11px]"
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
              <td class="px-4 py-3 whitespace-nowrap">
                {#if rec.status === 'done'}
                  <span
                    class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  >
                    <CircleCheck class="w-3 h-3" /> Done
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
                    <CircleAlert class="w-3 h-3" /> Error
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

    <!-- Infinite Scroll Sentinel & Load More Buttons -->
    {#if hasMore}
      <div
        bind:this={bottomSentinel}
        class="p-4 bg-slate-950/80 border-t border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs"
      >
        <span class="text-slate-400">
          Đang hiển thị <span class="text-white font-medium">{visibleRecords.length}</span> / {filteredRecords.length} trang (còn {filteredRecords.length - visibleRecords.length} trang)
        </span>
        <div class="flex items-center gap-2">
          <button
            onclick={loadMore}
            type="button"
            class="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
          >
            <ChevronDown class="w-3.5 h-3.5 text-indigo-400" />
            <span>Tải thêm 20 trang</span>
          </button>
          <button
            onclick={showAll}
            type="button"
            class="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium rounded-lg border border-indigo-500/30 flex items-center gap-1.5 transition cursor-pointer"
          >
            <Layers class="w-3.5 h-3.5" />
            <span>Hiện tất cả</span>
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

