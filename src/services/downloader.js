const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const QUALITY_ORDER = ['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'];
const META_TIMEOUT_MS = Number(process.env.META_TIMEOUT_MS || 20_000);
const STREAM_TIMEOUT_MS = Number(process.env.STREAM_TIMEOUT_MS || 120_000);
const AUDIO_OUTPUT_MODE = (process.env.AUDIO_OUTPUT_MODE || 'mp3').toLowerCase();
const DEFAULT_CLIENTS = ['WEB', 'WEB_EMBEDDED', 'IOS', 'ANDROID'];

function cleanFileName(name) {
  return (name || 'download')
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function withTimeout(promise, timeoutMs, timeoutMessage) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      const timer = setTimeout(() => {
        const error = new Error(timeoutMessage);
        error.status = 504;
        reject(error);
      }, timeoutMs);
      timer.unref?.();
    })
  ]);
}

function pickNearestQuality(formats, targetQuality) {
  const videoFormats = formats.filter((f) => f.hasVideo && f.hasAudio && f.qualityLabel);
  if (!videoFormats.length) return null;

  const targetIndex = QUALITY_ORDER.indexOf(targetQuality);
  if (targetIndex === -1) {
    return videoFormats.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  }

  const sorted = [...videoFormats].sort((a, b) => (a.height || 0) - (b.height || 0));
  const requestedHeight = Number(targetQuality.replace('p', ''));

  const exactOrLower = sorted.filter((f) => (f.height || 0) <= requestedHeight);
  if (exactOrLower.length) return exactOrLower[exactOrLower.length - 1];

  return sorted[0];
}

function normalizeYtdlError(error, fallbackMessage) {
  const raw = String(error?.message || '').toLowerCase();

  if (raw.includes('status code: 410') || raw.includes('status code: 403')) {
    const e = new Error('This video is unavailable, private, or blocked for extraction.');
    e.status = 403;
    return e;
  }

  if (raw.includes('too many') || raw.includes('429')) {
    const e = new Error('Rate limited by YouTube. Please wait and try again.');
    e.status = 429;
    return e;
  }

  if (raw.includes('sign in') || raw.includes('captcha') || raw.includes('bot')) {
    const e = new Error('This video requires sign-in or bot verification. Add YOUTUBE_COOKIE env on backend and redeploy, then retry.');
    e.status = 422;
    return e;
  }

  const e = new Error(fallbackMessage);
  e.status = error?.status || 500;
  return e;
}

function parseClients() {
  const fromEnv = (process.env.YTDL_CLIENTS || '')
    .split(',')
    .map((v) => v.trim().toUpperCase())
    .filter(Boolean);
  return fromEnv.length ? fromEnv : DEFAULT_CLIENTS;
}

function parseCookieEnv() {
  const raw = (process.env.YOUTUBE_COOKIE || '').trim();
  if (!raw) return null;

  // Supports either full cookie header string or JSON array string.
  if (raw.startsWith('[')) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  const parts = raw.split(';').map((p) => p.trim()).filter(Boolean);
  return parts.map((entry) => {
    const eq = entry.indexOf('=');
    if (eq === -1) return null;
    const name = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    if (!name) return null;
    return {
      domain: '.youtube.com',
      path: '/',
      secure: true,
      httpOnly: false,
      sameSite: 'Lax',
      name,
      value
    };
  }).filter(Boolean);
}

function createYtdlAgentIfAvailable() {
  const cookies = parseCookieEnv();
  if (!cookies || !cookies.length) return null;
  try {
    return ytdl.createAgent(cookies);
  } catch {
    return null;
  }
}

async function getInfoWithFallback(url) {
  const clients = parseClients();
  const agent = createYtdlAgentIfAvailable();
  const attempts = [];

  for (const client of clients) {
    try {
      const options = {
        playerClients: [client]
      };
      if (agent) options.agent = agent;

      const info = await withTimeout(
        ytdl.getInfo(url, options),
        META_TIMEOUT_MS,
        `Timed out while fetching metadata using client ${client}.`
      );

      return { info, agent, client };
    } catch (error) {
      attempts.push(`${client}: ${error.message}`);
    }
  }

  const finalError = new Error(attempts.join(' | '));
  throw finalError;
}

