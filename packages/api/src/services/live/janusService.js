'use strict';
/**
 * Janus WebRTC Gateway Service — room management, publisher/subscriber, co-hosting.
 * Implements Janus VideoRoom plugin API for live streaming.
 * https://milloapp.com
 */

const crypto = require('crypto');
const db = require('@millo/database');

const JANUS_URL = process.env.JANUS_GATEWAY_URL || process.env.JANUS_URL || 'http://localhost:8088/janus';
const JANUS_ADMIN_SECRET = process.env.JANUS_ADMIN_SECRET;
const JANUS_API_SECRET = process.env.JANUS_API_SECRET;

// Session and handle caches
const sessions = new Map();
const handles = new Map();

let _warned = false;

/**
 * Check if Janus is configured.
 */
function isConfigured() {
  return !!(process.env.JANUS_GATEWAY_URL || process.env.JANUS_URL);
}

/**
 * Check if we're in production mode.
 */
function isProduction() {
  return process.env.NODE_ENV === 'production';
}

/**
 * Generate a unique transaction ID.
 */
function generateTransaction() {
  return crypto.randomBytes(12).toString('hex');
}

/**
 * Generate a numeric room ID from stream ID.
 */
function streamIdToRoomId(streamId) {
  const hash = crypto.createHash('md5').update(String(streamId)).digest('hex');
  return parseInt(hash.substring(0, 8), 16);
}

/**
 * Make a request to Janus API.
 */
async function janusRequest(endpoint, body = {}) {
  if (!isConfigured()) {
    if (isProduction()) {
      throw new Error('JANUS_NOT_CONFIGURED: JANUS_GATEWAY_URL or JANUS_URL is required in production');
    }
    if (!_warned) {
      _warned = true;
      console.warn('[Janus] DEV MODE: JANUS_GATEWAY_URL not configured. Using stubs.');
    }
    return null;
  }

  const url = `${JANUS_URL}${endpoint}`;
  const requestBody = {
    ...body,
    transaction: body.transaction || generateTransaction(),
  };

  if (JANUS_API_SECRET) {
    requestBody.apisecret = JANUS_API_SECRET;
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    const data = await res.json();

    if (data.janus === 'error') {
      const error = new Error(data.error?.reason || 'Janus API error');
      error.code = data.error?.code;
      throw error;
    }

    return data;
  } catch (err) {
    console.error('[Janus] Request failed:', err.message);
    throw err;
  }
}

/**
 * Create a new Janus session.
 * @returns {Promise<{sessionId: string}>}
 */
async function createSession() {
  const data = await janusRequest('', { janus: 'create' });

  if (!data) {
    // Dev stub
    const stubSession = `stub_session_${Date.now()}`;
    sessions.set(stubSession, { id: stubSession, created: Date.now(), stub: true });
    return { sessionId: stubSession, stub: true };
  }

  const sessionId = String(data.data?.id);
  sessions.set(sessionId, { id: sessionId, created: Date.now() });

  // Start keepalive
  startKeepalive(sessionId);

  return { sessionId };
}

/**
 * Destroy a Janus session.
 */
