const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// 1. Synchronisation dist/app.js -> app.js
const distPath = path.join(ROOT_DIR, 'dist', 'app.js');
const rootAppPath = path.join(ROOT_DIR, 'app.js');

if (fs.existsSync(distPath)) {
  try {
    fs.copyFileSync(distPath, rootAppPath);
    console.log('[Build] dist/app.js copié vers app.js avec succès.');
  } catch (e) {
    console.warn('[Build] Erreur copie dist/app.js:', e);
  }
}

// 2. Génération / Mise à jour de config.js depuis les variables d'environnement si disponibles
const configPath = path.join(ROOT_DIR, 'config.js');
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (supabaseUrl && supabaseAnonKey) {
  const payload = `// Généré automatiquement lors du build
window.__ENV__ = {
  SUPABASE_URL: ${JSON.stringify(supabaseUrl)},
  SUPABASE_ANON_KEY: ${JSON.stringify(supabaseAnonKey)}
};
`;
  fs.writeFileSync(configPath, payload, 'utf8');
  console.log('[Build] config.js mis à jour depuis les variables d\'environnement.');
} else {
  console.log('[Build] Variables d\'environnement non définies au build, conservation du config.js existant.');
}

console.log('[Build] Build terminé avec succès.');
