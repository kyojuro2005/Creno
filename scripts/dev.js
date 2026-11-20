const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.resolve(__dirname, '..');

// Lecture et parsing du fichier .env
function loadEnv() {
  const envPath = path.join(ROOT_DIR, '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const separatorIdx = trimmed.indexOf('=');
        if (separatorIdx !== -1) {
          const key = trimmed.slice(0, separatorIdx).trim();
          const val = trimmed.slice(separatorIdx + 1).trim();
          process.env[key] = val;
        }
      }
    }
    console.log('[Env] Fichier .env chargé avec succès.');

    // Synchronisation automatique de config.js sur le disque
    try {
      const configPath = path.join(ROOT_DIR, 'config.js');
      const payload = `// Généré automatiquement depuis .env
window.__ENV__ = {
  SUPABASE_URL: ${JSON.stringify(process.env.SUPABASE_URL || '')},
  SUPABASE_ANON_KEY: ${JSON.stringify(process.env.SUPABASE_ANON_KEY || '')}
};
`;
      fs.writeFileSync(configPath, payload, 'utf8');
      console.log('[Env] config.js synchronisé sur le disque.');
    } catch (e) {
      console.warn('[Env] Impossible d\'écrire config.js:', e);
    }
  } else {
    console.warn('[Env] Aucun fichier .env trouvé à la racine.');
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

// 1. Démarrage de la compilation TypeScript en mode watch
console.log('[TypeScript] Démarrage du compilateur en mode watch...');
const tscPath = path.join(ROOT_DIR, 'node_modules', 'typescript', 'bin', 'tsc');
const tscProcess = spawn(process.execPath, [tscPath, '--watch'], {
  cwd: ROOT_DIR,
  stdio: 'pipe'
});

tscProcess.stdout.on('data', (data) => {
  const msg = data.toString().trim();
  if (msg) {
    console.log(`[TypeScript] ${msg}`);
    const distPath = path.join(ROOT_DIR, 'dist', 'app.js');
    const rootAppPath = path.join(ROOT_DIR, 'app.js');
    if (fs.existsSync(distPath)) {
      try {
        fs.copyFileSync(distPath, rootAppPath);
      } catch (e) {}
    }
  }
});

tscProcess.stderr.on('data', (data) => {
  console.error(`[TypeScript Error] ${data.toString().trim()}`);
});

// 2. Gestion de la persistance locale partagée pour les tests multi-navigateurs
const DATA_DIR = path.join(ROOT_DIR, '.data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
const LOCAL_STORE_FILE = path.join(DATA_DIR, 'local_db.json');

function loadLocalDb() {
  if (fs.existsSync(LOCAL_STORE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(LOCAL_STORE_FILE, 'utf8'));
    } catch (e) {}
  }
  return { appointments: [], configs: {}, notifications: [] };
}

function saveLocalDb(db) {
  try {
    fs.writeFileSync(LOCAL_STORE_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (e) {}
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

// 3. Serveur HTTP local
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const reqUrl = parsedUrl.pathname;

  // CORS headers pour autoriser toutes les origines locales et profils Chrome
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Point d'accès dynamique /config.js injectant les variables du .env
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

  // --- API LOCALE PARTAGÉE MULTI-NAVIGATEURS ---
  if (reqUrl.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    const db = loadLocalDb();

    // 1. Rendez-vous
    if (reqUrl === '/api/appointments') {
      if (req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('user_id');
        let list = db.appointments;
        if (userId) {
          list = list.filter(a => a.user_id === userId || a.userId === userId);
        }
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
          if (existIdx >= 0) {
            db.appointments[existIdx] = newApt;
          } else {
            db.appointments.unshift(newApt);
          }

          // Création automatique de la notification pour l'administrateur
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

    // 2. Mise à jour de statut rendez-vous
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

    // 3. Notifications
    if (reqUrl === '/api/notifications') {
      if (req.method === 'GET') {
        const userId = parsedUrl.searchParams.get('user_id');
        let list = db.notifications;
        if (userId) {
          list = list.filter(n => n.user_id === userId);
        }
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

    // 4. Configuration de réservation
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
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 : Fichier non trouvé');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-cache'
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('----------------------------------------------------');
  console.log(`Serveur de développement prêt :`);
  console.log(`> Local : http://localhost:${PORT}/`);
  console.log('Variables d\'environnement injectées depuis .env');
  console.log('Appuyez sur Ctrl+C pour arrêter le serveur.');
  console.log('----------------------------------------------------');
});

process.on('SIGINT', () => {
  tscProcess.kill();
  server.close(() => {
    process.exit(0);
  });
});
