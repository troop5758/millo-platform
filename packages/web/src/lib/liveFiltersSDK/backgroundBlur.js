/**
 * Background blur pipeline — WebGL + TensorFlow.js body segmentation.
 * Optional: npm install @tensorflow/tfjs @tensorflow-models/body-segmentation
 * https://milloapp.com
 */
function createBackgroundBlurPipeline() {
  return {
    async apply(video, canvas) {
      if (!canvas || !video) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = video.videoWidth || 1;
      canvas.height = video.videoHeight || 1;
      ctx.drawImage(video, 0, 0);
      // TODO: load body-segmentation model, segment person, blur background in WebGL/canvas
    },
    dispose() {},
  };
}

module.exports = { createBackgroundBlurPipeline };
