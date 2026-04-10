/**
 * Face smoothing pipeline — WebGL + TensorFlow.js/MediaPipe face mesh.
 * Optional: face detection + bilateral blur on face ROI.
 * https://milloapp.com
 */
function createFaceSmoothingPipeline() {
  return {
    async apply(video, canvas) {
      if (!canvas || !video) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth || 1;
      canvas.height = video.videoHeight || 1;
      ctx.drawImage(video, 0, 0);
      // TODO: face mesh → face ROI → WebGL bilateral/smoothing pass
    },
    dispose() {},
  };
}

module.exports = { createFaceSmoothingPipeline };
