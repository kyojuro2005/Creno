# MÉMOIRE DU PROJET — CRÉNO SAAS

Ce fichier consigne l'ensemble des interventions, décisions d'architecture et étapes de développement réalisées sur le SaaS de gestion de rendez-vous pour PME et indépendants (Créno).

---

## 1. Contexte & Directives Fondamentales
- **Source de vérité :** Document `imperatif/point_de_verite_site_web.txt` (fond blanc cassé, bleu ciel principal, police Aptos, texte 12px, aucun dégradé violet/bleu, aucun tiret cadratin, aucun emoji dans les titres).
- **Backend & Données :** Supabase Auth & Database (`https://ayvpgnwdfpfcxsgdbhda.supabase.co`).
- **Gestion des clés :** Clés API stockées strictement dans `.env` et exclues via `.gitignore`.
- **Règle absolue de données :** Aucune donnée fictive ou fausse information. Remise à neuf totale de la base.

---

## 2. Structure et Modules Cibles du Dashboard
1. **Dashboard** : Vue globale des métriques réelles du mois (total RDV pris, validés, annulés, fréquence, prochains RDV).
2. **Rendez-vous** : Liste chronologique des demandes de RDV reçues, avec statuts en direct (En attente, Validé, Annulé).
3. **Historique** : Archive des rendez-vous honorés et confirmés, avec récapitulatifs hebdomadaires ou mensuels au choix.
4. **Fréquence** : Analyses chiffrées et graphiques sobres des volumes de rendez-vous par jour et par semaine.
5. **Paramètres** : Configuration du compte, sécurité, et surtout **générateur de lien public / QR code** pour la prise de rendez-vous par les clients.
6. **Compte** : Profil professionnel, email, mot de passe, déconnexion.
7. **Page publique client** : Interface épurée permettant aux clients finaux de prendre rendez-vous via le lien ou QR code du professionnel.

---

## 3. Journal des Étapes

### Initialisation (19 Novembre 2026)
- Création du fichier `MEMOIRE.md` pour le suivi continu.
- Rédaction du plan d'implémentation détaillé soumis à validation du client avant tout développement.

### Étape 1 : Nettoyage & Schéma SQL Supabase (Terminée)
- **Remise à neuf du schéma SQL (`supabase_schema.sql`) :**
  - Schéma 100% idempotent avec `drop policy if exists` et `add column if not exists` pour éviter tout conflit de ré-exécution.
  - Création des tables : `profiles`, `user_activity_logs`, `booking_configs`, `appointments`, `notifications`.
  - Suivi intégral du cycle de vie utilisateur : table `user_activity_logs` enregistrant la création de compte, les connexions et chaque action opérationnelle.
  - Statuts normalisés pour les rendez-vous : `en_attente`, `confirme`, `annule`, `honore`.
  - Trigger automatique `tr_on_new_appointment` : génère instantanément une notification et un log d'activité dès la soumission d'un RDV client.
  - Trigger automatique `on_auth_user_created` : génère le profil, la configuration de réservation par défaut, et journalise l'inscription.
  - Politiques RLS strictes : accès professionnel isolé par `user_id = auth.uid()` et autorisation publique d'insertion (`anon`) pour la prise de RDV sans compte côté client.
- **Éradication des données fictives (`src/app.ts`) :**
  - Suppression totale de `DEFAULT_APPOINTMENTS`, `DEFAULT_CLIENTS`, `DEFAULT_CATEGORIES`.
  - Initialisation par défaut à vide (`[]`) pour les rendez-vous, clients et notifications.
  - Ajout des types TypeScript `BookingConfig` et `NotificationItem`.
  - Nettoyage du mécanisme de réinitialisation pour préserver un état vierge.
- **Sécurisation :** Clés Supabase maintenues dans `.env`, configuration injectée au runtime via `scripts/dev.js`.
- **Compilation TypeScript :** `tsc` validé sans erreur, `dist/app.js` et `app.js` synchronisés.

### Étape 2 : Sidebar & Architecture des 6 Vues (Terminée)
- **Menu latéral (Sidebar) conforme aux spécifications :**
  - Nom de l'établissement dynamique avec sous-titre "SaaS Professionnel".
  - Liens : Dashboard, Rendez-vous, Notifications, Historique, Fréquence, Paramètres.
  - Badges dynamiques de compteurs réels (RDV en attente, notifications non lues).
  - Pied de sidebar : Profil du responsable avec avatar initiales et bouton discret de déconnexion.
