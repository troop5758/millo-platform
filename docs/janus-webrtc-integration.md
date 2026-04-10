# Janus WebRTC Integration

This document describes the Janus WebRTC Gateway integration for Millo's live streaming co-hosting feature.

## Architecture Overview

```
Creator Start Stream
      │
      ▼
Create Janus Room (VideoRoom plugin)
      │
      ▼
Viewers Join WebRTC
      │
      ├── HLS/RTMP fallback (NGINX-RTMP)
      │
      └── WebRTC direct (low latency)
            │
            ▼
      Co-Host Peer Connection
            │
            ▼
      Multi-Publisher Room
```

## Prerequisites

### Install Janus Gateway

**Ubuntu/Debian:**
```bash
apt install janus-gateway
```

**From Source:**
```bash
git clone https://github.com/meetecho/janus-gateway.git
cd janus-gateway
./configure --prefix=/opt/janus
make && make install
```

### Configuration

Set the following environment variables:

```env
# Required
JANUS_GATEWAY_URL=http://localhost:8088/janus

# Optional (for admin operations)
JANUS_ADMIN_SECRET=your-admin-secret
JANUS_API_SECRET=your-api-secret
```

## API Endpoints

### Get Room Info
```http
GET /live/stream/:streamId/webrtc/info
```

Returns WebRTC room status and participants.

**Response:**
```json
{
  "ok": true,
  "configured": true,
  "exists": true,
  "roomId": 123456789,
  "participants": [
    { "id": 111, "display": "CreatorName", "publisher": true }
  ],
  "numParticipants": 1
}
```

### Join as Publisher (Creator/Co-Host)
```http
POST /live/stream/:streamId/webrtc/publish
Authorization: Bearer <token>
Content-Type: application/json

{
  "displayName": "CoHost Name"
}
```

**Response:**
```json
{
  "ok": true,
  "feed": 123456789,
  "sessionId": "session_abc",
  "handleId": "handle_xyz",
  "publishers": [],
  "jsep": null
}
```

### Configure Publisher (Send SDP Offer)
```http
POST /live/stream/:streamId/webrtc/configure
Authorization: Bearer <token>
Content-Type: application/json

{
  "sessionId": "session_abc",
  "handleId": "handle_xyz",
  "jsep": {
    "type": "offer",
    "sdp": "v=0\r\no=..."
  },
  "audio": true,
  "video": true,
  "bitrate": 512000
}
```

**Response:**
```json
{
  "ok": true,
  "configured": true,
  "jsep": {
    "type": "answer",
    "sdp": "v=0\r\no=..."
  }
}
```

### Subscribe to Publisher
```http
POST /live/stream/:streamId/webrtc/subscribe
Content-Type: application/json

{
  "feedId": 123456789
}
```

**Response:**
```json
{
  "ok": true,
  "sessionId": "session_viewer",
  "handleId": "handle_viewer",
  "jsep": {
    "type": "offer",
    "sdp": "v=0\r\no=..."
  }
}
```

### Start Receiving Stream
```http
POST /live/stream/:streamId/webrtc/start
Content-Type: application/json

{
  "sessionId": "session_viewer",
  "handleId": "handle_viewer",
  "jsep": {
    "type": "answer",
    "sdp": "v=0\r\no=..."
  }
}
```

### Leave WebRTC Room
```http
POST /live/stream/:streamId/webrtc/leave
Content-Type: application/json

{
  "sessionId": "session_abc"
}
```

## Client Integration

### React Web Client

```javascript
// services/janusClient.js
class JanusClient {
  constructor(streamId, token) {
    this.streamId = streamId;
    this.token = token;
    this.peerConnection = null;
  }

  async publish() {
    // 1. Join as publisher
    const join = await fetch(`/live/stream/${this.streamId}/webrtc/publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ displayName: 'My Name' })
    }).then(r => r.json());

    // 2. Create peer connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // 3. Add local tracks
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: true, 
      audio: true 
    });
    stream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, stream);
    });

    // 4. Create and send offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    const config = await fetch(`/live/stream/${this.streamId}/webrtc/configure`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: join.sessionId,
        handleId: join.handleId,
        jsep: { type: 'offer', sdp: offer.sdp }
      })
    }).then(r => r.json());

    // 5. Set remote description
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(config.jsep)
    );

    return { feed: join.feed, sessionId: join.sessionId };
  }

  async subscribe(feedId) {
    // 1. Subscribe to feed
    const sub = await fetch(`/live/stream/${this.streamId}/webrtc/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feedId })
    }).then(r => r.json());

    // 2. Create peer connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    // 3. Handle incoming tracks
    this.peerConnection.ontrack = (event) => {
      const video = document.getElementById('remote-video');
      video.srcObject = event.streams[0];
    };

    // 4. Set remote offer
    await this.peerConnection.setRemoteDescription(
      new RTCSessionDescription(sub.jsep)
    );

    // 5. Create and send answer
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    await fetch(`/live/stream/${this.streamId}/webrtc/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: sub.sessionId,
        handleId: sub.handleId,
        jsep: { type: 'answer', sdp: answer.sdp }
      })
    });
  }

  async leave() {
    if (this.peerConnection) {
      this.peerConnection.close();
    }
    await fetch(`/live/stream/${this.streamId}/webrtc/leave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: this.sessionId })
    });
  }
}
```

## Co-Hosting Flow

1. **Creator starts stream** → Janus room created automatically
2. **Creator invites co-host** → `POST /live/cohost/invite`
3. **Co-host accepts** → `POST /live/cohost/accept` → `createSubscriberFeed()` called
4. **Co-host publishes** → `POST /live/stream/:id/webrtc/publish`
5. **Viewers subscribe** to both creator and co-host feeds
6. **Stream ends** → Janus room destroyed

## Room Configuration

Default VideoRoom settings:

| Setting | Value | Description |
|---------|-------|-------------|
| `publishers` | 6 | Max publishers (creator + 5 co-hosts) |
| `bitrate` | 512000 | Default bitrate (512 kbps) |
| `audiocodec` | opus | Audio codec |
| `videocodec` | vp8,h264 | Video codecs (priority order) |
| `fir_freq` | 10 | FIR request frequency (seconds) |

## Fallback Behavior

When `JANUS_GATEWAY_URL` is not configured:

- **Development**: Stub mode enabled, WebRTC calls logged but no actual connections
- **Production**: WebRTC features disabled, fallback to HLS/RTMP streaming only

## Scaling

For production at scale:

1. **Janus Cluster**: Deploy multiple Janus instances behind a load balancer
2. **Redis Sessions**: Store session metadata in Redis for horizontal scaling
3. **Edge Servers**: Deploy Janus at edge locations for lower latency
4. **SFU vs MCU**: Janus VideoRoom is SFU (Selective Forwarding Unit) — efficient for many viewers

```
                    ┌─────────────┐
                    │ Load Balancer│
                    └──────┬──────┘
           ┌───────────────┼───────────────┐
           │               │               │
    ┌──────┴──────┐ ┌──────┴──────┐ ┌──────┴──────┐
    │  Janus US   │ │  Janus EU   │ │  Janus APAC │
    └─────────────┘ └─────────────┘ └─────────────┘
```

## Monitoring

Key metrics to track:

- Active rooms
- Publishers per room
- Subscribers per publisher
- Packet loss / jitter
- ICE connection failures

## Security

- All WebRTC connections use DTLS-SRTP encryption
- Room IDs are derived from stream IDs (MD5 hash)
- Only authenticated creators/co-hosts can publish
- PPV streams require purchase verification before subscribing
