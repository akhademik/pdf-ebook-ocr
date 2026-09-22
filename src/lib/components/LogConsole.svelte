<script lang="ts">
  import { Terminal, Trash2 } from '@lucide/svelte';

  interface Props {
    logs: string[];
    onClearLogs?: () => void;
  }

  let { logs }: Props = $props();
</script>

<div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xs">
  <div class="p-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
    <div class="flex items-center gap-2">
      <Terminal class="w-4 h-4 text-indigo-400" />
      <h2 class="text-xs font-semibold text-white">Live System Logs ({logs.length})</h2>
    </div>
  </div>

  <div class="p-3 bg-slate-950 font-mono text-[11px] h-48 overflow-y-auto space-y-1 select-text">
    {#if logs.length === 0}
      <p class="text-slate-600 italic">Chưa có nhật ký hoạt động.</p>
    {:else}
      {#each logs as line}
        <div class="leading-relaxed break-all
          {line.includes('[ERROR]') ? 'text-rose-400' : ''}
          {line.includes('[WARN]') ? 'text-amber-400' : ''}
          {line.includes('[INFO]') ? 'text-slate-300' : ''}
        ">
          {line}
        </div>
      {/each}
    {/if}
  </div>
</div>
