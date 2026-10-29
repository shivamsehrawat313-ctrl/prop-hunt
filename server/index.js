import { createServer } from "node:http";
import { Server } from "socket.io";
import { isInWater, waterDepth } from "../shared/water.js";

const port = Number(process.env.PORT || 3001);
const httpServer = createServer((request, response) => {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || "localhost"}`,
  );
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ ok: true, game: "shadow-hunt" }));
    return;
  }
  if (url.pathname === "/water") {
    const x = Number(url.searchParams.get("x"));
    const z = Number(url.searchParams.get("z"));
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: "Provide numeric x and z query values." }),
      );
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        isInWater: isInWater(x, z),
        waterDepth: waterDepth(x, z),
      }),
    );
    return;
  }
  response.writeHead(404);
  response.end("Socket.IO server ready");
});

const io = new Server(httpServer, { cors: { origin: "*" } });
io.on("connection", (socket) => {
  socket.emit("server:ready", { stage: "milestone-1A" });
});

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Shadow Hunt Socket.IO server listening on ${port}`);
});