- **6 Vues fonctionnelles (`index.html` & `src/app.ts`) :**
  - Vue Dashboard : 4 métriques réelles du mois, liste des prochains rendez-vous, bouton d'actualisation manuelle.
  - Vue Rendez-vous : Tableau complet avec filtres par statut et période, boutons d'action (Valider, Refuser, Annuler, Marquer Honoré).
  - Vue Notifications : Centre de notifications en temps réel avec marquage lu individuel ou global.
  - Vue Historique : Archives des rendez-vous honorés avec onglets de récapitulatif périodique (hebdomadaire, mensuel, global) et export CSV.
  - Vue Fréquence : Statistiques de fréquentation hebdomadaire avec barres visuelles proportionnelles sobres et indicateurs de pointe.
  - Vue Paramètres : Formulaire complet de configuration de l'établissement (nom, activité, horaires, durée créneau, jours disponibles), générateur de lien public et QR code téléchargeable, zone de maintenance locale.

### Étape 3 : Module Historique & Récapitulatifs Périodiques (Terminée)
- Filtrage automatique des rendez-vous au statut `honore`.
- Calcul dynamique des 4 indicateurs réels : total RDV honorés, total heures prestées réelles, nombre de clients distincts servis, durée moyenne par prestation.
- Bascule instantanée entre 3 filtres périodiques : Hebdomadaire (7 derniers jours), Mensuel (30 derniers jours), Tout l'historique.
- Export CSV avec encodage UTF-8 et séparateur point-virgule compatible Excel.

### Étape 4 : Gestion des Notifications Administrateur (Terminée)
- Synchronisation bidirectionnelle avec la table Supabase `notifications`.
- Cloche de notification dans l'en-tête supérieur et badge dynamique dans la sidebar.
- Marquage lu individuel ou groupé avec mise à jour immédiate de l'interface et de Supabase.

### Étape 5 : Modal de Nouveau Rendez-vous & Données Réelles (Terminée)
- Modal sobre et conforme au design system blanc cassé et bleu ciel.
- Création de rendez-vous avec calcul automatique de l'heure de fin selon la durée de prestation configurée.
- Insertion directe dans Supabase avec statut `confirme` si créé par l'administrateur, ou `en_attente` si soumis par un client.

### Étape 6 : Page Publique de Réservation Client (Terminée)
- Accès via URL dédiée `?reserver=<businessId>` ou scan du QR code généré dans les paramètres.
- Formulaire autonome pour les clients sans obligation de création de compte : nom, email, téléphone, prestation choisie, date et créneau horaire souhaité.
- Enregistrement immédiat dans la table Supabase `appointments` et déclenchement automatique de la notification administrateur.

### Étape 7 : Authentification Supabase Réelle (Terminée)
- Écran d'authentification professionnel avec bascule fluide entre Connexion et Création de compte.
- Inscription et connexion directes via Supabase Auth (`client.auth.signUp`, `client.auth.signInWithPassword`).
- Création automatique du profil dans `profiles` et de la configuration dans `booking_configs`.
- Gestion des sessions et persistance du token de connexion.

### Étape 8 : Notifications WhatsApp & Données Togo (Terminée)
- Formatage des numéros de téléphone avec indicatif Togo (`+228`).
- Formulaire client demandant impérativement le numéro WhatsApp.
- Déclenchement automatique de la notification WhatsApp (`wa.me/...`) dès que le responsable clique sur Valider un rendez-vous, avec message pré-rempli récapitulant la prestation, la date, l'heure et le nom de l'établissement.
- Bouton d'action rapide WhatsApp ajouté sur chaque rendez-vous pour un contact direct à tout instant.

### Étape 9 : Géolocalisation de l'Établissement (Terminée)
- Option activée et cochée par défaut dans les paramètres de réservation.
- Bouton de capture GPS automatique (`navigator.geolocation.getCurrentPosition`) enregistrant les coordonnées et le lien Google Maps.
- Affichage de l'emplacement et du lien direct "Voir sur la carte" sur la page de réservation client.

### Étape 10 : Intégration des Logos Officiels & Suppression des Anciens (Terminée)
- Remplacement de tous les logos générés par les fichiers officiels fournis par le client dans `images/` : `logowb.png` et `logo.jpg`.
- Suppression définitive des anciens fichiers SVG et PNG générés.
- Intégration sur l'écran d'authentification, la sidebar, la modal PWA et la page publique client.

### Étape 11 : Typographie Aptos, Survol Bleu & Suppression des Éléments Superflus (Terminée)
- Intégration de la police locale Aptos (`fonts/Aptos.ttf`, `fonts/Aptos-Bold.ttf`).
- Suppression du badge vert "Cloud Supabase Connecté" et de la coche bleue foncée sur les éléments actifs.
- Bleu de survol soutenu (`#e0f2fe`) et de sélection (`#bae6fd`).
- Éradication totale des emojis à travers toute l'application et remplacement par des icônes SVG légères.
- Suppression du badge "Agenda Ouvert • Prêt pour vos clients".

