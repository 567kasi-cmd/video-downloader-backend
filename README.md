# Video Downloader Backend
This backend provides direct media download APIs for the Age Calculator frontend.
## Endpoints
- `GET /health`
- `POST /video-info`
- `POST /download/video`
- `POST /download/audio`
## Tech
- Node.js + Express
- `@distube/ytdl-core`
- `fluent-ffmpeg`
- `ffmpeg-static`
## Environment
Create `.env` from `.env.example`:
- `PORT` (default `3000`)
- `FRONTEND_ORIGINS` comma-separated allowed origins
## Run locally
```bash
npm install
npm run dev
```
### Smoke test
```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1 -BaseUrl "http://localhost:3000"
```
## Deploy on Railway
1. Push this repo to GitHub.
2. Railway -> New Project -> Deploy from GitHub Repo.
3. Add env vars:
   - `FRONTEND_ORIGINS=https://theagefinder.pages.dev`
4. Deploy.
## Notes
- YouTube direct download is implemented.
- Instagram endpoints currently return `501` with a clear message until a robust provider is wired in.
