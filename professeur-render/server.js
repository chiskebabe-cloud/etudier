// « Professeur & Tableau » - serveur pour Render. Aucune dépendance.
// Variables d'environnement : SITE_USER, SITE_PASSWORD, GROQ_API_KEY, OPENROUTER_API_KEY
const http = require("http"), https = require("https"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const DIR = __dirname;
const PORT = process.env.PORT || 8765;
const USER = process.env.SITE_USER, PWD = process.env.SITE_PASSWORD;
const RELAIS = {
  "/api/groq": { host: "api.groq.com", path: "/openai/v1/chat/completions", key: process.env.GROQ_API_KEY },
  "/api/openrouter": { host: "openrouter.ai", path: "/api/v1/chat/completions", key: process.env.OPENROUTER_API_KEY }
};
const PAGE = "professeur_local.html";
const PUBLIC = new Set([PAGE]);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
  ".svg": "image/svg+xml", ".webp": "image/webp", ".ico": "image/x-icon", ".mp3": "audio/mpeg", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8" };

function egal(a, b) {
  const x = crypto.createHash("sha256").update(a).digest(), y = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(x, y);
}
function autorise(req) {
  if (!USER || !PWD) return true;
  const h = req.headers.authorization || "";
  if (!h.startsWith("Basic ")) return false;
  const dec = Buffer.from(h.slice(6), "base64").toString();
  return egal(dec, USER + ":" + PWD);
}

function relayer(req, res, cfg) {
  if (req.method !== "POST") { res.writeHead(405); return res.end(); }
  if (!cfg.key) { res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Clé API absente côté serveur"); }
  const chunks = []; let taille = 0;
  req.on("data", c => { taille += c.length; if (taille > 25e6) { req.destroy(); } else chunks.push(c); });
  req.on("end", () => {
    const corps = Buffer.concat(chunks);
    const r = https.request({ host: cfg.host, path: cfg.path, method: "POST", headers: {
      "Content-Type": "application/json", "Content-Length": corps.length, "Authorization": "Bearer " + cfg.key,
      "HTTP-Referer": "https://render.com", "X-Title": "Professeur" } }, up => {
      res.writeHead(up.statusCode, { "Content-Type": up.headers["content-type"] || "application/json" });
      up.pipe(res);
    });
    r.setTimeout(120000, () => r.destroy());
    r.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("Erreur de relais"); });
    r.end(corps);
  });
}

http.createServer((req, res) => {
  if (!autorise(req)) {
    res.writeHead(401, { "WWW-Authenticate": 'Basic realm="Professeur", charset="UTF-8"', "Content-Type": "text/plain; charset=utf-8" });
    return res.end("Authentification requise");
  }
  let p;
  try { p = decodeURIComponent(req.url.split("?")[0]); } catch (_) { res.writeHead(400); return res.end(); }
  if (RELAIS[p]) return relayer(req, res, RELAIS[p]);
  if (p === "/" || p === "/index.html") p = "/" + PAGE;
  const nom = p.replace(/^\/+/, "");
  if (!PUBLIC.has(nom)) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("Introuvable"); }
  fs.readFile(path.join(DIR, nom), (err, data) => {
    if (err) { res.writeHead(404); return res.end("Introuvable"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(nom).toLowerCase()] });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => console.log("Serveur sur le port", PORT));
