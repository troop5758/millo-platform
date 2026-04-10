'use strict';
/**
 * Music Library API — royalty-free music: list, search, get, upload, licenses.
 * Flow: Creator Upload → Audio Library API → Music Database → CDN Streaming.
 * https://milloapp.com
 */
const crypto = require('crypto');
const db = require('@millo/database');
const { resolveSession } = require('./auth');
const { validateId } = require('../lib/validateId');
const audioFingerprint = require('../services/audioFingerprintService');
const audioCdnStorage = require('../services/audioCdnStorage');
const copyrightScan = require('../services/copyrightScanService');
const audioModeration = require('../services/audioModerationService');
const trendingSoundsRedis = require('../lib/trendingSoundsRedis');

const AUDIO_CDN_BASE = process.env.AUDIO_CDN_URL || process.env.CDN_BASE_URL || '';

function generateTrackId() {
  const n = crypto.randomBytes(4).readUInt32BE(0) % 90000 + 10000;
  return `trk_${n}`;
}

function extensionFromMime(mime) {
  const map = { 'audio/mpeg': '.mp3', 'audio/mp4': '.m4a', 'audio/wav': '.wav', 'audio/x-wav': '.wav', 'audio/aac': '.aac' };
  return map[(mime || '').toLowerCase()] || '.mp3';
}

function authUser(request) {
  const token = (request.headers['authorization'] || '').replace('Bearer ', '').trim();
  return resolveSession(token);
}

async function getApprovedMusicArtist(userId) {
  if (!userId) return null;
  return db.MusicArtist.findOne({ userId, status: 'approved' }).lean();
}