async function destroySession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return { ok: false, error: 'SESSION_NOT_FOUND' };

  if (session.stub) {
    sessions.delete(sessionId);
    return { ok: true, stub: true };
  }

  stopKeepalive(sessionId);

  try {
    await janusRequest(`/${sessionId}`, { janus: 'destroy' });
    sessions.delete(sessionId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * Attach to VideoRoom plugin.
 */
async function attachVideoRoom(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('SESSION_NOT_FOUND');

  if (session.stub) {
    const stubHandle = `stub_handle_${Date.now()}`;
    handles.set(stubHandle, { id: stubHandle, sessionId, plugin: 'videoroom', stub: true });
    return { handleId: stubHandle, stub: true };
  }

  const data = await janusRequest(`/${sessionId}`, {
    janus: 'attach',
    plugin: 'janus.plugin.videoroom',
  });

  const handleId = String(data.data?.id);
  handles.set(handleId, { id: handleId, sessionId, plugin: 'videoroom' });

  return { handleId };
}

/**
 * Send a message to a plugin handle.
 */
async function sendMessage(sessionId, handleId, body, jsep = null) {
  const handle = handles.get(handleId);
  if (!handle) throw new Error('HANDLE_NOT_FOUND');

  if (handle.stub) {
    console.debug('[Janus DEV] sendMessage stub', { sessionId, handleId, body });
    return { stub: true, plugindata: { data: { videoroom: 'event' } } };
  }

  const request = {
    janus: 'message',
    body,
  };

  if (jsep) {
    request.jsep = jsep;
  }

  return janusRequest(`/${sessionId}/${handleId}`, request);
}

/**
 * Create a VideoRoom for a stream.
 * @param {string} streamId - Millo stream ID
 * @param {Object} opts - Room options
 * @returns {Promise<{roomId: number, created: boolean}>}
 */
async function createRoom(streamId, opts = {}) {
  const roomId = streamIdToRoomId(streamId);

  // Check if room already exists
  const existing = await db.LiveStream.findById(streamId).lean();
  if (existing?.meta?.janusRoomId) {
    return { roomId: existing.meta.janusRoomId, created: false };
  }

  if (!isConfigured()) {
    // Dev stub
    await db.LiveStream.findByIdAndUpdate(streamId, {
      $set: { 'meta.janusRoomId': roomId, 'meta.janusStub': true },
    });
    console.debug('[Janus DEV] createRoom stub', { streamId, roomId });
    return { roomId, created: true, stub: true };
  }

  // Create session and attach to videoroom
  const { sessionId } = await createSession();
  const { handleId } = await attachVideoRoom(sessionId);

  try {
    const response = await sendMessage(sessionId, handleId, {
      request: 'create',
      room: roomId,
      description: opts.description || `Millo Stream ${streamId}`,
      publishers: opts.maxPublishers || 6, // Creator + 5 co-hosts
      bitrate: opts.bitrate || 512000,
      fir_freq: opts.firFreq || 10,
      audiocodec: opts.audiocodec || 'opus',
      videocodec: opts.videocodec || 'vp8,h264',
      record: opts.record || false,
      rec_dir: opts.recDir || '/tmp/janus-recordings',
      is_private: false,
      require_pvtid: false,
      notify_joining: true,
      permanent: false,
    });

    const result = response?.plugindata?.data;

    if (result?.videoroom === 'created' || result?.error_code === 427) {
      // 427 = room already exists
      await db.LiveStream.findByIdAndUpdate(streamId, {
        $set: {
          'meta.janusRoomId': roomId,
          'meta.janusSessionId': sessionId,
          'meta.janusHandleId': handleId,
        },
      });

      return { roomId, created: result?.videoroom === 'created', sessionId, handleId };
    }

    throw new Error(result?.error || 'Failed to create room');
  } catch (err) {
    // Cleanup on failure
    await destroySession(sessionId);
    throw err;
  }
}

/**
 * Destroy a VideoRoom.
 */
async function destroyRoom(streamId) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream?.meta?.janusRoomId) {
    return { ok: true, message: 'No Janus room associated' };
  }

  if (stream.meta.janusStub) {
    await db.LiveStream.findByIdAndUpdate(streamId, {
      $unset: { 'meta.janusRoomId': 1, 'meta.janusStub': 1 },
    });
    return { ok: true, stub: true };
  }

  const roomId = stream.meta.janusRoomId;
  const sessionId = stream.meta.janusSessionId;
  const handleId = stream.meta.janusHandleId;

  if (sessionId && handleId) {
    try {
      await sendMessage(sessionId, handleId, {
        request: 'destroy',
        room: roomId,
      });
    } catch (err) {
      console.warn('[Janus] Failed to destroy room:', err.message);
    }

    await destroySession(sessionId);
  }

  await db.LiveStream.findByIdAndUpdate(streamId, {
    $unset: {
      'meta.janusRoomId': 1,
      'meta.janusSessionId': 1,
      'meta.janusHandleId': 1,
    },
  });

  return { ok: true, roomId };
}

