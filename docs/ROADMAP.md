# Delivery plan

1. Core watch rooms: authoritative server, native/YouTube adapters, room permissions, queue and private invite.
2. Reliability: unit and protocol tests; multi-device playback telemetry, jitter injection, late joins, buffering and autoplay; YouTube playlist/search adapter with quota controls.
3. Social: experimental mesh call and screen sharing; deploy TURN or SFU only after budget and network verification. Screen share only for content the host has permission to share.
4. Production: dedicated HTTPS WebSocket service, persistent room/session state, abuse controls, privacy review, PWA icons and install tests, cross-browser accessibility audit.
5. OTT feasibility: provider-supported integration where available; manual external links otherwise. No DRM bypass.

Keep Vibify and all other repositories, databases and deployments untouched. No credentials in Git. Start with a single-instance Node service to keep synchronization authoritative. Production costs and hosting limits must be reviewed before enabling paid infrastructure.
