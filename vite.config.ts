import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { initDb, getAppState, saveRealResults, saveParticipantPredictions, resetDb, restoreBackup, getPlayerStatsWithCache, syncOpenFootballData } from './db'

// Initialize SQLite database on startup
initDb().catch(err => {
  console.error('Failed to initialize SQLite database:', err);
});

// https://vite.dev/config/
export default defineConfig({
  server: {
    host: true,
  },
  plugins: [
    react(),
    {
      name: 'sqlite-middleware',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // 1. Handle GET /api/data (Retrieve all state from SQLite)
          if (req.method === 'GET' && req.url === '/api/data') {
            getAppState()
              .then(state => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(state));
              })
              .catch(err => {
                console.error('Error fetching SQLite AppState:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || err }));
              });
            return;
          }

          // 1b. Handle GET /api/stats/players (Retrieve player stats for Top Scorers and Assistants)
          if (req.method === 'GET' && req.url === '/api/stats/players') {
            getPlayerStatsWithCache()
              .then(stats => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(stats));
              })
              .catch(err => {
                console.error('Error fetching player stats with cache:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message || err }));
              });
            return;
          }

          // 2. Handle POST /api/save-csv (Save real results to SQLite exclusively)
          if (req.method === 'POST' && req.url === '/api/save-csv') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                saveRealResults(data)
                  .then(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                  })
                  .catch(err => {
                    console.error('Failed to save real results to SQLite:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message || err }));
                  });
              } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid JSON body: ' + errorMsg }));
              }
            });
            return;
          }

          // 3. Handle POST /api/save-predictions (Save participant predictions to SQLite exclusively)
          if (req.method === 'POST' && req.url === '/api/save-predictions') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                saveParticipantPredictions(data.name, data.predictions, data.password)
                  .then(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                  })
                  .catch(err => {
                    console.error(`Failed to save predictions for ${data.name} to SQLite:`, err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message || err }));
                  });
              } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid JSON body: ' + errorMsg }));
              }
            });
            return;
          }

          // 4. Handle POST /api/reset-db (Wipe SQLite and reload from the original read-only CSV template)
          if (req.method === 'POST' && req.url === '/api/reset-db') {
            resetDb()
              .then(() => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              })
              .catch(err => {
                console.error('Failed to reset database:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message || err }));
              });
            return;
          }

          // 5. Handle POST /api/restore-backup (Wipe SQLite and load from uploaded backup state)
          if (req.method === 'POST' && req.url === '/api/restore-backup') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', () => {
              try {
                const data = JSON.parse(body);
                const backupPayload = data.backupData || data;
                restoreBackup(backupPayload)
                  .then(() => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true }));
                  })
                  .catch(err => {
                    console.error('Failed to restore database from backup:', err);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, error: err.message || err }));
                  });
              } catch (err: unknown) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: 'Invalid JSON body: ' + errorMsg }));
              }
            });
            return;
          }

          // 6. Handle POST /api/sync-openfootball (Sync match results and player stats from OpenFootball)
          if (req.method === 'POST' && req.url === '/api/sync-openfootball') {
            syncOpenFootballData()
              .then(result => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: result.updatedMatchesCount }));
              })
              .catch(err => {
                console.error('Failed to sync OpenFootball data:', err);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message || err }));
              });
            return;
          }

          // Fallback to standard dev server handling
          next();
        });
      }
    }
  ],
})
