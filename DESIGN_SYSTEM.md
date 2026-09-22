# Design System

## 1. Color Palette (Dark/Light Neutral with Indigo & Emerald accents)

- **Primary / Brand**: Indigo (`bg-indigo-600`, `hover:bg-indigo-700`, `text-indigo-600`, `focus:ring-indigo-500`)
- **Success / Done**: Emerald (`bg-emerald-500/10 text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-800`)
- **Warning / Processing**: Amber (`bg-amber-500/10 text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-800`)
- **Error / Failed**: Rose / Red (`bg-rose-500/10 text-rose-700 border-rose-300 dark:text-rose-400 dark:border-rose-800`)
- **Pending / Neutral**: Slate / Zinc (`bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300`)
- **Backgrounds**: Slate-50 / Slate-900 / Slate-950

## 2. Typography & Hierarchy

- Headings: `font-semibold tracking-tight text-slate-900 dark:text-slate-100`
- Body: `text-sm text-slate-600 dark:text-slate-400`
- Monospace / Code: `font-mono text-xs bg-slate-100 dark:bg-slate-800/80 p-1 rounded`

## 3. UI Components & Tokens

- **Cards**: `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xs p-5`
- **Buttons**:
  - Primary: `px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`
  - Secondary: `px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 cursor-pointer`
- **Badges**: `inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border`
- **Modals / Drawers**: Backdrop `bg-black/50 backdrop-blur-xs`, dialog `bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800`
