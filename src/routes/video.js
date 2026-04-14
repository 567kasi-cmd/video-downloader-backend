const express = require('express');
const {
  getVideoInfo,
  streamVideo,
  streamAudio
} = require('../services/downloader');
const router = express.Router();
function validateUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    const error = new Error('Please provide a valid URL.');
    error.status = 400;
    throw error;
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    const error = new Error('URL format is invalid.');
    error.status = 400;
    throw error;
  }
  const host = parsed.hostname.replace(/^www\./, '').toLowerCase();
  const isYouTube = host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be' || host === 'music.youtube.com';
  const isInstagram = host === 'instagram.com';
  if (!isYouTube && !isInstagram) {
    const error = new Error('Only YouTube and Instagram URLs are supported.');
    error.status = 400;
    throw error;
  }
  return { url: parsed.toString(), isYouTube, isInstagram };
}
router.post('/video-info', async (req, res, next) => {
  try {
    const { url } = validateUrl(req.body?.url);
    const data = await getVideoInfo(url);
    res.json(data);
  } catch (error) {
    next(error);
  }
});
router.post('/download/video', async (req, res, next) => {
  try {
    const { url, isInstagram } = validateUrl(req.body?.url);
    const quality = req.body?.quality || '360p';
    if (isInstagram) {
      const error = new Error('Instagram direct download is not configured yet on this backend.');
      error.status = 501;
      throw error;
    }
    await streamVideo({ url, quality, res });
  } catch (error) {
    next(error);
  }
});
router.post('/download/audio', async (req, res, next) => {
  try {
    const { url, isInstagram } = validateUrl(req.body?.url);
    if (isInstagram) {
      const error = new Error('Instagram MP3 extraction is not configured yet on this backend.');
      error.status = 501;
      throw error;
    }
    await streamAudio({ url, res });
  } catch (error) {
    next(error);
  }
});
module.exports = { router };