async function musicRoutes(app) {
  /* ── List / browse (public for active tracks). Query: genre, mood, bpm, duration for fast discovery. ── */
  app.get('/music', async (request, reply) => {
    const { limit = 24, offset = 0, genre, mood, bpm, duration, license: licenseSlug, status } = request.query ?? {};
    const query = { status: status || 'active' };
    if (genre) query.genre = new RegExp(genre, 'i');
    if (mood) query.mood = new RegExp(mood, 'i');
    if (bpm != null && bpm !== '') query.bpm = Number(bpm);
    if (duration != null && duration !== '') query.duration = Number(duration);
    if (licenseSlug) {
      const lic = await db.MusicLicense.findOne({ slug: licenseSlug }).select('_id').lean();
      if (lic) query.licenseId = lic._id;
    }
    const [tracks, total] = await Promise.all([
      db.MusicTrack.find(query)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 50))
        .populate('licenseId', 'name slug url requiresAttribution')
        .lean(),
      db.MusicTrack.countDocuments(query),
    ]);
    const out = tracks.map((t) => formatTrackResponse(t));
    return reply.send({ tracks: out, total, limit: Number(limit), offset: Number(offset) });
  });

  /* ── Search ── */
  app.get('/music/search', async (request, reply) => {
    const { q, limit = 20, offset = 0 } = request.query ?? {};
    if (!q || String(q).trim().length < 2) {
      return reply.send({ tracks: [], total: 0, limit: Number(limit), offset: Number(offset) });
    }
    const search = String(q).trim();
    const query = {
      status: 'active',
      $or: [
        { title: new RegExp(escapeRegex(search), 'i') },
        { artist: new RegExp(escapeRegex(search), 'i') },
        { tags: new RegExp(escapeRegex(search), 'i') },
        { genre: new RegExp(escapeRegex(search), 'i') },
      ],
    };
    const [tracks, total] = await Promise.all([
      db.MusicTrack.find(query)
        .sort({ createdAt: -1 })
        .skip(Number(offset))
        .limit(Math.min(Number(limit), 50))
        .populate('licenseId', 'name slug url requiresAttribution')
        .lean(),
      db.MusicTrack.countDocuments(query),
    ]);
    const out = tracks.map((t) => formatTrackResponse(t));
    return reply.send({ tracks: out, total, limit: Number(limit), offset: Number(offset) });
  });

  /* ── Trending sound leaderboard (ZSET trending_sounds, score = viral_score, updated every 5 min). GET /music/trending and GET /sounds/trending. Optional ?region=us|brazil|india for geographic trend. ── */
  app.get(['/music/trending', '/sounds/trending'], async (request, reply) => {
    const { limit = 20, genre, cluster, region, expand } = request.query ?? {};
    const lim = Math.min(Number(limit), 50);
    let ids = [];
    if (region && trendingSoundsRedis.toRegionSlug(region)) {
      ids = await trendingSoundsRedis.getTrendingSoundIdsForRegion(region, lim).catch(() => []);
    } else if (cluster) {
      ids = await trendingSoundsRedis.getTrendingSoundIdsForCluster(cluster, lim).catch(() => []);
      if (ids.length === 0) ids = await trendingSoundsRedis.getTrendingSoundIds(lim).catch(() => []);
    } else {
      ids = await trendingSoundsRedis.getTrendingSoundIds(lim);
    }
    let tracks;
    if (ids.length > 0) {
      const list = await db.MusicTrack.find({ _id: { $in: ids }, status: 'active' })
        .populate('licenseId', 'name slug url requiresAttribution')
        .lean();
      const orderMap = new Map(ids.map((id, i) => [String(id), i]));
      list.sort((a, b) => (orderMap.get(String(a._id)) ?? 999) - (orderMap.get(String(b._id)) ?? 999));
      tracks = genre ? list.filter((t) => new RegExp(genre, 'i').test(t.genre || '')) : list;
    } else {
      const query = { status: 'active' };
      if (genre) query.genre = new RegExp(genre, 'i');
      tracks = await db.MusicTrack.find(query)
        .sort({ createdAt: -1 })
        .limit(lim)
        .populate('licenseId', 'name slug url requiresAttribution')
        .lean();
    }
    const out = tracks.map((t) => formatTrackResponse(t));
    const response = { tracks: out };
    if (expand === 'true' || expand === true) {
      const testCluster = cluster || 'general';
      const testIds = await trendingSoundsRedis.getTestSoundIdsForCluster(testCluster, 10).catch(() => []);
      const existingIds = new Set(out.map((t) => String(t._id)));
      const newTestIds = testIds.filter((id) => !existingIds.has(String(id)));
      if (newTestIds.length > 0) {
        const testTracks = await db.MusicTrack.find({ _id: { $in: newTestIds }, status: 'active' })
          .populate('licenseId', 'name slug url requiresAttribution')
          .lean();
        response.testing = testTracks.map((t) => ({ ...formatTrackResponse(t), _testing: true }));
      }
    }
    return reply.send(response);
  });

  /* ── Sponsored sounds (brand-paid promotion) — public ── */
  app.get('/music/sponsored', async (request, reply) => {
    const now = new Date();
    const limit = Math.min(Number(request.query?.limit) || 20, 50);
    const list = await db.SponsoredSound.find({
      status: 'active',
      startAt: { $lte: now },
      endAt: { $gte: now },
    })
      .sort({ priority: -1, startAt: -1 })
      .limit(limit)
      .populate('trackId')
      .lean();
    const tracks = (list || [])
      .map((s) => s.trackId)
      .filter(Boolean)
      .map((t) => ({ ...formatTrackResponse(t), sponsored: true, brandName: list.find((x) => String(x.trackId?._id) === String(t._id))?.brandName }));
    return reply.send({ tracks });
  });

  /* ── Sound challenges (brand-paid, e.g. "Nike challenge sound") — public ── */
  app.get('/music/challenges', async (request, reply) => {
    const now = new Date();
    const limit = Math.min(Number(request.query?.limit) || 20, 50);
    const list = await db.SoundChallenge.find({
      status: 'active',
      startAt: { $lte: now },
      endAt: { $gte: now },
    })
      .sort({ startAt: -1 })
      .limit(limit)
      .populate('trackId')
      .lean();
    const challenges = (list || []).map((c) => {
      const t = c.trackId;
      return {
        _id: c._id,
        challengeName: c.challengeName,
        description: c.description,
        brandName: c.brandName,
        startAt: c.startAt,
        endAt: c.endAt,
        imageUrl: c.imageUrl || c.bannerUrl,
        prizeDescription: c.prizeDescription,
        rules: c.rules,
        track: t ? formatTrackResponse(t) : null,
      };
    });
    return reply.send({ challenges });
  });

  /* ── Early viral detection: sounds in viral_candidate pool (first 50–500 videos, signals exceed threshold) ── */
  app.get('/music/viral-candidates', async (request, reply) => {
    const limit = Math.min(Number(request.query?.limit) || 20, 50);
    const ids = await trendingSoundsRedis.getViralCandidateIds(limit).catch(() => []);
    if (!ids.length) return reply.send({ tracks: [] });
    const tracks = await db.MusicTrack.find({ _id: { $in: ids }, status: 'active' })
      .populate('licenseId', 'name slug url requiresAttribution')
      .lean();
    const orderMap = new Map(ids.map((id, i) => [String(id), i]));
    tracks.sort((a, b) => (orderMap.get(String(a._id)) ?? 999) - (orderMap.get(String(b._id)) ?? 999));
    const out = tracks.map((t) => formatTrackResponse(t));
    return reply.send({ tracks: out });
  });

  /* ── Interest clusters for cross-cluster propagation (dance, comedy, fitness, beauty, gaming, general) ── */
  app.get('/music/clusters', async (_request, reply) => {
    const list = trendingSoundsRedis.CLUSTERS || ['dance', 'comedy', 'fitness', 'beauty', 'gaming', 'general'];
    return reply.send({ clusters: list });
  });

  /* ── Geographic trend: list of regions for trending_sounds_<region> leaderboards (us, brazil, india, uk, eu) ── */
  app.get('/music/regions', async (_request, reply) => {
    const list = trendingSoundsRedis.TRENDING_REGIONS || [];
    return reply.send({ regions: list });
  });

  /* ── AI Music Generator (future feature) — stub returns 501 ── */
  app.post('/music/ai/generate', async (request, reply) => {
    return reply.status(501).send({
      error: 'AI_MUSIC_GENERATOR_NOT_AVAILABLE',
      message: 'AI music generation is a planned feature. Creators will be able to generate royalty-free tracks from prompts (e.g. "Lo-fi chill beat 20 seconds") using providers such as Meta MusicGen, Suno AI, or Stability Audio.',
      intendedRequest: { prompt: 'string (e.g. "Lo-fi chill beat 20 seconds")', durationSeconds: 'optional number', genre: 'optional string', mood: 'optional string' },
      docs: 'See docs/ai-music-generator.md',
    });
  });

  /* ── Video-to-sound attribution graph: sound → videos → creators + engagement (measure sound influence) ── */
  app.get('/music/:id/attribution-graph', async (request, reply) => {
    const id = request.params.id;
    const byTrackId = typeof id === 'string' && id.startsWith('trk_');
    const query = byTrackId ? { trackId: id, status: 'active' } : { _id: id, status: 'active' };
    if (!byTrackId && !validateId(id, reply)) return;
    const track = await db.MusicTrack.findOne(query)
      .populate('licenseId', 'name slug')
      .lean();
    if (!track) return reply.status(404).send({ error: 'TRACK_NOT_FOUND' });

    const limit = Math.min(Number(request.query?.limit) || 50, 100);
    const offset = Math.max(0, Number(request.query?.offset) || 0);

    const videoSounds = await db.VideoSound.find({ soundId: track._id })
      .sort({ createdAt: -1 })
      .skip(offset)
      .limit(limit)
      .lean();

    if (!videoSounds.length) {
      return reply.send({
        sound: formatTrackResponse(track),
        videos: [],
        summary: { videoCount: 0, creatorCount: 0, totalViews: 0, totalLikes: 0, totalShares: 0, totalWatchTimeSeconds: 0 },
      });
    }

    const videoIds = videoSounds.map((vs) => vs.videoId);
    const creatorIds = [...new Set(videoSounds.map((vs) => vs.creatorId).filter(Boolean))];

    const [streams, engagements, profiles] = await Promise.all([
      db.LiveStream.find({ _id: { $in: videoIds } }).select('_id userId title thumbnailUrl recordingUrl status category').lean(),
      db.ContentEngagement.find({ contentType: 'stream', contentId: { $in: videoIds } }).lean(),
      db.Profile.find({ userId: { $in: creatorIds } }).select('userId displayName avatarUrl').lean(),
    ]);

    const streamMap = Object.fromEntries(streams.map((s) => [String(s._id), s]));
    const engagementMap = Object.fromEntries(engagements.map((e) => [String(e.contentId), e]));
    const profileByUser = Object.fromEntries(profiles.map((p) => [String(p.userId), p]));

    const videos = videoSounds.map((vs) => {
      const stream = streamMap[String(vs.videoId)];
      const eng = engagementMap[String(vs.videoId)] || {};
      const creatorProfile = profileByUser[String(vs.creatorId)];
      return {
        videoId: vs.videoId,
        creatorId: vs.creatorId,
        creator: creatorProfile ? { displayName: creatorProfile.displayName || null, avatarUrl: creatorProfile.avatarUrl || null } : null,
        title: stream?.title || null,
        thumbnailUrl: stream?.thumbnailUrl || null,
        engagement: {
          views: eng.viewCount ?? 0,
          likes: eng.likes ?? 0,
          shares: eng.shares ?? 0,
          comments: eng.comments ?? 0,
          watchTimeSeconds: eng.watchTimeSeconds ?? 0,
          completionRate: eng.completionRate ?? 0,
          playCount: eng.playCount ?? 0,
        },
        startTime: vs.startTime ?? 0,
        duration: vs.duration ?? null,
        createdAt: vs.createdAt,
      };
    });

    const allVideoIdsForSound = await db.VideoSound.find({ soundId: track._id }).select('videoId').lean().then((arr) => arr.map((vs) => vs.videoId));
    const totalCount = allVideoIdsForSound.length;
    const creatorCount = await db.VideoSound.distinct('creatorId', { soundId: track._id }).then((arr) => arr.length);
    const engAgg = allVideoIdsForSound.length > 0
      ? await db.ContentEngagement.aggregate([
          { $match: { contentType: 'stream', contentId: { $in: allVideoIdsForSound } } },
          {
            $group: {
              _id: null,
              totalViews: { $sum: '$viewCount' },
              totalLikes: { $sum: '$likes' },
              totalShares: { $sum: '$shares' },
              totalWatchTimeSeconds: { $sum: '$watchTimeSeconds' },
            },
          },
        ]).then((r) => r[0] || { totalViews: 0, totalLikes: 0, totalShares: 0, totalWatchTimeSeconds: 0 })
      : { totalViews: 0, totalLikes: 0, totalShares: 0, totalWatchTimeSeconds: 0 };

    return reply.send({
      sound: formatTrackResponse(track),
      videos,
      summary: {
        videoCount: totalCount,
        creatorCount,
        totalViews: engAgg.totalViews ?? 0,
        totalLikes: engAgg.totalLikes ?? 0,
        totalShares: engAgg.totalShares ?? 0,
        totalWatchTimeSeconds: engAgg.totalWatchTimeSeconds ?? 0,
      },
    });
  });

  /* ── Get one track (by _id or trackId e.g. trk_9981) ── */
  app.get('/music/:id', async (request, reply) => {
    const id = request.params.id;
    const byTrackId = typeof id === 'string' && id.startsWith('trk_');
    const query = byTrackId ? { trackId: id, status: 'active' } : { _id: id, status: 'active' };
    if (!byTrackId && !validateId(id, reply)) return;
    const track = await db.MusicTrack.findOne(query)
      .populate('licenseId', 'name slug url description requiresAttribution allowsCommercial')
      .lean();
    if (!track) return reply.status(404).send({ error: 'TRACK_NOT_FOUND' });
    return reply.send(formatTrackResponse(track));
  });

  /* ── List licenses (public) ── */
  app.get('/music/licenses', async (_request, reply) => {
    const licenses = await db.MusicLicense.find({}).sort({ name: 1 }).lean();
    return reply.send({ licenses });
  });

  /* ── Upload audio file to CDN (S3 / R2 / GCS) and create track ── */
  app.post('/music/upload', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!audioCdnStorage.isConfigured()) {
      return reply.status(503).send({
        error: 'AUDIO_CDN_NOT_CONFIGURED',
        message: 'Upload not available. Set AUDIO_CDN_PROVIDER, AUDIO_CDN_URL, and provider credentials. Or use POST /music with audioUrl.',
      });
    }
    let buffer; let mime = 'audio/mpeg'; let filename = ''; const fields = {};
    try {
      const parts = request.parts();
      for await (const part of parts) {
        if (part.type === 'file' && part.file) {
          const chunks = [];
          for await (const chunk of part.file) chunks.push(chunk);
          buffer = Buffer.concat(chunks);
          mime = (part.mimetype || 'audio/mpeg').toLowerCase();
          filename = part.filename || '';
        } else if (part.type === 'field') {
          fields[part.fieldname] = part.value;
        }
      }
    } catch (err) {
      request.log.error(err, 'Multipart parse error');
      return reply.status(400).send({ error: 'PARSE_ERROR', message: err.message || 'Invalid multipart body' });
    }
    if (!buffer || buffer.length === 0) return reply.status(400).send({ error: 'FILE_REQUIRED', message: 'Send multipart form with an audio file' });
    if (!mime.startsWith('audio/')) return reply.status(400).send({ error: 'INVALID_TYPE', message: 'File must be audio (e.g. audio/mpeg, audio/mp4)' });

    const scanResult = await copyrightScan.scanBuffer(buffer, mime).catch((err) => {
      request.log.warn(err, 'Copyright scan failed');
      return { detected: false, action: 'allow' };
    });
    if (scanResult.detected && scanResult.action === 'block') {
      return reply.status(403).send({
        error: 'COPYRIGHT_DETECTED',
        message: 'Copyrighted music detected. Upload blocked to prevent copyright abuse.',
        match: scanResult.match ? { title: scanResult.match.title, artist: scanResult.match.artist } : undefined,
      });
    }

    const modResult = await audioModeration.scanAudio(buffer, mime).catch((err) => {
      request.log.warn(err, 'Audio moderation scan failed');
      return { decision: 'allow' };
    });
    if (modResult.decision === 'block') {
      return reply.status(403).send({
        error: 'AUDIO_MODERATION_BLOCKED',
        message: 'Audio content was flagged (hate speech, adult, or other policy violation). Upload blocked.',
        reason: modResult.reason,
        categories: modResult.categories,
      });
    }
    if (modResult.decision === 'review') {
      return reply.status(403).send({
        error: 'AUDIO_MODERATION_REVIEW',
        message: 'Audio content needs review before publishing. Upload blocked until approved.',
        reason: modResult.reason,
      });
    }

    const ext = extensionFromMime(mime);
    const trackId = generateTrackId();
    const key = `music/${trackId}${ext}`;
    let cdnUrl;
    try {
      cdnUrl = await audioCdnStorage.upload(key, buffer, mime);
    } catch (err) {
      request.log.error(err, 'Audio CDN upload failed');
      return reply.status(502).send({ error: 'UPLOAD_FAILED', message: err.message || 'Storage upload failed' });
    }
    const title = (fields.title && String(fields.title).trim()) || filename || trackId;
    const artist = (fields.artist && String(fields.artist).trim()) || '';
    const genre = (fields.genre && String(fields.genre).trim()) || '';
    const fingerprint = audioFingerprint.generateFingerprint({ streamUrl: cdnUrl, title, artist });
    const existing = await audioFingerprint.findTrackByFingerprint(db, fingerprint);
    if (existing) {
      return reply.status(409).send({ error: 'TRACK_ALREADY_EXISTS', message: 'A track with this content already exists.', existingId: existing._id });
    }
    const musicArtist = await getApprovedMusicArtist(user._id);
    const initialStatus = user.role === 'admin'
      ? (fields.status && String(fields.status)) || 'active'
      : musicArtist ? 'draft' : 'active';
    const track = await db.MusicTrack.create({
      trackId,
      title: title || trackId,
      artist,
      duration: 0,
      durationSeconds: 0,
      streamUrl: cdnUrl,
      audioUrl: cdnUrl,
      licenseType: 'royalty_free',
      fingerprint,
      genre,
      status: initialStatus,
      revSharePercent: musicArtist ? musicArtist.revSharePercent : null,
      uploadedBy: user._id,
    });
    const populated = await db.MusicTrack.findById(track._id)
      .populate('licenseId', 'name slug url requiresAttribution')
      .lean();
    return reply.status(201).send(formatTrackResponse(populated));
  });

  /* ── Create/upload track (auth: creator or admin) ── */
  app.post('/music', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const isAdmin = user.role === 'admin';
    const body = request.body ?? {};
    const title = (body.title || '').trim();
    const audioUrl = (body.audioUrl || body.streamUrl || '').trim();
    if (!title) return reply.status(400).send({ error: 'TITLE_REQUIRED' });
    if (!audioUrl) return reply.status(400).send({ error: 'STREAM_URL_REQUIRED' });

    const scanResult = await copyrightScan.scanByUrl(audioUrl).catch((err) => {
      request.log.warn(err, 'Copyright scan by URL failed');
      return { detected: false, action: 'allow' };
    });
    if (scanResult.detected && scanResult.action === 'block') {
      return reply.status(403).send({
        error: 'COPYRIGHT_DETECTED',
        message: 'Copyrighted music detected at the provided URL. Use royalty-free or licensed audio only.',
        match: scanResult.match ? { title: scanResult.match.title, artist: scanResult.match.artist } : undefined,
      });
    }

    const modResult = await audioModeration.scanAudioByUrl(audioUrl).catch((err) => {
      request.log.warn(err, 'Audio moderation by URL failed');
      return { decision: 'allow' };
    });
    if (modResult.decision === 'block') {
      return reply.status(403).send({
        error: 'AUDIO_MODERATION_BLOCKED',
        message: 'Audio content was flagged (hate speech, adult, or other policy violation). Upload blocked.',
        reason: modResult.reason,
        categories: modResult.categories,
      });
    }
    if (modResult.decision === 'review') {
      return reply.status(403).send({
        error: 'AUDIO_MODERATION_REVIEW',
        message: 'Audio content needs review before publishing. Upload blocked until approved.',
        reason: modResult.reason,
      });
    }

    const fingerprint = audioFingerprint.generateFingerprint({
      streamUrl: audioUrl,
      title: body.title,
      artist: body.artist,
    });
    const existing = await audioFingerprint.findTrackByFingerprint(db, fingerprint);
    if (existing) {
      return reply.status(409).send({ error: 'TRACK_ALREADY_EXISTS', message: 'A track with this content already exists.', existingId: existing._id });
    }

    const musicArtist = await getApprovedMusicArtist(user._id);
    const initialStatus = isAdmin ? (body.status || 'active') : musicArtist ? 'draft' : 'active';
    const durationSec = Number(body.duration ?? body.durationSeconds) || 0;
    const track = await db.MusicTrack.create({
      title,
      artist: (body.artist || '').trim(),
      duration: durationSec,
      durationSeconds: durationSec,
      streamUrl: audioUrl,
      audioUrl,
      thumbnailUrl: (body.thumbnailUrl || '').trim() || null,
      licenseId: body.licenseId || null,
      licenseType: (body.licenseType || 'royalty_free').trim(),
      provider: (body.provider || '').trim(),
      waveform: (body.waveform || '').trim() || null,
      fingerprint,
      genre: (body.genre || '').trim(),
      mood: (body.mood || '').trim(),
      bpm: body.bpm != null ? Number(body.bpm) : null,
      tags: Array.isArray(body.tags) ? body.tags.filter(Boolean).map((t) => String(t).trim()) : [],
      status: initialStatus,
      revSharePercent: musicArtist ? musicArtist.revSharePercent : null,
      uploadedBy: user._id,
      meta: body.meta || {},
    });
    const populated = await db.MusicTrack.findById(track._id)
      .populate('licenseId', 'name slug url requiresAttribution')
      .lean();
    return reply.status(201).send(formatTrackResponse(populated));
  });

  /* ── Creator Music Upload Program: artist signup ── */
  app.post('/music/artist/apply', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { acceptLicense, licenseVersion } = request.body ?? {};
    if (!acceptLicense) return reply.status(400).send({ error: 'LICENSE_REQUIRED', message: 'You must accept the artist license agreement.' });
    const existing = await db.MusicArtist.findOne({ userId: user._id }).lean();
    if (existing) {
      return reply.status(409).send({ error: 'ALREADY_APPLIED', status: existing.status, message: 'You have already applied to the music artist program.' });
    }
    const version = licenseVersion || process.env.ARTIST_LICENSE_VERSION || '1';
    const artist = await db.MusicArtist.create({
      userId: user._id,
      status: 'pending',
      revSharePercent: Number(process.env.ARTIST_REV_SHARE_PERCENT) || 70,
      licenseAgreementVersion: version,
      licenseAgreementAcceptedAt: new Date(),
      appliedAt: new Date(),
    });
    return reply.status(201).send({
      ok: true,
      status: 'pending',
      message: 'Application submitted. You will be notified when approved. Then you can upload tracks for review and earn when your song trends.',
      artist: { _id: artist._id, status: artist.status, revSharePercent: artist.revSharePercent },
    });
  });

  app.get('/music/artist/me', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const artist = await db.MusicArtist.findOne({ userId: user._id }).lean();
    if (!artist) return reply.status(404).send({ error: 'NOT_ARTIST', message: 'You have not applied to the music artist program.' });
    return reply.send(artist);
  });

  /* ── Artist: submit track for moderation (draft → pending_review) ── */
  app.post('/music/tracks/:id/submit', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    if (!validateId(request.params.id, reply)) return;
    const track = await db.MusicTrack.findOne({ _id: request.params.id, uploadedBy: user._id }).lean();
    if (!track) return reply.status(404).send({ error: 'TRACK_NOT_FOUND' });
    if (track.status !== 'draft') return reply.status(400).send({ error: 'INVALID_STATUS', message: 'Only draft tracks can be submitted for review.' });
    await db.MusicTrack.updateOne({ _id: track._id }, { $set: { status: 'pending_review' } });
    return reply.send({ ok: true, status: 'pending_review', message: 'Track submitted for moderation.' });
  });

  /* ── Artist: my tracks (drafts + pending + active) ── */
  app.get('/music/artist/tracks', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const { limit = 20, offset = 0, status } = request.query ?? {};
    const query = { uploadedBy: user._id };
    if (status) query.status = status;
    const [tracks, total] = await Promise.all([
      db.MusicTrack.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 50)).populate('licenseId', 'name slug').lean(),
      db.MusicTrack.countDocuments(query),
    ]);
    return reply.send({ tracks: tracks.map((t) => formatTrackResponse(t)), total, limit: Number(limit), offset: Number(offset) });
  });

  /* ── Artist: earnings when song trends (platform rev share) ── */
  app.get('/music/artist/earnings', async (request, reply) => {
    const user = await authUser(request);
    if (!user) return reply.status(401).send({ error: 'UNAUTHORIZED' });
    const artist = await db.MusicArtist.findOne({ userId: user._id, status: 'approved' }).lean();
    if (!artist) return reply.status(403).send({ error: 'NOT_APPROVED_ARTIST', message: 'Only approved artists can view earnings.' });
    const { limit = 50, offset = 0 } = request.query ?? {};
    const [earnings, total] = await Promise.all([
      db.MusicTrackEarning.find({ artistId: user._id }).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).lean(),
      db.MusicTrackEarning.countDocuments({ artistId: user._id }),
    ]);
    const totalCents = await db.MusicTrackEarning.aggregate([{ $match: { artistId: user._id } }, { $group: { _id: null, sum: { $sum: '$amountCents' } } }]).then((r) => r[0]?.sum ?? 0);
    return reply.send({ earnings, total, totalCents, revSharePercent: artist.revSharePercent });
  });

  /* ── Admin: approve/reject artist application ── */
  app.patch('/music/admin/artists/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const { status, rejectionReason } = request.body ?? {};
    if (!['approved', 'rejected'].includes(status)) return reply.status(400).send({ error: 'INVALID_STATUS', message: 'status must be approved or rejected' });
    const artist = await db.MusicArtist.findById(request.params.id);
    if (!artist) return reply.status(404).send({ error: 'ARTIST_NOT_FOUND' });
    if (artist.status !== 'pending') return reply.status(400).send({ error: 'ALREADY_PROCESSED' });
    artist.status = status;
    artist.approvedBy = status === 'approved' ? user._id : null;
    artist.approvedAt = status === 'approved' ? new Date() : null;
    artist.rejectionReason = status === 'rejected' ? (rejectionReason || '') : '';
    await artist.save();
    return reply.send({ ok: true, status: artist.status, artist: await db.MusicArtist.findById(artist._id).lean() });
  });

  app.get('/music/admin/artists', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { limit = 50, offset = 0, status } = request.query ?? {};
    const query = status ? { status } : {};
    const [artists, total] = await Promise.all([
      db.MusicArtist.find(query).sort({ appliedAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).populate('userId', 'email').lean(),
      db.MusicArtist.countDocuments(query),
    ]);
    return reply.send({ artists, total, limit: Number(limit), offset: Number(offset) });
  });

  /* ── Admin: set sound seeding (seed_priority) — platform partners, popular creators, brand campaigns; algorithm boosts early uses ── */
  app.patch('/music/admin/tracks/:id/seed', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const body = request.body ?? {};
    const seedPriority = body.seedPriority ?? body.seed_priority;
    if (typeof seedPriority !== 'boolean') return reply.status(400).send({ error: 'SEED_PRIORITY_REQUIRED', message: 'seedPriority must be true or false' });
    const track = await db.MusicTrack.findById(request.params.id);
    if (!track) return reply.status(404).send({ error: 'TRACK_NOT_FOUND' });
    track.seedPriority = seedPriority;
    track.seedPriorityReason = (body.seedPriorityReason ?? body.seed_priority_reason ?? '').trim() || '';
    track.seedPrioritySetAt = seedPriority ? new Date() : null;
    await track.save();
    const populated = await db.MusicTrack.findById(track._id).populate('licenseId', 'name slug').lean();
    return reply.send(formatTrackResponse(populated, { includeSeedPriority: true }));
  });

  /* ── Admin: moderate track (pending_review → active | rejected) ── */
  app.patch('/music/admin/tracks/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const { status, moderationNote } = request.body ?? {};
    if (!['active', 'rejected'].includes(status)) return reply.status(400).send({ error: 'INVALID_STATUS', message: 'status must be active or rejected' });
    const track = await db.MusicTrack.findById(request.params.id);
    if (!track) return reply.status(404).send({ error: 'TRACK_NOT_FOUND' });
    if (track.status !== 'pending_review') return reply.status(400).send({ error: 'NOT_PENDING_REVIEW' });
    track.status = status;
    track.moderatedBy = user._id;
    track.moderatedAt = new Date();
    track.moderationNote = moderationNote || '';
    await track.save();
    return reply.send(formatTrackResponse(await db.MusicTrack.findById(track._id).populate('licenseId', 'name slug').lean()));
  });

  /* ── Admin: list all (including draft/disabled) ── */
  app.get('/music/admin/tracks', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { limit = 50, offset = 0, status } = request.query ?? {};
    const query = status ? { status } : {};
    const [tracks, total] = await Promise.all([
      db.MusicTrack.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).populate('licenseId', 'name slug').lean(),
      db.MusicTrack.countDocuments(query),
    ]);
    const out = tracks.map((t) => formatTrackResponse(t, { includeSeedPriority: true }));
    return reply.send({ tracks: out, total, limit: Number(limit), offset: Number(offset) });
  });

  /* ── Admin: Sponsored sounds CRUD (brand-paid sound promotion) ── */
  app.post('/music/admin/sponsored-sounds', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const body = request.body ?? {};
    const trackId = body.trackId ?? body.track_id;
    if (!trackId) return reply.status(400).send({ error: 'TRACK_ID_REQUIRED' });
    if (!validateId(trackId, reply)) return;
    const track = await db.MusicTrack.findById(trackId);
    if (!track) return reply.status(404).send({ error: 'TRACK_NOT_FOUND' });
    const brandName = (body.brandName ?? body.brand_name ?? '').trim();
    if (!brandName) return reply.status(400).send({ error: 'BRAND_NAME_REQUIRED' });
    const startAt = body.startAt ? new Date(body.startAt) : new Date();
    const endAt = body.endAt ? new Date(body.endAt) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (endAt <= startAt) return reply.status(400).send({ error: 'END_AT_MUST_BE_AFTER_START_AT' });
    const sponsored = await db.SponsoredSound.create({
      trackId: track._id,
      brandName,
      brandId: (body.brandId ?? body.brand_id ?? '').trim() || null,
      startAt,
      endAt,
      budgetCents: Number(body.budgetCents ?? body.budget_cents ?? 0) || 0,
      status: body.status === 'active' ? 'active' : 'draft',
      priority: Number(body.priority ?? 0) || 0,
      targetRegions: Array.isArray(body.targetRegions) ? body.targetRegions : (body.target_regions || []),
      targetGenres: Array.isArray(body.targetGenres) ? body.targetGenres : (body.target_genres || []),
      meta: body.meta || {},
    });
    const created = await db.SponsoredSound.findById(sponsored._id).populate('trackId').lean();
    return reply.send({ ok: true, sponsored: { ...created, track: created.trackId ? formatTrackResponse(created.trackId) : null } });
  });

  app.get('/music/admin/sponsored-sounds', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { limit = 50, offset = 0, status } = request.query ?? {};
    const query = status ? { status } : {};
    const [list, total] = await Promise.all([
      db.SponsoredSound.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).populate('trackId').lean(),
      db.SponsoredSound.countDocuments(query),
    ]);
    const sponsored = (list || []).map((s) => ({ ...s, track: s.trackId ? formatTrackResponse(s.trackId) : null }));
    return reply.send({ sponsored, total, limit: Number(limit), offset: Number(offset) });
  });

  app.patch('/music/admin/sponsored-sounds/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const doc = await db.SponsoredSound.findById(request.params.id);
    if (!doc) return reply.status(404).send({ error: 'SPONSORED_SOUND_NOT_FOUND' });
    const body = request.body ?? {};
    if (body.brandName != null) doc.brandName = String(body.brandName).trim();
    if (body.startAt != null) doc.startAt = new Date(body.startAt);
    if (body.endAt != null) doc.endAt = new Date(body.endAt);
    if (body.budgetCents != null) doc.budgetCents = Number(body.budgetCents);
    if (body.status != null && ['draft', 'active', 'paused', 'ended'].includes(body.status)) doc.status = body.status;
    if (body.priority != null) doc.priority = Number(body.priority);
    if (body.targetRegions != null) doc.targetRegions = Array.isArray(body.targetRegions) ? body.targetRegions : [];
    if (body.targetGenres != null) doc.targetGenres = Array.isArray(body.targetGenres) ? body.targetGenres : [];
    await doc.save();
    const updated = await db.SponsoredSound.findById(doc._id).populate('trackId').lean();
    return reply.send({ ok: true, sponsored: { ...updated, track: updated.trackId ? formatTrackResponse(updated.trackId) : null } });
  });

  app.delete('/music/admin/sponsored-sounds/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const doc = await db.SponsoredSound.findById(request.params.id);
    if (!doc) return reply.status(404).send({ error: 'SPONSORED_SOUND_NOT_FOUND' });
    await db.SponsoredSound.deleteOne({ _id: doc._id });
    return reply.send({ ok: true, deleted: true });
  });

  /* ── Admin: Sound challenges CRUD (brand-paid challenges, e.g. Nike challenge sound) ── */
  app.post('/music/admin/challenges', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const body = request.body ?? {};
    const trackId = body.trackId ?? body.track_id;
    if (!trackId) return reply.status(400).send({ error: 'TRACK_ID_REQUIRED' });
    if (!validateId(trackId, reply)) return;
    const track = await db.MusicTrack.findById(trackId);
    if (!track) return reply.status(404).send({ error: 'TRACK_NOT_FOUND' });
    const brandName = (body.brandName ?? body.brand_name ?? '').trim();
    const challengeName = (body.challengeName ?? body.challenge_name ?? '').trim();
    if (!brandName || !challengeName) return reply.status(400).send({ error: 'BRAND_NAME_AND_CHALLENGE_NAME_REQUIRED' });
    const startAt = body.startAt ? new Date(body.startAt) : new Date();
    const endAt = body.endAt ? new Date(body.endAt) : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    if (endAt <= startAt) return reply.status(400).send({ error: 'END_AT_MUST_BE_AFTER_START_AT' });
    const challenge = await db.SoundChallenge.create({
      trackId: track._id,
      brandName,
      brandId: (body.brandId ?? body.brand_id ?? '').trim() || null,
      challengeName,
      description: (body.description ?? '').trim(),
      startAt,
      endAt,
      status: body.status === 'active' ? 'active' : 'draft',
      imageUrl: (body.imageUrl ?? body.image_url ?? '').trim() || null,
      bannerUrl: (body.bannerUrl ?? body.banner_url ?? '').trim() || null,
      prizeDescription: (body.prizeDescription ?? body.prize_description ?? '').trim(),
      rules: (body.rules ?? '').trim(),
      budgetCents: Number(body.budgetCents ?? body.budget_cents ?? 0) || 0,
      meta: body.meta || {},
    });
    const created = await db.SoundChallenge.findById(challenge._id).populate('trackId').lean();
    return reply.send({ ok: true, challenge: { ...created, track: created.trackId ? formatTrackResponse(created.trackId) : null } });
  });

  app.get('/music/admin/challenges', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    const { limit = 50, offset = 0, status } = request.query ?? {};
    const query = status ? { status } : {};
    const [list, total] = await Promise.all([
      db.SoundChallenge.find(query).sort({ createdAt: -1 }).skip(Number(offset)).limit(Math.min(Number(limit), 100)).populate('trackId').lean(),
      db.SoundChallenge.countDocuments(query),
    ]);
    const challenges = (list || []).map((c) => ({ ...c, track: c.trackId ? formatTrackResponse(c.trackId) : null }));
    return reply.send({ challenges, total, limit: Number(limit), offset: Number(offset) });
  });

  app.patch('/music/admin/challenges/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const doc = await db.SoundChallenge.findById(request.params.id);
    if (!doc) return reply.status(404).send({ error: 'CHALLENGE_NOT_FOUND' });
    const body = request.body ?? {};
    if (body.brandName != null) doc.brandName = String(body.brandName).trim();
    if (body.challengeName != null) doc.challengeName = String(body.challengeName).trim();
    if (body.description != null) doc.description = String(body.description).trim();
    if (body.startAt != null) doc.startAt = new Date(body.startAt);
    if (body.endAt != null) doc.endAt = new Date(body.endAt);
    if (body.status != null && ['draft', 'active', 'paused', 'ended'].includes(body.status)) doc.status = body.status;
    if (body.imageUrl != null) doc.imageUrl = String(body.imageUrl).trim() || null;
    if (body.bannerUrl != null) doc.bannerUrl = String(body.bannerUrl).trim() || null;
    if (body.prizeDescription != null) doc.prizeDescription = String(body.prizeDescription).trim();
    if (body.rules != null) doc.rules = String(body.rules).trim();
    if (body.budgetCents != null) doc.budgetCents = Number(body.budgetCents);
    await doc.save();
    const updated = await db.SoundChallenge.findById(doc._id).populate('trackId').lean();
    return reply.send({ ok: true, challenge: { ...updated, track: updated.trackId ? formatTrackResponse(updated.trackId) : null } });
  });

  app.delete('/music/admin/challenges/:id', async (request, reply) => {
    const user = await authUser(request);
    if (!user || user.role !== 'admin') return reply.status(403).send({ error: 'FORBIDDEN' });
    if (!validateId(request.params.id, reply)) return;
    const doc = await db.SoundChallenge.findById(request.params.id);
    if (!doc) return reply.status(404).send({ error: 'CHALLENGE_NOT_FOUND' });
    await db.SoundChallenge.deleteOne({ _id: doc._id });
    return reply.send({ ok: true, deleted: true });
  });
}

