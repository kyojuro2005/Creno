# Créno — Gestion de Rendez-vous pour PME & Indépendants

Créno est une application web progressive (PWA) et une plateforme SaaS tout-en-un conçue pour simplifier la prise et la gestion de rendez-vous pour les petites et moyennes entreprises (PME), salons de coiffure, cabinets, ateliers et professionnels indépendants.

L'application combine un tableau de bord d'administration complet pour les professionnels et un portail de réservation fluide, accessible sur smartphone pour les clients sans obligation de création de compte.

---

## Fonctionnalités Clés

### 1. Portail Administrateur (Professionnels)
- **Tableau de Bord en Temps Réel :** Vue d'ensemble des demandes en attente, des prochains rendez-vous du jour et des alertes récentes.
- **Gestion Complète des Rendez-vous :** Validation, passage à l'état honoré, annulation, modification et suppression définitive.
- **Notification WhatsApp Directe :** Envoi en un clic d'un message WhatsApp pré-formaté et personnalisé au client lors de la confirmation du rendez-vous.
- **Centre de Notifications & Alertes :** Réception en direct des nouvelles réservations effectuées par les clients avec remise à zéro automatique lors de la consultation.
- **Historique & Archives Segmentées :** Classement et filtrage de tous les rendez-vous traités (confirmés, honorés et annulés) avec calcul d'heures prestées, volume de clients distincts et export au format CSV.
- **Analyse de Fréquence & Affluence :** Statistiques hebdomadaires et mensuelles des jours et tranches horaires les plus sollicités pour optimiser l'organisation de travail.
- **Paramètres de Réservation sur Mesure :**
  - Nom et secteur d'activité de l'établissement.
  - Sélection précise des jours ouvrés et des plages horaires d'ouverture/fermeture.
  - Choix de la durée des créneaux (15 min, 30 min, 45 min, 1h, 2h).
  - Détection automatique de la position GPS et génération du lien Google Maps.
  - Questions supplémentaires dynamiques (ex: *Type de prestation souhaité*, *Quartier de résidence*).
  - Générateur automatique de lien public de réservation et de code QR téléchargeable en haute définition.

### 2. Portail Client Public (PWA Mobile-First)
- **Réservation en 1 Clic :** Accessible via lien court ou code QR sans forcer la création d'un compte utilisateur.
- **Prise en Compte des Disponibilités Réelles :** Calcul dynamique des créneaux libres en évitant tout chevauchement ou réservation sur un jour fermé.
- **Installation PWA Pop-up :** Proposition d'installation sur l'écran d'accueil du smartphone après la réservation pour un accès direct comme une application native.
- **Suivi & Notifications Instantanées :** Le client suit en temps réel l'état de validation ou de refus de sa demande, avec badge d'alerte et horodatage.
- **Guidage Géographique :** Bouton direct vers l'itinéraire Google Maps de l'établissement.

---

## Architecture Technique

- **Frontend :** HTML5 sémantique, CSS3 moderne (variables CSS, flexbox/grid, design sobre sans emojis, typographie Aptos), TypeScript 5.4.
- **Backend & Données :** [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Auth, Realtime).
- **Mode PWA :** Manifest Web App (`manifest.json`) et Service Worker (`sw.js`) pour la mise en cache et le support hors-ligne.
- **Serveur de Développement & Déploiement :** Node.js avec serveur HTTP autonome (`server.js`) injectant dynamiquement la configuration.

---

## Structure du Projet

```text
├── index.html              # Interface principale (Vues Admin & Portail Client PWA)
├── styles.css              # Feuille de styles globale (Charte graphique Aptos & Sky Blue)
├── app.js                  # Fichier JavaScript compilé pour exécution directe
├── config.js               # Configuration injectée des variables Supabase
├── server.js               # Serveur HTTP Node.js pour production (Render Web Service)
├── manifest.json           # Manifest PWA pour installation smartphone/bureau
├── sw.js                   # Service Worker pour gestion du cache
├── tsconfig.json           # Configuration TypeScript
├── package.json            # Dépendances et scripts de build
├── supabase_schema.sql     # Schéma SQL complet & idempotent avec RLS
├── MEMOIRE.md              # Journal exhaustif de conception et d'évolution du projet
├── src/
│   └── app.ts              # Code source applicatif TypeScript (Admin & Client)
├── scripts/
│   ├── dev.js              # Serveur local de développement avec surveillance de fichiers
│   └── build.js            # Script de build et synchronisation des assets
├── fonts/                  # Polices typographiques Aptos
└── images/                 # Logos et icônes applicatives
```

