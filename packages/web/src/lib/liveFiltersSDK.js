/**
 * Live Filters SDK — WebGL + TensorFlow.js client entry.
 * Replaces CSS stub for: face_smoothing, background_blur, ar_masks.
 * https://milloapp.com
 *
 * Usage:
 *   import { createLiveFilterPipeline, isWebGLFilter } from '@/lib/liveFiltersSDK';
 *   if (isWebGLFilter(filterConfig)) {
 *     const pipeline = createLiveFilterPipeline({ filterId: filterConfig.filterId });
 *     pipeline.apply(videoElement, canvasElement);
 *   }
 */

/**
 * @param {{ webgl?: boolean, filterId?: string }} filterConfig - From API /live/filters/:name or applyFilter response
 * @returns {boolean}
 */
export function isWebGLFilter(filterConfig) {
  return filterConfig && filterConfig.webgl === true && filterConfig.filterId;
}

/**
 * Create a filter pipeline for the given filter ID. When @tensorflow/tfjs (and optional body-segmentation) are available,
 * returns a pipeline that applies the filter; otherwise returns a no-op pipeline.
 * @param {{ filterId: string }} opts
 * @returns {{ apply: (video: HTMLVideoElement, canvas: HTMLCanvasElement) => Promise<void>, dispose: () => void }}
 */
export function createLiveFilterPipeline(opts = {}) {
  const filterId = opts.filterId || 'passthrough';

  const noop = {
    async apply(video, canvas) {
      if (canvas && video) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          canvas.width = video.videoWidth || 1;
          canvas.height = video.videoHeight || 1;
          ctx.drawImage(video, 0, 0);
        }
      }
    },
    dispose() {},
  };

  if (filterId === 'none' || filterId === 'passthrough') return noop;

  try {
    if (filterId === 'background_blur') {
      return require('./liveFiltersSDK/backgroundBlur').createBackgroundBlurPipeline();
    }
    if (filterId === 'face_smoothing') {
      return require('./liveFiltersSDK/faceSmoothing').createFaceSmoothingPipeline();
    }
    if (filterId === 'ar_masks') {
      return require('./liveFiltersSDK/arMasks').createARMasksPipeline();
    }
  } catch (_) {
    return noop;
  }

  return noop;
}

/**
 * List of WebGL filter IDs that require the SDK (and optional TF.js).
 */
export const WEBGL_FILTER_IDS = ['face_smoothing', 'background_blur', 'ar_masks'];
