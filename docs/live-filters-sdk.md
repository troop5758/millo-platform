# Live Filters SDK — WebGL + TensorFlow.js

The Live Filters SDK replaces the CSS-only stub with **WebGL + TensorFlow.js** for real-time video filters on the client.

## Backend

- **GET /live/filters/list** — Returns filter IDs including `face_smoothing`, `background_blur`, `ar_masks`.
- **GET /live/filters/:name** — Returns filter metadata; when `filterConfig.webgl === true`, the client must apply the filter via the SDK.
- Filter registry (in `@millo/live`): `face_smoothing`, `background_blur`, `ar_masks` are marked `webgl: true`, `sdk: 'tensorflow'`.

## Client integration

1. Install optional deps (when using WebGL filters):

   ```bash
   npm install @tensorflow/tfjs @tensorflow-models/body-segmentation
   ```

2. Use the SDK entry point:

   ```js
   import { createLiveFilterPipeline } from '@/lib/liveFiltersSDK';
   const pipeline = createLiveFilterPipeline({ filterId: 'background_blur' });
   pipeline.apply(videoElement, canvasOutput);
   ```

3. **Face smoothing** — Use TensorFlow.js face detection + WebGL shader to smooth skin (e.g. bilateral blur on face region).
4. **Background blur** — Use `@tensorflow-models/body-segmentation` to segment person, then blur the background in WebGL.
5. **AR masks** — Overlay 3D/2D assets (e.g. glasses, hats) using face landmark detection (e.g. MediaPipe or TF.js face landmarks).

## Examples

- **Face smoothing**: Run face mesh (e.g. MediaPipe Face Mesh or TF.js face-landmarks), extract face ROI, apply bilateral or Gaussian blur in a WebGL pass.
- **Background blur**: Body segmentation model → mask → WebGL: blur non-person pixels.
- **AR masks**: Face landmarks → position overlay texture in WebGL; optional 3D with Three.js.

## Kill switch

When `LIVE_FILTERS_ENABLED=false`, the API and engine disable filters; the client should not apply WebGL filters.

## See also

- `packages/live/src/filtersEngine.js` — Filter registry and apply logic.
- `packages/web/src/lib/liveFiltersSDK.js` — Client SDK entry (stub + optional TF.js pipeline).
