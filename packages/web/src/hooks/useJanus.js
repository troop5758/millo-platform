import { useEffect } from 'react';

/**
 * useJanus(streamId)
 * Frontend WebRTC hook scaffold for Janus room flows.
 * This keeps UI integration points stable while backend signaling is wired.
 */
export default function useJanus(streamId) {
  useEffect(() => {
    if (!streamId) return;

    // Placeholder hook for Janus WebRTC signaling lifecycle.
    // Next step: call backend Janus signaling endpoints to create/join room.
    // eslint-disable-next-line no-console
    console.log('Connecting to Janus room:', streamId);

    return () => {
      // eslint-disable-next-line no-console
      console.log('Disconnecting from Janus room:', streamId);
    };
  }, [streamId]);
}

