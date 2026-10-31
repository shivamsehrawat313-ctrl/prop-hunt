# Shadow Hunt

Shadow Hunt is a small multiplayer prop-disguise hide-and-seek game. Rooms and movement are server synchronized; each round chooses one hunter and the other players hide as unique props.

## Run locally

Install dependencies once, then run the client and server together:

```powershell
npm install
npm run dev
```

Open `http://localhost:5173`. Create a room in one tab, join from another, ready all guests, and let the host start. Use `WASD` or arrow keys to move. Hiders select one prop and press `E` to lock; the selected hider becomes that prop. The hunter aims with the mouse and clicks to use a knife strike. Press `F3` to show FPS, draw calls, ping, and snapshot rate.

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
4. In tab 1, choose **Start**. Confirm one hunter sees **YOU ARE THE HUNTER** and cannot move during hiding; the hider sees the prop picker.
5. Hiders pick distinct props during the hide phase and lock with `E`. Their character takes the selected prop's appearance. Once hunting starts, aim and click to strike.
6. Confirm caught players spectate, results show the winner, and only the host can restart or return to the lobby.

For solo room testing, open `http://localhost:5173/?bots=2`, create a room, and press **Start** when the world finishes loading.

## Tests

```powershell
npm test
npm run build
```

`npm test` runs one headless Socket.IO script with three and four clients. It checks timer victory, strikes-out, all-hiders-caught, unique simultaneous prop picks and locking, auto-pick, role assignment/restart, knife range/cooldown, and the one-hunter/three-hider setup with four players.

## Current rough edges

- Client-side prediction uses a small positional correction threshold without per-input sequence acknowledgements; brief correction can be visible on high-latency links.
- Remote players use timestamp-buffered linear interpolation without extrapolation.
- Bots wander with simple random direction changes and exist only for `?bots=2` testing.
- The hunter swing is visual; audio is intentionally out of scope. The supplied cart has no preview image, so its picker button uses text only.
