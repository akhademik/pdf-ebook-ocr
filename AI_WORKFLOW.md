# AI Workflow & Project Rules

## Tech Stack & Core Guidelines

- Node.js (v20+), Docker & Docker Compose
- Google Drive API, Google Sheets API (`googleapis`)
- Google Gemini API (`@google/genai` or `@google/generative-ai`)
- `node-cron`, `dotenv`
- Package manager: `pnpm`

## Pipeline Verification

1. `pnpm lint` / `pnpm test`
2. Docker build & validation test
