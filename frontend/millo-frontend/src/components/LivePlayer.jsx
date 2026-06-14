import { useEffect, useRef } from "react";
import Hls from "hls.js";

export default function LivePlayer({ streamId }) {
  const videoRef = useRef(null);

  useEffect(() => {
    const video = videoRef.current;
    const url = `https://milloapp.com/hls/${streamId}.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(video);

      return () => hls.destroy();
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
    }
  }, [streamId]);

  return (
    <video
      ref={videoRef}
      controls
      autoPlay
      muted
      style={{ width: "100%", height: "100%", background: "#000" }}
    />
  );
}