### Étape 12 : Architecture Responsive Complète & Pop-up PWA Centré (Terminée)
- **Architecture Téléphone (Mobile) :**
  - Navbar supérieure compacte : barre de recherche fluide, icône notification et bouton d'action rapide `+`.
  - Navbar inférieure fixe (Bottom Bar) avec les 6 sections clés et badges en temps réel.
  - Déconnexion et profil intégrés directement dans la section Paramètres.
  - Boutons d'action superposés deux à deux pour éviter tout débordement horizontal.
- **Architecture Tablette :** Menu hamburger avec tiroir latéral coulissant.
- **Architecture PC :** Bouton flèche permettant de rétracter ou déployer la sidebar.
- **Pop-up PWA Centré :** Boîte de dialogue modale élégante au milieu de l'écran avec fond flouté, bouton d'installation et guide iOS.

### Étape 13 : Sanitarisation des Messages d'Erreur & Nouveau Pied de Page (Terminée)
- **Messages d'erreur concis et sobres (sans jargon technique) :**
  - En cas d'identifiants erronés lors de la connexion : `L'un des deux identifiants est incorrect.`
  - En cas d'erreur de base de données, réseau, création de compte ou échec inattendu : `Une erreur est survenue.`
  - Élimination totale de tout texte technique, référence interne à Supabase, SMTP, ou pavé d'explication verbeux dans les alertes utilisateur.
- **Pied de page de l'écran de connexion / inscription :**
  - Remplacement de *"Authentification sécurisée par Supabase Auth • Données isolées"* par la signature épurée de l'application : `Créno, gérez vos rendez-vous.`.

### Étape 14 : Application Mobile Client (Sans Compte / PWA Client Dédiée) (Terminée)
- **Expérience Client Autonome sans création de compte ni mot de passe :**
  - Le client accède via le lien de l'établissement (`?reserver=<businessId>`), scan QR code ou raccourci PWA installé.
  - L'application installe et mémorise l'établissement sur le téléphone du client (`localStorage`).
- **En-tête Supérieur Client Mobile :**
  - Logo officiel Créno et nom de l'établissement à gauche.
  - Bouton cloche avec badge dynamique de notifications non lues à droite.
  - Bouton `+` compact pour ouvrir la prise de rendez-vous.
- **Barre de Navigation Inférieure Client (Bottom Bar 3 Onglets) :**
  - **1. Mes rendez-vous :** Tableau de bord personnel du client listant ses rendez-vous réservés, avec date et heure, statut en temps réel (*En attente de validation*, *Rendez-vous validé*, *Rendez-vous refusé*), motif, et case localisation avec bouton direct vers Google Maps.
  - **2. Notifications :** Fil d'alertes informant le client de la validation ou du refus de ses rendez-vous. Règle absolue respectée : l'accès à l'onglet réinitialise le compteur d'alertes à zéro et marque les notifications comme lues.
  - **3. Paramètres :** Mémorisation locale du nom, prénom et numéro WhatsApp (sans code requis), et bascule du thème (Clair / Sombre) avec persistance dans le `localStorage`.
- **Formulaire de Réservation Client Ajusté :**
  - Suppression définitive du champ email.
  - Intitulé du numéro : `Entrer un numéro (WhatsApp si possible) *`.
  - Mention d'information en gris sous le numéro : `NB : Une confirmation de votre rendez-vous pourrait vous être envoyée sur votre numéro WhatsApp ou une éventuelle relance en cas de retard de rendez-vous.`.
  - Champ de motif : `Précision du motif` (Placeholder: `Informations utiles par rapport à votre rendez-vous...`).
  - Case de localisation dédiée tout en bas des coordonnées avec libellé clair et lien cliquable `Cliquez pour voir la localisation`.
  - Redirection automatique vers "Mes rendez-vous" dès la confirmation du rendez-vous.
  - Boîte modale PWA déclenchée automatiquement après le premier rendez-vous envoyé pour inciter à l'installation directe sur le téléphone.
- **Synchronisation en Temps Réel :**
  - Détection automatique et synchronisation périodique avec Supabase et le stockage local dès que l'administrateur valide ou refuse un rendez-vous, déclenchant l'alerte chez le client.

### Étape 15 : Parcours d'Arrivée Client Direct & Déclenchement PWA Post-Confirmation (Terminée)
- **Arrivée directe sur le formulaire de prise de rendez-vous :**
  - Dès qu'un client clique sur le lien public (`?reserver=...`), il est immédiatement dirigé sur la vue formulaire de réservation (`clientViewBooking`) afin de commencer directement à remplir son rendez-vous (date, créneau horaire, nom, numéro WhatsApp, motif et localisation).
  - Aucun pop-up intempestif ne vient interrompre la saisie de sa demande.
- **Bascule Dashboard & Déclenchement PWA Ciblé :**
  - Dès qu'il clique sur *"Confirmer ma demande de rendez-vous"*, le rendez-vous est enregistré dans Supabase et dans le `localStorage` de son téléphone.
  - Le client bascule automatiquement sur son tableau de bord personnel (*Mes rendez-vous*) avec le statut *En attente de validation*.
  - Le pop-up centré d'installation PWA s'affiche instantanément avec un message ciblé : *"Installez l'application sur votre téléphone pour recevoir en direct la réponse de validation de votre rendez-vous."*
  - Ce flux garantit une conversion maximale sans friction et une incitation d'installation motivée par la réception du retour de validation de son rendez-vous.

### Étape 16 : Correction des Boutons de la Modal PWA & Clarification WhatsApp (Terminée)
- **Correction des écouteurs de la modal PWA :**
  - Extraction de la gestion de la modal PWA dans `initPwaModalEvents()`, exécutée immédiatement au démarrage de l'application avant la bifurcation en mode client.
  - Les boutons *"Installer l'application"*, *"Plus tard"*, la croix de fermeture et le clic sur l'arrière-plan sont désormais actifs et réactifs en mode client comme en mode pro.
  - Prise en charge universelle : déclenchement du prompt PWA natif si disponible, affichage des instructions iPhone/Safari ou guide Chrome/Edge si le prompt automatique est en attente.
- **Clarification et renforcement du flux WhatsApp :**
  - Dès que le responsable valide un rendez-vous (bouton *Valider*), WhatsApp s'ouvre automatiquement (`wa.me/...`) avec le message pré-rempli au format togolais (`+228`), prêt à l'envoi.
  - Sécurisation contre le blocage des pop-ups par les navigateurs : redirection directe de secours si `window.open` est bloqué par le navigateur.
  - Le client reçoit simultanément la notification en temps réel dans son application Créno.

### Étape 17 : Unicité du Lien Administrateur & Raccordement Intégral des Rendez-vous (Terminée)
- **Unicité stricte et permanente du lien de réservation (`getClientBookingUrl`) :**
  - Éradication définitive de tout identifiant partagé ou `'demo'`.
  - Chaque administrateur dispose désormais d'un identifiant 100% exclusif (son UUID Supabase unique ou un identifiant persistant dédié).
  - Deux administrateurs différents n'ont **jamais** le même lien, garantissant l'étanchéité totale de la collecte des rendez-vous.
  - Ajout d'une mention claire sous le lien dans les Paramètres : *"Lien permanent rattaché exclusivement à votre compte..."*.
- **Harmonisation complète du schéma de données Supabase :**
  - Identification de l'écart entre les colonnes requises et la table existante (`date`, `time`, `client`, `client_whatsapp`, `title`, `duration`, `status`, `notes`, `source`).
  - Adaptation exhaustive de toutes les requêtes (`select`, `insert`, `update`, `order`) dans `src/app.ts` pour correspondre à 100% au schéma de production.
  - Élimination des erreurs PostgREST PGRST204 (`appointment_date`, `duration_minutes`, `business_name` dans `profiles`).
- **Synchronisation Administrateur en Temps Réel (`initAdminSync`) :**
  - Mise en place d'un écouteur d'événements de stockage inter-onglets (`storage`) : un rendez-vous pris par un client sur le même appareil/navigateur apparaît instantanément (0 ms) sur le dashboard administrateur sans rechargement de page.
  - Polling d'arrière-plan haute disponibilité toutes les 4 secondes interrogeant Supabase.
  - Abonnement Realtime Supabase sur la table `appointments` pour une réception push immédiate des demandes clients provenant de smartphones distants.
  - Isolation des données : chaque administrateur ne voit que les rendez-vous lui appartenant strictement (`userId === state.currentUser.id`).

### Étape 18 : Paramètres Personnalisés, Questions Additionnelles, Durée 2h & Synchronisation Multi-Profils (Terminée)
- **Paramètres de Réservation & Masquage par défaut du Lien Client :**
  - Le bloc "Votre lien de réservation client" et le code QR sont désormais totalement masqués par défaut (`display: none`). Aucune information ni QR code n'apparaît tant que l'administrateur n'a pas validé ses paramètres.
  - Par défaut, aucune case de jours n'est pré-cochée (`availableDays: []`), laissant l'administrateur définir ses jours d'ouverture.
  - Suppression de la valeur forcée "Mon Établissement" : l'administrateur renseigne lui-même le nom de son établissement et son secteur d'activité.
  - Ajout de l'option de durée de créneau **2 heures (120 minutes)** dans le sélecteur (`cfgSlotDuration`), aux côtés de 15 min, 30 min, 45 min et 1 heure.
  - Bouton GPS opérationnel : `Autoriser le GPS pour détecter ma position` interroge la géolocalisation native (`navigator.geolocation.getCurrentPosition`) et remplit automatiquement les coordonnées et le lien Google Maps.
  - **Questions supplémentaires personnalisées :** Ajout du bouton `+ (Ajouter des informations supplémentaires nécessaires)` avant le bouton d'enregistrement. Permet à l'administrateur d'ajouter, modifier ou supprimer dynamiquement des questions spécifiques (ex: *Quel type de cheveux avez-vous ?*, *Dans quel quartier habitez-vous ?*).
  - Dès le clic sur *Enregistrer les paramètres de réservation*, le bloc du lien client et code QR apparaît au bas de la page et la vue défile automatiquement dessus.
- **Formulaire Client Dynamique & Collecte des Réponses :**
  - Les questions configurées par l'administrateur s'affichent automatiquement sous forme de champs texte dédiés sur la vue de réservation client (`clientCustomQuestionsContainer`).
  - Lors de la validation par le client, les réponses sont collectées et formatées de manière claire et lisible dans les détails du rendez-vous (`[Informations complémentaires] • Question : Réponse`).
  - Le pas de temps des créneaux horaires affichés et la durée du rendez-vous respectent scrupuleusement le réglage de l'administrateur (1 heure, 2 heures, 30 min...).
- **Centre de Notifications Administrateur Alimenté en Direct :**
  - Chaque réservation client déclenche la création d'une véritable notification dans `state.notifications`, `creno_notifications_${businessId}`, Supabase `notifications` et `/api/notifications`.
  - Le badge de notification s'incrémente et l'onglet Notifications affiche la carte complète avec le détail de la demande et le bouton *Marquer lu*.
- **Cloisonnement Client & Synchronisation Multi-Profils / Multi-Navigateurs :**
  - **Cloisonnement strict par établissement :** Les réservations et notifications côté client sont partitionnées par identifiant d'établissement (`creno_client_apts_${businessId}` et `creno_client_notifs_${businessId}`). Un client consultant les liens de deux administrateurs différents ne voit que les rendez-vous respectifs de chacun.
  - **API locale partagée (`scripts/dev.js`) :** Implémentation de points d'accès `/api/appointments`, `/api/appointments/status`, `/api/notifications` et `/api/config` avec en-têtes CORS universels. Les tests effectués dans des profils Chrome séparés sur `localhost:3000` se synchronisent instantanément toutes les 3 secondes via `initAdminSync()`.
  - **Mise à jour instantanée des statuts :** La validation ou le refus d'un rendez-vous par le responsable met à jour l'API locale, notifie le client en direct, et prépare le message WhatsApp pré-rempli.
- **Conformité stricte :** Zéro emoji, typographie Aptos, fond blanc cassé, palette bleu ciel et texte 12px.

### Étape 19 : Correction du Blocage des Jours d'Ouverture & Calcul Fuseau Horaire Robuste (Terminée)
- **Identification de la cause racine du message « L'établissement est fermé le [jour] » :**
  1. *Tableau de jours vide par défaut :* En initialisant `availableDays: []` dans la configuration par défaut pour laisser les cases à cocher vides dans l'administration, la condition `config.availableDays.includes(dayName)` retournait systématiquement `false` pour tous les jours de la semaine (lundi, mardi, mercredi, jeudi, vendredi, samedi, dimanche), déclarant l'établissement fermé quel que soit le jour sélectionné.
  2. *Décalage de fuseau horaire JavaScript :* `new Date('YYYY-MM-DD')` analyse la date en UTC minuit (`00:00:00Z`). Dans les fuseaux horaires à l'ouest d'UTC (ou en cas d'écart local), `d.getDay()` reculait d'un jour entier (ex : le vendredi était analysé comme jeudi).
- **Correctifs exhaustifs apportés :**
  - **Fonction `normalizeAvailableDays(raw)` :** Normalise, nettoie et formate les jours (prise en compte des tableaux JSON, chaînes PostgreSQL `{lundi,mardi...}`, et minuscules). Si aucun jour n'est restreint ou si le tableau est vide, la fonction renvoie automatiquement les jours ouvrables standards (`lundi` à `samedi`). Un établissement n'est ainsi jamais bloqué fermé 7j/7.
  - **Calcul de date insensible aux fuseaux horaires (`getDayNameFromIso`) :** Décomposition manuelle de `YYYY-MM-DD` et instanciation à midi local (`new Date(year, month, day, 12, 0, 0)`), immunisant totalement l'application contre les décalages de jour et le changement d'heure.
  - **Recherche automatique du premier jour ouvert (`findNextAvailableDate`) :** Recherche prospective sur 14 jours garantissant que la date pré-sélectionnée à l'ouverture de la réservation client tombe toujours sur un jour où l'établissement est ouvert.
  - **Prise en charge de la saisie utilisateur (`change` et `input`) :** Écouteurs d'événements doubles sur le sélecteur de date pour rafraîchir instantanément les créneaux lors de la manipulation du calendrier.
  - **Indication explicite des jours d'ouverture :** Si un jour est effectivement fermé (ex : dimanche si non sélectionné), le message informe clairement le client des jours d'ouverture disponibles : *« L'établissement est fermé le dimanche. Jours d'ouverture : Lundi, Mardi, Mercredi, Jeudi, Vendredi, Samedi. »*.
- **Validation :** Compilation TypeScript validée sans erreur (`dist/app.js` et `app.js` synchronisés).

### Étape 20 : Explication des Navigateurs (Chrome vs Edge), Synchronisation & En-tête Client Personnalisé (Terminée)
- **Explication technique de la différence Chrome vs Edge en local :**
  - Chrome et Edge sont deux applications système indépendantes disposant de mémoires locales (`localStorage`) strictement étanches.
  - Dans Chrome, la réservation client s'affichait instantanément car Chrome partage sa propre mémoire entre ses onglets.
  - Dans Edge, Edge ne peut pas lire le `localStorage` de Chrome et doit impérativement passer par le réseau (soit la base Cloud Supabase, soit l'API du serveur Node.js).
  - Deux raisons empêchaient la liaison dans Edge :
    1. *Politique de sécurité Supabase RLS :* Par défaut, Supabase bloque les écritures anonymes (`anon`) tant que la politique SQL publique n'est pas autorisée.
    2. *Serveur de développement local :* Le processus Node.js lancé en début de session n'avait pas encore rechargé les routes `/api/` ajoutées récemment (Node.js ne recharge pas son code serveur automatiquement).
  - L'hébergement n'est pas obligatoire pour tester sur le même ordinateur, mais il suffit de redémarrer le serveur local (`npm run dev`) ou d'activer la politique SQL Supabase. L'hébergement en ligne sera nécessaire uniquement pour permettre à de vrais clients sur leurs téléphones 4G/WiFi d'accéder au service.
- **En-tête de Réservation Client Personnalisé :**
  - Ajout d'une bannière complète au-dessus du formulaire de prise de rendez-vous client :
    - Tag « Réservation en ligne ».
    - Titre principal : « Prendre un rendez-vous ».
    - Mention en grands caractères : **« chez [Nom de l'établissement] »** (affichant fidèlement la structure configurée par l'administrateur, ex: *Salon Élégance*).
    - Badges de caractéristiques : secteur d'activité (ex: *Coiffure & Beauté*, *Vente au détail*...) et contact (WhatsApp / Téléphone).
  - Injection dynamique lors de l'initialisation de la vue client (`initClientPortal` et `setupClientBookingView`).
- **Validation :** Compilation TypeScript validée (`dist/app.js` et `app.js` synchronisés).

### Étape 21 : Résolution des Alertes Supabase (RLS), Affichage Notifications Admin, Dédoublonnage Client & Historique Complet (Terminée)
- **Résolution des Points Rouges Supabase (Security Advisor / RLS Disabled) :**
  - *Cause :* La désactivation antérieure du RLS (`DISABLE ROW LEVEL SECURITY`) déclenchait l'alerte critique automatique du Security Advisor de Supabase car les tables du schéma `public` étaient exposées à l'API PostgREST sans garde-fous. De plus, les politiques existantes en veille créaient l'alerte *Policy Exists RLS Disabled*.
  - *Correctif SQL :* Réactivation complète du RLS (`ENABLE ROW LEVEL SECURITY`) sur les tables `profiles`, `user_activity_logs`, `booking_configs`, `appointments`, et `notifications`, avec des politiques idempotentes équilibrées :
    - Les professionnels authentifiés ont le contrôle total sur leurs données (`auth.uid() = user_id` / `auth.uid() = id`).
    - Les clients publics (`anon`) disposent des autorisations strictement nécessaires : insertion de rendez-vous, consultation des disponibilités et suivi de leur statut, lecture de la configuration de l'établissement.
    - Script SQL mis à jour dans `supabase_schema.sql` prêt pour exécution dans le SQL Editor pour faire passer tous les boucliers Supabase au vert.
- **Correction de la Page Blanche dans l'Onglet Notifications Administrateur :**
  - *Cause :* La balise `<section class="view-panel" id="view-notifications" style="display: none;">` contenait un style inline `display: none;` qui outrepassait la classe CSS `.view-panel.active { display: block; }`. L'écran restait donc entièrement blanc au clic sur "Notifications".
  - *Correctif :* Retrait du style inline dans `index.html` et forçage programmatique dans `switchView()` (`panel.style.display = 'block'` / `'none'`).
  - *Remise à zéro automatique du badge :* Dès que l'administrateur accède à l'onglet Notifications, toutes les alertes en attente sont automatiquement marquées comme lues (`isRead: true`), le badge rouge est réinitialisé à zéro et la synchronisation avec Supabase est assurée.
- **Élimination de la Boucle de Notifications Répétées Côté Client :**
  - *Cause :* Lors de la validation d'un rendez-vous, une désynchronisation temporaire entre le statut local et le statut distant réexécutait la fonction de détection toutes les 2 à 3 secondes. `handleClientAppointmentStatusChange` empilait alors sans condition une nouvelle notification pour le même rendez-vous.
  - *Correctif :*
    1. Dédoublonnage strict dans `handleClientAppointmentStatusChange` : vérification préalable de l'existence d'une notification pour le même `appointmentId` et même statut avant toute insertion.
    2. Protection contre la régression de statut : un rendez-vous validé ou annulé ne peut plus jamais être régressé rétroactivement vers `en_attente`.
    3. Nettoyage automatique au chargement (`loadClientStorage`) : dédoublonnage de toutes les notifications existantes dans le stockage local du client.
- **Refonte Complète de l'Historique (Confirmés, Honorés & Annulés) :**
  - *Prise en compte globale des rendez-vous traités :* L'historique n'est plus limité aux rendez-vous validés/honorés, il intègre et classe également les rendez-vous annulés et refusés.
  - *Boutons de sous-filtrage rapide :* Ajout des sélecteurs `Tous les statuts`, `Confirmés & Honorés`, et `Annulés`.
  - *4 Cartes KPI actualisées :*
    1. Total des archives (ensemble des rendez-vous traités sur la période).
    2. Confirmés & Honorés (avec calcul des heures prestées).
    3. Annulés & Refusés (décompte clair des demandes non abouties).
    4. Clients distincts servis.
  - *Badges de statut dans le tableau :* Affichage contrasté et soigné (`Confirmé`, `Honoré`, `Annulé`).
  - *Compteur de la barre latérale :* L'indicateur numérique à côté de « Historique » reflète fidèlement la totalité des rendez-vous archivés.
- **Validation :** Compilation TypeScript réussie (`dist/app.js` et `app.js` synchronisés).

### Étape 22 : Préparation du Déploiement Render & Rédaction du README.md (Terminée)
- **Configuration Multi-Environnement de Déploiement :**
  - Création de `server.js` : serveur HTTP Node.js autonome dédié à la production (Render Web Service), servant les fichiers statiques, injectant dynamiquement `config.js` sans processus `tsc --watch` superflu.
  - Création de `scripts/build.js` : script de compilation et synchronisation automatique générant `config.js` à partir des variables d'environnement si renseignées lors du build.
  - Déplacement de `typescript` dans les `dependencies` de `package.json` pour garantir une compilation sans faille sur les runners Linux de Render.
  - Ajustement de `.gitignore` pour versionner `dist/app.js`, permettant un déploiement statique instantané même sans phase de build préalable.
- **Rédaction et Mise en Ligne du README.md :**
  - Fiche de présentation complète du projet Créno pour GitHub.
  - Détail des fonctionnalités Administrateur et Portail Client PWA.
  - Guide d'installation en local, initialisation Supabase et tutoriel étape par étape pour le déploiement sur Render (Static Site et Web Service).
  - Versionnement et push direct sur la branche `main` de `kyojuro2005/Creno`.

### Étape 23 : Résolution de l'Effacement Intempestif des Formulaires (Paramètres & Compte) (Terminée)
- **Identification de la cause racine de l'effacement automatique des champs :**
  - Le timer périodique d'arrière-plan de 3 secondes (`initAdminSync`) exécutait systématiquement `loadSupabaseData()`.
  - `loadSupabaseData()` rechargeait la configuration brute depuis Supabase et appelait sans condition `renderCurrentView()`.
  - `renderCurrentView()` invoquait `renderSettings()` et `renderAccount()`, qui réécrivaient immédiatement la propriété `.value` de tous les champs texte (`cfgBusinessName`, `cfgActivityType`, `cfgPhoneContact`, `accFullName`, etc.) et la propriété `.checked` de toutes les cases à cocher de jours (`cfgDays`), réinitialisant ainsi ce que l'utilisateur était en train de saisir ou de cocher.
- **Correctifs globaux apportés :**
  - **Isolation du Polling d'Arrière-Plan (`syncNewAppointmentsAndNotifs`) :** Remplacement du rechargement complet par une fonction légère dédiée uniquement aux nouveaux rendez-vous et nouvelles alertes. Elle ne recharge jamais la configuration et ne réexécute jamais `renderSettings()` ou `renderAccount()`.
  - **Protection contre l'Écrasement du Focus (`activeElement`) :** Si le curseur de l'utilisateur se trouve dans l'un des formulaires (`#formBookingConfig` ou `#formUserProfile`), toute tentative de réécriture des champs et des cases à cocher est strictement bloquée.
  - **Liaison Bidirectionnelle en Temps Réel (Live-Sync) :** Ajout d'écouteurs d'événements `input` et `change` immédiats sur les formulaires de paramètres et de profil. Chaque caractère tapé ou case de jour cochée met instantanément à jour l'état en mémoire (`state.bookingConfig`).
