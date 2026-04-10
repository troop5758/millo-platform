'use strict';
/**
 * Live Streaming Filters — Real-Time ML Pipeline
 *
 * This document describes how Millo's live filters evolve from CSS stubs to a
 * production-ready ML pipeline using TensorFlow.js, MediaPipe-style models,
 * and GPU shader rendering.
 *
 * Architecture
 * ============
 *
 *  Video Frame (camera/WebRTC)
 *        │
 *        ▼
 *  TensorFlow Worker (model inference)
 *        │
 *        ▼
 *  Filter Pipeline (per-frame transforms)
 *        │
 *        ▼
 *  GPU Shader Renderer (WebGL / Metal / OpenGL ES)
 *        │
 *        ▼
 *  Encoded Stream (RTMP/WebRTC/HLS)
 *
 * 1. Frame capture
 * ----------------
 * - Web: capture frames from the `<video>` element (getUserMedia/WebRTC).
 * - Mobile: camera capture via native APIs (`AVCaptureSession` on iOS,
 *   `Camera2`/`CameraX` on Android).
 * - Frames are drawn into an offscreen canvas or GPU texture that feeds the
 *   ML models and shaders.
 *
 * 2. Model integration
 * --------------------
 *
 * Effect           Model example
 * --------------  -----------------------------------------------
 * Face tracking    MediaPipe Face Mesh / TF.js face-landmarks
 * Beauty filter    TensorFlow segmentation + smoothing shaders
 * AR masks         Face landmarks (MediaPipe / TF.js) + overlays
 * Background blur  BodyPix / body-segmentation (person mask)
 *
 * Web (TF.js):
 * - `@tensorflow/tfjs` + `@tensorflow-models/body-segmentation` for background
 *   blur.
 * - Optional: `@tensorflow-models/face-landmarks-detection` or a MediaPipe
 *   bridge for face mesh.
 *
 * Native:
 * - Reuse the same model families via TFLite / MediaPipe on-device.
 * - Models run on GPU/NN accelerators where available.
 *
 * 3. Filter pipeline
 * ------------------
 *
 * The filter pipeline composes ML outputs into render-time effects:
 *
 * - `face_smoothing`
 *   - Run face mesh → get face ROI polygon.
 *   - Apply a bilateral or Gaussian blur in a shader only inside that ROI.
 * - `background_blur`
 *   - Run body segmentation → person mask.
 *   - Blur non-person pixels in a separate render pass.
 * - `ar_masks`
 *   - Run face landmarks → nose/eyes/mouth anchors.
 *   - Draw 2D/3D overlay textures positioned by those anchors.
 *
 * The existing `filtersEngine` and `liveFiltersSDK` already expose:
 *
 * - Filter IDs: `face_smoothing`, `background_blur`, `ar_masks`.
 * - `filterConfig.webgl === true` + `sdk: 'tensorflow'` to instruct the client
 *   to use the TF.js + WebGL pipeline instead of CSS stubs.
 *
 * 4. Worker architecture
 * ----------------------
 *
 * A simplified worker loop (conceptual) for web:
 *
 * - `live_filter_worker`:
 *   - Receives configuration `{ filterId, modelConfig }`.
 *   - For each frame:
 *     - Capture: read from shared canvas / VideoFrame / ImageBitmap.
 *     - Model inference: run TF.js model (segmentation / landmarks).
 *     - Filter pipeline: compute masks/ROIs and uniforms for shaders.
 *     - GPU shader: render to an output canvas/texture.
 *     - Return: either:
 *       - the processed frame (for recording), or
 *       - the output canvas bound directly to the local preview.
 *
 * On mobile, this corresponds to:
 *
 * - A background thread / GPU pipeline driven by the camera capture session.
 * - ML model invocation on each frame (or at a throttled cadence).
 * - Render passes for blur, smoothing, and overlays before encoding.
 *
 * 5. Mobile SDKs
 * --------------
 *
 * Two dedicated SDKs provide platform-native integrations:
 *
 * - `millo-live-sdk-ios`
 *   - Camera capture (`AVCaptureSession`).
 *   - GPU filters via `Metal` (or `Core Image` as fallback).
 *   - Face tracking and beauty filters via TFLite/MediaPipe.
 *   - AR masks and virtual gift overlays as additional render layers.
 *   - Exposes a small API:
 *     - `startLiveSession(config)`
 *     - `setFilter(filterId)`
 *     - `applyGiftOverlay(giftId, meta)`
 *     - `stopLiveSession()`
 *
 * - `millo-live-sdk-android`
 *   - Camera capture via `CameraX`/`Camera2`.
 *   - GPU filters via `OpenGL ES` / `Vulkan`.
 *   - TFLite/MediaPipe models for segmentation + landmarks.
 *   - Same conceptual API as iOS for parity.
 *
 * 6. Integration with existing code
 * ---------------------------------
 *
 * - Backend:
 *   - `packages/live/src/filtersEngine.js` already defines filter IDs and
 *     marks WebGL/TF.js filters with `webgl: true, sdk: 'tensorflow'`.
 *   - `LIVE_FILTERS_ENABLED` acts as a kill-switch.
 *
 * - Web client:
 *   - `packages/web/src/lib/liveFiltersSDK.js` exposes:
 *     - `isWebGLFilter(filterConfig)`
 *     - `createLiveFilterPipeline({ filterId })`
 *   - Submodules:
 *     - `backgroundBlur.js` — body segmentation + background blur.
 *     - `faceSmoothing.js` — face mesh + smoothing.
 *     - `arMasks.js` — face landmarks + masks.
 *
 * Future work
 * -----------
 *
 * - Wire concrete TF.js models into the existing SDK submodules.
 * - Add frame-skipping / dynamic quality scaling under CPU/GPU pressure.
 * - Expose filter performance metrics via Prometheus for capacity planning.
 */

