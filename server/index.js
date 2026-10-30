import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGameServer } from './gameServer.js';

export { createGameServer };

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT || 3000);
  const game = createGameServer({ port, host: '0.0.0.0' });
  game.listen().then((actualPort) => console.log(`Shadow Hunt server listening on ${actualPort}`))
    .catch((error) => { console.error('Could not start Shadow Hunt server:', error); process.exitCode = 1; });
  process.on('SIGINT', () => game.close().finally(() => process.exit(0)));
  process.on('SIGTERM', () => game.close().finally(() => process.exit(0)));
}
