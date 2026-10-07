import { createServer } from "node:http"

/**
 * Mock del AI API (send-push + crons). Los hooks de PB hacen $http.send a
 * AI_API_URL; este server captura cada request para que los tests asserten
 * qué push se habría enviado (y con qué X-Internal-Key).
 *
 * Endpoints de control (no existen en el API real):
 *   GET  /_captured  → lista de requests capturados
 *   POST /_reset     → vacía la lista
 */
export function startPushMock(port) {
  const captured = []
  const server = createServer((req, res) => {
    let body = ""
    req.on("data", (chunk) => (body += chunk))
    req.on("end", () => {
      if (req.method === "GET" && req.url === "/_captured") {
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(captured))
        return
      }
      if (req.method === "POST" && req.url === "/_reset") {
        captured.length = 0
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end("{}")
        return
      }
      if (req.url.startsWith("/strava/")) {
        // Stub de Strava (#914): captura el cuerpo en crudo (multipart/form) y
        // responde lo mínimo que usan los handlers.
        captured.push({ path: req.url, method: req.method, raw: body, auth: req.headers.authorization || null })
        const path = req.url.slice("/strava".length)
        let out = {}
        if (path === "/oauth/token") out = { access_token: "tok-nuevo", refresh_token: "ref-nuevo", expires_at: Math.floor(Date.now() / 1000) + 21600, athlete: { id: 777 } }
        else if (req.method === "POST" && path === "/api/v3/uploads") out = { id: 555, status: "Your activity is still being processed.", activity_id: null, error: null }
        else if (req.method === "GET" && path === "/api/v3/uploads/555") out = { id: 555, status: "Your activity is ready.", activity_id: 9001, error: null }
        else if (path === "/api/v3/activities") out = { id: 9002 }
        res.writeHead(200, { "Content-Type": "application/json" })
        res.end(JSON.stringify(out))
        return
      }
      let parsed = null
      try { parsed = JSON.parse(body) } catch { /* body no-JSON */ }
      captured.push({
        path: req.url,
        body: parsed,
        internalKey: req.headers["x-internal-key"] || null,
      })
      res.writeHead(200, { "Content-Type": "application/json" })
      res.end('{"ok":true}')
    })
  })
  return new Promise((resolve, reject) => {
    server.on("error", reject)
    server.listen(port, "127.0.0.1", () => resolve(server))
  })
}