function formatTrackResponse(t, opts = {}) {
  if (!t) return t;
  const duration = t.duration ?? t.durationSeconds ?? 0;
  const audioUrl = t.audioUrl ?? t.streamUrl ?? null;
  const out = {
    _id: t._id,
    trackId: t.trackId,
    title: t.title,
    artist: t.artist,
    duration,
    durationSeconds: duration,
    audioUrl,
    streamUrl: audioUrl,
    thumbnailUrl: t.thumbnailUrl,
    licenseId: t.licenseId,
    licenseType: t.licenseType ?? 'royalty_free',
    provider: t.provider,
    genre: t.genre,
    mood: t.mood,
    bpm: t.bpm,
    waveform: t.waveform,
    tags: t.tags,
    status: t.status,
    createdAt: t.createdAt,
    revSharePercent: t.revSharePercent ?? undefined,
    moderatedAt: t.moderatedAt ?? undefined,
    moderationNote: t.moderationNote ?? undefined,
    ...(t.licenseId && typeof t.licenseId === 'object' ? { licenseId: t.licenseId } : {}),
  };
  if (opts.includeSeedPriority) {
    out.seed_priority = !!t.seedPriority;
    if (t.seedPriorityReason) out.seed_priority_reason = t.seedPriorityReason;
    if (t.seedPrioritySetAt) out.seed_priority_set_at = t.seedPrioritySetAt;
  }
  return out;
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { musicRoutes };
