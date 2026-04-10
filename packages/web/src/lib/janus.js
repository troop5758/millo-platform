/**
 * Janus WebRTC client helpers — VideoRoom publisher / subscriber.
 * Requires HTTPS (or localhost) for getUserMedia. Server = REST or WebSocket URL to Janus API.
 * https://milloapp.com
 */
import 'webrtc-adapter';
import Janus from 'janus-gateway';

/**
 * Initialize the Janus library and open a session to the gateway.
 * @param {string | string[]} server e.g. `wss://janus.example/ws` or `https://janus.example/janus`
 * @returns {Promise<InstanceType<typeof Janus>>}
 */
export function initJanus(server) {
  return new Promise((resolve, reject) => {
    Janus.init({
      debug: import.meta.env?.DEV ? ['warn', 'error'] : false,
      callback() {
        // eslint-disable-next-line no-new
        const janus = new Janus({
          server,
          success() {
            resolve(janus);
          },
          error(reason) {
            reject(new Error(typeof reason === 'string' ? reason : 'Janus session failed'));
          },
        });
      },
    });
  });
}

/**
 * Go live: attach VideoRoom, join as publisher, capture A/V, publish offer.
 * @param {InstanceType<typeof Janus>} janus
 * @param {number} roomId Janus VideoRoom id (numeric)
 * @returns {Promise<object>} plugin handle (Janus.PluginHandle)
 */
export function startPublishing(janus, roomId) {
  return new Promise((resolve, reject) => {
    janus.attach({
      plugin: 'janus.plugin.videoroom',
      error(err) {
        reject(new Error(typeof err === 'string' ? err : 'Janus attach failed'));
      },
      success(pluginHandle) {
        pluginHandle.send({
          message: {
            request: 'join',
            room: roomId,
            ptype: 'publisher',
          },
        });

        pluginHandle.createOffer({
          media: { video: true, audio: true },
          success(jsep) {
            pluginHandle.send({
              message: { request: 'publish' },
              jsep,
            });
            resolve(pluginHandle);
          },
          error(err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          },
        });
      },
    });
  });
}

/**
 * Watch live: attach VideoRoom and join as subscriber.
 * Pass `extraAttach` for `onmessage` / `onremotestream` / `iceState` to complete SDP and render remote media.
 *
 * @param {InstanceType<typeof Janus>} janus
 * @param {number} roomId
 * @param {Record<string, unknown>} [extraAttach] Additional Janus attach options (e.g. onmessage, onremotestream)
 * @returns {Promise<object>} plugin handle
 */
export function joinViewer(janus, roomId, extraAttach = {}) {
  const userError = typeof extraAttach.error === 'function' ? extraAttach.error : null;
  const userSuccess = typeof extraAttach.success === 'function' ? extraAttach.success : null;
  const { error: _e, success: _s, ...rest } = extraAttach;

  return new Promise((resolve, reject) => {
    janus.attach({
      plugin: 'janus.plugin.videoroom',
      ...rest,
      error(err) {
        if (userError) userError(err);
        reject(new Error(typeof err === 'string' ? err : 'Janus attach failed'));
      },
      success(pluginHandle) {
        if (userSuccess) userSuccess(pluginHandle);
        pluginHandle.send({
          message: {
            request: 'join',
            room: roomId,
            ptype: 'subscriber',
          },
        });
        resolve(pluginHandle);
      },
    });
  });
}
