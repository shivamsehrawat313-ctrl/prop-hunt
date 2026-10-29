# Shadow Hunt

Shadow Hunt is a browser based multiplayer hide and seek game set in a forest. Hiders blend into the world as props while a hunter searches with limited strikes. Rooms support 2–6 players.

## Play locally

Requirements: Node.js 20 or newer.

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite client proxies Socket.IO to the game server on port 3001. To run a production build locally instead:

```sh
npm run build
npm start
```

Then open `http://localhost:3001`. `npm start` serves the built client, Socket.IO, map data, models, and media from one process. The `PORT` environment variable selects the listening port.

## Controls

- Move with **WASD** or the arrow keys.
- Aim with the mouse; click or press **Space** to strike as hunter.
- Select a weapon with **1** (knife), **2** (pistol), or **3** (crossbow).
- As a hider, use **E** near a matching pair of props to disguise; move with **WASD** to blend into the scene.
- On touch screens, use the left joystick to move and the right hand buttons to choose your weapon or disguise, lock/unlock, and strike. Low-spec touch devices start on Low quality; quality can be changed in settings.
- Ready up in the lobby; the host starts when everyone is ready.

## Tests

```sh
npm run test:multiplayer
npm test
npm run build
```

The multiplayer test starts a local server and connects headless Socket.IO players to exercise round timers, strikes, disguises, solo bots, catches, and hunter rotation.
`npm test` also checks vision privacy, audio unlock and synthesis, and mobile control layout at 390x844 and 844x390.
To verify the production stylesheet, run `npm run build`, start `npm start`, then run `npm run test:production-css -- http://localhost:3000` in another terminal.

## Deploy to Render

The repository includes a Render Blueprint at `render.yaml`.

1. Push the `main` branch to GitHub and create a new **Blueprint** in Render using this repository.
2. Render installs dependencies with `npm ci`, runs `npm run build`, and starts the Node service with `npm start`.
3. Once the deploy is live, open the generated `https://…onrender.com` URL. The browser client and Socket.IO share the same origin, so no separate client URL is needed.

The service binds to Render's `PORT`, serves `/health` for health checks, and allows same origin Socket.IO connections. Set `CLIENT_ORIGIN` to a comma separated list only if you later host the client on separate domains.

## Project layout

- `client/`: Vite application, game rendering, interface, and public models/media.
- `server/`: HTTP hosting and authoritative multiplayer rules.
- `shared/`: constants and deterministic movement, terrain, water, collision, and world data used on both sides.
- `maps/`: world map and placement/planning references.
