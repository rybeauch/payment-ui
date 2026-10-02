# Common Ground Payment Simulator

A React app for running a three-player payment simulation. Set each player's starting balance, send payments, and follow player balances and ledger entries as updates arrive from the API and WebSocket.

## Requirements

- Node.js 20.19+ or 22.12+
- Payment API available at `http://localhost:8080`

## Run locally

```sh
npm install
npm run dev
```

Vite serves the app (normally at `http://localhost:5173`) and proxies `/api` and `/ws` to the API on port 8080. The local proxy removes the browser `Origin` header to avoid the API's CORS rejection during development.

## API integration

- `POST /api/game/setup` creates a simulation with starting balances.
- `POST /api/payments` transfers an amount between players.
- `GET /api/games/{gameId}/players/{playerId}/ledger` loads a player's ledger.
- `GET /api/games/{gameId}/players/{playerId}/balance` loads a player's balance.

The player IDs in the UI are `player-1`, `player-2`, and `player-3`. The app uses the API's `gameId` fields and route names internally; the UI calls these sessions simulations.

## WebSocket

The OpenAPI document does not specify a WebSocket route or event envelope. The app connects to the same-origin `/ws` route, which Vite proxies to the API. Set `VITE_WS_URL` to override the WebSocket URL. Events may be a ledger entry, an array of entries, or an object containing `entries` or `entry`. Each entry should include `playerId`, `type` (`CREDIT` or `DEBIT`), and `amount`; `id` is used to deduplicate payment responses against socket events.

For an API hosted on another origin outside the Vite development proxy, set `VITE_API_BASE_URL` and configure the API's CORS policy for the frontend origin.

## Checks

```sh
npm test
npm run lint
npm run build
```

The unit tests cover WebSocket event normalization, ledger entry validation and deduplication, and signed credit/debit balance calculations.