async function getVideoInfo(url) {
  if (!ytdl.validateURL(url)) {
    const error = new Error('Unsupported or invalid YouTube URL.');
    error.status = 400;
    throw error;
  }

  let result;
  try {
    result = await getInfoWithFallback(url);
  } catch (error) {
    throw normalizeYtdlError(error, 'Failed to fetch YouTube metadata.');
  }

  const info = result.info;
  const title = info.videoDetails?.title || 'YouTube Video';
  const thumbnail = info.videoDetails?.thumbnails?.slice(-1)[0]?.url || '';

  const uniqueByLabel = new Map();
  for (const format of info.formats) {
    if (!format.hasVideo || !format.hasAudio || !format.qualityLabel) continue;
    const label = format.qualityLabel;
    const quality = label.includes('p') ? label : `${format.height || ''}p`;
    if (!quality.includes('p')) continue;

    if (!uniqueByLabel.has(quality)) {
      uniqueByLabel.set(quality, {
        value: quality,
        label: `${quality} (${format.container || 'video'})`,
        fileSize: format.contentLength ? Number(format.contentLength) : null
      });
    }
  }

  const qualities = [...uniqueByLabel.values()]
    .sort((a, b) => Number(a.value.replace('p', '')) - Number(b.value.replace('p', '')))
    .map((item) => ({
      ...item,
      default: item.value === '360p'
    }));

  return {
    platform: 'youtube',
    title,
    thumbnail,
    qualities: qualities.length ? qualities : [{ value: '360p', label: '360p', default: true }],
    supportsAudio: true,
    qualityMessage: `Available qualities fetched from YouTube (client: ${result.client}).`
  };
}

async function streamVideo({ url, quality, res }) {
  if (!ytdl.validateURL(url)) {
    const error = new Error('Unsupported or invalid YouTube URL.');
    error.status = 400;
    throw error;
  }

  let result;
  try {
    result = await getInfoWithFallback(url);
  } catch (error) {
    throw normalizeYtdlError(error, 'Failed to prepare video stream.');
  }

  const info = result.info;
  const chosen = pickNearestQuality(info.formats, quality);
  if (!chosen) {
    const error = new Error('No downloadable video format found for this URL.');
    error.status = 422;
    throw error;
  }

  const filename = `${cleanFileName(info.videoDetails?.title || 'video-download')}-${chosen.qualityLabel || quality}.mp4`;

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  if (chosen.contentLength) {
    res.setHeader('Content-Length', chosen.contentLength);
  }
  res.setTimeout(STREAM_TIMEOUT_MS);

  const downloadOptions = {
    quality: chosen.itag,
    highWaterMark: 1 << 25,
    playerClients: [result.client]
  };
  if (result.agent) downloadOptions.agent = result.agent;

  const stream = ytdl.downloadFromInfo(info, downloadOptions);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Video stream failed. Please try another video.' });
    } else {
      res.end();
    }
  });

  stream.pipe(res);
}

async function streamAudio({ url, res }) {
  if (!ytdl.validateURL(url)) {
    const error = new Error('Unsupported or invalid YouTube URL.');
    error.status = 400;
    throw error;
  }

  let result;
  try {
    result = await getInfoWithFallback(url);
  } catch (error) {
    throw normalizeYtdlError(error, 'Failed to prepare audio stream.');
  }

  const info = result.info;
  const base = cleanFileName(info.videoDetails?.title || 'audio-download');
  res.setTimeout(STREAM_TIMEOUT_MS);

  const downloadOptions = {
    quality: 'highestaudio',
    filter: 'audioonly',
    highWaterMark: 1 << 25,
    playerClients: [result.client]
  };
  if (result.agent) downloadOptions.agent = result.agent;

  const audioStream = ytdl.downloadFromInfo(info, downloadOptions);
  audioStream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Audio stream failed. Please try another video.' });
    } else {
      res.end();
    }
  });

  if (AUDIO_OUTPUT_MODE === 'passthrough' || !ffmpegPath) {
    const passthroughName = `${base}.webm`;
    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(passthroughName)}`);
    audioStream.pipe(res);
    return;
  }

  const mp3Name = `${base}.mp3`;
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(mp3Name)}`);

  ffmpeg(audioStream)
    .audioCodec('libmp3lame')
    .audioBitrate(128)
    .format('mp3')
    .on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Audio extraction failed. Set AUDIO_OUTPUT_MODE=passthrough if ffmpeg is restricted.' });
      } else {
        res.end();
      }
    })
    .pipe(res, { end: true });
}

module.exports = {
  getVideoInfo,
  streamVideo,
  streamAudio
};