---

## Installation & Démarrage en Local

### Prérequis
- [Node.js](https://nodejs.org/) (version 18 ou supérieure recommandée).
- Un compte [Supabase](https://supabase.com/) avec un projet configuré.

### 1. Cloner le dépôt
```bash
git clone https://github.com/kyojuro2005/Creno.git
cd Creno
```

### 2. Installer les dépendances
```bash
npm install
```

### 3. Configurer les variables d'environnement
Créez un fichier `.env` à la racine du projet en vous basant sur `.env.example` :
```env
SUPABASE_URL=https://votre-projet.supabase.co
SUPABASE_ANON_KEY=votre_cle_publique_anon
```

### 4. Initialiser la base de données Supabase
Ouvrez votre console Supabase, accédez au **SQL Editor** et exécutez l'intégralité du fichier `supabase_schema.sql`. Toutes les tables (`profiles`, `appointments`, `booking_configs`, `notifications`, `user_activity_logs`) et leurs politiques de sécurité RLS seront créées.

### 5. Lancer l'application en local
```bash
npm run dev
```
L'application est accessible sur `http://localhost:3000/`.

---

## Déploiement en Production sur Render

Le projet peut être déployé sur [Render](https://render.com/) selon deux méthodes :

### Option 1 : Déploiement en « Static Site » (Recommandé)
Le mode Site Statique est 100% gratuit et ne subit aucun délai de réveil après inactivité.

1. Connectez-vous sur [dashboard.render.com](https://dashboard.render.com/) et cliquez sur **New +** > **Static Site**.
2. Connectez votre dépôt GitHub `kyojuro2005/Creno`.
3. Configurez les paramètres :
   - **Build Command :** `npm install && npm run build`
   - **Publish Directory :** `.`
4. *(Recommandé)* Dans la section **Environment**, ajoutez vos variables :
   - `SUPABASE_URL` : Votre URL de projet Supabase.
   - `SUPABASE_ANON_KEY` : Votre clé publique anon Supabase.
5. Cliquez sur **Create Static Site**.

### Option 2 : Déploiement en « Web Service » (Node.js)
1. Cliquez sur **New +** > **Web Service**.
2. Sélectionnez le dépôt `kyojuro2005/Creno`.
3. Configurez :
   - **Environment :** `Node`
   - **Build Command :** `npm install && npm run build`
   - **Start Command :** `npm start`
4. Ajoutez les variables d'environnement `SUPABASE_URL` et `SUPABASE_ANON_KEY`.
5. Cliquez sur **Create Web Service**.

### Configuration de redirection Supabase
Une fois votre URL Render générée (ex : `https://creno.onrender.com`) :
1. Accédez à votre console Supabase > **Authentication** > **URL Configuration**.
2. Définissez **Site URL** sur votre adresse Render : `https://creno.onrender.com`.
3. Ajoutez dans **Redirect URLs** : `https://creno.onrender.com/**` puis enregistrez.

---

## Sécurité & Confidentialité

- **Isolation par RLS (Row Level Security) :** Chaque professionnel authentifié ne peut consulter et modifier que ses propres données.
- **Accès Public Contrôlé :** Les clients non connectés peuvent uniquement insérer une demande de rendez-vous sur la boutique ciblée et consulter la disponibilité horaire, sans jamais accéder aux informations sensibles d'autres clients.
- **Protection des Identifiants :** Seule la clé publique `anon` de Supabase est utilisée côté frontend. La clé `service_role` reste confidentielle et n'est jamais exposée.

---

## Licence

Projet développé pour la gestion et l'optimisation des rendez-vous professionnels. Tous droits réservés.
