const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;

// Chargement basique d'un fichier .env local si présent (développement)
function loadEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    try {
      const content = fs.readFileSync(envPath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const sepIdx = trimmed.indexOf('=');
          if (sepIdx !== -1) {
            const k = trimmed.slice(0, sepIdx).trim();
            const v = trimmed.slice(sepIdx + 1).trim();
            if (!process.env[k]) process.env[k] = v;
          }
        }
      }
    } catch (e) {}
  }
}
loadEnv();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

// Gestion locale .data si utilisée
const DATA_DIR = path.join(ROOT_DIR, '.data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
const LOCAL_STORE_FILE = path.join(DATA_DIR, 'local_db.json');

function loadLocalDb() {
  if (fs.existsSync(LOCAL_STORE_FILE)) {
    try { return JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8')); } catch (e) {}
  }
  return { appointments: [], configs: {}, notifications: [] };
}

function saveLocalDb(db) {
  try { fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(db, null, 2), 'utf8'); } catch (e) {}
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch (e) { resolve({}); }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const reqUrl = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Point d'accès dynamique /config.js injectant les variables d'environnement
  if (reqUrl === '/config.js') {
    res.writeHead(200, {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache'
    });
    const configPayload = `window.__ENV__ = {
  SUPABASE_URL: ${JSON.stringify(process.env.SUPABASE_URL || '')},
  SUPABASE_ANON_KEY: ${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')}
};`;
    res.end(configPayload);
    return;
  }

  // API locale partagée
  if (reqUrl.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    const db = loadLocalDb();

    if (reqUrl === '/api/appointments') {
      if (req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('user_id');
        let list = db.appointments;
        if (userId) list = list.filter(a => a.user_id === userId || a.userId === userId);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: list }));
        return;
      }
      if (req.method === 'POST') {
        const payload = await parseJsonBody(req);
        if (payload && (payload.user_id || payload.userId)) {
          const uId = payload.user_id || payload.userId;
          const aptId = payload.id || ('apt-' + Date.now());
          const newApt = {
            id: aptId,
            user_id: uId,
            userId: uId,
            client: payload.client || payload.clientName || 'Client',
            client_name: payload.client || payload.clientName || 'Client',
            client_whatsapp: payload.client_whatsapp || payload.clientPhone || '',
            client_phone: payload.client_whatsapp || payload.clientPhone || '',
            title: payload.title || payload.serviceName || 'Rendez-vous standard',
            service_name: payload.title || payload.serviceName || 'Rendez-vous standard',
            date: payload.date || payload.appointmentDate,
            appointment_date: payload.date || payload.appointmentDate,
            time: payload.time || payload.appointmentTime,
            appointment_time: payload.time || payload.appointmentTime,
            duration: Number(payload.duration || payload.durationMinutes || 30),
            duration_minutes: Number(payload.duration || payload.durationMinutes || 30),
            status: payload.status || 'en_attente',
            notes: payload.notes || '',
            source: payload.source || 'lien_public',
            created_at: payload.created_at || new Date().toISOString()
          };
          const existIdx = db.appointments.findIndex(a => a.id === aptId);
          if (existIdx >= 0) db.appointments[existIdx] = newApt;
          else db.appointments.unshift(newApt);

          db.notifications.unshift({
            id: 'notif-' + Date.now() + Math.random().toString(36).substring(2, 6),
            user_id: uId,
            appointment_id: aptId,
            title: 'Nouvelle demande de rendez-vous',
            message: `${newApt.client} a demandé un rendez-vous le ${newApt.date} à ${newApt.time}.`,
            is_read: false,
            created_at: new Date().toISOString()
          });
          saveLocalDb(db);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, data: newApt }));
          return;
        }
      }
    }

    if (reqUrl === '/api/appointments/status' && req.method === 'POST') {
      const payload = await parseJsonBody(req);
      if (payload.id && payload.status) {
        const item = db.appointments.find(a => a.id === payload.id);
        if (item) {
          item.status = payload.status;
          saveLocalDb(db);
        }
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }
    }

    if (reqUrl === '/api/notifications') {
      if (req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('user_id');
        let list = db.notifications;
        if (userId) list = list.filter(n => n.user_id === userId);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: list }));
        return;
      }
      if (req.method === 'POST') {
        const payload = await parseJsonBody(req);
        if (payload.id) {
          const notif = db.notifications.find(n => n.id === payload.id);
          if (notif) notif.is_read = true;
        } else if (payload.user_id) {
          db.notifications.filter(n => n.user_id === payload.user_id).forEach(n => n.is_read = true);
        }
        saveLocalDb(db);
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }
    }

    if (reqUrl === '/api/config') {
      if (req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('user_id');
        const cfg = (userId && db.configs[userId]) ? db.configs[userId] : null;
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, data: cfg }));
        return;
      }
      if (req.method === 'POST') {
        const payload = await parseJsonBody(req);
        if (payload && (payload.user_id || payload.userId)) {
          const uId = payload.user_id || payload.userId;
          db.configs[uId] = payload;
          saveLocalDb(db);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true, data: payload }));
          return;
        }
      }
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Endpoint API non trouvé' }));
    return;
  }

  let finalUrl = reqUrl;
  if (finalUrl === '/') finalUrl = '/index.html';

  const safePath = path.normalize(finalUrl).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(ROOT_DIR, safePath);

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Fallback SPA vers index.html si la ressource n'est pas trouvée
      const fallbackHtml = path.join(ROOT_DIR, 'index.html');
      fs.stat(fallbackHtml, (fErr, fStats) => {
        if (!fErr && fStats.isFile()) {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          fs.createReadStream(fallbackHtml).pipe(res);
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('404 : Fichier non trouvé');
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    });

    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Serveur Créno en écoute sur le port ${PORT}`);
});

process.on('SIGTERM', () => {
  server.close(() => { process.exit(0); });
});
process.on('SIGINT', () => {
  server.close(() => { process.exit(0); });
});
