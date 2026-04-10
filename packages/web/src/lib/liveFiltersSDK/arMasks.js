/**
 * AR masks pipeline — WebGL + face landmarks for overlays (glasses, hats, etc.).
 * Optional: TensorFlow.js face landmarks or MediaPipe Face Mesh.
 * https://milloapp.com
 */
function createARMasksPipeline() {
  return {
    async apply(video, canvas) {
      if (!canvas || !video) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth || 1;
      canvas.height = video.videoHeight || 1;
      ctx.drawImage(video, 0, 0);
      // TODO: face landmarks → position overlay texture in WebGL/2D
    },
    dispose() {},
  };
}

module.exports = { createARMasksPipeline };