/**
 * Join a room as a publisher (streamer/co-host).
 * @param {string} streamId - Stream ID
 * @param {string} userId - User ID
 * @param {string} displayName - Display name
 * @returns {Promise<{feed: number, jsep?: Object}>}
 */
async function joinAsPublisher(streamId, userId, displayName) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream?.meta?.janusRoomId) {
    throw new Error('ROOM_NOT_FOUND');
  }

  if (stream.meta.janusStub) {
    const stubFeed = parseInt(crypto.createHash('md5').update(userId).digest('hex').substring(0, 8), 16);
    console.debug('[Janus DEV] joinAsPublisher stub', { streamId, userId, feed: stubFeed });
    return { feed: stubFeed, stub: true };
  }

  // Create session for this user
  const { sessionId } = await createSession();
  const { handleId } = await attachVideoRoom(sessionId);

  const response = await sendMessage(sessionId, handleId, {
    request: 'join',
    room: stream.meta.janusRoomId,
    ptype: 'publisher',
    display: displayName,
    id: parseInt(crypto.createHash('md5').update(userId).digest('hex').substring(0, 8), 16),
  });

  const result = response?.plugindata?.data;

  if (result?.videoroom !== 'joined') {
    await destroySession(sessionId);
    throw new Error(result?.error || 'Failed to join room');
  }

  // Store user's Janus session
  await db.LiveStream.findByIdAndUpdate(streamId, {
    $set: {
      [`meta.publishers.${userId}`]: {
        sessionId,
        handleId,
        feed: result.id,
        display: displayName,
        joinedAt: new Date(),
      },
    },
  });

  return {
    feed: result.id,
    publishers: result.publishers,
    sessionId,
    handleId,
    jsep: response.jsep,
  };
}

/**
 * Join a room as a subscriber (viewer).
 */
async function joinAsSubscriber(streamId, userId, feedId) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream?.meta?.janusRoomId) {
    throw new Error('ROOM_NOT_FOUND');
  }

  if (stream.meta.janusStub) {
    console.debug('[Janus DEV] joinAsSubscriber stub', { streamId, userId, feedId });
    return { stub: true };
  }

  const { sessionId } = await createSession();
  const { handleId } = await attachVideoRoom(sessionId);

  const response = await sendMessage(sessionId, handleId, {
    request: 'join',
    room: stream.meta.janusRoomId,
    ptype: 'subscriber',
    feed: feedId,
    private_id: parseInt(crypto.createHash('md5').update(userId).digest('hex').substring(0, 8), 16),
  });

  const result = response?.plugindata?.data;

  if (result?.videoroom !== 'attached') {
    await destroySession(sessionId);
    throw new Error(result?.error || 'Failed to subscribe');
  }

  return {
    sessionId,
    handleId,
    jsep: response.jsep,
  };
}

/**
 * Configure a publisher (send SDP offer).
 */
async function configurePublisher(sessionId, handleId, jsep, opts = {}) {
  const handle = handles.get(handleId);
  if (!handle) throw new Error('HANDLE_NOT_FOUND');

  if (handle.stub) {
    console.debug('[Janus DEV] configurePublisher stub');
    return { stub: true, jsep: { type: 'answer', sdp: 'stub-sdp' } };
  }

  const body = {
    request: 'configure',
    audio: opts.audio !== false,
    video: opts.video !== false,
    bitrate: opts.bitrate || 512000,
  };

  const response = await sendMessage(sessionId, handleId, body, jsep);

  return {
    jsep: response.jsep,
    configured: response?.plugindata?.data?.configured === 'ok',
  };
}

/**
 * Start WebRTC for a subscriber.
 */
async function startSubscriber(sessionId, handleId, jsep) {
  const handle = handles.get(handleId);
  if (!handle) throw new Error('HANDLE_NOT_FOUND');

  if (handle.stub) {
    console.debug('[Janus DEV] startSubscriber stub');
    return { stub: true, started: true };
  }

  const response = await sendMessage(sessionId, handleId, { request: 'start' }, jsep);

  return {
    started: response?.plugindata?.data?.started === 'ok',
  };
}

