const ytdl = require('@distube/ytdl-core');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);
const QUALITY_ORDER = ['144p', '240p', '360p', '480p', '720p', '1080p', '1440p', '2160p'];
function cleanFileName(name) {
  return (name || 'download')
    .replace(/[<>:"/\\|?*]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
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
async function getVideoInfo(url) {
  if (!ytdl.validateURL(url)) {
    const error = new Error('Unsupported or invalid YouTube URL.');
    error.status = 400;
    throw error;
  }
  const info = await ytdl.getInfo(url);
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
    qualityMessage: 'Available qualities fetched from YouTube.'
  };
}
async function streamVideo({ url, quality, res }) {
  if (!ytdl.validateURL(url)) {
    const error = new Error('Unsupported or invalid YouTube URL.');
    error.status = 400;
    throw error;
  }
  const info = await ytdl.getInfo(url);
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
  const stream = ytdl.downloadFromInfo(info, {
    quality: chosen.itag,
    highWaterMark: 1 << 25
  });
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
  const info = await ytdl.getInfo(url);
  const filename = `${cleanFileName(info.videoDetails?.title || 'audio-download')}.mp3`;
  res.setHeader('Content-Type', 'audio/mpeg');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  const audioStream = ytdl.downloadFromInfo(info, {
    quality: 'highestaudio',
    filter: 'audioonly',
    highWaterMark: 1 << 25
  });
  ffmpeg(audioStream)
    .audioCodec('libmp3lame')
    .audioBitrate(128)
    .format('mp3')
    .on('error', () => {
      if (!res.headersSent) {
        res.status(500).json({ error: 'Audio extraction failed. Please try another video.' });
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
