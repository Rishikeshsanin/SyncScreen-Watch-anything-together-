# SyncScreen

One room, one timeline, every device. Independent media playback, not host video rebroadcast (except explicit screen sharing).

## Development preview

Node 22+, run npm install, npm test, npm start; open http://localhost:3000. Share a room code or invite link. For phones use an HTTPS deployment (camera, screen capture and WebCrypto require secure contexts).

Sources: embeddable YouTube videos, HTTPS browser-playable media, matching local files, experimental WebRTC screen share, external OTT links (manual only). No DRM circumvention or protected content restreaming. No video upload. YouTube ads, autoplay, provider buffering, mobile screen capture support and codec limitations can prevent synchronization. The local file fingerprint samples bytes, not a complete integrity hash.

Server-authoritative, versioned room state; midpoint clock samples; scheduled play/seek; bounded rate correction and hard-seek cooldown; host and delegated controls; catch-up or group wait; queue, chat, reactions, reconnect and peer signaling. Voice/video and screen sharing are experimental mesh WebRTC, best for small rooms; TURN is needed for restrictive networks, and production should use a dedicated SFU plus ephemeral TURN credentials. Never put permanent TURN secrets into public configuration. Room state is in-memory and expires after disconnect grace; use one server instance, no horizontal scaling or durable recovery yet.

## Release gates

Run unit and integration tests; measure per-device p50/p95 drift and recovery on real iPhone/Android/Windows devices. Target p95 under 100 ms on native video with healthy networks; YouTube and WebRTC need separate budgets. No zero-latency guarantee. Test host permissions, reconnect, slow networks, ads, local codecs, TURN and screen/audio permissions. No production release until verified. OTT synchronization requires provider-approved integration or a separately reviewed browser extension.

See docs/ROADMAP.md.
