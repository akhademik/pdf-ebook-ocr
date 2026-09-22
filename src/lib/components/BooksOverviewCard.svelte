<script lang="ts">
  import {
    BookOpen,
    Play,
    Download,
    Trash2,
    CircleCheck,
    Clock,
    CircleAlert,
    LoaderCircle,
  } from '@lucide/svelte';
  import type { SheetRecord } from '$lib/types/ocr.js';
  import type { BatchRun } from '$lib/types/batchRun.js';

  interface Props {
    records: SheetRecord[];
    isSyncing: boolean;
    useBatchMode?: boolean;
    batchRuns?: BatchRun[];
    onRunBookBatch: (bookName: string) => void;
    onDownloadBookZip: (bookName: string) => void;
    onDeleteBook: (bookName: string) => void;
  }

  let {
    records,
    isSyncing,
    useBatchMode = true,
    batchRuns = [],
    onRunBookBatch,
    onDownloadBookZip,
    onDeleteBook,
  }: Props = $props();

  interface BookStat {
    bookName: string;
    total: number;
    done: number;
    pending: number;
    batchSubmitted: number;
    processing: number;
    error: number;
    percent: number;
  }

  let runsByBook = $derived.by(() => {
    const map = new Map<string, BatchRun>();
    for (const run of batchRuns) {
      if (!map.has(run.bookName)) {
        map.set(run.bookName, run);
      }
    }
    return map;
  });

  let bookStats = $derived.by(() => {
    const map = new Map<string, BookStat>();

    for (const r of records) {
      const bName = r.bookName || 'Default';
      if (!map.has(bName)) {
        map.set(bName, {
          bookName: bName,
          total: 0,
          done: 0,
          pending: 0,
          batchSubmitted: 0,
          processing: 0,
          error: 0,
          percent: 0,
        });
      }

      const stat = map.get(bName)!;
      stat.total++;
      if (r.status === 'done') stat.done++;
      else if (r.status === 'pending') stat.pending++;
      else if (r.status === 'batch_submitted' || r.status === 'batching') stat.batchSubmitted++;
      else if (r.status === 'processing') stat.processing++;
      else if (r.status === 'error') stat.error++;
    }

    const list = Array.from(map.values());
    for (const s of list) {
      s.percent = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
    }
    return list;
  });
</script>

