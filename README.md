# Shadow Hunt

## Run locally

Install dependencies once, then start the Vite client and Socket.IO server together:

```powershell
npm install
npm run dev
```

Open the client at `http://localhost:5173`. The Socket.IO skeleton listens on port 3001 (`/health` returns a small health response, and `/water?x=70&z=60` returns shared river depth data). Use WASD or the arrow keys to move. Wading is always allowed; movement slows in the river, while optional bridges provide full speed without splashes. Milestone 1A adds no sound beyond the existing audio-unlock button. The quality buttons adjust render resolution and shadows.

This workspace was missing the original Vite/Three.js and Node/Socket.IO setup, so Milestone 1A adds a minimal runnable foundation. Map coordinates and path nodes live in `maps/forest.json`; planning documents remain in `maps/`.