- **Validation :** Compilation TypeScript réussie, synchronisation `dist/app.js` et `app.js`.

### Étape 24 : Évolution Majeure Créno v2 — Inscription 3 Étapes, Prestations & Tarifs, Multi-Collaborateurs et Portail Client Enrichi (Terminée)
- **1. Onboarding & Inscription en 3 Étapes :**
  - *Étape 1 (Identifiants) :* Email professionnel, mot de passe (>= 6 caractères), confirmation du mot de passe.
  - *Étape 2 (Établissement) :* Sélecteur de secteur d'activité enrichi (Coiffure, Commerce, Esthétique, Santé, Pressing, Services, et option « Autre » ouvrant un champ texte personnalisé), nom de l'établissement, nom du responsable, téléphone WhatsApp, upload logo/photo avec compression offscreen canvas HTML5 en JPEG base64 < 100 Ko, description succincte.
  - *Étape 3 (Abonnement Créno) :* Grille des 4 formules tarifaires avec fonctionnalités complètes sur chaque formule :
    - *Essai Découverte :* 14 jours gratuits sans carte bancaire.
    - *Flexibilité Mensuelle :* 10 000 FCFA / mois.
    - *Recommandé Trimestriel :* 25 000 FCFA / 3 mois (8 333 FCFA / mois, badge « Économisez 5 000 FCFA », présélectionné par défaut).
    - *Sérénité Annuelle :* 80 000 FCFA / an (6 666 FCFA / mois, rentabilité maximale).
