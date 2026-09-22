<script lang="ts">
  import { FileText, CircleCheck, Clock, CircleAlert } from '@lucide/svelte';
  import type { SheetRecord } from '$lib/types/ocr.js';

  interface Props {
    records: SheetRecord[];
  }

  let { records }: Props = $props();

  let totalCount = $derived(records.length);
  let doneCount = $derived(records.filter((r) => r.status === 'done').length);
  let pendingCount = $derived(records.filter((r) => r.status === 'pending' || r.status === 'processing').length);
  let errorCount = $derived(records.filter((r) => r.status === 'error').length);
</script>

<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
  <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
    <div>
      <p class="text-xs font-medium text-slate-400">Tổng số file</p>
      <p class="text-2xl font-bold text-white mt-1">{totalCount}</p>
    </div>
    <div class="w-10 h-10 rounded-lg bg-slate-800/80 border border-slate-700/50 flex items-center justify-center text-slate-300">
      <FileText class="w-5 h-5" />
    </div>
  </div>

  <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
    <div>
      <p class="text-xs font-medium text-emerald-400">Đã OCR thành công</p>
      <p class="text-2xl font-bold text-white mt-1">{doneCount}</p>
    </div>
    <div class="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
      <CircleCheck class="w-5 h-5" />
    </div>
  </div>

  <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
    <div>
      <p class="text-xs font-medium text-amber-400">Đang chờ / Xử lý</p>
      <p class="text-2xl font-bold text-white mt-1">{pendingCount}</p>
    </div>
    <div class="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
      <Clock class="w-5 h-5" />
    </div>
  </div>

  <div class="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
    <div>
      <p class="text-xs font-medium text-rose-400">Lỗi OCR</p>
      <p class="text-2xl font-bold text-white mt-1">{errorCount}</p>
    </div>
    <div class="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
      <CircleAlert class="w-5 h-5" />
    </div>
  </div>
</div>
