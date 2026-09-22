<script lang="ts">
  import { ShieldCheck, CheckCircle2, XCircle, Loader2, Play } from '@lucide/svelte';
  import type { SetupCheckResult } from '$lib/types/config.js';

  interface Props {
    isConfigured: boolean;
    missingEnv: string[];
    setupResult: SetupCheckResult | null;
    isRunningCheck: boolean;
    onRunSetupCheck: () => void;
  }

  let { isConfigured, missingEnv, setupResult, isRunningCheck, onRunSetupCheck }: Props = $props();
</script>

<div class="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xs">
  <div class="flex items-center justify-between pb-4 border-b border-slate-800">
    <div class="flex items-center gap-2.5">
      <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
        <ShieldCheck class="w-4 h-4" />
      </div>
      <div>
        <h2 class="text-sm font-semibold text-white">Kiểm tra kết nối hệ thống </h2>
        <p class="text-xs text-slate-400">Apps Script, Google Drive và Gemini API</p>
      </div>
    </div>

    <button
      onclick={onRunSetupCheck}
      disabled={isRunningCheck}
      class="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
    >
      {#if isRunningCheck}
        <Loader2 class="w-3.5 h-3.5 animate-spin" />
        <span>Đang kiểm tra...</span>
      {:else}
        <Play class="w-3.5 h-3.5" />
        <span>Chạy Test kết nối</span>
      {/if}
    </button>
  </div>

  {#if !isConfigured}
    <div class="mt-4 p-3.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
      <p class="font-medium">Chưa cấu hình đầy đủ file <span class="font-mono bg-rose-950/60 px-1 py-0.5 rounded">.env</span>. Còn thiếu các biến sau:</p>
      <ul class="list-disc list-inside mt-1.5 space-y-0.5 font-mono text-[11px] text-rose-400">
        {#each missingEnv as envName}
          <li>{envName}</li>
        {/each}
      </ul>
    </div>
  {:else if setupResult}
    <div class="mt-4 space-y-2.5">
      {#each setupResult.steps as step}
        <div class="flex items-start justify-between p-3 rounded-lg bg-slate-950/50 border border-slate-800/80">
          <div class="flex items-start gap-2.5">
            {#if step.status === 'success'}
              <CheckCircle2 class="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
            {:else if step.status === 'error'}
              <XCircle class="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
            {:else}
              <Loader2 class="w-4 h-4 text-amber-400 animate-spin mt-0.5 shrink-0" />
            {/if}
            <div>
              <p class="text-xs font-medium text-slate-200">{step.title}</p>
              <p class="text-[11px] text-slate-400 mt-0.5">{step.message}</p>
              {#if step.details}
                <p class="text-[11px] text-rose-400 bg-rose-950/30 p-1.5 rounded mt-1.5 font-mono break-all">{step.details}</p>
              {/if}
            </div>
          </div>
          <span class="text-[11px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wider
            {step.status === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : ''}
            {step.status === 'error' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : ''}
            {step.status === 'pending' || step.status === 'running' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : ''}
          ">
            {step.status}
          </span>
        </div>
      {/each}
    </div>
  {:else}
    <div class="mt-4 p-3 rounded-lg bg-slate-950/40 border border-slate-800/60 text-slate-400 text-xs text-center">
      Bấm nút <span class="text-indigo-400 font-medium">"Chạy Test kết nối"</span> ở trên để kiểm tra kết nối Apps Script, Drive và Gemini API.
    </div>
  {/if}
</div>
