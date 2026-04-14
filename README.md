# Video Downloader Backend (Free-Tier Ready)

This backend provides direct media APIs for the downloader UI in `age-calculator`.

## Current strategy

- Frontend: Cloudflare Pages (already live)
- Backend: Render Free Web Service (no paid plan required to start)
- Downloader behavior: direct API streaming (no third-party redirect UI)

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
- In-memory rate limiting + timeout guards

## Environment variables

Copy `.env.example` to `.env` for local runs.

- `PORT=3000`
- `FRONTEND_ORIGINS=https://theagefinder.pages.dev`
- `RATE_LIMIT_WINDOW_MS=60000`
- `RATE_LIMIT_MAX=40`
- `META_TIMEOUT_MS=20000`
- `STREAM_TIMEOUT_MS=120000`
- `AUDIO_OUTPUT_MODE=mp3` (`mp3` or `passthrough`)
- `YTDL_CLIENTS=WEB,WEB_EMBEDDED,IOS,ANDROID`
- `YOUTUBE_COOKIE=` (optional but recommended for bot-check/sign-in protected videos)

If ffmpeg conversion is restricted in a host, set:

```text
AUDIO_OUTPUT_MODE=passthrough
```

Then audio downloads are served as original stream format (usually webm/m4a) instead of mp3.

## YouTube sign-in / bot verification fix

If you see:

```text
This video requires sign-in or bot verification...
```

set `YOUTUBE_COOKIE` on Render.

Format can be either:

1) Raw cookie header string:

```text
SID=...; HSID=...; SSID=...; APISID=...; SAPISID=...
```

2) JSON array cookie format (advanced)

After setting `YOUTUBE_COOKIE`, redeploy.

## Local run

```bash
npm install
npm run dev
```

Smoke test:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1 -BaseUrl "http://localhost:3000"
```

## Deploy to Render (free-tier)

1. Push this repo to GitHub.
2. Go to Render -> New -> Web Service.
3. Connect repo: `567kasi-cmd/video-downloader-backend`.
4. Use settings:
   - Runtime: Node
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Add env vars:
   - `FRONTEND_ORIGINS=https://theagefinder.pages.dev`
   - (optional, for tougher videos) `YOUTUBE_COOKIE=<your cookie string>`
6. Deploy.

Render gives URL like:

```text
https://video-downloader-backend-xxxx.onrender.com
```

## Frontend integration (already supported)

The downloader page in `age-calculator` supports backend URL override using localStorage key `VIDEO_BACKEND_BASE_URL`.

After backend deploy, run once in browser console on your frontend:

```javascript
localStorage.setItem('VIDEO_BACKEND_BASE_URL', 'https://video-downloader-backend-xxxx.onrender.com');
location.reload();
```

## Notes about free-tier reliability

- Free instances can sleep when idle (cold starts).
- First request after idle can be slower.
- Large/long streams may hit host limits.
- Rate limiting is intentionally lightweight and in-memory.

## Current feature status

- YouTube video metadata: implemented
- YouTube video stream download: implemented
- YouTube audio download: implemented (`mp3` mode) or passthrough fallback
- Instagram direct extraction: returns `501` for now (placeholder until provider is added)