- **2. Prestations & Tarifs Paramétrables :**
  - Section d'administration dans les Paramètres : ajout, suppression et consultation des prestations avec nom, durée en minutes, tarif en FCFA et description.
  - Sélection dynamique côté client sur le lien public : cartes de prestation cliquables adaptant automatiquement la durée du créneau et réinitialisant la grille horaire.
- **3. Module Multi-Collaborateurs & Agendas Individuels :**
  - Table Supabase `collaborators` avec politiques RLS d'isolation par `user_id`.
  - Nouvelle vue « Collaborateurs » dans le dashboard : supervision d'équipe, 4 indicateurs de performance (Total assignés, Validés, Honorés, Taux de présence), cartes membres avec statut actif/inactif, modal d'édition avec code PIN rapide et horaires personnalisés.
  - Tableau d'agenda filtré par collaborateur sélectionné avec boutons d'action rapide.
  - Modal « Fiche & Notes Internes » pour chaque rendez-vous : réassignation de collaborateur, modification de statut, et saisie de notes confidentielles d'équipe.
- **4. Portail Client Enrichi & Actions Autonomes :**
  - Séparation des réservations en deux onglets distincts : « Rendez-vous à venir » (en attente et confirmés) et « Réservations passées » (honorés et refusés/annulés).
  - Bouton « Modifier mon créneau » sur chaque réservation active : ouvre un modal de reprogrammation permettant de choisir une nouvelle date et un nouveau créneau horaire sans recréer la réservation.
  - Bouton « Annuler ce rendez-vous » : confirmation avec motif optionnel, mise à jour instantanée du statut et transmission d'une alerte à l'administrateur.
- **5. Conformité & Qualité :**
  - Zéro emoji dans l'ensemble des écrans, boutons, notifications et code source.
  - Remplacement strict des tirets cadratins par des deux-points ou virgules.
  - Compilation TypeScript sans faute (`npm run build`).
