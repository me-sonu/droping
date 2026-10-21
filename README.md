# SecureDrop

Private. Direct. Simple.

SecureDrop is a browser-based peer-to-peer file-transfer application. The frontend uses WebRTC DataChannel; the Node.js server only handles temporary signaling/session coordination.

## Important implementation note

This project is a real working WebRTC application, not a visual-only mockup. However, browsers cannot create a cross-device WebRTC connection from a static HTML file alone: a signaling service is needed to exchange SDP/ICE messages. Therefore this project contains a small Node.js WebSocket signaling server.

The browser also applies AES-GCM to file chunks after deriving a session key with ECDH. WebRTC itself supplies DTLS transport encryption. Private keys stay in the browser.

The included QR renderer is dependency-free but is intentionally a pairing visual fallback rather than a standards-compliant QR encoder/decoder. The 6-character manual code is fully supported. For production, add a vetted QR library locally (not from an untrusted CDN) and connect its decoder to `scanBtn`.

## Structure

SecureDrop/
  client/
    index.html
    style.css
    app.js
    crypto.js
    webrtc.js
    qr.js
  server/
    server.js
    package.json
  README.md
  .gitignore

## Run in VS Code / Windows

1. Install Node.js LTS.
2. Open the `SecureDrop` folder in VS Code.
3. Open Terminal in VS Code.
4. Run:

```powershell
cd server
npm install
npm start
```

5. Open:

`http://localhost:8787`

For testing on a phone, the phone cannot use your laptop's `localhost`. Put both devices on the same LAN and run the server bound to the laptop's LAN interface, then use the laptop's LAN IP. Browser security rules mean camera/WebRTC behavior is much more reliable over HTTPS. For production, use HTTPS + WSS.

## Production deployment

Host the static client behind HTTPS and run the Node.js signaling server on an HTTPS-capable host/reverse proxy. GitHub Pages can host the static frontend, but it cannot run `server.js` or a WebSocket server. The signaling endpoint must be a separate WSS service.

Recommended production controls:
- HTTPS only
- WSS only
- Origin allow-list
- Authentication/rate limits for signaling
- Short-lived sessions
- No file persistence on signaling server
- CSP and security headers
- TURN only when necessary
- Secrets such as TURN credentials stored server-side/environment variables

## Browser support

Modern Chromium/Firefox/Safari versions generally support WebRTC DataChannel, but exact behavior varies. iOS browsers have additional platform restrictions. Camera QR scanning requires a secure context and user permission.

## Security model

1. Pairing code identifies a temporary signaling session.
2. SDP/ICE messages are exchanged through the signaling server.
3. WebRTC DataChannel establishes an encrypted transport.
4. Each browser creates an ECDH P-256 key pair locally.
5. The peers derive an AES-GCM key.
6. File chunks are encrypted in the sender browser and decrypted in the receiver browser.
7. The signaling server never receives file chunks.
8. Received files remain in browser memory until the user accepts/downloads them.

## Limitations

- A browser cannot guarantee a direct P2P route on every network. Some networks require TURN relay.
- A static GitHub Pages site cannot provide signaling by itself.
- Browser support for folder selection, HEIC/MOV handling, camera APIs and background transfers varies.
- The included QR display is a fallback visual pairing code, not a production QR implementation. Use the manual code or add a vetted QR library before claiming full QR compatibility.

## Troubleshooting

### "Signaling server is unavailable"
Make sure `npm install` and `npm start` were run from `server/`, then open port 8787.

### Phone cannot connect
Do not use `localhost` on the phone. Use the laptop's LAN IP during local testing and make sure Windows Firewall allows the server port.

### WebRTC stays connecting
The network may require STUN/TURN. Configure TURN credentials server-side and provide them to the client through a secure configuration mechanism.

### Camera does not scan
Use the 6-character manual pairing code. For production, install a vetted QR encoder/decoder locally and wire it into `qr.js`.

## Security checklist

- [x] No permanent file storage
- [x] WebRTC DataChannel
- [x] ECDH + AES-GCM application encryption
- [x] Secure random pairing code
- [x] Expiring sessions
- [x] File approval UI
- [x] Input/rate checks on signaling server
- [x] Security headers
- [x] No analytics/tracking
- [ ] Production HTTPS/WSS certificate
- [ ] Production TURN service
- [ ] Production QR encoder/decoder
- [ ] Production origin allow-list