<div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
  <div class="p-4 border-b border-slate-800 flex items-center justify-between">
    <div class="flex items-center gap-2.5">
      <div
        class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400"
      >
        <BookOpen class="w-4 h-4" />
      </div>
      <div>
        <h2 class="text-sm font-semibold text-white">Quản lý sách & Tiến độ ({bookStats.length} cuốn)</h2>
        <p class="text-xs text-slate-400">
          {useBatchMode
            ? 'Chế độ Batch API (giảm 50% chi phí - yêu cầu Paid Tier)'
            : 'Chế độ Trực tiếp (nhận diện tức thì - phù hợp Free Tier)'}
        </p>
      </div>
    </div>
  </div>

  <div class="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
    {#if bookStats.length === 0}
      <div class="col-span-full py-8 text-center text-slate-500 text-xs">
        Chưa có dữ liệu sách nào. Hãy bấm "Làm mới" hoặc "Quét Google Drive" để nạp các thư mục sách.
      </div>
    {:else}
      {#each bookStats as book}
        {@const currentRun = runsByBook.get(book.bookName)}
        {@const isRunning =
          currentRun &&
          (currentRun.phase === 'preparing' ||
            currentRun.phase === 'downloading' ||
            currentRun.phase === 'uploading' ||
            currentRun.phase === 'ocr_processing')}
        <div class="bg-slate-950/60 border {isRunning ? 'border-indigo-500/60 ring-1 ring-indigo-500/30' : 'border-slate-800/80'} rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition">
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-semibold text-white truncate flex items-center gap-1.5" title={book.bookName}>
                📚 <span class="font-mono text-indigo-300">{book.bookName}</span>
              </span>
              <span class="text-xs font-mono font-bold {book.percent === 100 ? 'text-emerald-400' : 'text-indigo-400'}">
                {book.percent}%
              </span>
            </div>

            <!-- Main Book Progress bar -->
            <div class="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-3">
              <div
                class="h-full {book.percent === 100 ? 'bg-emerald-500' : 'bg-indigo-500'} transition-all duration-300"
                style="width: {book.percent}%"
              ></div>
            </div>

            <!-- Active Batch / Direct Run Progress Banner (Live Feature) -->
            {#if isRunning && currentRun}
              <div class="mb-3 p-2.5 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-xs">
                <div class="flex items-center justify-between gap-2 text-indigo-300 font-medium mb-1.5">
                  <span class="flex items-center gap-1.5">
                    <LoaderCircle class="w-3.5 h-3.5 animate-spin text-indigo-400" />
                    <span>{currentRun.phase === 'ocr_processing' ? 'Đang nhận diện OCR (Free Tier)...' : currentRun.phase === 'downloading' ? 'Đang tải ảnh...' : currentRun.phase === 'uploading' ? 'Đang nạp lên Gemini...' : 'Đang chuẩn bị...'}</span>
                  </span>
                  <span class="font-mono font-bold text-indigo-200">{currentRun.percent}%</span>
                </div>
                <div class="w-full h-1.5 bg-indigo-950 rounded-full overflow-hidden mb-1.5">
                  <div
                    class="h-full bg-indigo-400 transition-all duration-200"
                    style="width: {currentRun.percent}%"
                  ></div>
                </div>
                <div class="text-[11px] text-indigo-200/80 truncate" title={currentRun.message}>
                  {currentRun.message}
                </div>
              </div>
            {:else if currentRun && (currentRun.phase === 'batch_submitted' || currentRun.phase === 'completed')}
              <div class="mb-3 p-2 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center gap-1.5">
                <CircleCheck class="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span class="truncate" title={currentRun.message}>
                  {currentRun.message}
                </span>
              </div>
            {:else if currentRun && currentRun.phase === 'error'}
              <div class="mb-3 p-2 rounded-lg bg-rose-950/40 border border-rose-500/30 text-[11px] text-rose-300 flex items-center gap-1.5">
                <CircleAlert class="w-3.5 h-3.5 text-rose-400 shrink-0" />
                <span class="truncate" title={currentRun.errorMessage || currentRun.message}>
                  {currentRun.errorMessage || currentRun.message}
                </span>
              </div>
            {/if}

            <!-- Stats detail -->
            <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-400 mb-4 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/50">
              <div>
                Tổng số trang: <span class="text-white font-medium">{book.total}</span>
              </div>
              <div class="text-emerald-400 flex items-center gap-1">
                <CircleCheck class="w-3 h-3" /> Đã xong: <span class="font-medium">{book.done}</span>
              </div>
              <div class="text-sky-400 flex items-center gap-1">
                <Clock class="w-3 h-3" /> Đang chờ/Lô: <span class="font-medium">{book.pending + book.batchSubmitted + book.processing}</span>
              </div>
              <div class="{book.error > 0 ? 'text-rose-400' : 'text-slate-500'} flex items-center gap-1">
                <CircleAlert class="w-3 h-3" /> Lỗi: <span class="font-medium">{book.error}</span>
              </div>
            </div>
          </div>

          <!-- Actions for this book -->
          <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
            <div class="flex items-center gap-1.5">
              <button
                onclick={() => onRunBookBatch(book.bookName)}
                disabled={isSyncing || isRunning || book.pending === 0}
                type="button"
                class="px-2.5 py-1.5 {useBatchMode ? 'bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border-indigo-500/30' : 'bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-300 border-emerald-500/30'} border rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                title={book.pending === 0 ? 'Không có trang pending' : useBatchMode ? 'Gửi batch không đồng bộ cho cuốn sách này (Paid Tier)' : 'Chạy OCR trực tiếp cho cuốn sách này (Free Tier)'}
              >
                {#if isRunning}
                  <LoaderCircle class="w-3 h-3 animate-spin" />
                  <span>Đang xử lý...</span>
                {:else}
                  <Play class="w-3 h-3" />
                  <span>{useBatchMode ? 'Chạy Batch' : 'Chạy OCR'} ({book.pending})</span>
                {/if}
              </button>

              <button
                onclick={() => onDownloadBookZip(book.bookName)}
                disabled={book.done === 0}
                type="button"
                class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                title="Tải ZIP file Markdown chỉ riêng cuốn này"
              >
                <Download class="w-3 h-3" />
                <span>Tải ZIP</span>
              </button>
            </div>

            <button
              onclick={() => onDeleteBook(book.bookName)}
              type="button"
              class="px-2 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 rounded-lg text-xs font-medium flex items-center gap-1 transition cursor-pointer"
              title="Xóa cuốn này khỏi Sheet 1 và batch_jobs sau khi đã hoàn thành"
            >
              <Trash2 class="w-3.5 h-3.5 text-rose-400" />
              <span class="hidden sm:inline">Xóa sách</span>
            </button>
          </div>
        </div>
      {/each}
    {/if}
  </div>
</div>

