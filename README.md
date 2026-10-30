# Shadow Hunt

Shadow Hunt is a small multiplayer forest room and movement prototype. Milestone 2 provides rooms, lobby state, authoritative walking, and live player sync. The map and its art data are unchanged.

## Run locally

Install dependencies once, then run the client and server together:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. Vite serves the client and proxies Socket.IO to the server on port 3000. Use `WASD` or the arrow keys to move during a room. Press `F3` to show FPS, draw calls, ping, and snapshot rate.

For the production server, build the client and start the one-origin Node host:

```powershell
npm run build
npm start
```

Open `http://localhost:3000`. `PORT` overrides the default server port. `/health`, the built client, and public models are served by that process. No lobby video or `/media` route is used.

## Two-tab room check

1. Open the client in two browser tabs.
2. In tab 1, enter a name and choose **Create Room**. Copy the four-letter code.
3. In tab 2, enter a different name and join with that code. Mark the second player **Ready**.
4. In tab 1, choose **Start**. Both players should enter the forest and see the other player's name and colored marker.
5. Move in both tabs. The other character should follow smoothly; each player dot should also appear on the minimap.
6. Press **Leave room**. The remaining player should see the roster update. Create another room to check the host controls.

For solo room testing, open `http://localhost:5173/?bots=2`, create a room, and press **Start** when the world finishes loading.

## Tests

```powershell
npm test
npm run build
```

`npm test` starts an isolated in-process Socket.IO server and checks room creation/join, ready gating, start, safe spawn positions, three-client snapshots, room-code errors, capacity and started-room rejection, movement speed correction, 20 Hz snapshot rate, host promotion/rejoin, solo bots, and empty-room cleanup.

## Current rough edges

- Client-side prediction uses a small positional correction threshold without per-input sequence acknowledgements; brief correction can be visible on high-latency links.
- Remote players use timestamp-buffered linear interpolation without extrapolation.
- Bots wander with simple random direction changes and exist only for `?bots=2` testing.