/**
 * Create subscriber feed for co-host.
 * This is the main function called when a co-host joins.
 * @param {string} streamId - Stream ID
 * @param {string} userId - Co-host user ID
 */
async function createSubscriberFeed(streamId, userId) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream) {
    throw new Error('STREAM_NOT_FOUND');
  }

  // Ensure room exists
  if (!stream.meta?.janusRoomId) {
    await createRoom(streamId);
  }

  // Get user info for display name
  const user = await db.User.findById(userId).lean();
  const displayName = user?.displayName || user?.email?.split('@')[0] || `CoHost_${userId.substring(0, 6)}`;

  // Join as publisher (co-host can broadcast their video)
  const result = await joinAsPublisher(streamId, userId, displayName);

  // Log the co-host connection
  await db.FinancialAuditLog.create({
    action: 'cohost_joined_janus',
    amountCents: 0,
    refType: 'live_stream',
    refId: streamId,
    actorId: userId,
    meta: { feed: result.feed, displayName },
  }).catch(() => {});

  return {
    ok: true,
    feed: result.feed,
    sessionId: result.sessionId,
    handleId: result.handleId,
    publishers: result.publishers,
  };
}

/**
 * Remove a publisher from a room.
 */
async function removePublisher(streamId, userId) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream?.meta?.publishers?.[userId]) {
    return { ok: true, message: 'Publisher not found' };
  }

  const { sessionId } = stream.meta.publishers[userId];

  if (sessionId && !stream.meta.janusStub) {
    await destroySession(sessionId);
  }

  await db.LiveStream.findByIdAndUpdate(streamId, {
    $unset: { [`meta.publishers.${userId}`]: 1 },
  });

  return { ok: true };
}

/**
 * Get room info.
 */
async function getRoomInfo(streamId) {
  const stream = await db.LiveStream.findById(streamId).lean();
  if (!stream?.meta?.janusRoomId) {
    return { exists: false };
  }

  if (stream.meta.janusStub) {
    return {
      exists: true,
      roomId: stream.meta.janusRoomId,
      stub: true,
      publishers: Object.keys(stream.meta.publishers || {}),
    };
  }

  // Get live room info from Janus
  const { sessionId } = await createSession();
  const { handleId } = await attachVideoRoom(sessionId);

  try {
    const response = await sendMessage(sessionId, handleId, {
      request: 'listparticipants',
      room: stream.meta.janusRoomId,
    });

    const result = response?.plugindata?.data;

    return {
      exists: true,
      roomId: stream.meta.janusRoomId,
      participants: result?.participants || [],
      numParticipants: result?.participants?.length || 0,
    };
  } finally {
    await destroySession(sessionId);
  }
}

// Keepalive management
const keepaliveIntervals = new Map();

function startKeepalive(sessionId) {
  if (keepaliveIntervals.has(sessionId)) return;

  const interval = setInterval(async () => {
    try {
      await janusRequest(`/${sessionId}`, { janus: 'keepalive' });
    } catch {
      stopKeepalive(sessionId);
    }
  }, 30000); // Every 30 seconds

  keepaliveIntervals.set(sessionId, interval);
}

function stopKeepalive(sessionId) {
  const interval = keepaliveIntervals.get(sessionId);
  if (interval) {
    clearInterval(interval);
    keepaliveIntervals.delete(sessionId);
  }
}

/**
 * Cleanup all sessions and handles on shutdown.
 */
async function cleanup() {
  for (const sessionId of sessions.keys()) {
    await destroySession(sessionId).catch(() => {});
  }
  sessions.clear();
  handles.clear();
  keepaliveIntervals.forEach((interval) => clearInterval(interval));
  keepaliveIntervals.clear();
}

module.exports = {
  isConfigured,
  createSession,
  destroySession,
  attachVideoRoom,
  sendMessage,
  createRoom,
  destroyRoom,
  joinAsPublisher,
  joinAsSubscriber,
  configurePublisher,
  startSubscriber,
  createSubscriberFeed,
  removePublisher,
  getRoomInfo,
  cleanup,
  streamIdToRoomId,
};
