"use strict";
// ==============================================================================
// CRÉNO — SAAS DE GESTION DE RENDEZ-VOUS POUR PME & INDÉPENDANTS
// Version : 2.5 (Clean Slate & Architecture 6 Vues)
// ==============================================================================
function getSupabaseConfig() {
    const env = window.__ENV__ || {};
    return {
        url: env.SUPABASE_URL || 'https://ayvpgnwdfpfcxsgdbhda.supabase.co',
        anonKey: env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF5dnBnbndkZnBmY3hzZ2RiaGRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTUwNDA3ODMsImV4cCI6MjExMDYxNjc4M30.ZfKblr-eELR13S4xeoweReHcNHtyw8N0tMKcG5JahaI'
    };
}
let supabaseClient = null;
function getSupabaseClient() {
    if (supabaseClient)
        return supabaseClient;
    try {
        const cfg = getSupabaseConfig();
        const sup = typeof window !== 'undefined' ? window.supabase : null;
        if (cfg.url && cfg.anonKey && sup && sup.createClient) {
            supabaseClient = sup.createClient(cfg.url, cfg.anonKey);
        }
    }
    catch (e) {
        console.warn('Erreur initialisation Supabase Client', e);
    }
    return supabaseClient;
}
// Initialisation immédiate au chargement
getSupabaseClient();
// ==============================================================================
// 2. CONFIGURATION PAR DÉFAUT & ÉTAT INITIAL
// ==============================================================================
const DEFAULT_BOOKING_CONFIG = {
    businessName: '',
    activityType: '',
    description: '',
    phoneContact: '',
    address: '',
    slotDurationMinutes: 30,
    openingTime: '09:00',
    closingTime: '18:00',
    availableDays: [],
    requirePhone: true,
    requireNotes: false,
    enableGeolocation: true,
    latitude: null,
    longitude: null,
    googleMapsUrl: '',
    customQuestions: [],
    hasConfiguredSettings: false,
    services: []
};
const ALL_WEEK_DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const STANDARD_BUSINESS_DAYS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
function getDayNameFromIso(isoDateStr) {
    if (!isoDateStr)
        return '';
    const parts = isoDateStr.split('-');
    if (parts.length !== 3)
        return '';
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    // Midi (12:00:00) en heure locale immunise totalement contre les décalages UTC et fuseaux horaires
    const d = new Date(year, month, day, 12, 0, 0);
    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    return dayNames[d.getDay()];
}
function normalizeAvailableDays(raw) {
    if (!raw)
        return STANDARD_BUSINESS_DAYS;
    let list = [];
    if (Array.isArray(raw)) {
        list = raw;
    }
    else if (typeof raw === 'string') {
        const cleaned = raw.replace(/^\{|\}$|^\[|\]$/g, '');
        list = cleaned.split(',').map(s => s.replace(/["']/g, '').trim());
    }
    const cleanedList = list
        .map(d => String(d).trim().toLowerCase())
        .filter(d => ALL_WEEK_DAYS.includes(d));
    // Si la liste est vide ou non renseignée, un établissement n'est jamais fermé 7j/7 par défaut
    return cleanedList.length > 0 ? cleanedList : STANDARD_BUSINESS_DAYS;
}
function generateUuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
const todayIso = new Date().toISOString().split('T')[0];
const state = {
    currentUser: null,
    appointments: [],
    collaborators: [],
    activeCollaboratorId: 'ALL',
    collaboratorMode: false,
    notifications: [],
    bookingConfig: { ...DEFAULT_BOOKING_CONFIG },
    currentView: 'dashboard',
    historyPeriod: 'weekly',
    historyStatusFilter: 'ALL',
    frequencyScope: 'month',
    filters: {
        search: '',
        period: 'ALL',
        status: 'ALL',
        collaboratorId: 'ALL'
    }
};
const STORAGE_KEYS = {
    userSession: 'creno_saas_user_v2',
    appointments: 'creno_saas_appointments_v2',
    bookingConfig: 'creno_saas_booking_config_v2',
    notifications: 'creno_saas_notifications_v2',
    collaborators: 'creno_saas_collaborators_v2'
};
function loadStorage() {
    try {
        const storedUser = localStorage.getItem(STORAGE_KEYS.userSession);
        if (storedUser)
            state.currentUser = JSON.parse(storedUser);
        const activeEl = document.activeElement;
        const isEditingSettings = activeEl && activeEl.closest('#formBookingConfig') !== null;
        if (!isEditingSettings) {
            const storedConfig = localStorage.getItem(STORAGE_KEYS.bookingConfig);
            state.bookingConfig = storedConfig ? JSON.parse(storedConfig) : { ...DEFAULT_BOOKING_CONFIG };
            // Si un administrateur est actif, charger sa configuration spécifique
            if (state.currentUser) {
                const userCfgRaw = localStorage.getItem(`creno_booking_config_${state.currentUser.id}`);
                if (userCfgRaw) {
                    try {
                        state.bookingConfig = JSON.parse(userCfgRaw);
                    }
                    catch { }
                }
            }
        }
        const storedAppointments = localStorage.getItem(STORAGE_KEYS.appointments);
        let apts = storedAppointments ? JSON.parse(storedAppointments) : [];
        // Si un administrateur est actif, fusionner les rendez-vous de sa boîte dédiée
        if (state.currentUser) {
            const dedicatedKey = `creno_appointments_${state.currentUser.id}`;
            const rawDedicated = localStorage.getItem(dedicatedKey);
            if (rawDedicated) {
                try {
                    const dedicatedList = JSON.parse(rawDedicated);
                    for (const d of dedicatedList) {
                        if (!apts.some(a => a.id === d.id)) {
                            apts.unshift(d);
                        }
                    }
                }
                catch { }
            }
            // Isolation absolue : ne conserver que les rendez-vous rattachés à cet administrateur
            apts = apts.filter(a => !a.userId || a.userId === state.currentUser.id);
        }
        state.appointments = apts;
        const storedNotifications = localStorage.getItem(STORAGE_KEYS.notifications);
        state.notifications = storedNotifications ? JSON.parse(storedNotifications) : [];
        // Fusionner notifications dédiées de l'administrateur
        if (state.currentUser) {
            const dedicatedNotifsKey = `creno_notifications_${state.currentUser.id}`;
            const rawDedicatedNotifs = localStorage.getItem(dedicatedNotifsKey);
            if (rawDedicatedNotifs) {
                try {
                    const notifList = JSON.parse(rawDedicatedNotifs);
                    for (const n of notifList) {
                        if (!state.notifications.some(existing => existing.id === n.id)) {
                            state.notifications.unshift(n);
                        }
                    }
                }
                catch { }
            }
        }
    }
    catch (e) {
        console.warn('Erreur lecture localStorage', e);
    }
}
function saveStorage() {
    try {
        if (state.currentUser) {
            localStorage.setItem(STORAGE_KEYS.userSession, JSON.stringify(state.currentUser));
            // Sauvegarder également dans les clés dédiées isolées de cet administrateur
            localStorage.setItem(`creno_appointments_${state.currentUser.id}`, JSON.stringify(state.appointments));
            localStorage.setItem(`creno_booking_config_${state.currentUser.id}`, JSON.stringify(state.bookingConfig));
            localStorage.setItem(`creno_notifications_${state.currentUser.id}`, JSON.stringify(state.notifications));
        }
        else {
            localStorage.removeItem(STORAGE_KEYS.userSession);
        }
        localStorage.setItem(STORAGE_KEYS.bookingConfig, JSON.stringify(state.bookingConfig));
        localStorage.setItem(STORAGE_KEYS.appointments, JSON.stringify(state.appointments));
        localStorage.setItem(STORAGE_KEYS.notifications, JSON.stringify(state.notifications));
    }
    catch (e) {
        console.error('Erreur écriture localStorage', e);
    }
}
// ==============================================================================
// 3. JOURNALISATION D'ACTIVITÉ SUPABASE & AUDIT LOG
// ==============================================================================
async function logUserActivity(action, entityType = 'general', entityId, details = {}) {
    if (!supabaseClient || !state.currentUser)
        return;
    try {
        await supabaseClient.from('user_activity_logs').insert([{
                user_id: state.currentUser.id,
                action: action,
                entity_type: entityType,
                entity_id: entityId || null,
                details: details
            }]);
    }
    catch (e) {
        console.warn('Journalisation Supabase ignorée', e);
    }
}
// ==============================================================================
// 4. CHARGEMENT ET SYNCHRONISATION SUPABASE
// ==============================================================================
async function loadSupabaseData() {
    if (!supabaseClient || !state.currentUser)
        return;
    try {
        // 1. Profil utilisateur
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', state.currentUser.id)
            .maybeSingle();
        if (profile) {
            state.currentUser.fullName = profile.full_name || state.currentUser.fullName;
            state.currentUser.phone = profile.phone || state.currentUser.phone;
            state.currentUser.activityType = profile.activity_type || state.currentUser.activityType;
            state.currentUser.subscriptionPlan = profile.subscription_plan || 'trial_14d';
            state.currentUser.createdAt = profile.created_at || state.currentUser.createdAt;
            // Calcul de la période d'essai basée sur la date de création du compte (14 jours)
            const createdAtDate = profile.created_at ? new Date(profile.created_at) : new Date();
            const trialEndsAtDate = profile.trial_ends_at
                ? new Date(profile.trial_ends_at)
                : new Date(createdAtDate.getTime() + 14 * 24 * 3600 * 1000);
            state.currentUser.trialEndsAt = trialEndsAtDate.toISOString();
            const now = new Date();
            const diffMs = trialEndsAtDate.getTime() - now.getTime();
            const remainingDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
            const isPaid = profile.subscription_status === 'actif' || profile.subscription_status === 'active' || profile.subscription_status === 'mensuel_10k' || profile.subscription_status === 'trimestriel_25k' || profile.subscription_status === 'annuel_80k';
            if (isPaid) {
                state.currentUser.subscriptionStatus = 'actif';
            }
            else if (remainingDays <= 0) {
                state.currentUser.subscriptionStatus = 'expire';
                if (profile.subscription_status !== 'expire') {
                    await supabaseClient.from('profiles').update({ subscription_status: 'expire' }).eq('id', state.currentUser.id);
                }
            }
            else {
                state.currentUser.subscriptionStatus = 'trial';
                if (remainingDays <= 5) {
                    await checkAndSendTrialExpiringNotification(remainingDays, trialEndsAtDate);
                }
            }
        }
        // 2. Configuration de réservation
        const { data: config } = await supabaseClient
            .from('booking_configs')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .maybeSingle();
        if (config) {
            if (config.business_name) {
                state.currentUser.businessName = config.business_name;
            }
            const activeEl = document.activeElement;
            const isEditingSettings = activeEl && activeEl.closest('#formBookingConfig') !== null;
            if (!isEditingSettings) {
                state.bookingConfig = {
                    businessName: config.business_name || '',
                    activityType: config.activity_type || '',
                    description: config.description || '',
                    phoneContact: config.phone_contact || '',
                    address: config.address || '',
                    slotDurationMinutes: Number(config.slot_duration_minutes) || 30,
                    openingTime: config.opening_time ? config.opening_time.substring(0, 5) : '09:00',
                    closingTime: config.closing_time ? config.closing_time.substring(0, 5) : '18:00',
                    availableDays: normalizeAvailableDays(config.available_days),
                    requirePhone: config.require_phone ?? true,
                    requireNotes: config.require_notes ?? false,
                    enableGeolocation: config.enable_geolocation ?? true,
                    latitude: config.latitude ?? null,
                    longitude: config.longitude ?? null,
                    googleMapsUrl: config.google_maps_url || '',
                    customQuestions: Array.isArray(config.custom_fields) ? config.custom_fields : [],
                    services: Array.isArray(config.services) ? config.services : [],
                    hasConfiguredSettings: Boolean(config.business_name)
                };
            }
        }
        // 3. Rendez-vous réels du professionnel (prise en charge tolérante du schéma Supabase)
        const { data: rdvList, error: rdvErr } = await supabaseClient
            .from('appointments')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .order('date', { ascending: false })
            .order('time', { ascending: false });
        if (rdvErr) {
            console.warn('Erreur chargement rendez-vous Supabase:', rdvErr.message);
        }
        let loadedApts = [];
        if (rdvList && Array.isArray(rdvList)) {
            loadedApts = rdvList.map((item) => ({
                id: item.id,
                userId: item.user_id,
                collaboratorId: item.collaborator_id || undefined,
                clientName: item.client || item.client_name || 'Client',
                clientEmail: item.client_email || '',
                clientPhone: item.client_whatsapp || item.client_phone || '',
                serviceName: item.title || item.service_name || 'Rendez-vous standard',
                servicePrice: Number(item.service_price) || 0,
                appointmentDate: item.date || item.appointment_date,
                appointmentTime: (item.time || item.appointment_time || '09:00').substring(0, 5),
                durationMinutes: item.duration || item.duration_minutes || 30,
                status: item.status,
                notes: item.notes || '',
                internalNotes: item.internal_notes || undefined,
                clientCancelReason: item.client_cancel_reason || undefined,
                source: item.source || 'lien_public',
                createdAt: item.created_at
            }));
        }
        // 3bis. Collaborateurs de l'établissement
        try {
            const { data: collabList } = await supabaseClient
                .from('collaborators')
                .select('*')
                .eq('user_id', state.currentUser.id)
                .order('created_at', { ascending: true });
            if (collabList && Array.isArray(collabList)) {
                state.collaborators = collabList.map((c) => ({
                    id: c.id,
                    userId: c.user_id,
                    fullName: c.full_name,
                    role: c.role || 'Collaborateur',
                    phone: c.phone || '',
                    avatarUrl: c.avatar_url || '',
                    availableDays: normalizeAvailableDays(c.available_days),
                    openingTime: c.opening_time ? c.opening_time.substring(0, 5) : '09:00',
                    closingTime: c.closing_time ? c.closing_time.substring(0, 5) : '18:00',
                    pinCode: c.pin_code || '1234',
                    active: c.active !== false,
                    createdAt: c.created_at
                }));
            }
        }
        catch (collabErr) {
            console.warn('Erreur chargement collaborateurs Supabase:', collabErr);
        }
        // Fusionner les rendez-vous reçus localement pour cet administrateur
        const adminKey = `creno_appointments_${state.currentUser.id}`;
        const rawLocal = localStorage.getItem(adminKey);
        if (rawLocal) {
            try {
                const localList = JSON.parse(rawLocal);
                for (const loc of localList) {
                    if (!loadedApts.some(a => a.id === loc.id)) {
                        loadedApts.unshift(loc);
                    }
                }
            }
            catch { }
        }
        state.appointments = loadedApts;
        // 4. Notifications
        const { data: notifList } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .order('created_at', { ascending: false });
        let loadedNotifs = [];
        if (notifList && Array.isArray(notifList)) {
            loadedNotifs = notifList.map((n) => ({
                id: n.id,
                appointmentId: n.appointment_id,
                title: n.title,
                message: n.message,
                isRead: n.is_read,
                createdAt: n.created_at
            }));
        }
        // Fusionner notifications locales dédiées pour cet administrateur
        const dedicatedNotifsKey = `creno_notifications_${state.currentUser.id}`;
        const rawLocalNotifs = localStorage.getItem(dedicatedNotifsKey);
        if (rawLocalNotifs) {
            try {
                const localNotifs = JSON.parse(rawLocalNotifs);
                for (const locN of localNotifs) {
                    if (!loadedNotifs.some(n => n.id === locN.id)) {
                        loadedNotifs.unshift(locN);
                    }
                }
            }
            catch { }
        }
        state.notifications = loadedNotifs;
        saveStorage();
        renderCurrentView();
    }
    catch (err) {
        console.warn('Erreur chargement Supabase', err);
    }
}
// ==============================================================================
// 5. NOTIFICATIONS ET TOASTS
// ==============================================================================
function showToast(message) {
    const toast = document.getElementById('toastNotification');
    const msgEl = document.getElementById('toastMessage');
    if (!toast || !msgEl)
        return;
    msgEl.textContent = message;
    toast.style.display = 'block';
    setTimeout(() => {
        toast.style.display = 'none';
    }, 3000);
}
function setAuthAlert(message, type = 'error') {
    const alertEl = document.getElementById('authAlert');
    if (!alertEl)
        return;
    if (!message) {
        alertEl.style.display = 'none';
        alertEl.textContent = '';
        return;
    }
    alertEl.className = `auth-alert ${type}`;
    alertEl.textContent = message;
    alertEl.style.display = 'block';
}
function updateNotificationBadge() {
    const pendingCount = state.appointments.filter(a => a.status === 'en_attente').length;
    const badgeEl = document.getElementById('badgePendingAppointments');
    if (badgeEl) {
        if (pendingCount > 0) {
            badgeEl.textContent = String(pendingCount);
            badgeEl.style.display = 'inline-flex';
        }
        else {
            badgeEl.style.display = 'none';
        }
    }
    // Historique inclut tous les rendez-vous traités (confirmés, honorés ou annulés)
    const historyCount = state.appointments.filter(a => a.status === 'confirme' || a.status === 'honore' || a.status === 'annule').length;
    const histEl = document.getElementById('sidebarCountHistory');
    if (histEl) {
        histEl.textContent = String(historyCount);
    }
    // Notifications non lues
    const unreadCount = state.notifications.filter(n => !n.isRead).length;
    const sidebarNotifBadge = document.getElementById('sidebarBadgeNotifications');
    if (sidebarNotifBadge) {
        sidebarNotifBadge.textContent = String(unreadCount);
        sidebarNotifBadge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
    }
    // Cloche de notification dans le header (affiche les demandes en attente + notifications non lues)
    const totalAlerts = pendingCount + unreadCount;
    const headerBellBadge = document.getElementById('headerNotificationBadge');
    if (headerBellBadge) {
        headerBellBadge.textContent = String(totalAlerts);
        headerBellBadge.style.display = totalAlerts > 0 ? 'flex' : 'none';
    }
    const dashPendingBadge = document.getElementById('dashPendingBadge');
    if (dashPendingBadge) {
        dashPendingBadge.textContent = `${pendingCount} en attente`;
    }
    // Badges Navbar Mobile (Bottom Navigation)
    const mobileAptBadge = document.getElementById('mobileBadgeAppointments');
    if (mobileAptBadge) {
        if (pendingCount > 0) {
            mobileAptBadge.textContent = String(pendingCount);
            mobileAptBadge.style.display = 'inline-flex';
        }
        else {
            mobileAptBadge.style.display = 'none';
        }
    }
    const mobileNotifBadge = document.getElementById('mobileBadgeNotifications');
    if (mobileNotifBadge) {
        if (unreadCount > 0) {
            mobileNotifBadge.textContent = String(unreadCount);
            mobileNotifBadge.style.display = 'inline-flex';
        }
        else {
            mobileNotifBadge.style.display = 'none';
        }
    }
}
// ==============================================================================
// 6. NAVIGATION ET ARCHITECTURE DES 6 VUES
// ==============================================================================
function switchView(viewName) {
    state.currentView = viewName;
    // Mise à jour de la classe active sur tous les liens sidebar
    document.querySelectorAll('.sidebar-link').forEach(link => {
        if (link.getAttribute('data-view') === viewName) {
            link.classList.add('active');
        }
        else {
            link.classList.remove('active');
        }
    });
    // Mise à jour de la classe active sur tous les boutons navbar mobile
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        if (btn.getAttribute('data-view') === viewName) {
            btn.classList.add('active');
        }
        else {
            btn.classList.remove('active');
        }
    });
    // Fermer le tiroir latéral sur tablette lors du changement de vue
    const appLayout = document.getElementById('appContainer');
    appLayout?.classList.remove('sidebar-open-drawer');
    // Affichage du bon panneau de contenu avec gestion explicite du style display
    document.querySelectorAll('.view-panel').forEach(panel => {
        if (panel.id === `view-${viewName}`) {
            panel.classList.add('active');
            panel.style.display = 'block';
        }
        else {
            panel.classList.remove('active');
            panel.style.display = 'none';
        }
    });
    // Dès que le responsable entre dans les notifications, marquer automatiquement comme lues
    if (viewName === 'notifications') {
        let hasUnread = false;
        state.notifications.forEach(n => {
            if (!n.isRead) {
                n.isRead = true;
                hasUnread = true;
            }
        });
        if (hasUnread) {
            saveStorage();
            const client = getSupabaseClient();
            if (client && state.currentUser) {
                client.from('notifications').update({ is_read: true }).eq('user_id', state.currentUser.id).then().catch(() => { });
            }
        }
    }
    // Défilement automatique vers le haut sur mobile
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderCurrentView();
}
function renderCurrentView() {
    renderWorkspaceHeader();
    renderSubscriptionBanner();
    updateNotificationBadge();
    if (state.currentView === 'dashboard')
        renderDashboard();
    if (state.currentView === 'appointments')
        renderAppointments();
    if (state.currentView === 'collaborators')
        renderCollaboratorsView();
    if (state.currentView === 'notifications')
        renderNotifications();
    if (state.currentView === 'history')
        renderHistory();
    if (state.currentView === 'frequency')
        renderFrequency();
    if (state.currentView === 'settings')
        renderSettings();
    if (state.currentView === 'account')
        renderAccount();
}
function renderWorkspaceHeader() {
    const brandNameEl = document.getElementById('sidebarBrandName');
    if (brandNameEl) {
        brandNameEl.textContent = state.bookingConfig.businessName || 'Créno';
    }
    const userEmailEl = document.getElementById('userEmailDisplay');
    const userAvatarEl = document.getElementById('userAvatarText');
    const userRoleEl = document.getElementById('userRoleDisplay');
    if (state.currentUser) {
        if (userEmailEl)
            userEmailEl.textContent = state.currentUser.fullName || state.currentUser.email;
        if (userRoleEl)
            userRoleEl.textContent = state.currentUser.businessName || 'Mon Compte';
        if (userAvatarEl) {
            const initial = (state.currentUser.fullName || state.currentUser.email || 'U').charAt(0).toUpperCase();
            userAvatarEl.textContent = initial;
        }
    }
    const topbarDate = document.getElementById('topbarDateDisplay');
    if (topbarDate) {
        const now = new Date();
        const options = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
        topbarDate.textContent = now.toLocaleDateString('fr-FR', options);
    }
}
function getSubscriptionPlanLabel(plan) {
    switch (plan) {
        case 'mensuel_10k': return 'Flexibilité Mensuelle (10 000 FCFA / mois)';
        case 'trimestriel_25k': return 'Formule Trimestrielle (25 000 FCFA / 3 mois)';
        case 'annuel_80k': return 'Sérénité Annuelle (80 000 FCFA / an)';
        case 'trial_14d':
        default:
            return 'Essai Découverte (14 jours)';
    }
}
function getTrialRemainingDays() {
    if (!state.currentUser?.trialEndsAt)
        return 14;
    const trialEnd = new Date(state.currentUser.trialEndsAt);
    const now = new Date();
    const diffMs = trialEnd.getTime() - now.getTime();
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}
async function checkAndSendTrialExpiringNotification(remainingDays, trialEndDate) {
    if (!state.currentUser)
        return;
    const notifTitle = `Période d'essai : plus que ${remainingDays} jour${remainingDays > 1 ? 's' : ''}`;
    // Dédoublonnage : ne pas répéter la notification si déjà présente
    const alreadyNotified = state.notifications.some(n => n.title.includes("Période d'essai"));
    if (alreadyNotified)
        return;
    const dateEndFormatted = formatDisplayDate(trialEndDate.toISOString().split('T')[0]);
    const notifItem = {
        id: generateUuid(),
        title: notifTitle,
        message: `Votre essai gratuit se termine le ${dateEndFormatted}. Choisissez votre formule d'abonnement dès maintenant pour conserver vos réservations et vos accès actifs.`,
        createdAt: new Date().toISOString(),
        isRead: false
    };
    state.notifications.unshift(notifItem);
    saveStorage();
    updateNotificationBadge();
    const client = getSupabaseClient();
    if (client) {
        try {
            await client.from('notifications').insert([{
                    id: notifItem.id,
                    user_id: state.currentUser.id,
                    title: notifItem.title,
                    message: notifItem.message,
                    is_read: false
                }]);
        }
        catch (e) { }
    }
}
function renderSubscriptionBanner() {
    const banner = document.getElementById('subscriptionGlobalBanner');
    if (!banner)
        return;
    if (!state.currentUser) {
        banner.style.display = 'none';
        return;
    }
    const isPaid = state.currentUser.subscriptionStatus === 'actif' || state.currentUser.subscriptionStatus === 'active';
    const remaining = getTrialRemainingDays();
    const isExpired = state.currentUser.subscriptionStatus === 'expire' || (!isPaid && remaining <= 0);
    if (isExpired) {
        state.currentUser.subscriptionStatus = 'expire';
        banner.className = 'subscription-alert-bar danger';
        banner.innerHTML = `
      <div class="subscription-alert-bar-inner">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        <div>
          <strong>Période d'essai terminée : vos réservations en ligne sont suspendues.</strong>
          <span style="margin-left: 6px; font-size: 12px;">Activez une formule d'abonnement pour réactiver instantanément votre établissement.</span>
        </div>
      </div>
      <button type="button" class="btn-primary btn-mini" id="btnBannerSubscribeNow">Activer mon abonnement</button>
    `;
        banner.style.display = 'flex';
        document.getElementById('btnBannerSubscribeNow')?.addEventListener('click', openSubscriptionModal);
    }
    else if (!isPaid && remaining <= 5 && remaining > 0) {
        banner.className = 'subscription-alert-bar warning';
        banner.innerHTML = `
      <div class="subscription-alert-bar-inner">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <div>
          <strong>Période d'essai Créno : plus que ${remaining} jour${remaining > 1 ? 's' : ''} d'essai gratuit.</strong>
          <span style="margin-left: 6px; font-size: 12px;">Souscrivez dès maintenant pour éviter toute interruption de vos rendez-vous.</span>
        </div>
      </div>
      <button type="button" class="btn-primary btn-mini" id="btnBannerSubscribeWarning">Choisir une formule</button>
    `;
        banner.style.display = 'flex';
        document.getElementById('btnBannerSubscribeWarning')?.addEventListener('click', openSubscriptionModal);
    }
    else {
        banner.style.display = 'none';
    }
}
function openSubscriptionModal() {
    const modal = document.getElementById('modalSubscriptionPlans');
    if (modal)
        modal.style.display = 'flex';
}
async function handleConfirmSubscriptionPlan() {
    if (!state.currentUser)
        return;
    const selectedRadio = document.querySelector('input[name="modalSubPlan"]:checked');
    const chosenPlan = selectedRadio?.value || 'trimestriel_25k';
    // Règle formelle : le plan gratuit ne peut pas être choisi une deuxième fois
    if (chosenPlan === 'trial_14d') {
        alert("La période d'essai gratuit ne peut pas être réactivée. Veuillez choisir une formule payante.");
        return;
    }
    state.currentUser.subscriptionPlan = chosenPlan;
    state.currentUser.subscriptionStatus = 'actif';
    saveStorage();
    const client = getSupabaseClient();
    if (client) {
        try {
            await client.from('profiles').update({
                subscription_plan: chosenPlan,
                subscription_status: 'actif',
                updated_at: new Date().toISOString()
            }).eq('id', state.currentUser.id);
            await logUserActivity('activation_abonnement', 'profile', state.currentUser.id, {
                plan: chosenPlan
            });
        }
        catch (e) {
            console.warn('Erreur activation abonnement Supabase', e);
        }
    }
    const modal = document.getElementById('modalSubscriptionPlans');
    if (modal)
        modal.style.display = 'none';
    renderCurrentView();
    showToast('Abonnement Créno activé avec succès.');
}
// ==============================================================================
// 7. VUE 1 : DASHBOARD (SYNTHÈSE DU MOIS EN COURS)
// ==============================================================================
function renderDashboard() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    // Filtrer les rendez-vous du mois en cours
    const thisMonthRdv = state.appointments.filter(a => {
        if (!a.appointmentDate)
            return false;
        const d = new Date(a.appointmentDate);
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
    });
    const total = thisMonthRdv.length;
    const confirmed = thisMonthRdv.filter(a => a.status === 'confirme').length;
    const cancelled = thisMonthRdv.filter(a => a.status === 'annule').length;
    const honored = thisMonthRdv.filter(a => a.status === 'honore').length;
    const pending = thisMonthRdv.filter(a => a.status === 'en_attente').length;
    const rate = total > 0 ? Math.round(((confirmed + honored) / total) * 100) : 0;
    // Calcul de la fréquence moyenne sur le mois
    const elapsedWeeks = Math.max(1, Math.ceil(now.getDate() / 7));
    const avgMonthlyFreq = (total / elapsedWeeks).toFixed(1);
    // Mise à jour des KPI
    const kpiTotal = document.getElementById('dashKpiTotal');
    const kpiConfirmed = document.getElementById('dashKpiConfirmed');
    const kpiConfirmedRate = document.getElementById('dashKpiConfirmedRate');
    const kpiCancelled = document.getElementById('dashKpiCancelled');
    const kpiHonored = document.getElementById('dashKpiHonored');
    const kpiFreq = document.getElementById('dashKpiFrequency');
    const kpiFreqMeta = document.getElementById('dashKpiFrequencyMeta');
    if (kpiTotal)
        kpiTotal.textContent = String(total);
    if (kpiConfirmed)
        kpiConfirmed.textContent = String(confirmed);
    if (kpiConfirmedRate)
        kpiConfirmedRate.textContent = `${rate}% de validation`;
    if (kpiCancelled)
        kpiCancelled.textContent = String(cancelled);
    if (kpiHonored)
        kpiHonored.textContent = String(honored);
    if (kpiFreq)
        kpiFreq.textContent = `${avgMonthlyFreq} / sem`;
    if (kpiFreqMeta) {
        kpiFreqMeta.textContent = total > 0 ? `${rate}% de concrétisation` : "Rythme d'activité";
    }
    // Bannière d'accueil vivante et personnalisée
    const welcomeNameEl = document.getElementById('dashWelcomeName');
    const welcomeDateEl = document.getElementById('dashWelcomeDate');
    const welcomeAvatarEl = document.getElementById('dashWelcomeAvatar');
    const greetingName = state.bookingConfig.businessName || state.currentUser?.businessName || state.currentUser?.fullName || (state.currentUser?.email ? state.currentUser.email.split('@')[0] : 'Responsable');
    if (welcomeNameEl)
        welcomeNameEl.textContent = greetingName;
    if (welcomeAvatarEl)
        welcomeAvatarEl.textContent = (greetingName || 'C').charAt(0).toUpperCase();
    if (welcomeDateEl) {
        const dateFormatted = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        const capitalizedDate = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);
        if (pending > 0) {
            welcomeDateEl.textContent = `${capitalizedDate} : Vous avez ${pending} demande${pending > 1 ? 's' : ''} en attente de validation.`;
        }
        else {
            welcomeDateEl.textContent = `${capitalizedDate} : Votre planning est à jour et prêt pour vos clients.`;
        }
    }
    // Colonne 1 : Demandes en attente (triées les plus récentes en haut)
    const pendingList = state.appointments
        .filter(a => a.status === 'en_attente')
        .sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate) || b.appointmentTime.localeCompare(a.appointmentTime));
    const pendingListEl = document.getElementById('dashPendingList');
    if (pendingListEl) {
        if (pendingList.length === 0) {
            pendingListEl.innerHTML = `
        <div class="empty-state-box human-empty">
          <div class="empty-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <p class="empty-state-text">Tout est à jour ! Aucune demande en attente actuellement.</p>
        </div>`;
        }
        else {
            pendingListEl.innerHTML = pendingList.slice(0, 5).map(apt => `
        <div class="dashboard-item-card">
          <div class="dashboard-item-main">
            <span class="dashboard-item-title">${escapeHtml(apt.clientName)}</span>
            <span class="dashboard-item-meta">${formatDisplayDate(apt.appointmentDate)} à ${apt.appointmentTime} &bull; ${escapeHtml(apt.serviceName)}</span>
          </div>
          <div class="dashboard-item-actions">
            <button class="btn-primary btn-mini btn-validate-apt" data-id="${apt.id}">Valider</button>
            <button class="btn-danger-subtle btn-mini btn-cancel-apt" data-id="${apt.id}">Refuser</button>
          </div>
        </div>
      `).join('');
        }
    }
    // Colonne 2 : Prochains rendez-vous programmés
    const upcomingList = state.appointments
        .filter(a => a.status === 'confirme' && a.appointmentDate >= todayIso)
        .sort((a, b) => a.appointmentDate.localeCompare(b.appointmentDate) || a.appointmentTime.localeCompare(b.appointmentTime));
    const upcomingListEl = document.getElementById('dashUpcomingList');
    if (upcomingListEl) {
        if (upcomingList.length === 0) {
            upcomingListEl.innerHTML = `
        <div class="empty-state-box human-empty">
          <div class="empty-icon-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
              <line x1="16" y1="2" x2="16" y2="6"></line>
              <line x1="8" y1="2" x2="8" y2="6"></line>
              <line x1="3" y1="10" x2="21" y2="10"></line>
            </svg>
          </div>
          <p class="empty-state-text">Aucun rendez-vous confirmé à venir. Partagez votre lien de réservation pour recevoir des demandes.</p>
        </div>`;
        }
        else {
            upcomingListEl.innerHTML = upcomingList.slice(0, 5).map(apt => `
        <div class="dashboard-item-card">
          <div class="dashboard-item-main">
            <span class="dashboard-item-title">${escapeHtml(apt.clientName)}</span>
            <span class="dashboard-item-meta">${formatDisplayDate(apt.appointmentDate)} à ${apt.appointmentTime} &bull; ${apt.durationMinutes} min</span>
          </div>
          <div class="dashboard-item-actions">
            <button class="btn-secondary btn-mini btn-honor-apt" data-id="${apt.id}">Marquer Honoré</button>
          </div>
        </div>
      `).join('');
        }
    }
    bindDashboardItemButtons();
}
function bindDashboardItemButtons() {
    document.querySelectorAll('.btn-validate-apt').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (id)
                updateAppointmentStatus(id, 'confirme');
        });
    });
    document.querySelectorAll('.btn-cancel-apt').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (id)
                updateAppointmentStatus(id, 'annule');
        });
    });
    document.querySelectorAll('.btn-honor-apt').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (id)
                updateAppointmentStatus(id, 'honore');
        });
    });
}
// ==============================================================================
// 8. VUE 2 : RENDEZ-VOUS (CHRONOLOGIQUE DU PLUS RÉCENT AU PLUS VIEUX)
// ==============================================================================
function getFilteredAppointments() {
    return state.appointments.filter(item => {
        // Filtre texte
        if (state.filters.search) {
            const q = state.filters.search.toLowerCase();
            const matchName = (item.clientName || '').toLowerCase().includes(q);
            const matchPhone = (item.clientPhone || '').toLowerCase().includes(q);
            const matchService = (item.serviceName || '').toLowerCase().includes(q);
            const matchNotes = (item.notes || '').toLowerCase().includes(q);
            if (!matchName && !matchPhone && !matchService && !matchNotes)
                return false;
        }
        // Filtre période
        if (state.filters.period !== 'ALL') {
            const itemDate = new Date(item.appointmentDate);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            if (state.filters.period === 'TODAY') {
                if (item.appointmentDate !== todayIso)
                    return false;
            }
            else if (state.filters.period === 'WEEK') {
                const diffDays = Math.abs((itemDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays > 7)
                    return false;
            }
            else if (state.filters.period === 'MONTH') {
                if (itemDate.getMonth() !== now.getMonth() || itemDate.getFullYear() !== now.getFullYear()) {
                    return false;
                }
            }
        }
        // Filtre statut
        if (state.filters.status !== 'ALL' && item.status !== state.filters.status) {
            return false;
        }
        // Filtre collaborateur
        if (state.filters.collaboratorId && state.filters.collaboratorId !== 'ALL') {
            if (item.collaboratorId !== state.filters.collaboratorId)
                return false;
        }
        return true;
    }).sort((a, b) => {
        // Ordre chronologique inversé : les plus récents en haut !
        const cmpDate = b.appointmentDate.localeCompare(a.appointmentDate);
        if (cmpDate !== 0)
            return cmpDate;
        return b.appointmentTime.localeCompare(a.appointmentTime);
    });
}
function renderAppointments() {
    // Mettre à jour le sélecteur de collaborateurs dans les filtres
    const selectCollabFilter = document.getElementById('filterRdvCollaborator');
    if (selectCollabFilter) {
        const curVal = state.filters.collaboratorId || 'ALL';
        selectCollabFilter.innerHTML = `
      <option value="ALL" ${curVal === 'ALL' ? 'selected' : ''}>Tous les collaborateurs</option>
      ${state.collaborators.map(c => `
        <option value="${c.id}" ${curVal === c.id ? 'selected' : ''}>${escapeHtml(c.fullName)} (${escapeHtml(c.role)})</option>
      `).join('')}
    `;
        if (!selectCollabFilter._hasListener) {
            selectCollabFilter._hasListener = true;
            selectCollabFilter.addEventListener('change', () => {
                state.filters.collaboratorId = selectCollabFilter.value;
                renderAppointments();
            });
        }
    }
    const list = getFilteredAppointments();
    const tbody = document.getElementById('appointmentsTableBody');
    const emptyState = document.getElementById('emptyAppointmentsState');
    const countSummary = document.getElementById('appointmentCountSummary');
    if (!tbody)
        return;
    tbody.innerHTML = '';
    if (list.length === 0) {
        if (emptyState)
            emptyState.style.display = 'block';
    }
    else {
        if (emptyState)
            emptyState.style.display = 'none';
        list.forEach(apt => {
            const tr = document.createElement('tr');
            const contactInfo = [apt.clientPhone, apt.clientEmail].filter(Boolean).join(' &bull; ');
            const collab = state.collaborators.find(c => c.id === apt.collaboratorId);
            tr.innerHTML = `
        <td class="whitespace-nowrap font-mono">
          <strong>${formatDisplayDate(apt.appointmentDate)}</strong><br>
          <span class="text-muted">${apt.appointmentTime}</span>
        </td>
        <td>
          <strong>${escapeHtml(apt.clientName)}</strong>
          ${contactInfo ? `<br><span class="text-muted" style="font-size: 11px;">${escapeHtml(contactInfo)}</span>` : ''}
        </td>
        <td>
          <strong>${escapeHtml(apt.serviceName)}</strong>
          ${apt.servicePrice ? `<br><span class="text-muted" style="font-size: 11px; font-weight: 600;">${apt.servicePrice.toLocaleString('fr-FR')} FCFA</span>` : ''}
        </td>
        <td>
          ${collab ? `<strong>${escapeHtml(collab.fullName)}</strong><br><span class="text-muted" style="font-size: 11px;">${escapeHtml(collab.role)}</span>` : '<span class="text-muted" style="font-size: 11px;">Non assigné</span>'}
        </td>
        <td class="font-mono">${apt.durationMinutes} min</td>
        <td>
          <span class="badge-status status-${apt.status}">
            ${getStatusLabel(apt.status)}
          </span>
        </td>
        <td>
          <span class="text-muted" style="font-size: 11px;">
            ${apt.source === 'lien_public' ? 'Lien client' : 'Manuel'}
          </span>
        </td>
        <td class="text-muted" style="max-width: 180px; font-size: 12px;">
          ${apt.notes ? `<div>${escapeHtml(apt.notes)}</div>` : ''}
          ${apt.internalNotes ? `<div style="color: #0284c7; font-size: 11px; font-weight: 600; margin-top: 2px;">Note : ${escapeHtml(apt.internalNotes)}</div>` : ''}
          ${!apt.notes && !apt.internalNotes ? '-' : ''}
        </td>
        <td class="text-center">
          <div style="display: inline-flex; gap: 4px; align-items: center; flex-wrap: wrap; justify-content: center;">
            ${apt.status === 'en_attente' ? `<button class="btn-mini btn-primary btn-validate-apt" data-id="${apt.id}">Valider</button>` : ''}
            ${apt.status === 'confirme' ? `<button class="btn-mini btn-secondary btn-honor-apt" data-id="${apt.id}">Honoré</button>` : ''}
            ${apt.status !== 'annule' && apt.status !== 'honore' ? `<button class="btn-mini btn-danger-subtle btn-cancel-apt" data-id="${apt.id}">Refuser</button>` : ''}
            ${apt.clientPhone ? `<button class="btn-mini btn-whatsapp-action btn-notify-wa" data-id="${apt.id}" title="Notifier sur WhatsApp">WhatsApp</button>` : ''}
            <button class="btn-mini btn-subtle btn-open-internal-notes" data-id="${apt.id}">Fiche / Notes</button>
            <button class="btn-mini btn-edit-appointment" data-id="${apt.id}">Éditer</button>
            <button class="btn-mini btn-delete-appointment text-danger" data-id="${apt.id}">&times;</button>
          </div>
        </td>
      `;
            tbody.appendChild(tr);
        });
    }
    if (countSummary) {
        countSummary.textContent = `${list.length} rendez-vous affiché(s) sur ${state.appointments.length} total`;
    }
    bindAppointmentsTableButtons();
}
function bindAppointmentsTableButtons() {
    bindDashboardItemButtons();
    document.querySelectorAll('.btn-notify-wa').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            const apt = state.appointments.find(a => a.id === id);
            if (apt)
                notifyClientViaWhatsApp(apt);
        });
    });
    document.querySelectorAll('.btn-edit-appointment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (id)
                openAppointmentModal(id);
        });
    });
    document.querySelectorAll('.btn-open-internal-notes').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (id)
                openAppointmentInternalNotesModal(id);
        });
    });
    document.querySelectorAll('.btn-delete-appointment').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (id && confirm('Confirmer la suppression définitive de ce rendez-vous ?')) {
                deleteAppointment(id);
            }
        });
    });
}
function getStatusLabel(status) {
    switch (status) {
        case 'en_attente': return 'En attente';
        case 'confirme': return 'Confirmé';
        case 'annule': return 'Annulé';
        case 'honore': return 'Honoré';
        default: return status;
    }
}
// ==============================================================================
// 8bis. VUE COLLABORATEURS (MODULE MULTI-COLLABORATEURS & AGENDAS INDIVIDUELS)
// ==============================================================================
function renderCollaboratorsView() {
    const container = document.getElementById('collaboratorsCardsContainer');
    const selector = document.getElementById('collabViewSelector');
    const indicator = document.getElementById('collabActiveIndicator');
    // Remplir le sélecteur de collaborateur
    if (selector) {
        const currentVal = state.activeCollaboratorId || 'ALL';
        selector.innerHTML = `
      <option value="ALL" ${currentVal === 'ALL' ? 'selected' : ''}>Vue globale de l'équipe (Administrateur)</option>
      ${state.collaborators.map(c => `
        <option value="${c.id}" ${currentVal === c.id ? 'selected' : ''}>${escapeHtml(c.fullName)} (${escapeHtml(c.role)})</option>
      `).join('')}
    `;
        if (!selector._hasListener) {
            selector._hasListener = true;
            selector.addEventListener('change', () => {
                state.activeCollaboratorId = selector.value;
                renderCollaboratorsView();
            });
        }
    }
    // Mettre à jour le texte du mode
    if (indicator) {
        if (state.activeCollaboratorId === 'ALL') {
            indicator.textContent = "Mode : Supervision générale";
        }
        else {
            const c = state.collaborators.find(x => x.id === state.activeCollaboratorId);
            indicator.textContent = c ? `Collaborateur : ${c.fullName}` : "Mode collaborateur";
        }
    }
    // Filtrer les rendez-vous pour ce collaborateur
    const filteredApts = state.activeCollaboratorId === 'ALL'
        ? state.appointments
        : state.appointments.filter(a => a.collaboratorId === state.activeCollaboratorId);
    // Indicateurs de performance individuels
    const totalAssigned = filteredApts.length;
    const confirmed = filteredApts.filter(a => a.status === 'confirme').length;
    const honored = filteredApts.filter(a => a.status === 'honore').length;
    const rate = totalAssigned > 0 ? Math.round(((confirmed + honored) / totalAssigned) * 100) : 100;
    const kpiTotal = document.getElementById('collabKpiTotal');
    const kpiConfirmed = document.getElementById('collabKpiConfirmed');
    const kpiHonored = document.getElementById('collabKpiHonored');
    const kpiRate = document.getElementById('collabKpiRate');
    if (kpiTotal)
        kpiTotal.textContent = String(totalAssigned);
    if (kpiConfirmed)
        kpiConfirmed.textContent = String(confirmed);
    if (kpiHonored)
        kpiHonored.textContent = String(honored);
    if (kpiRate)
        kpiRate.textContent = `${rate}%`;
    // Rendu des cartes des collaborateurs
    if (container) {
        if (state.collaborators.length === 0) {
            container.innerHTML = `
        <div class="empty-state-box human-empty" style="grid-column: 1 / -1;">
          <p class="empty-state-text">Aucun collaborateur enregistré pour le moment. Cliquez sur "+ Ajouter un collaborateur" pour constituer votre équipe.</p>
        </div>
      `;
        }
        else {
            container.innerHTML = state.collaborators.map(c => {
                const daysLabel = c.availableDays.map(d => d.substring(0, 3)).join(', ');
                const initial = c.fullName ? c.fullName.charAt(0).toUpperCase() : 'C';
                return `
          <div class="collaborator-card ${c.active ? '' : 'opacity-60'}">
            <div class="collaborator-card-header">
              <div class="collaborator-avatar">${initial}</div>
              <div class="collaborator-info">
                <div class="collaborator-name">${escapeHtml(c.fullName)}</div>
                <div class="collaborator-role">${escapeHtml(c.role)}</div>
              </div>
            </div>

            <div class="collaborator-details-list">
              <div><strong>Disponibilités :</strong> ${daysLabel}</div>
              <div><strong>Horaires :</strong> ${c.openingTime} à ${c.closingTime}</div>
              <div><strong>Code PIN :</strong> ${escapeHtml(c.pinCode || '1234')}</div>
              ${c.phone ? `<div><strong>Téléphone :</strong> ${escapeHtml(c.phone)}</div>` : ''}
            </div>

            <div class="collaborator-actions">
              <button type="button" class="btn-primary btn-mini btn-view-collab-agenda" data-id="${c.id}">Voir agenda</button>
              <button type="button" class="btn-subtle btn-mini btn-edit-collab" data-id="${c.id}">Modifier</button>
              <button type="button" class="btn-danger-subtle btn-mini btn-toggle-collab-active" data-id="${c.id}">
                ${c.active ? 'Désactiver' : 'Activer'}
              </button>
            </div>
          </div>
        `;
            }).join('');
        }
    }
    renderCollaboratorAppointmentsTable(filteredApts);
    bindCollaboratorsButtons();
}
function renderCollaboratorAppointmentsTable(list) {
    const tbody = document.getElementById('collabAppointmentsTableBody');
    const emptyState = document.getElementById('collabEmptyAppointments');
    if (!tbody)
        return;
    tbody.innerHTML = '';
    if (list.length === 0) {
        if (emptyState)
            emptyState.style.display = 'block';
        return;
    }
    if (emptyState)
        emptyState.style.display = 'none';
    list.forEach(apt => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
      <td class="whitespace-nowrap font-mono">
        <strong>${formatDisplayDate(apt.appointmentDate)}</strong><br>
        <span class="text-muted">${apt.appointmentTime}</span>
      </td>
      <td>
        <strong>${escapeHtml(apt.clientName)}</strong><br>
        <span class="text-muted" style="font-size: 11px;">${escapeHtml(apt.clientPhone || '')}</span>
      </td>
      <td>
        <strong>${escapeHtml(apt.serviceName)}</strong>
        ${apt.servicePrice ? `<br><span class="text-muted" style="font-size: 11px; font-weight: 600;">${apt.servicePrice.toLocaleString('fr-FR')} FCFA</span>` : ''}
      </td>
      <td>
        <span class="badge-status status-${apt.status}">
          ${getStatusLabel(apt.status)}
        </span>
      </td>
      <td style="font-size: 12px; color: var(--text-muted); max-width: 180px;">
        ${apt.internalNotes ? `<span style="color: #0284c7; font-weight: 600;">${escapeHtml(apt.internalNotes)}</span>` : (apt.notes ? escapeHtml(apt.notes) : '-')}
      </td>
      <td class="text-center">
        <div style="display: inline-flex; gap: 4px; align-items: center; justify-content: center; flex-wrap: wrap;">
          ${apt.status === 'en_attente' ? `<button class="btn-mini btn-primary btn-validate-apt" data-id="${apt.id}">Accepter</button>` : ''}
          ${apt.status !== 'annule' && apt.status !== 'honore' ? `<button class="btn-mini btn-danger-subtle btn-cancel-apt" data-id="${apt.id}">Refuser</button>` : ''}
          <button class="btn-mini btn-subtle btn-open-internal-notes" data-id="${apt.id}">Notes / Fiche</button>
        </div>
      </td>
    `;
        tbody.appendChild(tr);
    });
}
function bindCollaboratorsButtons() {
    // Voir agenda collaborateur
    document.querySelectorAll('.btn-view-collab-agenda').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (id) {
                state.activeCollaboratorId = id;
                renderCollaboratorsView();
                document.getElementById('collabAppointmentsTable')?.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });
    // Modifier collaborateur
    document.querySelectorAll('.btn-edit-collab').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (id)
                openCollaboratorModal(id);
        });
    });
    // Activer / Désactiver collaborateur
    document.querySelectorAll('.btn-toggle-collab-active').forEach(btn => {
        btn.addEventListener('click', async () => {
            const id = btn.getAttribute('data-id');
            const collab = state.collaborators.find(c => c.id === id);
            if (collab) {
                collab.active = !collab.active;
                saveStorage();
                renderCollaboratorsView();
                const client = getSupabaseClient();
                if (client) {
                    try {
                        await client.from('collaborators').update({ active: collab.active }).eq('id', id);
                    }
                    catch (e) { }
                }
                showToast(collab.active ? 'Collaborateur activé.' : 'Collaborateur désactivé.');
            }
        });
    });
    // Boutons valider / refuser dans l'agenda collaborateur
    bindAppointmentsTableButtons();
}
function openCollaboratorModal(collabId) {
    const modal = document.getElementById('modalCollaborator');
    const title = document.getElementById('modalCollaboratorTitle');
    const inputId = document.getElementById('collabEditId');
    const inputName = document.getElementById('collabFullName');
    const inputRole = document.getElementById('collabRole');
    const inputPhone = document.getElementById('collabPhone');
    const inputPin = document.getElementById('collabPinCode');
    const inputOpen = document.getElementById('collabOpeningTime');
    const inputClose = document.getElementById('collabClosingTime');
    if (!modal)
        return;
    if (collabId) {
        const c = state.collaborators.find(x => x.id === collabId);
        if (!c)
            return;
        if (title)
            title.textContent = "Modifier le collaborateur";
        if (inputId)
            inputId.value = c.id;
        if (inputName)
            inputName.value = c.fullName;
        if (inputRole)
            inputRole.value = c.role;
        if (inputPhone)
            inputPhone.value = c.phone || '';
        if (inputPin)
            inputPin.value = c.pinCode || '1234';
        if (inputOpen)
            inputOpen.value = c.openingTime || '09:00';
        if (inputClose)
            inputClose.value = c.closingTime || '18:00';
        document.querySelectorAll('input[name="collabDays"]').forEach(cb => {
            cb.checked = c.availableDays.includes(cb.value);
        });
    }
    else {
        if (title)
            title.textContent = "Ajouter un collaborateur";
        if (inputId)
            inputId.value = '';
        if (inputName)
            inputName.value = '';
        if (inputRole)
            inputRole.value = 'Collaborateur';
        if (inputPhone)
            inputPhone.value = '';
        if (inputPin)
            inputPin.value = '1234';
        if (inputOpen)
            inputOpen.value = '09:00';
        if (inputClose)
            inputClose.value = '18:00';
        document.querySelectorAll('input[name="collabDays"]').forEach(cb => {
            cb.checked = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi'].includes(cb.value);
        });
    }
    modal.style.display = 'flex';
}
async function handleSaveCollaborator(e) {
    e.preventDefault();
    if (!state.currentUser)
        return;
    const inputId = document.getElementById('collabEditId');
    const inputName = document.getElementById('collabFullName');
    const inputRole = document.getElementById('collabRole');
    const inputPhone = document.getElementById('collabPhone');
    const inputPin = document.getElementById('collabPinCode');
    const inputOpen = document.getElementById('collabOpeningTime');
    const inputClose = document.getElementById('collabClosingTime');
    const modal = document.getElementById('modalCollaborator');
    const fullName = inputName?.value.trim();
    if (!fullName) {
        alert('Veuillez saisir le nom complet du collaborateur.');
        return;
    }
    const days = [];
    document.querySelectorAll('input[name="collabDays"]:checked').forEach(cb => {
        days.push(cb.value);
    });
    const collabId = inputId?.value || generateUuid();
    const isEditing = Boolean(inputId?.value);
    const newCollab = {
        id: collabId,
        userId: state.currentUser.id,
        fullName: fullName,
        role: inputRole?.value.trim() || 'Collaborateur',
        phone: inputPhone?.value.trim() || '',
        pinCode: inputPin?.value.trim() || '1234',
        openingTime: inputOpen?.value || '09:00',
        closingTime: inputClose?.value || '18:00',
        availableDays: days.length > 0 ? days : STANDARD_BUSINESS_DAYS,
        active: true,
        createdAt: new Date().toISOString()
    };
    if (isEditing) {
        const idx = state.collaborators.findIndex(c => c.id === collabId);
        if (idx >= 0) {
            newCollab.active = state.collaborators[idx].active;
            state.collaborators[idx] = newCollab;
        }
    }
    else {
        state.collaborators.push(newCollab);
    }
    saveStorage();
    const client = getSupabaseClient();
    if (client) {
        try {
            await client.from('collaborators').upsert({
                id: collabId,
                user_id: state.currentUser.id,
                full_name: newCollab.fullName,
                role: newCollab.role,
                phone: newCollab.phone || null,
                pin_code: newCollab.pinCode,
                opening_time: newCollab.openingTime,
                closing_time: newCollab.closingTime,
                available_days: newCollab.availableDays,
                active: newCollab.active
            });
        }
        catch (err) {
            console.warn('Erreur sauvegarde collaborateur Supabase', err);
        }
    }
    if (modal)
        modal.style.display = 'none';
    renderCollaboratorsView();
    showToast(isEditing ? 'Collaborateur modifié.' : 'Nouveau collaborateur ajouté.');
}
function openAppointmentInternalNotesModal(aptId) {
    const modal = document.getElementById('modalAppointmentInternalNotes');
    const inputId = document.getElementById('internalNotesAppointmentId');
    const summaryEl = document.getElementById('internalNotesClientSummary');
    const selectCollab = document.getElementById('internalNotesCollaboratorSelect');
    const selectStatus = document.getElementById('internalNotesStatusSelect');
    const textarea = document.getElementById('internalNotesTextarea');
    if (!modal || !inputId || !summaryEl || !selectCollab || !selectStatus || !textarea)
        return;
    const apt = state.appointments.find(a => a.id === aptId);
    if (!apt)
        return;
    inputId.value = apt.id;
    summaryEl.innerHTML = `
    <div><strong>Client :</strong> ${escapeHtml(apt.clientName)} ${apt.clientPhone ? `(${escapeHtml(apt.clientPhone)})` : ''}</div>
    <div><strong>Date &amp; Heure :</strong> ${formatDisplayDate(apt.appointmentDate)} à ${apt.appointmentTime} (${apt.durationMinutes} min)</div>
    <div><strong>Prestation :</strong> ${escapeHtml(apt.serviceName)} ${apt.servicePrice ? `(${apt.servicePrice.toLocaleString('fr-FR')} FCFA)` : ''}</div>
    ${apt.notes ? `<div><strong>Motif client :</strong> ${escapeHtml(apt.notes)}</div>` : ''}
  `;
    selectCollab.innerHTML = `
    <option value="">Non assigné (Équipe générale)</option>
    ${state.collaborators.map(c => `
      <option value="${c.id}" ${apt.collaboratorId === c.id ? 'selected' : ''}>${escapeHtml(c.fullName)} (${escapeHtml(c.role)})</option>
    `).join('')}
  `;
    selectStatus.value = apt.status;
    textarea.value = apt.internalNotes || '';
    modal.style.display = 'flex';
}
async function handleSaveInternalNotes(e) {
    e.preventDefault();
    const inputId = document.getElementById('internalNotesAppointmentId');
    const selectCollab = document.getElementById('internalNotesCollaboratorSelect');
    const selectStatus = document.getElementById('internalNotesStatusSelect');
    const textarea = document.getElementById('internalNotesTextarea');
    const modal = document.getElementById('modalAppointmentInternalNotes');
    if (!inputId || !modal)
        return;
    const aptId = inputId.value;
    const apt = state.appointments.find(a => a.id === aptId);
    if (!apt)
        return;
    const newCollabId = selectCollab?.value || undefined;
    const newStatus = selectStatus?.value || apt.status;
    const newNotes = textarea?.value.trim() || undefined;
    apt.collaboratorId = newCollabId;
    apt.status = newStatus;
    apt.internalNotes = newNotes;
    saveStorage();
    const client = getSupabaseClient();
    if (client) {
        try {
            await client.from('appointments').update({
                collaborator_id: newCollabId || null,
                status: newStatus,
                internal_notes: newNotes || null,
                updated_at: new Date().toISOString()
            }).eq('id', aptId);
        }
        catch (err) {
            console.warn('Erreur mise à jour notes internes Supabase', err);
        }
    }
    modal.style.display = 'none';
    renderCurrentView();
    showToast('Fiche de rendez-vous mise à jour.');
}
// ==============================================================================
// 9. VUE 3 : HISTORIQUE (CONFIRMÉS, HONORÉS & ANNULÉS)
// ==============================================================================
function getFilteredHistoryAppointments() {
    // Inclut tous les rendez-vous traités (confirmés, honorés et annulés)
    const historyList = state.appointments.filter(a => a.status === 'confirme' || a.status === 'honore' || a.status === 'annule');
    const now = new Date();
    let filtered = historyList;
    if (state.historyPeriod === 'weekly') {
        filtered = historyList.filter(a => {
            const d = new Date(a.appointmentDate);
            const diff = Math.abs((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            return diff <= 7;
        });
    }
    else if (state.historyPeriod === 'monthly') {
        filtered = historyList.filter(a => {
            const d = new Date(a.appointmentDate);
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
    }
    // Sous-filtrage par statut (Tous, Validés & Honorés, Annulés)
    if (state.historyStatusFilter === 'VALID') {
        filtered = filtered.filter(a => a.status === 'confirme' || a.status === 'honore');
    }
    else if (state.historyStatusFilter === 'CANCELLED') {
        filtered = filtered.filter(a => a.status === 'annule');
    }
    return filtered.sort((a, b) => b.appointmentDate.localeCompare(a.appointmentDate) || b.appointmentTime.localeCompare(a.appointmentTime));
}
function renderHistory() {
    // 1. Calcul des métriques globales sur la période
    const historyList = state.appointments.filter(a => a.status === 'confirme' || a.status === 'honore' || a.status === 'annule');
    const now = new Date();
    let periodList = historyList;
    if (state.historyPeriod === 'weekly') {
        periodList = historyList.filter(a => {
            const d = new Date(a.appointmentDate);
            const diff = Math.abs((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
            return diff <= 7;
        });
    }
    else if (state.historyPeriod === 'monthly') {
        periodList = historyList.filter(a => {
            const d = new Date(a.appointmentDate);
            return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
    }
    const confirmedList = periodList.filter(a => a.status === 'confirme' || a.status === 'honore');
    const cancelledList = periodList.filter(a => a.status === 'annule');
    const totalCount = periodList.length;
    const confirmedCount = confirmedList.length;
    const cancelledCount = cancelledList.length;
    const totalMinutes = confirmedList.reduce((acc, a) => acc + (a.durationMinutes || 30), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);
    const distinctClients = new Set(periodList.map(a => (a.clientName || '').trim().toLowerCase())).size;
    const kpiTotal = document.getElementById('historyKpiTotal');
    const kpiConfirmed = document.getElementById('historyKpiConfirmed');
    const kpiCancelled = document.getElementById('historyKpiCancelled');
    const kpiHours = document.getElementById('historyKpiHours');
    const kpiClients = document.getElementById('historyKpiClients');
    const kpiPeriodLabel = document.getElementById('historyKpiPeriodLabel');
    const countSummary = document.getElementById('historyCountSummary');
    if (kpiTotal)
        kpiTotal.textContent = String(totalCount);
    if (kpiConfirmed)
        kpiConfirmed.textContent = String(confirmedCount);
    if (kpiCancelled)
        kpiCancelled.textContent = String(cancelledCount);
    if (kpiHours)
        kpiHours.textContent = `${totalHours}h prestées`;
    if (kpiClients)
        kpiClients.textContent = String(distinctClients);
    if (kpiPeriodLabel) {
        if (state.historyPeriod === 'weekly')
            kpiPeriodLabel.textContent = 'Sur les 7 derniers jours';
        else if (state.historyPeriod === 'monthly')
            kpiPeriodLabel.textContent = 'Sur le mois en cours';
        else
            kpiPeriodLabel.textContent = "Sur l'ensemble des archives";
    }
    // 2. Liste affichée selon le filtre de statut actif
    const displayedList = getFilteredHistoryAppointments();
    if (countSummary) {
        countSummary.textContent = `${displayedList.length} rendez-vous affiché(s) sur ${totalCount} dans cette période`;
    }
    // Mise à jour visuelle des boutons de filtre de statut
    document.querySelectorAll('#historyStatusToggle button[data-status-filter]').forEach(btn => {
        if (btn.getAttribute('data-status-filter') === state.historyStatusFilter) {
            btn.classList.add('active');
        }
        else {
            btn.classList.remove('active');
        }
    });
    // 3. Remplissage du tableau d'archive
    const tbody = document.getElementById('historyTableBody');
    const emptyState = document.getElementById('emptyHistoryState');
    if (!tbody)
        return;
    tbody.innerHTML = '';
    if (displayedList.length === 0) {
        if (emptyState)
            emptyState.style.display = 'block';
    }
    else {
        if (emptyState)
            emptyState.style.display = 'none';
        displayedList.forEach(apt => {
            const tr = document.createElement('tr');
            const contactInfo = [apt.clientPhone, apt.clientEmail].filter(Boolean).join(' &bull; ');
            const statusClass = apt.status === 'honore' ? 'status-honore' : apt.status === 'confirme' ? 'status-confirme' : 'status-annule';
            const defaultNote = apt.status === 'honore' ? 'Intervention honorée' : apt.status === 'annule' ? 'Rendez-vous annulé' : 'Rendez-vous validé';
            tr.innerHTML = `
        <td class="font-mono"><strong>${formatDisplayDate(apt.appointmentDate)}</strong></td>
        <td class="font-mono">${apt.appointmentTime}</td>
        <td>
          <strong>${escapeHtml(apt.clientName)}</strong>
          ${contactInfo ? `<br><span class="text-muted" style="font-size: 11px;">${escapeHtml(contactInfo)}</span>` : ''}
        </td>
        <td>${escapeHtml(apt.serviceName)}</td>
        <td class="font-mono">${apt.durationMinutes} min</td>
        <td><span class="badge-status ${statusClass}">${getStatusLabel(apt.status)}</span></td>
        <td class="text-muted">${escapeHtml(apt.notes || defaultNote)}</td>
      `;
            tbody.appendChild(tr);
        });
    }
}
// ==============================================================================
// 10. VUE 4 : FRÉQUENCE (GRAPHISMES & CALCULS DE FRÉQUENCE)
// ==============================================================================
function renderFrequency() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    let targetAppointments = state.appointments;
    if (state.frequencyScope === 'month') {
        targetAppointments = state.appointments.filter(a => {
            if (!a.appointmentDate)
                return false;
            const d = new Date(a.appointmentDate);
            return d.getFullYear() === currentYear && d.getMonth() === currentMonth;
        });
    }
    // 1. Fréquence par jour de la semaine
    const dayCounts = {
        lundi: 0,
        mardi: 0,
        mercredi: 0,
        jeudi: 0,
        vendredi: 0,
        samedi: 0,
        dimanche: 0
    };
    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    targetAppointments.forEach(apt => {
        if (!apt.appointmentDate)
            return;
        const d = new Date(apt.appointmentDate);
        const dayName = dayNames[d.getDay()];
        if (dayCounts[dayName] !== undefined) {
            dayCounts[dayName]++;
        }
    });
    const maxDayCount = Math.max(...Object.values(dayCounts), 1);
    // Mise à jour des barres du graphique des jours
    const setBar = (barId, valId, count) => {
        const bar = document.getElementById(barId);
        const val = document.getElementById(valId);
        const pct = Math.round((count / maxDayCount) * 100);
        if (bar)
            bar.style.height = `${pct}%`;
        if (val)
            val.textContent = String(count);
    };
    setBar('barLun', 'valLun', dayCounts.lundi);
    setBar('barMar', 'valMar', dayCounts.mardi);
    setBar('barMer', 'valMer', dayCounts.mercredi);
    setBar('barJeu', 'valJeu', dayCounts.jeudi);
    setBar('barVen', 'valVen', dayCounts.vendredi);
    setBar('barSam', 'valSam', dayCounts.samedi);
    setBar('barDim', 'valDim', dayCounts.dimanche);
    // Jour de pointe
    let topDay = '-';
    let topDayCount = 0;
    for (const [day, count] of Object.entries(dayCounts)) {
        if (count > topDayCount) {
            topDayCount = count;
            topDay = day.charAt(0).toUpperCase() + day.slice(1);
        }
    }
    // 2. Évolution par semaine (4 dernières semaines)
    const weekCounts = [0, 0, 0, 0]; // S-3, S-2, S-1, En cours
    targetAppointments.forEach(apt => {
        if (!apt.appointmentDate)
            return;
        const d = new Date(apt.appointmentDate);
        const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays >= 0 && diffDays < 7)
            weekCounts[3]++;
        else if (diffDays >= 7 && diffDays < 14)
            weekCounts[2]++;
        else if (diffDays >= 14 && diffDays < 21)
            weekCounts[1]++;
        else if (diffDays >= 21 && diffDays < 28)
            weekCounts[0]++;
    });
    const maxWeekCount = Math.max(...weekCounts, 1);
    setBar('barW1', 'valW1', weekCounts[0]);
    setBar('barW2', 'valW2', weekCounts[1]);
    setBar('barW3', 'valW3', weekCounts[2]);
    setBar('barW4', 'valW4', weekCounts[3]);
    // Moyenne par semaine
    const totalRdv = targetAppointments.length;
    const avgWeekly = (weekCounts.reduce((a, b) => a + b, 0) / 4).toFixed(1);
    // Créneau de pointe
    const hourCounts = {};
    targetAppointments.forEach(apt => {
        if (!apt.appointmentTime)
            return;
        const h = apt.appointmentTime.split(':')[0] + 'h';
        hourCounts[h] = (hourCounts[h] || 0) + 1;
    });
    let topSlot = '-';
    let topSlotCount = 0;
    for (const [slot, count] of Object.entries(hourCounts)) {
        if (count > topSlotCount) {
            topSlotCount = count;
            topSlot = slot;
        }
    }
    const freqAvgEl = document.getElementById('freqAvgWeekly');
    const freqTopDayEl = document.getElementById('freqTopDay');
    const freqTopSlotEl = document.getElementById('freqTopSlot');
    if (freqAvgEl)
        freqAvgEl.textContent = `${avgWeekly} RDV`;
    if (freqTopDayEl)
        freqTopDayEl.textContent = topDayCount > 0 ? `${topDay} (${topDayCount})` : '-';
    if (freqTopSlotEl)
        freqTopSlotEl.textContent = topSlotCount > 0 ? `${topSlot} (${topSlotCount})` : '-';
    // 3. Tableau de synthèse de répartition par statut
    const tbody = document.getElementById('frequencyBreakdownBody');
    if (tbody) {
        const statuses = [
            { label: 'En attente', key: 'en_attente', badgeClass: 'status-en_attente', desc: 'Nouvelles demandes à valider' },
            { label: 'Confirmés', key: 'confirme', badgeClass: 'status-confirme', desc: 'Au planning futur' },
            { label: 'Honorés', key: 'honore', badgeClass: 'status-honore', desc: 'Prestations réalisées' },
            { label: 'Annulés', key: 'annule', badgeClass: 'status-annule', desc: 'Refusés ou annulés' }
        ];
        tbody.innerHTML = statuses.map(s => {
            const count = targetAppointments.filter(a => a.status === s.key).length;
            const pct = totalRdv > 0 ? Math.round((count / totalRdv) * 100) : 0;
            return `
        <tr>
          <td><strong>${s.label}</strong></td>
          <td class="text-center font-mono">${count}</td>
          <td class="text-right font-mono">${pct}%</td>
          <td class="text-center">
            <span class="badge-status ${s.badgeClass}">${s.desc}</span>
          </td>
        </tr>
      `;
        }).join('');
    }
}
// ==============================================================================
// 11. VUE 5 : PARAMÈTRES (GÉNÉRATEUR LIEN & QR CODE CLIENT)
// ==============================================================================
function renderCustomQuestions() {
    const container = document.getElementById('customQuestionsContainer');
    if (!container)
        return;
    // Si l'utilisateur est activement en train d'écrire dans une question, ne pas recréer les éléments du DOM
    const activeEl = document.activeElement;
    if (activeEl && container.contains(activeEl)) {
        return;
    }
    const questions = state.bookingConfig.customQuestions || [];
    container.innerHTML = '';
    questions.forEach((q, idx) => {
        const row = document.createElement('div');
        row.className = 'custom-question-row';
        row.style.cssText = 'display: flex; gap: 8px; align-items: center; width: 100%;';
        row.innerHTML = `
      <input type="text" class="custom-question-input" data-index="${idx}" value="${escapeHtml(q)}" placeholder="Ex: Quel type de prestation ou de cheveux avez-vous ?" style="flex: 1; padding: 7px 10px; font-size: 13px; border: 1px solid var(--border-color); border-radius: 6px; font-family: Aptos, sans-serif;">
      <button type="button" class="btn-remove-question" data-index="${idx}" style="background: none; border: 1px solid #fee2e2; color: #ef4444; border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-family: Aptos, sans-serif;">Supprimer</button>
    `;
        container.appendChild(row);
    });
    container.querySelectorAll('.btn-remove-question').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = Number(e.currentTarget.getAttribute('data-index'));
            const currentValues = [];
            container.querySelectorAll('.custom-question-input').forEach(inp => {
                currentValues.push(inp.value);
            });
            currentValues.splice(idx, 1);
            state.bookingConfig.customQuestions = currentValues;
            renderCustomQuestions();
        });
    });
}
function renderServicesSettingsList() {
    const container = document.getElementById('servicesListContainer');
    if (!container)
        return;
    const services = state.bookingConfig.services || [];
    if (services.length === 0) {
        container.innerHTML = `
      <div style="font-size: 12px; color: var(--text-muted); font-style: italic; padding: 6px 0;">
        Aucune prestation configurée. Cliquez sur le bouton ci-dessous pour ajouter vos prestations et leurs tarifs.
      </div>
    `;
        return;
    }
    container.innerHTML = services.map(s => `
    <div class="service-admin-item">
      <div class="service-admin-info">
        <span class="service-admin-name">${escapeHtml(s.name)}</span>
        <span class="service-admin-meta">${s.durationMinutes} min ${s.description ? `&bull; ${escapeHtml(s.description)}` : ''}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 10px;">
        <span class="service-admin-price">${s.priceFcfa.toLocaleString('fr-FR')} FCFA</span>
        <button type="button" class="btn-mini btn-danger-subtle btn-delete-service" data-id="${s.id}">&times;</button>
      </div>
    </div>
  `).join('');
    container.querySelectorAll('.btn-delete-service').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-id');
            if (id) {
                state.bookingConfig.services = (state.bookingConfig.services || []).filter(s => s.id !== id);
                saveStorage();
                renderServicesSettingsList();
                showToast('Prestation supprimée.');
                const client = getSupabaseClient();
                if (client && state.currentUser) {
                    client.from('booking_configs').update({
                        services: state.bookingConfig.services || [],
                        updated_at: new Date().toISOString()
                    }).eq('user_id', state.currentUser.id).then().catch(() => { });
                }
            }
        });
    });
}
function renderSettings() {
    const cfg = state.bookingConfig;
    // Si l'utilisateur est activement en train de saisir dans le formulaire, ne jamais réinitialiser ses champs
    const activeEl = document.activeElement;
    const isEditingSettings = activeEl && activeEl.closest('#formBookingConfig') !== null;
    // Pré-remplir les champs du formulaire uniquement si le champ n'est pas en cours de saisie active
    const inputBizName = document.getElementById('cfgBusinessName');
    const inputActivity = document.getElementById('cfgActivityType');
    const inputOpen = document.getElementById('cfgOpeningTime');
    const inputClose = document.getElementById('cfgClosingTime');
    const selectDuration = document.getElementById('cfgSlotDuration');
    const inputPhone = document.getElementById('cfgPhoneContact');
    const inputAddress = document.getElementById('cfgAddress');
    if (inputBizName && inputBizName !== activeEl)
        inputBizName.value = cfg.businessName;
    if (inputActivity && inputActivity !== activeEl)
        inputActivity.value = cfg.activityType || state.currentUser?.activityType || '';
    if (inputOpen && inputOpen !== activeEl)
        inputOpen.value = cfg.openingTime;
    if (inputClose && inputClose !== activeEl)
        inputClose.value = cfg.closingTime;
    if (selectDuration && selectDuration !== activeEl)
        selectDuration.value = String(cfg.slotDurationMinutes || 30);
    if (inputPhone && inputPhone !== activeEl)
        inputPhone.value = cfg.phoneContact;
    if (inputAddress && inputAddress !== activeEl)
        inputAddress.value = cfg.address;
    // Géolocalisation
    const checkGeo = document.getElementById('cfgEnableGeolocation');
    const inputLat = document.getElementById('cfgLatitude');
    const inputLng = document.getElementById('cfgLongitude');
    const inputMaps = document.getElementById('cfgGoogleMapsUrl');
    const statusGeo = document.getElementById('gpsStatusIndicator');
    if (checkGeo && checkGeo !== activeEl)
        checkGeo.checked = cfg.enableGeolocation !== false;
    if (inputLat && cfg.latitude && inputLat !== activeEl)
        inputLat.value = String(cfg.latitude);
    if (inputLng && cfg.longitude && inputLng !== activeEl)
        inputLng.value = String(cfg.longitude);
    if (inputMaps && cfg.googleMapsUrl && inputMaps !== activeEl)
        inputMaps.value = cfg.googleMapsUrl;
    if (statusGeo) {
        statusGeo.textContent = (cfg.latitude && cfg.longitude)
            ? `Position : ${cfg.latitude.toFixed(4)}, ${cfg.longitude.toFixed(4)}`
            : 'Position non renseignée';
    }
    // Jours disponibles : ne pas écraser si l'utilisateur est en train de cocher/décocher
    if (!isEditingSettings) {
        const currentDays = (cfg.availableDays && cfg.availableDays.length > 0)
            ? cfg.availableDays.map(d => String(d).toLowerCase().trim())
            : [];
        document.querySelectorAll('input[name="cfgDays"]').forEach(cb => {
            cb.checked = currentDays.includes(cb.value.toLowerCase().trim());
        });
    }
    // Rendu de la liste des prestations & tarifs
    if (!isEditingSettings) {
        renderServicesSettingsList();
    }
    // Écouteur pour le bouton d'ajout de prestation
    const btnAddSrv = document.getElementById('btnAddService');
    if (btnAddSrv && !btnAddSrv._hasListener) {
        btnAddSrv._hasListener = true;
        btnAddSrv.addEventListener('click', () => {
            const name = prompt("Intitulé de la prestation (ex: Coupe homme, Tresses, Consultation...) :");
            if (!name || !name.trim())
                return;
            const priceStr = prompt("Tarif en FCFA (ex: 2500, 5000...) :", "2500");
            const price = priceStr ? (parseInt(priceStr.replace(/\D/g, ''), 10) || 0) : 0;
            const durStr = prompt("Durée estimée en minutes (ex: 30, 45, 60, 120) :", "30");
            const duration = durStr ? (parseInt(durStr, 10) || 30) : 30;
            const desc = prompt("Description courte (facultatif) :", "");
            if (!state.bookingConfig.services)
                state.bookingConfig.services = [];
            state.bookingConfig.services.push({
                id: generateUuid(),
                name: name.trim(),
                durationMinutes: duration,
                priceFcfa: price,
                description: desc ? desc.trim() : undefined
            });
            saveStorage();
            renderServicesSettingsList();
            showToast('Prestation ajoutée.');
            const client = getSupabaseClient();
            if (client && state.currentUser) {
                client.from('booking_configs').update({
                    services: state.bookingConfig.services || [],
                    updated_at: new Date().toISOString()
                }).eq('user_id', state.currentUser.id).then().catch(() => { });
            }
        });
    }
    // Rendu de la liste des questions supplémentaires personnalisées
    if (!isEditingSettings) {
        renderCustomQuestions();
    }
    // Écouteur pour le bouton d'ajout de question
    const btnAdd = document.getElementById('btnAddCustomQuestion');
    if (btnAdd && !btnAdd._hasListener) {
        btnAdd._hasListener = true;
        btnAdd.addEventListener('click', () => {
            const container = document.getElementById('customQuestionsContainer');
            const currentValues = [];
            if (container) {
                container.querySelectorAll('.custom-question-input').forEach(inp => {
                    currentValues.push(inp.value);
                });
            }
            currentValues.push('');
            state.bookingConfig.customQuestions = currentValues;
            renderCustomQuestions();
            const allInps = container?.querySelectorAll('.custom-question-input');
            if (allInps && allInps.length > 0) {
                allInps[allInps.length - 1].focus();
            }
        });
    }
    // Masquer ou afficher le bloc lien & QR code selon si les paramètres ont été enregistrés
    const shareBox = document.getElementById('clientShareBox');
    if (shareBox) {
        if (state.bookingConfig.hasConfiguredSettings) {
            shareBox.style.display = 'block';
        }
        else {
            shareBox.style.display = 'none';
        }
    }
    // Construction du lien public client
    const clientUrl = getClientBookingUrl();
    const shareInput = document.getElementById('shareUrlDisplay');
    if (shareInput)
        shareInput.value = clientUrl;
    const shareHint = document.getElementById('shareUrlHintText');
    if (shareHint && state.currentUser) {
        const ident = state.currentUser.fullName || state.currentUser.businessName || state.currentUser.id.substring(0, 8);
        shareHint.textContent = `Lien exclusif rattaché à votre compte (${ident}). Tous les rendez-vous pris via ce lien sont automatiquement collectés sur votre tableau de bord.`;
    }
    // Génération du QR Code SVG dans le conteneur
    generateQrCodeSvg(clientUrl, 'qrCodeContainer');
    // Mise à jour compteur stockage
    const storageCount = document.getElementById('storageCountAppointments');
    if (storageCount) {
        storageCount.textContent = `${state.appointments.length} rendez-vous enregistrés`;
    }
    // Profil utilisateur affiché dans les paramètres (indispensable sur mobile)
    const settingsAvatar = document.getElementById('settingsUserAvatar');
    const settingsName = document.getElementById('settingsAccountFullName');
    const settingsEmail = document.getElementById('settingsAccountEmail');
    const settingsBiz = document.getElementById('settingsAccountBizName');
    const fullName = state.currentUser?.fullName || 'Responsable';
    const emailStr = state.currentUser?.email || '';
    const bizStr = cfg.businessName || state.currentUser?.businessName || '';
    if (settingsAvatar)
        settingsAvatar.textContent = (fullName || 'U').charAt(0).toUpperCase();
    if (settingsName)
        settingsName.textContent = fullName;
    if (settingsEmail)
        settingsEmail.textContent = emailStr;
    if (settingsBiz)
        settingsBiz.textContent = bizStr;
}
function getClientBookingUrl() {
    let userId = state.currentUser ? state.currentUser.id : null;
    if (!userId) {
        let localAdminId = localStorage.getItem('creno_local_admin_unique_id');
        if (!localAdminId) {
            localAdminId = 'adm_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 7);
            localStorage.setItem('creno_local_admin_unique_id', localAdminId);
        }
        userId = localAdminId;
    }
    const base = window.location.origin + window.location.pathname;
    return `${base}?reserver=${encodeURIComponent(userId)}`;
}
// Générateur SVG propre de QR Code (Matrice vectorielle claire)
function generateQrCodeSvg(text, containerId) {
    const container = document.getElementById(containerId);
    if (!container)
        return;
    // Utilisation d'un QR code vectoriel SVG clair et lisible
    const encoded = encodeURIComponent(text);
    const qrSvgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encoded}&format=svg`;
    container.innerHTML = `
    <img src="${qrSvgUrl}" alt="Code QR Créno" style="width: 100%; height: 100%; object-fit: contain;" />
  `;
}
async function downloadQrCode() {
    const clientUrl = getClientBookingUrl();
    const encoded = encodeURIComponent(clientUrl);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encoded}&format=png`;
    try {
        const res = await fetch(qrUrl);
        if (res.ok) {
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = `qrcode-${(state.bookingConfig.businessName || 'creno').toLowerCase().replace(/\s+/g, '-')}.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(blobUrl);
            showToast('Code QR téléchargé avec succès.');
            return;
        }
    }
    catch (e) {
        console.warn('Fallback téléchargement QR', e);
    }
    window.open(qrUrl, '_blank');
}
// ==============================================================================
// 12. VUE 6 : COMPTE (PROFIL ADMINISTRATEUR & MOT DE PASSE)
// ==============================================================================
function renderAccount() {
    if (!state.currentUser)
        return;
    // Si l'utilisateur est activement en train d'éditer son profil, ne pas écraser ses saisies
    const activeEl = document.activeElement;
    if (activeEl && activeEl.closest('#formUserProfile') !== null) {
        return;
    }
    const emailEl = document.getElementById('accEmail');
    const nameEl = document.getElementById('accFullName');
    const bizEl = document.getElementById('accBusinessName');
    const phoneEl = document.getElementById('accPhone');
    if (emailEl && emailEl !== activeEl)
        emailEl.value = state.currentUser.email || '';
    if (nameEl && nameEl !== activeEl)
        nameEl.value = state.currentUser.fullName || '';
    if (bizEl && bizEl !== activeEl)
        bizEl.value = state.currentUser.businessName || state.bookingConfig.businessName;
    if (phoneEl && phoneEl !== activeEl)
        phoneEl.value = state.bookingConfig.phoneContact || '';
    // Affichage du statut d'abonnement
    const planNameEl = document.getElementById('accSubscriptionPlanName');
    const badgeEl = document.getElementById('accSubscriptionBadge');
    const detailsEl = document.getElementById('accSubscriptionDetails');
    const isPaid = state.currentUser.subscriptionStatus === 'actif' || state.currentUser.subscriptionStatus === 'active';
    const remaining = getTrialRemainingDays();
    const isExpired = state.currentUser.subscriptionStatus === 'expire' || (!isPaid && remaining <= 0);
    if (planNameEl) {
        planNameEl.textContent = getSubscriptionPlanLabel(state.currentUser.subscriptionPlan);
    }
    if (badgeEl) {
        if (isPaid) {
            badgeEl.className = 'subscription-account-badge active';
            badgeEl.textContent = 'Abonnement Actif';
        }
        else if (isExpired) {
            badgeEl.className = 'subscription-account-badge expired';
            badgeEl.textContent = 'Essai Expiré';
        }
        else {
            badgeEl.className = 'subscription-account-badge trial';
            badgeEl.textContent = `Essai en cours (${remaining} j)`;
        }
    }
    if (detailsEl) {
        if (isPaid) {
            detailsEl.textContent = 'Votre formule est active sans restriction. Vos clients peuvent réserver à tout moment.';
        }
        else if (isExpired) {
            detailsEl.textContent = 'Votre période d\'essai de 14 jours est terminée. Vos réservations en ligne sont suspendues.';
        }
        else {
            detailsEl.textContent = `Il vous reste ${remaining} jour${remaining > 1 ? 's' : ''} sur votre période d'essai gratuit de 14 jours.`;
        }
    }
}
// ==============================================================================
// 12. VUE NOTIFICATIONS (FEED & ACTIONS)
// ==============================================================================
function renderNotifications() {
    const container = document.getElementById('notificationsFeedContainer');
    if (!container)
        return;
    if (state.notifications.length === 0) {
        container.innerHTML = '<div class="empty-state-notice">Aucune notification enregistrée pour le moment.</div>';
        return;
    }
    container.innerHTML = state.notifications.map(n => `
    <div class="notification-feed-item ${n.isRead ? '' : 'unread'}" data-id="${n.id}">
      <div class="notif-main-info">
        <div class="notif-icon-circle">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
          </svg>
        </div>
        <div>
          <div class="notif-title">${escapeHtml(n.title)}</div>
          <div class="notif-desc">${escapeHtml(n.message)}</div>
          <div class="notif-time">${n.createdAt && !isNaN(new Date(n.createdAt).getTime()) ? new Date(n.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'À l\'instant'}</div>
        </div>
      </div>
      <div>
        ${n.isRead ? '' : `<button type="button" class="btn-subtle btn-mini btn-mark-notif-read" data-id="${n.id}">Marquer lu</button>`}
      </div>
    </div>
  `).join('');
    container.querySelectorAll('.btn-mark-notif-read').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            if (id)
                markNotificationAsRead(id);
        });
    });
}
async function markNotificationAsRead(id) {
    const notif = state.notifications.find(n => n.id === id);
    if (notif)
        notif.isRead = true;
    saveStorage();
    updateNotificationBadge();
    renderNotifications();
    const client = getSupabaseClient();
    if (client) {
        try {
            await client.from('notifications').update({ is_read: true }).eq('id', id);
        }
        catch (e) {
            console.warn('Erreur mise à jour notification Supabase', e);
        }
    }
}
async function markAllNotificationsAsRead() {
    state.notifications.forEach(n => n.isRead = true);
    saveStorage();
    updateNotificationBadge();
    renderNotifications();
    showToast('Toutes les notifications ont été marquées comme lues.');
    const client = getSupabaseClient();
    if (client && state.currentUser) {
        try {
            await client.from('notifications').update({ is_read: true }).eq('user_id', state.currentUser.id);
        }
        catch (e) {
            console.warn('Erreur marquer tout lu Supabase', e);
        }
    }
}
// ==============================================================================
// 13. NOTIFICATION CLIENT VIA WHATSAPP (CONFIRMATION DIRECTE)
// ==============================================================================
function notifyClientViaWhatsApp(apt) {
    const phone = (apt.clientPhone || '').replace(/\s+/g, '').replace(/[^\d+]/g, '');
    if (!phone) {
        showToast('Numéro WhatsApp non renseigné pour ce client.');
        return;
    }
    // Formatage du numéro pour WhatsApp (indicatif Togo 228 par défaut si numéro à 8 chiffres)
    let cleanPhone = phone.replace(/^\+/, '');
    if (cleanPhone.length === 8) {
        cleanPhone = '228' + cleanPhone;
    }
    const bizName = state.bookingConfig.businessName || state.currentUser?.businessName || 'Créno';
    const message = `Bonjour ${apt.clientName || 'Cher(e) client(e)'},\n\nVotre rendez-vous chez *${bizName}* pour la prestation "*${apt.serviceName || 'Rendez-vous standard'}*" le *${formatDisplayDate(apt.appointmentDate)}* à *${apt.appointmentTime}* a été validé avec succès.\n\nNous vous attendons avec plaisir.\nÀ très bientôt !`;
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    const win = window.open(waUrl, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
        window.location.href = waUrl;
    }
    showToast('Notification WhatsApp prête à être envoyée.');
}
// ==============================================================================
// 14. GESTION DES OPÉRATIONS DE RENDEZ-VOUS
// ==============================================================================
async function updateAppointmentStatus(id, newStatus) {
    const apt = state.appointments.find(a => a.id === id);
    if (!apt)
        return;
    apt.status = newStatus;
    saveStorage();
    // Également mettre à jour dans le stockage dédié de l'admin
    if (state.currentUser) {
        const adminKey = `creno_appointments_${state.currentUser.id}`;
        try {
            const raw = localStorage.getItem(adminKey);
            if (raw) {
                const list = JSON.parse(raw);
                const item = list.find(a => a.id === id);
                if (item)
                    item.status = newStatus;
                localStorage.setItem(adminKey, JSON.stringify(list));
            }
        }
        catch { }
    }
    // Notifier tous les onglets (notamment le client sur son smartphone/navigateur)
    try {
        localStorage.setItem('creno_status_update_event', JSON.stringify({
            timestamp: Date.now(),
            appointmentId: id,
            newStatus: newStatus
        }));
    }
    catch { }
    // Synchronisation avec l'API locale (support multi-profils Chrome)
    try {
        fetch('/api/appointments/status', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id, status: newStatus })
        });
    }
    catch (e) { }
    // Marquer immédiatement les notifications relatives à ce rendez-vous comme lues
    const relatedNotifs = state.notifications.filter(n => n.appointmentId === id && !n.isRead);
    if (relatedNotifs.length > 0) {
        relatedNotifs.forEach(n => { n.isRead = true; });
        updateNotificationBadge();
        const client = getSupabaseClient();
        if (client && state.currentUser) {
            client.from('notifications').update({ is_read: true }).eq('appointment_id', id).eq('user_id', state.currentUser.id).then().catch(() => { });
        }
    }
    renderCurrentView();
    showToast(`Rendez-vous mis à jour : ${getStatusLabel(newStatus)}`);
    // Notification WhatsApp automatique lorsque le responsable valide le rendez-vous
    if (newStatus === 'confirme') {
        notifyClientViaWhatsApp(apt);
    }
    // Mise à jour Supabase
    if (supabaseClient && state.currentUser) {
        try {
            await supabaseClient
                .from('appointments')
                .update({ status: newStatus })
                .eq('id', id);
            await logUserActivity(`statut_rdv_${newStatus}`, 'appointment', id, {
                clientName: apt.clientName,
                date: apt.appointmentDate,
                time: apt.appointmentTime
            });
        }
        catch (e) {
            console.warn('Erreur mise à jour Supabase', e);
        }
    }
}
async function deleteAppointment(id) {
    const index = state.appointments.findIndex(a => a.id === id);
    if (index === -1)
        return;
    state.appointments.splice(index, 1);
    saveStorage();
    if (state.currentUser) {
        const adminKey = `creno_appointments_${state.currentUser.id}`;
        try {
            const raw = localStorage.getItem(adminKey);
            if (raw) {
                const list = JSON.parse(raw);
                localStorage.setItem(adminKey, JSON.stringify(list.filter(a => a.id !== id)));
            }
        }
        catch { }
    }
    renderCurrentView();
    showToast('Rendez-vous supprimé.');
    if (supabaseClient && state.currentUser) {
        try {
            await supabaseClient.from('appointments').delete().eq('id', id);
            await logUserActivity('suppression_rdv', 'appointment', id);
        }
        catch (e) {
            console.warn('Erreur suppression Supabase', e);
        }
    }
}
function openAppointmentModal(appointmentId = null) {
    if (!appointmentId && state.currentUser?.subscriptionStatus === 'expire') {
        showToast("Votre période d'essai est terminée. Choisissez un abonnement pour planifier de nouveaux rendez-vous.");
        openSubscriptionModal();
        return;
    }
    const modal = document.getElementById('modalAppointment');
    const form = document.getElementById('formAppointment');
    const title = document.getElementById('modalAppointmentTitle');
    if (!modal || !form)
        return;
    if (appointmentId) {
        const item = state.appointments.find(a => a.id === appointmentId);
        if (!item)
            return;
        if (title)
            title.textContent = 'Modifier le Rendez-vous';
        document.getElementById('appointmentId').value = item.id;
        document.getElementById('appointmentDate').value = item.appointmentDate || todayIso;
        document.getElementById('appointmentTime').value = item.appointmentTime || '09:00';
        document.getElementById('appointmentClientName').value = item.clientName || '';
        document.getElementById('appointmentClientPhone').value = item.clientPhone || '';
        document.getElementById('appointmentClientEmail').value = item.clientEmail || '';
        document.getElementById('appointmentDurationMinutes').value = String(item.durationMinutes || 30);
        document.getElementById('appointmentServiceName').value = item.serviceName || 'Rendez-vous standard';
        document.getElementById('appointmentStatus').value = item.status || 'confirme';
        document.getElementById('appointmentNotes').value = item.notes || '';
    }
    else {
        if (title)
            title.textContent = 'Nouveau Rendez-vous';
        form.reset();
        document.getElementById('appointmentId').value = '';
        document.getElementById('appointmentDate').value = todayIso;
        document.getElementById('appointmentTime').value = '09:00';
        document.getElementById('appointmentDurationMinutes').value = '30';
        document.getElementById('appointmentServiceName').value = 'Rendez-vous standard';
        document.getElementById('appointmentStatus').value = 'confirme';
    }
    modal.style.display = 'flex';
}
function closeAppointmentModal() {
    const modal = document.getElementById('modalAppointment');
    if (modal)
        modal.style.display = 'none';
}
const clientState = {
    businessId: '',
    bookingConfig: { ...DEFAULT_BOOKING_CONFIG },
    profile: {
        fullName: '',
        phone: '',
        theme: 'light'
    },
    appointments: [],
    notifications: [],
    currentView: 'booking',
    currentTab: 'upcoming',
    busySlots: [],
    collaborators: [],
    selectedServiceId: '',
    selectedServiceName: '',
    selectedServicePrice: 0,
    selectedCollaboratorId: '',
    isBusinessExpired: false
};
function getClientAptsStorageKey() {
    return clientState.businessId ? `creno_client_apts_${clientState.businessId}` : 'creno_client_appointments';
}
function getClientNotifsStorageKey() {
    return clientState.businessId ? `creno_client_notifs_${clientState.businessId}` : 'creno_client_notifications';
}
function loadClientStorage() {
    try {
        const profRaw = localStorage.getItem('creno_client_profile');
        if (profRaw) {
            clientState.profile = { ...clientState.profile, ...JSON.parse(profRaw) };
        }
        const aptsKey = getClientAptsStorageKey();
        const aptsRaw = localStorage.getItem(aptsKey);
        if (aptsRaw) {
            clientState.appointments = JSON.parse(aptsRaw);
        }
        else {
            const legacyRaw = localStorage.getItem('creno_client_appointments');
            if (legacyRaw) {
                try {
                    const allLegacy = JSON.parse(legacyRaw);
                    clientState.appointments = clientState.businessId
                        ? allLegacy.filter(a => a.businessId === clientState.businessId)
                        : allLegacy;
                }
                catch {
                    clientState.appointments = [];
                }
            }
            else {
                clientState.appointments = [];
            }
        }
        const notifsKey = getClientNotifsStorageKey();
        const notifsRaw = localStorage.getItem(notifsKey);
        if (notifsRaw) {
            clientState.notifications = JSON.parse(notifsRaw);
        }
        else {
            const legacyNotifs = localStorage.getItem('creno_client_notifications');
            if (legacyNotifs && !clientState.businessId) {
                try {
                    clientState.notifications = JSON.parse(legacyNotifs);
                }
                catch {
                    clientState.notifications = [];
                }
            }
            else {
                clientState.notifications = [];
            }
        }
        // Dédoublonnage strict à la récupération des notifications pour assainir l'historique
        const seenNotifs = new Set();
        clientState.notifications = clientState.notifications.filter(n => {
            const key = `${n.appointmentId || ''}_${n.title}`;
            if (seenNotifs.has(key))
                return false;
            seenNotifs.add(key);
            return true;
        });
        const savedTheme = localStorage.getItem('creno_client_theme');
        if (savedTheme) {
            clientState.profile.theme = savedTheme;
        }
    }
    catch (e) {
        console.warn('Erreur chargement storage client', e);
    }
}
function saveClientStorage() {
    try {
        localStorage.setItem('creno_client_profile', JSON.stringify(clientState.profile));
        localStorage.setItem(getClientAptsStorageKey(), JSON.stringify(clientState.appointments));
        localStorage.setItem(getClientNotifsStorageKey(), JSON.stringify(clientState.notifications));
        localStorage.setItem('creno_client_theme', clientState.profile.theme);
        if (clientState.businessId) {
            localStorage.setItem('creno_client_business_id', clientState.businessId);
        }
    }
    catch (e) {
        console.warn('Erreur sauvegarde storage client', e);
    }
}
function setClientTheme(theme) {
    clientState.profile.theme = theme;
    saveClientStorage();
    const root = document.documentElement;
    if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
    }
    else {
        root.removeAttribute('data-theme');
    }
    const btnLight = document.getElementById('btnThemeLight');
    const btnDark = document.getElementById('btnThemeDark');
    if (btnLight && btnDark) {
        if (theme === 'dark') {
            btnDark.classList.add('active');
            btnLight.classList.remove('active');
        }
        else {
            btnLight.classList.add('active');
            btnDark.classList.remove('active');
        }
    }
}
function updateClientNotifBadge() {
    const unreadCount = clientState.notifications.filter(n => !n.read).length;
    const topBadge = document.getElementById('clientTopNotifBadge');
    const navBadge = document.getElementById('clientNavNotifBadge');
    if (topBadge) {
        if (unreadCount > 0) {
            topBadge.textContent = String(unreadCount);
            topBadge.style.display = 'flex';
        }
        else {
            topBadge.style.display = 'none';
        }
    }
    if (navBadge) {
        if (unreadCount > 0) {
            navBadge.textContent = String(unreadCount);
            navBadge.style.display = 'flex';
        }
        else {
            navBadge.style.display = 'none';
        }
    }
}
function renderClientAppointments() {
    const containerUpcoming = document.getElementById('clientAppointmentsList');
    const containerPast = document.getElementById('clientPastAppointmentsList');
    const emptyCard = document.getElementById('clientEmptyAppointments');
    const tabUpcoming = document.getElementById('btnClientTabUpcoming');
    const tabPast = document.getElementById('btnClientTabPast');
    if (!containerUpcoming || !containerPast || !emptyCard)
        return;
    // Brancher les boutons d'onglets s'ils n'ont pas encore d'écouteurs
    if (tabUpcoming && !tabUpcoming._hasListener) {
        tabUpcoming._hasListener = true;
        tabUpcoming.addEventListener('click', () => {
            clientState.currentTab = 'upcoming';
            tabUpcoming.classList.add('active');
            tabPast?.classList.remove('active');
            renderClientAppointments();
        });
    }
    if (tabPast && !tabPast._hasListener) {
        tabPast._hasListener = true;
        tabPast.addEventListener('click', () => {
            clientState.currentTab = 'past';
            tabPast.classList.add('active');
            tabUpcoming?.classList.remove('active');
            renderClientAppointments();
        });
    }
    const isUpcoming = clientState.currentTab !== 'past';
    if (isUpcoming) {
        containerUpcoming.style.display = 'flex';
        containerPast.style.display = 'none';
    }
    else {
        containerUpcoming.style.display = 'none';
        containerPast.style.display = 'flex';
    }
    const relevantApts = clientState.appointments.filter(a => !clientState.businessId || !a.businessId || a.businessId === clientState.businessId);
    const upcomingApts = relevantApts.filter(a => a.status === 'en_attente' || a.status === 'confirme');
    const pastApts = relevantApts.filter(a => a.status === 'honore' || a.status === 'annule');
    const currentList = isUpcoming ? upcomingApts : pastApts;
    if (currentList.length === 0) {
        if (isUpcoming) {
            containerUpcoming.innerHTML = '';
        }
        else {
            containerPast.innerHTML = '';
        }
        emptyCard.style.display = 'flex';
        return;
    }
    emptyCard.style.display = 'none';
    const html = currentList.map(apt => {
        let statusClass = 'badge-en_attente';
        let statusLabel = 'En attente de validation';
        let validatedMsg = '';
        if (apt.status === 'confirme') {
            statusClass = 'badge-confirme';
            statusLabel = 'Rendez-vous validé';
            validatedMsg = `
        <div class="client-card-validated-msg">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Votre rendez-vous a été validé par l'établissement.</span>
        </div>
      `;
        }
        else if (apt.status === 'annule') {
            statusClass = 'badge-annule';
            statusLabel = 'Rendez-vous annulé';
        }
        else if (apt.status === 'honore') {
            statusClass = 'badge-honore';
            statusLabel = 'Rendez-vous honoré';
        }
        const address = apt.address || clientState.bookingConfig.address || '';
        const mapsUrl = apt.googleMapsUrl || clientState.bookingConfig.googleMapsUrl || (address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}` : '');
        const locationBoxHtml = address ? `
      <div class="client-location-box">
        <div class="client-location-box-header">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
            <circle cx="12" cy="10" r="3"></circle>
          </svg>
          <span>Localisation de l'établissement</span>
        </div>
        <div class="client-location-box-address">${escapeHtml(address)}</div>
        ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="client-location-btn">Cliquez pour voir la localisation</a>` : ''}
      </div>
    ` : '';
        // Trouver le nom du collaborateur si assigné
        const collab = clientState.collaborators.find(c => c.id === apt.collaboratorId);
        const collabHtml = collab ? `
      <div class="client-card-row">
        <strong>Professionnel :</strong> <span>${escapeHtml(collab.fullName)} (${escapeHtml(collab.role)})</span>
      </div>
    ` : '';
        // Prestation et tarif
        const serviceHtml = `
      <div class="client-card-row">
        <strong>Prestation :</strong> <span>${escapeHtml(apt.serviceName || 'Rendez-vous standard')} ${apt.servicePrice && apt.servicePrice > 0 ? `(${apt.servicePrice.toLocaleString('fr-FR')} FCFA)` : ''}</span>
      </div>
    `;
        // Motif d'annulation client si présent
        const cancelReasonHtml = apt.clientCancelReason ? `
      <div class="client-card-notes" style="color: #ef4444; margin-top: 6px;">
        <strong>Motif d'annulation :</strong> ${escapeHtml(apt.clientCancelReason)}
      </div>
    ` : '';
        // Boutons d'action pour les rendez-vous à venir uniquement
        const actionButtonsHtml = isUpcoming ? `
      <div class="client-card-actions" style="margin-top: 12px; display: flex; gap: 8px; flex-wrap: wrap; border-top: 1px solid var(--border-color); padding-top: 10px;">
        <button type="button" class="btn-subtle btn-xs btn-client-reschedule" data-id="${apt.id}">
          Modifier mon créneau
        </button>
        <button type="button" class="btn-subtle btn-xs btn-client-cancel" data-id="${apt.id}" style="color: #ef4444;">
          Annuler ce rendez-vous
        </button>
      </div>
    ` : '';
        return `
      <article class="client-appointment-card">
        <div class="client-card-top">
          <div class="client-card-datetime">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span>${formatDisplayDate(apt.appointmentDate)} à ${apt.appointmentTime}</span>
          </div>
          <span class="client-status-badge ${statusClass}">${statusLabel}</span>
        </div>

        <div class="client-card-meta">
          <div class="client-card-row">
            <strong>Établissement :</strong> <span>${escapeHtml(apt.businessName || clientState.bookingConfig.businessName)}</span>
          </div>
          ${serviceHtml}
          ${collabHtml}
          ${apt.notes ? `
            <div class="client-card-notes">
              <strong>Motif :</strong> ${escapeHtml(apt.notes)}
            </div>
          ` : ''}
          ${cancelReasonHtml}
        </div>

        ${validatedMsg}
        ${locationBoxHtml}
        ${actionButtonsHtml}
      </article>
    `;
    }).join('');
    if (isUpcoming) {
        containerUpcoming.innerHTML = html;
    }
    else {
        containerPast.innerHTML = html;
    }
    // Brancher les clics sur les boutons d'action client
    document.querySelectorAll('.btn-client-reschedule').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            if (id)
                openClientRescheduleModal(id);
        });
    });
    document.querySelectorAll('.btn-client-cancel').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = btn.getAttribute('data-id');
            if (id)
                openClientCancelModal(id);
        });
    });
}
function openClientRescheduleModal(aptId) {
    const modal = document.getElementById('modalClientReschedule');
    const inputId = document.getElementById('rescheduleAppointmentId');
    const inputDate = document.getElementById('rescheduleDateInput');
    const inputTime = document.getElementById('rescheduleSelectedTime');
    if (!modal || !inputId || !inputDate)
        return;
    const apt = clientState.appointments.find(a => a.id === aptId);
    if (!apt)
        return;
    inputId.value = apt.id;
    inputDate.min = todayIso;
    inputDate.value = apt.appointmentDate >= todayIso ? apt.appointmentDate : todayIso;
    if (inputTime)
        inputTime.value = '';
    renderRescheduleSlots(inputDate.value);
    if (!inputDate._hasListener) {
        inputDate._hasListener = true;
        inputDate.addEventListener('change', () => {
            renderRescheduleSlots(inputDate.value);
        });
    }
    modal.style.display = 'flex';
}
function renderRescheduleSlots(dateVal) {
    const container = document.getElementById('rescheduleSlotsGrid');
    const hiddenTime = document.getElementById('rescheduleSelectedTime');
    if (!container)
        return;
    if (!dateVal) {
        container.innerHTML = '<span class="slots-placeholder-text">Sélectionnez une date pour charger les créneaux.</span>';
        return;
    }
    const cfg = clientState.bookingConfig;
    const dayName = getDayNameFromIso(dateVal);
    const validDays = normalizeAvailableDays(cfg.availableDays);
    if (!validDays.includes(dayName)) {
        const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        const readableDays = validDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
        container.innerHTML = `
      <div class="establishment-closed-notice">
        <strong>L'établissement est fermé le ${capitalizedDay.toLowerCase()}.</strong>
        <p>Jours d'ouverture : ${readableDays}.</p>
      </div>
    `;
        return;
    }
    const slots = [];
    const openStr = cfg.openingTime || '09:00';
    const closeStr = cfg.closingTime || '18:00';
    const [openH, openM] = openStr.split(':').map(Number);
    const [closeH, closeM] = closeStr.split(':').map(Number);
    const slotMinutes = Number(cfg.slotDurationMinutes) || 30;
    let currentMin = (isNaN(openH) ? 9 : openH) * 60 + (isNaN(openM) ? 0 : openM);
    const endMin = (isNaN(closeH) ? 18 : closeH) * 60 + (isNaN(closeM) ? 0 : closeM);
    while (currentMin + slotMinutes <= endMin) {
        const h = String(Math.floor(currentMin / 60)).padStart(2, '0');
        const m = String(currentMin % 60).padStart(2, '0');
        slots.push(`${h}:${m}`);
        currentMin += slotMinutes;
    }
    container.innerHTML = slots.map((timeStr) => {
        const isBusy = clientState.busySlots.some(b => b.date === dateVal && b.time === timeStr);
        return `
      <button type="button" class="slot-btn ${isBusy ? 'disabled' : ''}" data-time="${timeStr}" ${isBusy ? 'disabled' : ''}>
        ${timeStr}
      </button>
    `;
    }).join('');
    container.querySelectorAll('.slot-btn:not(.disabled)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            const timeVal = target.getAttribute('data-time') || '';
            if (hiddenTime)
                hiddenTime.value = timeVal;
        });
    });
}
async function submitClientReschedule(e) {
    e.preventDefault();
    const inputId = document.getElementById('rescheduleAppointmentId');
    const inputDate = document.getElementById('rescheduleDateInput');
    const inputTime = document.getElementById('rescheduleSelectedTime');
    const modal = document.getElementById('modalClientReschedule');
    if (!inputId || !inputDate || !inputTime)
        return;
    const aptId = inputId.value;
    const newDate = inputDate.value;
    const newTime = inputTime.value;
    if (!newDate || !newTime) {
        alert('Veuillez sélectionner une date et un créneau horaire.');
        return;
    }
    const apt = clientState.appointments.find(a => a.id === aptId);
    if (!apt)
        return;
    apt.appointmentDate = newDate;
    apt.appointmentTime = newTime;
    apt.status = 'en_attente';
    saveClientStorage();
    if (supabaseClient && clientState.businessId) {
        try {
            await supabaseClient.from('appointments').update({
                date: newDate,
                time: newTime,
                status: 'en_attente',
                updated_at: new Date().toISOString()
            }).eq('id', aptId);
            await supabaseClient.from('notifications').insert([{
                    user_id: clientState.businessId,
                    appointment_id: aptId,
                    title: 'Rendez-vous reprogrammé',
                    message: `${clientState.profile.fullName || 'Le client'} a modifié son rendez-vous pour le ${formatDisplayDate(newDate)} à ${newTime}.`,
                    is_read: false
                }]);
        }
        catch (err) {
            console.warn('Erreur Supabase reprogrammation:', err);
        }
    }
    try {
        await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: aptId,
                user_id: clientState.businessId,
                date: newDate,
                time: newTime,
                status: 'en_attente'
            })
        });
    }
    catch (e) { }
    if (modal)
        modal.style.display = 'none';
    renderClientAppointments();
    showToast('Votre créneau a été modifié avec succès.');
}
function openClientCancelModal(aptId) {
    const modal = document.getElementById('modalClientCancel');
    const inputId = document.getElementById('cancelAppointmentId');
    const inputReason = document.getElementById('cancelAppointmentReason');
    if (!modal || !inputId)
        return;
    inputId.value = aptId;
    if (inputReason)
        inputReason.value = '';
    modal.style.display = 'flex';
}
async function submitClientCancel(e) {
    e.preventDefault();
    const inputId = document.getElementById('cancelAppointmentId');
    const inputReason = document.getElementById('cancelAppointmentReason');
    const modal = document.getElementById('modalClientCancel');
    if (!inputId)
        return;
    const aptId = inputId.value;
    const reason = inputReason?.value.trim() || '';
    const apt = clientState.appointments.find(a => a.id === aptId);
    if (!apt)
        return;
    apt.status = 'annule';
    apt.clientCancelReason = reason;
    saveClientStorage();
    if (supabaseClient && clientState.businessId) {
        try {
            await supabaseClient.from('appointments').update({
                status: 'annule',
                client_cancel_reason: reason || null,
                updated_at: new Date().toISOString()
            }).eq('id', aptId);
            await supabaseClient.from('notifications').insert([{
                    user_id: clientState.businessId,
                    appointment_id: aptId,
                    title: 'Rendez-vous annulé par le client',
                    message: `${clientState.profile.fullName || 'Le client'} a annulé son rendez-vous du ${formatDisplayDate(apt.appointmentDate)} à ${apt.appointmentTime}.${reason ? ` Motif : ${reason}` : ''}`,
                    is_read: false
                }]);
        }
        catch (err) {
            console.warn('Erreur Supabase annulation client:', err);
        }
    }
    try {
        await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: aptId,
                user_id: clientState.businessId,
                status: 'annule',
                client_cancel_reason: reason
            })
        });
    }
    catch (e) { }
    if (modal)
        modal.style.display = 'none';
    renderClientAppointments();
    showToast('Rendez-vous annulé.');
}
function renderClientServicesList() {
    const container = document.getElementById('clientServicesGrid');
    const hiddenId = document.getElementById('clientSelectedServiceId');
    const hiddenName = document.getElementById('clientSelectedServiceName');
    const hiddenPrice = document.getElementById('clientSelectedServicePrice');
    if (!container)
        return;
    const services = clientState.bookingConfig.services || [];
    if (services.length === 0) {
        const defaultDur = clientState.bookingConfig.slotDurationMinutes || 30;
        container.innerHTML = `
      <div class="client-service-card selected" data-service-id="default" data-service-name="Rendez-vous standard" data-service-price="0" data-service-duration="${defaultDur}">
        <div class="client-service-header">
          <span class="client-service-name">Rendez-vous en boutique</span>
          <span class="client-service-price">Standard</span>
        </div>
        <div class="client-service-meta">
          <span>Durée : ${defaultDur} min</span>
        </div>
      </div>
    `;
        clientState.selectedServiceId = 'default';
        clientState.selectedServiceName = 'Rendez-vous standard';
        clientState.selectedServicePrice = 0;
        if (hiddenId)
            hiddenId.value = 'default';
        if (hiddenName)
            hiddenName.value = 'Rendez-vous standard';
        if (hiddenPrice)
            hiddenPrice.value = '0';
        return;
    }
    if (!clientState.selectedServiceId || !services.some(s => s.id === clientState.selectedServiceId)) {
        clientState.selectedServiceId = services[0].id;
        clientState.selectedServiceName = services[0].name;
        clientState.selectedServicePrice = services[0].priceFcfa;
        clientState.bookingConfig.slotDurationMinutes = services[0].durationMinutes;
    }
    if (hiddenId)
        hiddenId.value = clientState.selectedServiceId;
    if (hiddenName)
        hiddenName.value = clientState.selectedServiceName;
    if (hiddenPrice)
        hiddenPrice.value = String(clientState.selectedServicePrice);
    container.innerHTML = services.map(srv => {
        const isSelected = clientState.selectedServiceId === srv.id;
        return `
      <div class="client-service-card ${isSelected ? 'selected' : ''}" data-service-id="${srv.id}" data-service-name="${escapeHtml(srv.name)}" data-service-price="${srv.priceFcfa}" data-service-duration="${srv.durationMinutes}">
        <div class="client-service-header">
          <span class="client-service-name">${escapeHtml(srv.name)}</span>
          <span class="client-service-price">${srv.priceFcfa > 0 ? `${srv.priceFcfa.toLocaleString('fr-FR')} FCFA` : 'Gratuit'}</span>
        </div>
        <div class="client-service-meta">
          <span>Durée : ${srv.durationMinutes} min</span>
          ${srv.description ? `<p class="client-service-desc">${escapeHtml(srv.description)}</p>` : ''}
        </div>
      </div>
    `;
    }).join('');
    container.querySelectorAll('.client-service-card').forEach(card => {
        card.addEventListener('click', () => {
            container.querySelectorAll('.client-service-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const sId = card.getAttribute('data-service-id') || '';
            const sName = card.getAttribute('data-service-name') || '';
            const sPrice = Number(card.getAttribute('data-service-price')) || 0;
            const sDuration = Number(card.getAttribute('data-service-duration')) || 30;
            clientState.selectedServiceId = sId;
            clientState.selectedServiceName = sName;
            clientState.selectedServicePrice = sPrice;
            clientState.bookingConfig.slotDurationMinutes = sDuration;
            if (hiddenId)
                hiddenId.value = sId;
            if (hiddenName)
                hiddenName.value = sName;
            if (hiddenPrice)
                hiddenPrice.value = String(sPrice);
            const dateInput = document.getElementById('clientViewDateInput');
            if (dateInput && dateInput.value) {
                updateClientViewAvailableSlots(dateInput.value, clientState.bookingConfig, clientState.busySlots);
            }
        });
    });
}
function renderClientCollaboratorsList() {
    const block = document.getElementById('clientCollaboratorStepBlock');
    const container = document.getElementById('clientCollabSelectionGrid');
    const hiddenCollabId = document.getElementById('clientSelectedCollaboratorId');
    if (!block || !container)
        return;
    const collabs = clientState.collaborators.filter(c => c.active !== false);
    if (collabs.length === 0) {
        block.style.display = 'none';
        clientState.selectedCollaboratorId = '';
        if (hiddenCollabId)
            hiddenCollabId.value = '';
        return;
    }
    block.style.display = 'block';
    container.innerHTML = `
    <div class="client-collab-card ${!clientState.selectedCollaboratorId ? 'selected' : ''}" data-collab-id="">
      <div class="client-collab-name">N'importe quel professionnel</div>
      <div class="client-collab-role">Premier disponible</div>
    </div>
    ${collabs.map(c => `
      <div class="client-collab-card ${clientState.selectedCollaboratorId === c.id ? 'selected' : ''}" data-collab-id="${c.id}">
        <div class="client-collab-name">${escapeHtml(c.fullName)}</div>
        <div class="client-collab-role">${escapeHtml(c.role || 'Professionnel')}</div>
      </div>
    `).join('')}
  `;
    container.querySelectorAll('.client-collab-card').forEach(card => {
        card.addEventListener('click', () => {
            container.querySelectorAll('.client-collab-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            const cid = card.getAttribute('data-collab-id') || '';
            clientState.selectedCollaboratorId = cid;
            if (hiddenCollabId)
                hiddenCollabId.value = cid;
        });
    });
}
function renderClientNotifications() {
    const container = document.getElementById('clientNotificationsList');
    const emptyCard = document.getElementById('clientEmptyNotifications');
    const clearBtn = document.getElementById('btnClientClearNotifs');
    if (!container || !emptyCard)
        return;
    if (clientState.notifications.length === 0) {
        container.innerHTML = '';
        emptyCard.style.display = 'flex';
        if (clearBtn)
            clearBtn.style.display = 'none';
        return;
    }
    emptyCard.style.display = 'none';
    if (clearBtn)
        clearBtn.style.display = 'inline-block';
    container.innerHTML = clientState.notifications.map(notif => {
        const isSuccess = notif.type === 'success' || notif.title.toLowerCase().includes('validé') || notif.title.toLowerCase().includes('confirm');
        const isDanger = notif.type === 'danger' || notif.title.toLowerCase().includes('refus') || notif.title.toLowerCase().includes('annul');
        let iconClass = 'info';
        let iconSvg = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
    `;
        if (isSuccess) {
            iconClass = 'success';
            iconSvg = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      `;
        }
        else if (isDanger) {
            iconClass = 'danger';
            iconSvg = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      `;
        }
        return `
      <div class="client-notif-item ${notif.read ? '' : 'unread'}">
        <div class="client-notif-icon ${iconClass}">
          ${iconSvg}
        </div>
        <div class="client-notif-body">
          <div class="client-notif-title">${escapeHtml(notif.title)}</div>
          <div class="client-notif-desc">${escapeHtml(notif.message)}</div>
          <div class="client-notif-date">${notif.date}</div>
        </div>
      </div>
    `;
    }).join('');
}
function renderClientSettings() {
    const nameInput = document.getElementById('clientSettingsName');
    const phoneInput = document.getElementById('clientSettingsPhone');
    if (nameInput)
        nameInput.value = clientState.profile.fullName || '';
    if (phoneInput)
        phoneInput.value = clientState.profile.phone || '';
    const btnLight = document.getElementById('btnThemeLight');
    const btnDark = document.getElementById('btnThemeDark');
    if (btnLight && btnDark) {
        if (clientState.profile.theme === 'dark') {
            btnDark.classList.add('active');
            btnLight.classList.remove('active');
        }
        else {
            btnLight.classList.add('active');
            btnDark.classList.remove('active');
        }
    }
}
function switchClientView(view) {
    clientState.currentView = view;
    document.querySelectorAll('.client-view-panel').forEach(panel => {
        panel.classList.remove('active');
    });
    const targetPanelId = view === 'booking'
        ? 'clientViewBooking'
        : view === 'appointments'
            ? 'clientViewAppointments'
            : view === 'notifications'
                ? 'clientViewNotifications'
                : 'clientViewSettings';
    const targetPanel = document.getElementById(targetPanelId);
    if (targetPanel)
        targetPanel.classList.add('active');
    // Mettre à jour l'onglet actif dans la barre du bas
    document.querySelectorAll('.client-nav-item').forEach(btn => {
        if (btn.getAttribute('data-client-view') === view) {
            btn.classList.add('active');
        }
        else {
            btn.classList.remove('active');
        }
    });
    // Bouton retour si on est sur la vue booking et qu'on a déjà des rendez-vous
    const btnCancelBooking = document.getElementById('btnCancelBookingView');
    if (btnCancelBooking) {
        if (clientState.appointments.length > 0) {
            btnCancelBooking.style.display = 'inline-block';
        }
        else {
            btnCancelBooking.style.display = 'none';
        }
    }
    if (view === 'booking') {
        setupClientBookingView();
    }
    else if (view === 'notifications') {
        clientState.notifications.forEach(n => {
            n.read = true;
        });
        saveClientStorage();
        updateClientNotifBadge();
        renderClientNotifications();
    }
    else if (view === 'appointments') {
        renderClientAppointments();
    }
    else if (view === 'settings') {
        renderClientSettings();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
function findNextAvailableDate(config) {
    const dayNames = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const cur = new Date();
    const validDays = normalizeAvailableDays(config.availableDays);
    for (let i = 0; i < 14; i++) {
        const candidate = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + i, 12, 0, 0);
        const dayName = dayNames[candidate.getDay()];
        if (validDays.includes(dayName)) {
            const y = candidate.getFullYear();
            const m = String(candidate.getMonth() + 1).padStart(2, '0');
            const d = String(candidate.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, '0');
    const d = String(cur.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
function updateClientViewAvailableSlots(selectedDate, config, busySlots) {
    const container = document.getElementById('clientViewSlotsGrid');
    const hiddenTime = document.getElementById('clientViewSelectedTime');
    if (!container)
        return;
    if (!selectedDate) {
        container.innerHTML = `<span class="slots-placeholder-text">Sélectionnez une date.</span>`;
        return;
    }
    const dayName = getDayNameFromIso(selectedDate);
    const validDays = normalizeAvailableDays(config.availableDays);
    if (!validDays.includes(dayName)) {
        const capitalizedDay = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        const readableDays = validDays.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ');
        container.innerHTML = `<span class="slots-placeholder-text">L'établissement est fermé le ${capitalizedDay.toLowerCase()}. Jours d'ouverture : ${readableDays}.</span>`;
        if (hiddenTime)
            hiddenTime.value = '';
        return;
    }
    const slots = [];
    const openStr = config.openingTime || '09:00';
    const closeStr = config.closingTime || '18:00';
    const [openH, openM] = openStr.split(':').map(Number);
    const [closeH, closeM] = closeStr.split(':').map(Number);
    const slotMinutes = Number(config.slotDurationMinutes) || 30;
    let currentMin = (isNaN(openH) ? 9 : openH) * 60 + (isNaN(openM) ? 0 : openM);
    const endMin = (isNaN(closeH) ? 18 : closeH) * 60 + (isNaN(closeM) ? 0 : closeM);
    while (currentMin + slotMinutes <= endMin) {
        const h = String(Math.floor(currentMin / 60)).padStart(2, '0');
        const m = String(currentMin % 60).padStart(2, '0');
        slots.push(`${h}:${m}`);
        currentMin += slotMinutes;
    }
    if (slots.length === 0) {
        container.innerHTML = `<span class="slots-placeholder-text">Aucun créneau disponible pour ces horaires d'ouverture.</span>`;
        if (hiddenTime)
            hiddenTime.value = '';
        return;
    }
    container.innerHTML = slots.map(timeStr => {
        const isBusy = busySlots.some(b => b.date === selectedDate && b.time === timeStr);
        return `
      <button type="button" class="slot-btn ${isBusy ? 'disabled' : ''}" data-time="${timeStr}" ${isBusy ? 'disabled' : ''}>
        ${timeStr}
      </button>
    `;
    }).join('');
    container.querySelectorAll('.slot-btn:not(.disabled)').forEach(btn => {
        btn.addEventListener('click', (e) => {
            container.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            const timeVal = target.getAttribute('data-time') || '';
            if (hiddenTime)
                hiddenTime.value = timeVal;
        });
    });
}
function setupClientBookingView() {
    const dateInput = document.getElementById('clientViewDateInput');
    const hiddenTime = document.getElementById('clientViewSelectedTime');
    const nameInput = document.getElementById('clientViewNameInput');
    const phoneInput = document.getElementById('clientViewPhoneInput');
    const notesInput = document.getElementById('clientViewNotesInput');
    const btnSubmit = document.getElementById('btnSubmitClientViewBooking');
    if (hiddenTime)
        hiddenTime.value = '';
    if (notesInput)
        notesInput.value = '';
    if (btnSubmit)
        btnSubmit.disabled = false;
    // Pré-remplissage avec coordonnées mémorisées
    if (nameInput)
        nameInput.value = clientState.profile.fullName || '';
    if (phoneInput)
        phoneInput.value = clientState.profile.phone || '+228 ';
    const cfg = clientState.bookingConfig;
    // Blocage si l'établissement a dépassé sa période d'essai sans formule payante
    const blockedNotice = document.getElementById('clientBlockedNotice');
    const bookingForm = document.getElementById('formClientBookingView');
    const blockedPhone = document.getElementById('clientBlockedPhone');
    if (clientState.isBusinessExpired) {
        if (blockedNotice)
            blockedNotice.style.display = 'block';
        if (bookingForm)
            bookingForm.style.display = 'none';
        if (blockedPhone)
            blockedPhone.textContent = cfg.phoneContact || '+228';
        return;
    }
    else {
        if (blockedNotice)
            blockedNotice.style.display = 'none';
        if (bookingForm)
            bookingForm.style.display = 'block';
    }
    // Mise à jour du nom de la structure et caractéristiques
    const bookingBizNameEl = document.getElementById('clientBookingBizName');
    const activityTextEl = document.getElementById('clientBookingActivityText');
    const contactTextEl = document.getElementById('clientBookingContactText');
    const activityBadge = document.getElementById('clientBookingActivityBadge');
    const contactBadge = document.getElementById('clientBookingContactBadge');
    if (bookingBizNameEl)
        bookingBizNameEl.textContent = cfg.businessName || 'Établissement';
    if (activityTextEl)
        activityTextEl.textContent = cfg.activityType || 'Prestations & Services';
    if (contactTextEl) {
        if (cfg.phoneContact) {
            contactTextEl.textContent = cfg.phoneContact;
            if (contactBadge)
                contactBadge.style.display = 'inline-flex';
        }
        else if (contactBadge) {
            contactBadge.style.display = 'none';
        }
    }
    // Questions supplémentaires nécessaires posées par l'établissement
    const qContainer = document.getElementById('clientCustomQuestionsContainer');
    if (qContainer) {
        const questions = cfg.customQuestions || [];
        if (questions.length === 0) {
            qContainer.innerHTML = '';
            qContainer.style.display = 'none';
        }
        else {
            qContainer.style.display = 'block';
            qContainer.innerHTML = `
        <div style="margin-top: 14px; margin-bottom: 8px; font-weight: 600; font-size: 13px; color: var(--text-dark);">
          Informations demandées par l'établissement :
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          ${questions.map((q, idx) => `
            <div class="auth-field" style="margin-bottom: 4px;">
              <label style="font-size: 12px; font-weight: 500; color: #475569; display: block; margin-bottom: 4px;">${escapeHtml(q)}</label>
              <input type="text" class="client-custom-answer-input" data-question="${escapeHtml(q)}" placeholder="Votre réponse..." style="width: 100%; padding: 8px 12px; font-size: 13px; border: 1px solid var(--border-color); border-radius: 8px; font-family: Aptos, sans-serif;">
            </div>
          `).join('')}
        </div>
      `;
        }
    }
    // Case Localisation distincte tout en bas
    const locBox = document.getElementById('clientViewLocationBox');
    const locAddr = document.getElementById('clientViewLocationAddress');
    const locLink = document.getElementById('clientViewLocationLink');
    if (locBox && cfg.address) {
        locBox.style.display = 'flex';
        if (locAddr)
            locAddr.textContent = cfg.address;
        if (locLink) {
            locLink.href = cfg.googleMapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(cfg.address)}`;
        }
    }
    else if (locBox) {
        locBox.style.display = 'none';
    }
    // Rendu de la grille des prestations & sélection de collaborateur
    renderClientServicesList();
    renderClientCollaboratorsList();
    // Initialisation date et créneaux
    const nextDate = findNextAvailableDate(cfg);
    if (dateInput) {
        dateInput.min = todayIso;
        dateInput.value = nextDate;
        updateClientViewAvailableSlots(nextDate, cfg, clientState.busySlots);
    }
}
async function submitClientViewBooking() {
    if (clientState.isBusinessExpired) {
        alert("Les réservations en ligne pour cet établissement sont momentanément suspendues.");
        return;
    }
    const dateInput = document.getElementById('clientViewDateInput');
    const timeInput = document.getElementById('clientViewSelectedTime');
    const nameInput = document.getElementById('clientViewNameInput');
    const phoneInput = document.getElementById('clientViewPhoneInput');
    const notesInput = document.getElementById('clientViewNotesInput');
    const btnSubmit = document.getElementById('btnSubmitClientViewBooking');
    if (!dateInput?.value || !timeInput?.value || !nameInput?.value.trim() || !phoneInput?.value.trim()) {
        alert('Veuillez sélectionner une date, un créneau horaire, et renseigner votre nom et numéro WhatsApp.');
        return;
    }
    const clientName = nameInput.value.trim();
    const clientPhone = phoneInput.value.trim();
    const appointmentDate = dateInput.value;
    const appointmentTime = timeInput.value;
    const rawNotes = notesInput?.value.trim() || '';
    // Collecter les réponses aux questions supplémentaires
    const answerInputs = document.querySelectorAll('.client-custom-answer-input');
    const customAnswers = [];
    answerInputs.forEach(inp => {
        const q = inp.getAttribute('data-question') || '';
        const a = inp.value.trim();
        if (a) {
            customAnswers.push({ question: q, answer: a });
        }
    });
    let fullNotes = rawNotes;
    if (customAnswers.length > 0) {
        const formattedAnswers = customAnswers.map(item => `• ${item.question} : ${item.answer}`).join('\n');
        if (fullNotes) {
            fullNotes = `${fullNotes}\n\n[Informations complémentaires]\n${formattedAnswers}`;
        }
        else {
            fullNotes = `[Informations complémentaires]\n${formattedAnswers}`;
        }
    }
    // Sauvegarde dans le profil local du client
    clientState.profile.fullName = clientName;
    clientState.profile.phone = clientPhone;
    if (btnSubmit)
        btnSubmit.disabled = true;
    const chosenServiceName = clientState.selectedServiceName || 'Rendez-vous en boutique';
    const chosenServicePrice = clientState.selectedServicePrice || 0;
    const chosenCollaboratorId = clientState.selectedCollaboratorId || undefined;
    const aptId = 'apt-' + Date.now();
    let supabaseId = aptId;
    // 1. Sauvegarde dans l'API locale partagée (garantit la synchronisation multi-profils Chrome sur localhost)
    try {
        await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: supabaseId,
                user_id: clientState.businessId,
                client: clientName,
                client_whatsapp: clientPhone,
                title: chosenServiceName,
                service_price: chosenServicePrice,
                collaborator_id: chosenCollaboratorId || null,
                date: appointmentDate,
                time: appointmentTime,
                duration: clientState.bookingConfig.slotDurationMinutes || 30,
                status: 'en_attente',
                notes: fullNotes,
                source: 'lien_public'
            })
        });
    }
    catch (e) { }
    // 2. Sauvegarde Supabase (avec le schéma exact de la base de données)
    if (supabaseClient && clientState.businessId) {
        try {
            const payload = {
                user_id: clientState.businessId,
                client: clientName,
                client_name: clientName,
                client_phone: clientPhone,
                client_whatsapp: clientPhone,
                title: chosenServiceName,
                service_name: chosenServiceName,
                service_price: chosenServicePrice,
                collaborator_id: chosenCollaboratorId || null,
                date: appointmentDate,
                appointment_date: appointmentDate,
                time: appointmentTime,
                appointment_time: appointmentTime,
                duration: clientState.bookingConfig.slotDurationMinutes || 30,
                duration_minutes: clientState.bookingConfig.slotDurationMinutes || 30,
                status: 'en_attente',
                notes: fullNotes,
                source: 'lien_public'
            };
            const { data, error } = await supabaseClient.from('appointments').insert([payload]).select('id').maybeSingle();
            if (!error && data && data.id) {
                supabaseId = data.id;
            }
            else if (error) {
                console.warn('Erreur insertion RDV client Supabase:', error.message);
            }
            await supabaseClient.from('notifications').insert([{
                    user_id: clientState.businessId,
                    appointment_id: supabaseId,
                    title: 'Nouvelle demande de rendez-vous',
                    message: `${clientName} a demandé un rendez-vous (${chosenServiceName}) le ${formatDisplayDate(appointmentDate)} à ${appointmentTime}.`,
                    is_read: false
                }]);
        }
        catch (e) {
            console.warn('Erreur insertion RDV client Supabase', e);
        }
    }
    // Création de l'objet de rendez-vous client
    const newClientApt = {
        id: supabaseId,
        businessId: clientState.businessId,
        businessName: clientState.bookingConfig.businessName,
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime,
        durationMinutes: clientState.bookingConfig.slotDurationMinutes || 30,
        serviceName: chosenServiceName,
        servicePrice: chosenServicePrice,
        collaboratorId: chosenCollaboratorId,
        notes: fullNotes || undefined,
        status: 'en_attente',
        createdAt: new Date().toISOString(),
        address: clientState.bookingConfig.address,
        googleMapsUrl: clientState.bookingConfig.googleMapsUrl
    };
    clientState.appointments.unshift(newClientApt);
    clientState.busySlots.push({ date: appointmentDate, time: appointmentTime });
    saveClientStorage();
    // Objet rendez-vous côté administrateur
    const localProApt = {
        id: supabaseId,
        userId: clientState.businessId,
        clientName: clientName,
        clientPhone: clientPhone,
        serviceName: chosenServiceName,
        servicePrice: chosenServicePrice,
        collaboratorId: chosenCollaboratorId,
        appointmentDate: appointmentDate,
        appointmentTime: appointmentTime,
        durationMinutes: clientState.bookingConfig.slotDurationMinutes || 30,
        status: 'en_attente',
        notes: fullNotes || undefined,
        source: 'lien_public',
        createdAt: new Date().toISOString()
    };
    // 1. Sauvegarde dans le stockage dédié de cet administrateur (clé isolée)
    const adminAptsKey = `creno_appointments_${clientState.businessId}`;
    let adminApts = [];
    try {
        const raw = localStorage.getItem(adminAptsKey);
        if (raw)
            adminApts = JSON.parse(raw);
    }
    catch { }
    adminApts.unshift(localProApt);
    try {
        localStorage.setItem(adminAptsKey, JSON.stringify(adminApts));
    }
    catch { }
    // 2. Notification administrateur dédiée
    const adminNotifsKey = `creno_notifications_${clientState.businessId}`;
    let adminNotifs = [];
    try {
        const rawN = localStorage.getItem(adminNotifsKey);
        if (rawN)
            adminNotifs = JSON.parse(rawN);
    }
    catch { }
    const newNotifItem = {
        id: 'notif-' + Date.now() + Math.random().toString(36).substring(2, 6),
        appointmentId: supabaseId,
        title: 'Nouvelle demande de rendez-vous',
        message: `${clientName} a demandé un rendez-vous le ${formatDisplayDate(appointmentDate)} à ${appointmentTime}.`,
        isRead: false,
        createdAt: new Date().toISOString()
    };
    adminNotifs.unshift(newNotifItem);
    try {
        localStorage.setItem(adminNotifsKey, JSON.stringify(adminNotifs));
    }
    catch { }
    // 3. Sauvegarde dans le store pro global s'il est dans le même navigateur
    const existingIdx = state.appointments.findIndex(a => a.id === supabaseId);
    if (existingIdx < 0) {
        state.appointments.unshift(localProApt);
        if (state.currentUser && state.currentUser.id === clientState.businessId) {
            state.notifications.unshift(newNotifItem);
            updateNotificationBadge();
            if (state.currentView === 'notifications') {
                renderNotifications();
            }
        }
        saveStorage();
    }
    // 4. Déclenchement d'un événement multi-onglets pour rafraîchir en temps réel le dashboard admin
    try {
        localStorage.setItem('creno_sync_appointment_event', JSON.stringify({
            timestamp: Date.now(),
            adminId: clientState.businessId,
            appointmentId: supabaseId
        }));
    }
    catch { }
    if (btnSubmit)
        btnSubmit.disabled = false;
    // Redirection sur "Mes rendez-vous" (dashboard client)
    switchClientView('appointments');
    showToast('Demande de rendez-vous enregistrée.');
    // Règle explicite utilisateur : "apres avoir confirmé son rendezvois, on lui propose d'unstaller l'application pour avoir la reponse de validation de son rendrez vous."
    setTimeout(() => {
        sessionStorage.removeItem('creno_pwa_dismissed');
        showPwaInstallModal('client_booking');
    }, 400);
}
function handleClientAppointmentStatusChange(apt, oldStatus, newStatus) {
    // Règle 1 : Ne jamais régresser un statut confirmé ou annulé vers "en_attente"
    if (oldStatus !== 'en_attente' && newStatus === 'en_attente') {
        return;
    }
    // Règle 2 : Dédoublonnage strict par identifiant de rendez-vous et statut
    const alreadyNotified = clientState.notifications.some(n => n.appointmentId === apt.id && ((newStatus === 'confirme' && n.title.includes('validé')) ||
        (newStatus === 'annule' && (n.title.includes('refusé') || n.title.includes('annulé')))));
    if (alreadyNotified) {
        return;
    }
    const dateFormatted = formatDisplayDate(apt.appointmentDate);
    const timeFormatted = apt.appointmentTime;
    if (newStatus === 'confirme' && oldStatus !== 'confirme') {
        clientState.notifications.unshift({
            id: 'notif-' + Date.now() + Math.random().toString(36).substring(2, 6),
            appointmentId: apt.id,
            title: 'Rendez-vous validé',
            message: `Votre rendez-vous du ${dateFormatted} à ${timeFormatted} a été validé par l'établissement.`,
            date: 'À l\'instant',
            read: false,
            type: 'success'
        });
    }
    else if (newStatus === 'annule' && oldStatus !== 'annule') {
        clientState.notifications.unshift({
            id: 'notif-' + Date.now() + Math.random().toString(36).substring(2, 6),
            appointmentId: apt.id,
            title: 'Rendez-vous refusé',
            message: `Votre demande de rendez-vous du ${dateFormatted} à ${timeFormatted} a été refusée.`,
            date: 'À l\'instant',
            read: false,
            type: 'danger'
        });
    }
}
async function syncClientAppointmentStatuses() {
    if (clientState.appointments.length === 0)
        return;
    let hasChanges = false;
    // 1. Synchronisation cross-tab locale avec les stockages de l'administrateur
    try {
        const candidateKeys = [
            STORAGE_KEYS.appointments,
            clientState.businessId ? `creno_appointments_${clientState.businessId}` : null
        ].filter(Boolean);
        let proApts = [];
        for (const key of candidateKeys) {
            const raw = localStorage.getItem(key);
            if (raw) {
                try {
                    const list = JSON.parse(raw);
                    for (const item of list) {
                        if (!proApts.some(p => p.id === item.id))
                            proApts.push(item);
                    }
                }
                catch { }
            }
        }
        if (proApts.length > 0) {
            for (const clientApt of clientState.appointments) {
                const found = proApts.find(p => p.id === clientApt.id || (p.appointmentDate === clientApt.appointmentDate &&
                    p.appointmentTime === clientApt.appointmentTime &&
                    p.clientPhone === clientState.profile.phone));
                if (found) {
                    if (found.id && clientApt.id !== found.id) {
                        clientApt.id = found.id;
                        hasChanges = true;
                    }
                    if (found.status !== clientApt.status) {
                        // Ne jamais régresser un rendez-vous validé ou annulé vers en attente
                        if (clientApt.status !== 'en_attente' && found.status === 'en_attente') {
                            continue;
                        }
                        const oldStatus = clientApt.status;
                        clientApt.status = found.status;
                        hasChanges = true;
                        handleClientAppointmentStatusChange(clientApt, oldStatus, found.status);
                    }
                }
            }
        }
    }
    catch (e) {
        console.warn('Sync cross-tab client:', e);
    }
    // 2. Synchronisation avec l'API locale partagée (multi-profils Chrome)
    if (clientState.businessId) {
        try {
            const apiRes = await fetch(`/api/appointments?user_id=${encodeURIComponent(clientState.businessId)}`);
            if (apiRes.ok) {
                const apiJson = await apiRes.json();
                if (apiJson?.data && Array.isArray(apiJson.data)) {
                    for (const remote of apiJson.data) {
                        const clientApt = clientState.appointments.find(a => a.id === remote.id);
                        if (clientApt && clientApt.status !== remote.status) {
                            if (clientApt.status !== 'en_attente' && remote.status === 'en_attente') {
                                continue;
                            }
                            const oldStatus = clientApt.status;
                            clientApt.status = remote.status;
                            hasChanges = true;
                            handleClientAppointmentStatusChange(clientApt, oldStatus, remote.status);
                        }
                    }
                }
            }
        }
        catch (e) { }
    }
    // 3. Synchronisation avec Supabase
    if (supabaseClient) {
        try {
            const ids = clientState.appointments.map(a => a.id).filter(id => !id.startsWith('apt-'));
            if (ids.length > 0) {
                const { data } = await supabaseClient
                    .from('appointments')
                    .select('id, status, date, time')
                    .in('id', ids);
                if (data && Array.isArray(data)) {
                    for (const row of data) {
                        const clientApt = clientState.appointments.find(a => a.id === row.id);
                        if (clientApt && clientApt.status !== row.status) {
                            if (clientApt.status !== 'en_attente' && row.status === 'en_attente') {
                                continue;
                            }
                            const oldStatus = clientApt.status;
                            clientApt.status = row.status;
                            hasChanges = true;
                            handleClientAppointmentStatusChange(clientApt, oldStatus, row.status);
                        }
                    }
                }
            }
        }
        catch (e) {
            console.warn('Sync distant Supabase RDV client:', e);
        }
    }
    if (hasChanges) {
        saveClientStorage();
        updateClientNotifBadge();
        if (clientState.currentView === 'appointments') {
            renderClientAppointments();
        }
        if (clientState.currentView === 'notifications') {
            renderClientNotifications();
        }
    }
}
async function initClientPortal(userId) {
    clientState.businessId = userId;
    loadClientStorage();
    setClientTheme(clientState.profile.theme);
    // Chargement de la configuration de l'établissement
    let config = { ...DEFAULT_BOOKING_CONFIG };
    let foundConfig = null;
    let profData = null;
    if (supabaseClient) {
        try {
            const { data: cfgData } = await supabaseClient
                .from('booking_configs')
                .select('*')
                .eq('user_id', userId)
                .maybeSingle();
            const { data: pData } = await supabaseClient
                .from('profiles')
                .select('full_name, phone, subscription_plan, subscription_status, trial_ends_at, created_at')
                .eq('id', userId)
                .maybeSingle();
            foundConfig = cfgData;
            profData = pData;
            if (pData) {
                const isPaid = pData.subscription_status === 'actif' || pData.subscription_status === 'active' || pData.subscription_status === 'mensuel_10k' || pData.subscription_status === 'trimestriel_25k' || pData.subscription_status === 'annuel_80k';
                const createdAt = pData.created_at ? new Date(pData.created_at) : new Date();
                const trialEnd = pData.trial_ends_at ? new Date(pData.trial_ends_at) : new Date(createdAt.getTime() + 14 * 24 * 3600 * 1000);
                clientState.isBusinessExpired = pData.subscription_status === 'expire' || (!isPaid && trialEnd.getTime() < Date.now());
            }
            // Créneaux occupés Supabase
            const { data: busy } = await supabaseClient
                .from('appointments')
                .select('date, time')
                .eq('user_id', userId)
                .neq('status', 'annule');
            if (busy) {
                clientState.busySlots = busy.map((b) => ({
                    date: b.date || b.appointment_date,
                    time: (b.time || b.appointment_time ? (b.time || b.appointment_time).substring(0, 5) : '')
                }));
            }
            // Collaborateurs actifs Supabase
            try {
                const { data: cols } = await supabaseClient
                    .from('collaborators')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('active', true);
                if (cols && Array.isArray(cols)) {
                    clientState.collaborators = cols.map((c) => ({
                        id: c.id,
                        userId: c.user_id,
                        fullName: c.full_name,
                        role: c.role || 'Collaborateur',
                        phone: c.phone || '',
                        avatarUrl: c.avatar_url || '',
                        availableDays: normalizeAvailableDays(c.available_days),
                        openingTime: c.opening_time ? c.opening_time.substring(0, 5) : '09:00',
                        closingTime: c.closing_time ? c.closing_time.substring(0, 5) : '18:00',
                        pinCode: c.pin_code || '1234',
                        active: c.active !== false,
                        createdAt: c.created_at
                    }));
                }
            }
            catch (colErr) {
                console.warn('Erreur chargement collaborateurs client Supabase', colErr);
            }
        }
        catch (e) {
            console.warn('Erreur chargement public client Supabase', e);
        }
    }
    // Fallback API partagée locale
    if (!foundConfig) {
        try {
            const apiRes = await fetch(`/api/config?user_id=${encodeURIComponent(userId)}`);
            if (apiRes.ok) {
                const apiJson = await apiRes.json();
                if (apiJson && apiJson.data)
                    foundConfig = apiJson.data;
            }
        }
        catch (e) { }
    }
    // Fallback localStorage spécifique
    if (!foundConfig) {
        try {
            const localStored = localStorage.getItem(`creno_booking_config_${userId}`) || localStorage.getItem(STORAGE_KEYS.bookingConfig);
            if (localStored)
                foundConfig = JSON.parse(localStored);
        }
        catch (e) { }
    }
    if (foundConfig) {
        config = {
            businessName: foundConfig.business_name || foundConfig.businessName || profData?.full_name || 'Établissement',
            activityType: foundConfig.activity_type || foundConfig.activityType || '',
            description: foundConfig.description || 'Prenez rendez-vous en ligne en toute simplicité',
            phoneContact: foundConfig.phone_contact || foundConfig.phoneContact || profData?.phone || '',
            address: foundConfig.address || '',
            slotDurationMinutes: Number(foundConfig.slot_duration_minutes || foundConfig.slotDurationMinutes) || 30,
            openingTime: foundConfig.opening_time ? foundConfig.opening_time.substring(0, 5) : (foundConfig.openingTime || '09:00'),
            closingTime: foundConfig.closing_time ? foundConfig.closing_time.substring(0, 5) : (foundConfig.closingTime || '18:00'),
            availableDays: normalizeAvailableDays(foundConfig.available_days || foundConfig.availableDays),
            requirePhone: foundConfig.require_phone ?? true,
            requireNotes: foundConfig.require_notes ?? false,
            enableGeolocation: foundConfig.enable_geolocation ?? true,
            latitude: foundConfig.latitude || null,
            longitude: foundConfig.longitude || null,
            googleMapsUrl: foundConfig.google_maps_url || foundConfig.googleMapsUrl || '',
            customQuestions: Array.isArray(foundConfig.custom_fields || foundConfig.customQuestions) ? (foundConfig.custom_fields || foundConfig.customQuestions) : [],
            services: Array.isArray(foundConfig.services) ? foundConfig.services : [],
            hasConfiguredSettings: true
        };
    }
    else if (profData) {
        config.businessName = profData.full_name || 'Établissement';
        if (profData.phone)
            config.phoneContact = profData.phone;
    }
    // Créneaux occupés de l'API locale
    try {
        const aptsRes = await fetch(`/api/appointments?user_id=${encodeURIComponent(userId)}`);
        if (aptsRes.ok) {
            const aptsJson = await aptsRes.json();
            if (aptsJson?.data && Array.isArray(aptsJson.data)) {
                aptsJson.data.filter((b) => b.status !== 'annule').forEach((b) => {
                    const dt = b.date || b.appointment_date;
                    const tm = (b.time || b.appointment_time ? (b.time || b.appointment_time).substring(0, 5) : '');
                    if (dt && tm && !clientState.busySlots.some(x => x.date === dt && x.time === tm)) {
                        clientState.busySlots.push({ date: dt, time: tm });
                    }
                });
            }
        }
    }
    catch (e) { }
    clientState.bookingConfig = config;
    // Mise à jour de l'en-tête client
    const bizNameEl = document.getElementById('clientHeaderBizName');
    const bizSubEl = document.getElementById('clientHeaderBizSub');
    const panelDescEl = document.getElementById('clientPanelBizDesc');
    const bookingSubEl = document.getElementById('clientBookingBizSub');
    const bookingBizNameEl = document.getElementById('clientBookingBizName');
    const activityTextEl = document.getElementById('clientBookingActivityText');
    const contactTextEl = document.getElementById('clientBookingContactText');
    const activityBadge = document.getElementById('clientBookingActivityBadge');
    const contactBadge = document.getElementById('clientBookingContactBadge');
    const finalBizName = config.businessName || 'Établissement';
    if (bizNameEl)
        bizNameEl.textContent = finalBizName;
    if (bizSubEl)
        bizSubEl.textContent = config.description ? config.description.substring(0, 32) : 'Espace Réservation';
    if (panelDescEl)
        panelDescEl.textContent = `Suivez vos rendez-vous pris auprès de ${finalBizName}`;
    if (bookingSubEl)
        bookingSubEl.textContent = `Prenez rendez-vous auprès de ${finalBizName}`;
    if (bookingBizNameEl)
        bookingBizNameEl.textContent = finalBizName;
    if (activityTextEl) {
        const act = config.activityType || 'Prestations & Services';
        activityTextEl.textContent = act;
    }
    if (contactTextEl) {
        const cont = config.phoneContact || '';
        if (cont) {
            contactTextEl.textContent = cont;
            if (contactBadge)
                contactBadge.style.display = 'inline-flex';
        }
        else if (contactBadge) {
            contactBadge.style.display = 'none';
        }
    }
    // Événements Top Bar Client
    document.getElementById('btnClientTopNotif')?.addEventListener('click', () => {
        switchClientView('notifications');
    });
    document.getElementById('btnClientTopNewRdv')?.addEventListener('click', () => {
        switchClientView('booking');
    });
    // Événements Navigation Basse Client
    document.querySelectorAll('.client-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-client-view');
            if (view)
                switchClientView(view);
        });
    });
    // Boutons d'action "Prendre un rendez-vous" / "Nouveau rendez-vous"
    document.getElementById('btnClientNewRdvAction')?.addEventListener('click', () => {
        switchClientView('booking');
    });
    document.getElementById('btnClientBookFirst')?.addEventListener('click', () => {
        switchClientView('booking');
    });
    document.getElementById('btnCancelBookingView')?.addEventListener('click', () => {
        switchClientView('appointments');
    });
    // Date picker change & input sur la vue booking
    const viewDateInput = document.getElementById('clientViewDateInput');
    if (viewDateInput) {
        const handleDateUpdate = () => {
            updateClientViewAvailableSlots(viewDateInput.value, clientState.bookingConfig, clientState.busySlots);
        };
        viewDateInput.addEventListener('change', handleDateUpdate);
        viewDateInput.addEventListener('input', handleDateUpdate);
    }
    // Soumission Formulaire Réservation Client
    const formBookingView = document.getElementById('formClientBookingView');
    if (formBookingView) {
        formBookingView.addEventListener('submit', async (e) => {
            e.preventDefault();
            await submitClientViewBooking();
        });
    }
    // Bouton Effacer Notifications
    document.getElementById('btnClientClearNotifs')?.addEventListener('click', () => {
        clientState.notifications = [];
        saveClientStorage();
        updateClientNotifBadge();
        renderClientNotifications();
    });
    // Formulaire Paramètres Coordonnées
    const formSettings = document.getElementById('formClientSettings');
    if (formSettings) {
        formSettings.addEventListener('submit', (e) => {
            e.preventDefault();
            const nameInput = document.getElementById('clientSettingsName');
            const phoneInput = document.getElementById('clientSettingsPhone');
            if (nameInput)
                clientState.profile.fullName = nameInput.value.trim();
            if (phoneInput)
                clientState.profile.phone = phoneInput.value.trim();
            saveClientStorage();
            showToast('Coordonnées enregistrées.');
        });
    }
    // Boutons Thème Clair / Sombre
    document.getElementById('btnThemeLight')?.addEventListener('click', () => {
        setClientTheme('light');
    });
    document.getElementById('btnThemeDark')?.addEventListener('click', () => {
        setClientTheme('dark');
    });
    // Lien retour vers Espace Professionnel
    document.getElementById('linkSwitchToPro')?.addEventListener('click', (e) => {
        e.preventDefault();
        localStorage.removeItem('creno_client_business_id');
        const cleanUrl = window.location.origin + window.location.pathname + '?pro=true';
        window.location.href = cleanUrl;
    });
    // Règle explicite utilisateur :
    // "quand le client clique sur le lien, il doit d'abord commencer à remplir son rendez-vous, après avoir confirmé son rendez-vous, on lui propose d'installer l'application pour avoir la réponse de validation de son rendez-vous."
    const params = new URLSearchParams(window.location.search);
    const cameViaLink = params.has('reserver');
    if (cameViaLink || clientState.appointments.length === 0) {
        switchClientView('booking');
    }
    else {
        switchClientView('appointments');
    }
    updateClientNotifBadge();
    // Synchronisation périodique des statuts de rendez-vous
    await syncClientAppointmentStatuses();
    setInterval(() => {
        syncClientAppointmentStatuses();
    }, 6000);
    window.addEventListener('storage', () => {
        syncClientAppointmentStatuses();
    });
}
async function checkClientBookingMode() {
    const params = new URLSearchParams(window.location.search);
    let targetUserId = params.get('reserver');
    const isProExplicit = params.get('pro') === 'true';
    if (!targetUserId && !state.currentUser && !isProExplicit) {
        const savedBizId = localStorage.getItem('creno_client_business_id');
        if (savedBizId) {
            targetUserId = savedBizId;
        }
    }
    if (!targetUserId)
        return false;
    // Masquer les conteneurs Pro
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    const clientAppContainer = document.getElementById('clientAppContainer');
    if (authContainer)
        authContainer.style.display = 'none';
    if (appContainer)
        appContainer.style.display = 'none';
    if (clientAppContainer)
        clientAppContainer.style.display = 'flex';
    await initClientPortal(targetUserId);
    return true;
}
// ==============================================================================
// 15. AUTHENTIFICATION SUPABASE (LOGIN / SIGNUP / LOGOUT)
// ==============================================================================
function updateAuthUI() {
    const authContainer = document.getElementById('authContainer');
    const appContainer = document.getElementById('appContainer');
    if (!state.currentUser) {
        if (authContainer)
            authContainer.style.display = 'flex';
        if (appContainer)
            appContainer.style.display = 'none';
    }
    else {
        if (authContainer)
            authContainer.style.display = 'none';
        if (appContainer)
            appContainer.style.display = 'flex';
        renderCurrentView();
    }
}
async function handleLogin(email, pass) {
    setAuthAlert(null);
    const btn = document.getElementById('btnLoginSubmit');
    if (btn)
        btn.disabled = true;
    const client = getSupabaseClient();
    if (!client) {
        setAuthAlert("Une erreur est survenue.", 'error');
        if (btn)
            btn.disabled = false;
        return;
    }
    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: email,
            password: pass
        });
        if (error) {
            console.warn('[Connexion Error]', error.message);
            const msg = (error.message || '').toLowerCase();
            if (msg.includes('invalid') ||
                msg.includes('credential') ||
                msg.includes('password') ||
                msg.includes('grant') ||
                msg.includes('user not found') ||
                error.status === 400) {
                setAuthAlert("L'un des deux identifiants est incorrect.", 'error');
            }
            else {
                setAuthAlert("Une erreur est survenue.", 'error');
            }
            if (btn)
                btn.disabled = false;
            return;
        }
        if (data && data.user) {
            state.currentUser = {
                id: data.user.id,
                email: data.user.email || email,
                fullName: data.user.user_metadata?.full_name || 'Responsable',
                businessName: data.user.user_metadata?.business_name || 'Mon Établissement',
                role: 'Administrateur'
            };
            saveStorage();
            updateAuthUI();
            await logUserActivity('connexion', 'auth', data.user.id, { email });
            await loadSupabaseData();
            showToast('Connexion réussie.');
            return;
        }
    }
    catch (err) {
        console.warn('[Connexion Catch]', err);
        setAuthAlert("Une erreur est survenue.", 'error');
    }
    finally {
        if (btn)
            btn.disabled = false;
    }
}
async function handleSignup(fullName, businessName, email, pass, phone = '', activityType = '', logoUrl = '', description = '', subscriptionPlan = 'trial_14d') {
    setAuthAlert(null);
    const btn = document.getElementById('btnSignupSubmit');
    if (btn)
        btn.disabled = true;
    const client = getSupabaseClient();
    if (!client) {
        setAuthAlert("Une erreur est survenue.", 'error');
        if (btn)
            btn.disabled = false;
        return;
    }
    const isTrial = subscriptionPlan === 'trial_14d';
    const trialEndsAt = isTrial ? new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString() : undefined;
    const subscriptionStatus = isTrial ? 'trial' : 'active';
    try {
        const { data, error } = await client.auth.signUp({
            email: email,
            password: pass,
            options: {
                data: {
                    full_name: fullName,
                    business_name: businessName,
                    phone: phone,
                    activity_type: activityType,
                    subscription_plan: subscriptionPlan
                }
            }
        });
        if (error) {
            console.warn('[Signup Error]', error.message);
            setAuthAlert("Une erreur est survenue lors de l'inscription.", 'error');
            if (btn)
                btn.disabled = false;
            return;
        }
        if (data && data.user) {
            // Cas 1 : Session active immédiate (email déjà confirmé ou confirmation désactivée)
            if (data.session) {
                state.currentUser = {
                    id: data.user.id,
                    email: data.user.email || email,
                    fullName: fullName,
                    businessName: businessName,
                    role: 'Administrateur',
                    phone: phone,
                    activityType: activityType,
                    subscriptionPlan: subscriptionPlan,
                    subscriptionStatus: subscriptionStatus,
                    trialEndsAt: trialEndsAt,
                    logoUrl: logoUrl || undefined,
                    description: description || undefined
                };
                state.bookingConfig.businessName = businessName;
                state.bookingConfig.activityType = activityType;
                state.bookingConfig.phoneContact = phone;
                state.bookingConfig.description = description || 'Prenez rendez-vous en ligne en toute simplicité';
                saveStorage();
                updateAuthUI();
                // Création ou synchronisation immédiate du profil et de la config dans Supabase
                try {
                    await client.from('profiles').upsert({
                        id: data.user.id,
                        full_name: fullName,
                        phone: phone || null,
                        subscription_plan: subscriptionPlan,
                        subscription_status: subscriptionStatus,
                        trial_ends_at: trialEndsAt || null,
                        logo_url: logoUrl || null,
                        description: description || null,
                        updated_at: new Date().toISOString()
                    });
                    await client.from('booking_configs').upsert({
                        user_id: data.user.id,
                        business_name: businessName,
                        activity_type: activityType,
                        phone_contact: phone,
                        description: description || 'Prenez rendez-vous en ligne en toute simplicité',
                        updated_at: new Date().toISOString()
                    });
                    await logUserActivity('creation_compte', 'auth', data.user.id, { email, businessName, subscriptionPlan });
                }
                catch (syncErr) {
                    console.warn('Sync profil post-inscription:', syncErr);
                }
                await loadSupabaseData();
                showToast('Compte professionnel créé.');
            }
            else {
                // Cas 2 : Compte créé dans auth.users mais Supabase attend une confirmation d'email
                setAuthAlert("Compte créé. Veuillez vérifier vos emails pour valider votre inscription puis connectez-vous.", 'info');
                // Basculer sur l'onglet Connexion avec l'email pré-rempli
                const tabLogin = document.getElementById('tabBtnLogin');
                const tabSignup = document.getElementById('tabBtnSignup');
                const formLogin = document.getElementById('formLogin');
                const formSignup = document.getElementById('formSignup');
                tabLogin?.classList.add('active');
                tabSignup?.classList.remove('active');
                document.querySelector('.auth-card')?.classList.remove('signup-mode');
                if (formLogin)
                    formLogin.style.display = 'flex';
                if (formSignup)
                    formSignup.style.display = 'none';
                const loginEmailInput = document.getElementById('loginEmail');
                if (loginEmailInput)
                    loginEmailInput.value = email;
            }
            return;
        }
    }
    catch (err) {
        console.warn('[Signup Catch]', err);
        setAuthAlert("Une erreur est survenue.", 'error');
    }
    finally {
        if (btn)
            btn.disabled = false;
    }
}
function initSignupStepper() {
    const form = document.getElementById('formSignup');
    if (!form)
        return;
    const pane1 = document.getElementById('signupPane1');
    const pane2 = document.getElementById('signupPane2');
    const pane3 = document.getElementById('signupPane3');
    const node1 = document.getElementById('stepNode1');
    const node2 = document.getElementById('stepNode2');
    const node3 = document.getElementById('stepNode3');
    const line1 = document.getElementById('stepLine1');
    const line2 = document.getElementById('stepLine2');
    const goToStep = (step) => {
        setAuthAlert(null);
        if (pane1)
            pane1.style.display = step === 1 ? 'block' : 'none';
        if (pane2)
            pane2.style.display = step === 2 ? 'block' : 'none';
        if (pane3)
            pane3.style.display = step === 3 ? 'block' : 'none';
        if (node1) {
            node1.className = `signup-step-node ${step === 1 ? 'active' : step > 1 ? 'completed' : ''}`;
        }
        if (node2) {
            node2.className = `signup-step-node ${step === 2 ? 'active' : step > 2 ? 'completed' : ''}`;
        }
        if (node3) {
            node3.className = `signup-step-node ${step === 3 ? 'active' : ''}`;
        }
        if (line1) {
            line1.className = `signup-step-line ${step > 1 ? 'completed' : ''}`;
        }
        if (line2) {
            line2.className = `signup-step-line ${step > 2 ? 'completed' : ''}`;
        }
    };
    // Étape 1 -> Étape 2
    document.getElementById('btnSignupNext1')?.addEventListener('click', () => {
        const email = document.getElementById('signupEmail')?.value.trim();
        const pass = document.getElementById('signupPassword')?.value;
        const confirm = document.getElementById('signupPasswordConfirm')?.value;
        if (!email || !email.includes('@')) {
            setAuthAlert('Veuillez renseigner une adresse email valide.', 'error');
            return;
        }
        if (!pass || pass.length < 6) {
            setAuthAlert('Le mot de passe doit comporter au moins 6 caractères.', 'error');
            return;
        }
        if (pass !== confirm) {
            setAuthAlert('Les deux mots de passe ne correspondent pas.', 'error');
            return;
        }
        goToStep(2);
    });
    // Étape 2 -> Étape 1
    document.getElementById('btnSignupBack2')?.addEventListener('click', () => {
        goToStep(1);
    });
    // Gestion du secteur d'activité "Autre"
    const selectActivity = document.getElementById('signupActivityType');
    const customActivityWrapper = document.getElementById('signupActivityCustomWrapper');
    selectActivity?.addEventListener('change', () => {
        if (customActivityWrapper) {
            customActivityWrapper.style.display = selectActivity.value === 'Autre' ? 'block' : 'none';
        }
    });
    // Gestion Upload Photo/Logo avec compression canvas offscreen
    let signupLogoBase64 = '';
    const logoInput = document.getElementById('signupLogoInput');
    const logoPreviewContainer = document.getElementById('signupLogoPreviewContainer');
    const logoPreviewImg = document.getElementById('signupLogoPreview');
    const btnRemoveLogo = document.getElementById('btnRemoveSignupLogo');
    logoInput?.addEventListener('change', () => {
        const file = logoInput.files?.[0];
        if (!file)
            return;
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const maxDim = 300;
                let width = img.width;
                let height = img.height;
                if (width > height && width > maxDim) {
                    height = Math.round((height * maxDim) / width);
                    width = maxDim;
                }
                else if (height > maxDim) {
                    width = Math.round((width * maxDim) / height);
                    height = maxDim;
                }
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    signupLogoBase64 = canvas.toDataURL('image/jpeg', 0.85);
                    if (logoPreviewImg)
                        logoPreviewImg.src = signupLogoBase64;
                    if (logoPreviewContainer)
                        logoPreviewContainer.style.display = 'block';
                }
            };
            img.src = e.target?.result;
        };
        reader.readAsDataURL(file);
    });
    btnRemoveLogo?.addEventListener('click', () => {
        signupLogoBase64 = '';
        if (logoInput)
            logoInput.value = '';
        if (logoPreviewContainer)
            logoPreviewContainer.style.display = 'none';
        if (logoPreviewImg)
            logoPreviewImg.src = '';
    });
    // Étape 2 -> Étape 3
    document.getElementById('btnSignupNext2')?.addEventListener('click', () => {
        const actType = selectActivity?.value || '';
        const actCustom = document.getElementById('signupActivityCustom')?.value.trim();
        const finalActivity = actType === 'Autre' ? actCustom : actType;
        const bizName = document.getElementById('signupBusinessName')?.value.trim();
        const fullName = document.getElementById('signupFullName')?.value.trim();
        const phone = document.getElementById('signupPhone')?.value.trim();
        if (!finalActivity) {
            setAuthAlert("Veuillez sélectionner ou préciser votre secteur d'activité.", 'error');
            return;
        }
        if (!bizName) {
            setAuthAlert("Veuillez renseigner le nom de votre établissement.", 'error');
            return;
        }
        if (!fullName) {
            setAuthAlert("Veuillez renseigner le nom et prénom du responsable.", 'error');
            return;
        }
        if (!phone) {
            setAuthAlert("Veuillez renseigner le numéro de téléphone WhatsApp.", 'error');
            return;
        }
        goToStep(3);
    });
    // Étape 3 -> Étape 2
    document.getElementById('btnSignupBack3')?.addEventListener('click', () => {
        goToStep(2);
    });
    // Soumission finale
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('signupEmail')?.value.trim();
        const pass = document.getElementById('signupPassword')?.value;
        const actType = selectActivity?.value || '';
        const actCustom = document.getElementById('signupActivityCustom')?.value.trim();
        const finalActivity = actType === 'Autre' ? actCustom : actType;
        const bizName = document.getElementById('signupBusinessName')?.value.trim();
        const fullName = document.getElementById('signupFullName')?.value.trim();
        const phone = document.getElementById('signupPhone')?.value.trim();
        const description = document.getElementById('signupDescription')?.value.trim() || '';
        const checkedPlan = document.querySelector('input[name="signupPlan"]:checked');
        const plan = checkedPlan ? checkedPlan.value : 'trial_14d';
        await handleSignup(fullName, bizName, email, pass, phone, finalActivity, signupLogoBase64, description, plan);
    });
}
async function handleLogout() {
    if (confirm('Voulez-vous vous déconnecter de votre espace de gestion ?')) {
        if (supabaseClient && state.currentUser) {
            try {
                await logUserActivity('deconnexion', 'auth', state.currentUser.id);
                await supabaseClient.auth.signOut();
            }
            catch (e) {
                console.warn('Erreur déconnexion', e);
            }
        }
        state.currentUser = null;
        localStorage.removeItem(STORAGE_KEYS.userSession);
        updateAuthUI();
        showToast('Session fermée.');
    }
}
function exportAppointmentsCsv(list, filenamePrefix = 'creno-rendez-vous') {
    if (list.length === 0) {
        showToast('Aucun rendez-vous à exporter.');
        return;
    }
    const headers = ['Date', 'Heure', 'Client', 'Telephone', 'Email', 'Prestation', 'Duree (min)', 'Statut', 'Source', 'Notes'];
    const rows = list.map(a => [
        a.appointmentDate,
        a.appointmentTime,
        `"${(a.clientName || '').replace(/"/g, '""')}"`,
        `"${(a.clientPhone || '').replace(/"/g, '""')}"`,
        `"${(a.clientEmail || '').replace(/"/g, '""')}"`,
        `"${(a.serviceName || '').replace(/"/g, '""')}"`,
        a.durationMinutes || 30,
        getStatusLabel(a.status),
        a.source === 'lien_public' ? 'Lien client' : 'Manuel',
        `"${(a.notes || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filenamePrefix}-${todayIso}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Fichier CSV exporté avec succès.');
}
// ==============================================================================
// 16. ÉVÉNEMENTS GLOBAUX & INITIALISATION
// ==============================================================================
function bindEvents() {
    // Onglets Auth (Connexion / Inscription)
    const tabLogin = document.getElementById('tabBtnLogin');
    const tabSignup = document.getElementById('tabBtnSignup');
    const formLogin = document.getElementById('formLogin');
    const formSignup = document.getElementById('formSignup');
    tabLogin?.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabSignup?.classList.remove('active');
        document.querySelector('.auth-card')?.classList.remove('signup-mode');
        if (formLogin)
            formLogin.style.display = 'flex';
        if (formSignup)
            formSignup.style.display = 'none';
        setAuthAlert(null);
    });
    tabSignup?.addEventListener('click', () => {
        tabSignup.classList.add('active');
        tabLogin?.classList.remove('active');
        document.querySelector('.auth-card')?.classList.add('signup-mode');
        if (formSignup)
            formSignup.style.display = 'flex';
        if (formLogin)
            formLogin.style.display = 'none';
        setAuthAlert(null);
    });
    formLogin?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const pass = document.getElementById('loginPassword').value;
        await handleLogin(email, pass);
    });
    // Initialisation du Stepper d'Inscription en 3 étapes
    initSignupStepper();
    // Modals Collaborateurs & Supervision
    ['btnOpenAddCollaborator', 'btnOpenAddCollabModal'].forEach(btnId => {
        document.getElementById(btnId)?.addEventListener('click', () => openCollaboratorModal());
    });
    ['btnCloseCollaboratorModal', 'btnCloseCollabModal', 'btnCancelCollaboratorModal', 'btnCancelCollabModal'].forEach(btnId => {
        document.getElementById(btnId)?.addEventListener('click', () => {
            const m = document.getElementById('modalCollaborator');
            if (m)
                m.style.display = 'none';
        });
    });
    document.getElementById('formCollaborator')?.addEventListener('submit', handleSaveCollaborator);
    // Modal Notes Internes & Actions Collaborateur
    document.getElementById('btnCloseInternalNotesModal')?.addEventListener('click', () => {
        const m = document.getElementById('modalAppointmentInternalNotes');
        if (m)
            m.style.display = 'none';
    });
    document.getElementById('btnCancelInternalNotesModal')?.addEventListener('click', () => {
        const m = document.getElementById('modalAppointmentInternalNotes');
        if (m)
            m.style.display = 'none';
    });
    document.getElementById('formAppointmentInternalNotes')?.addEventListener('submit', handleSaveInternalNotes);
    // Modal Modification / Reprogrammation Client
    document.getElementById('btnCloseRescheduleModal')?.addEventListener('click', () => {
        const m = document.getElementById('modalClientReschedule');
        if (m)
            m.style.display = 'none';
    });
    document.getElementById('btnCancelReschedule')?.addEventListener('click', () => {
        const m = document.getElementById('modalClientReschedule');
        if (m)
            m.style.display = 'none';
    });
    document.getElementById('formClientReschedule')?.addEventListener('submit', submitClientReschedule);
    // Modal Annulation Client
    document.getElementById('btnCloseCancelModal')?.addEventListener('click', () => {
        const m = document.getElementById('modalClientCancel');
        if (m)
            m.style.display = 'none';
    });
    document.getElementById('btnDismissCancel')?.addEventListener('click', () => {
        const m = document.getElementById('modalClientCancel');
        if (m)
            m.style.display = 'none';
    });
    document.getElementById('formClientCancel')?.addEventListener('submit', submitClientCancel);
    // Modal Formules d'Abonnement Créno
    document.getElementById('btnOpenSubscriptionModal')?.addEventListener('click', openSubscriptionModal);
    ['btnCloseSubscriptionModal', 'btnCancelSubscriptionModal'].forEach(btnId => {
        document.getElementById(btnId)?.addEventListener('click', () => {
            const m = document.getElementById('modalSubscriptionPlans');
            if (m)
                m.style.display = 'none';
        });
    });
    document.getElementById('btnConfirmSubscriptionPlan')?.addEventListener('click', handleConfirmSubscriptionPlan);
    // Liens de navigation Sidebar
    document.querySelectorAll('.sidebar-link').forEach(link => {
        link.addEventListener('click', () => {
            const view = link.getAttribute('data-view');
            if (view)
                switchView(view);
        });
    });
    // Liens de navigation Mobile (Navbar du bas)
    document.querySelectorAll('.mobile-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.getAttribute('data-view');
            if (view)
                switchView(view);
        });
    });
    // Toggle Sidebar (PC Rétraction & Tablette Menu Hamburger)
    const btnToggleSidebar = document.getElementById('btnToggleSidebar');
    const sidebarBackdrop = document.getElementById('sidebarBackdrop');
    const appLayout = document.getElementById('appContainer');
    const toggleSidebar = () => {
        if (appLayout) {
            if (window.innerWidth <= 1024 && window.innerWidth > 768) {
                // Mode tablette : tiroir glissant (drawer)
                appLayout.classList.toggle('sidebar-open-drawer');
            }
            else {
                // Mode PC desktop : rétraction / dépliement complet
                appLayout.classList.toggle('sidebar-collapsed');
            }
        }
    };
    btnToggleSidebar?.addEventListener('click', toggleSidebar);
    sidebarBackdrop?.addEventListener('click', () => {
        appLayout?.classList.remove('sidebar-open-drawer');
    });
    // Déconnexion
    document.getElementById('btnLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnLogoutFromAccount')?.addEventListener('click', handleLogout);
    document.getElementById('btnSettingsLogout')?.addEventListener('click', handleLogout);
    document.getElementById('btnSettingsGoToAccount')?.addEventListener('click', () => switchView('account'));
    // Boutons rapides d'ouverture de modal RDV
    document.getElementById('btnQuickNewAppointment')?.addEventListener('click', () => openAppointmentModal());
    document.getElementById('btnDashNewRdv')?.addEventListener('click', () => openAppointmentModal());
    document.getElementById('btnNewAppointment')?.addEventListener('click', () => openAppointmentModal());
    document.getElementById('btnCloseAppointmentModal')?.addEventListener('click', closeAppointmentModal);
    document.getElementById('btnCancelAppointmentModal')?.addEventListener('click', closeAppointmentModal);
    // Redirection rapide depuis Dashboard
    document.getElementById('btnDashShareLink')?.addEventListener('click', () => switchView('settings'));
    document.getElementById('btnDashViewAllRdv')?.addEventListener('click', () => switchView('appointments'));
    // Filtres Rendez-vous
    document.getElementById('filterRdvStatus')?.addEventListener('change', (e) => {
        state.filters.status = e.target.value;
        renderAppointments();
    });
    document.getElementById('filterRdvPeriod')?.addEventListener('change', (e) => {
        state.filters.period = e.target.value;
        renderAppointments();
    });
    document.getElementById('topbarSearchInput')?.addEventListener('input', (e) => {
        state.filters.search = e.target.value;
        if (state.currentView === 'appointments')
            renderAppointments();
    });
    document.getElementById('btnResetRdvFilters')?.addEventListener('click', () => {
        state.filters.search = '';
        state.filters.period = 'ALL';
        state.filters.status = 'ALL';
        state.filters.collaboratorId = 'ALL';
        const s1 = document.getElementById('filterRdvStatus');
        const s2 = document.getElementById('filterRdvPeriod');
        const s3 = document.getElementById('topbarSearchInput');
        const s4 = document.getElementById('filterRdvCollaborator');
        if (s1)
            s1.value = 'ALL';
        if (s2)
            s2.value = 'ALL';
        if (s3)
            s3.value = '';
        if (s4)
            s4.value = 'ALL';
        renderAppointments();
    });
    // Export CSV des Rendez-vous
    document.getElementById('btnExportRdvCsv')?.addEventListener('click', () => {
        const list = getFilteredAppointments();
        exportAppointmentsCsv(list, 'creno-rendez-vous');
    });
    // Export CSV de l'Historique
    document.getElementById('btnExportHistoryCsv')?.addEventListener('click', () => {
        const list = getFilteredHistoryAppointments();
        exportAppointmentsCsv(list, `creno-historique-${state.historyPeriod}`);
    });
    // Mise à jour Profil (Compte)
    document.getElementById('formUserProfile')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fullName = document.getElementById('accFullName').value.trim();
        const businessName = document.getElementById('accBusinessName').value.trim();
        const phone = document.getElementById('accPhone').value.trim();
        if (state.currentUser) {
            state.currentUser.fullName = fullName;
            state.currentUser.businessName = businessName;
            state.bookingConfig.businessName = businessName;
            state.bookingConfig.phoneContact = phone;
            saveStorage();
            renderWorkspaceHeader();
            showToast('Profil mis à jour.');
            if (supabaseClient) {
                try {
                    await supabaseClient.from('profiles').update({
                        full_name: fullName,
                        phone: phone,
                        updated_at: new Date().toISOString()
                    }).eq('id', state.currentUser.id);
                    await supabaseClient.from('booking_configs').update({
                        business_name: businessName,
                        phone_contact: phone,
                        updated_at: new Date().toISOString()
                    }).eq('user_id', state.currentUser.id);
                    await logUserActivity('mise_a_jour_profil', 'profile', state.currentUser.id);
                }
                catch (err) {
                    console.warn('Erreur mise à jour profil Supabase', err);
                }
            }
        }
    });
    // Modification mot de passe
    document.getElementById('formChangePassword')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const newPass = document.getElementById('accNewPassword').value;
        if (!newPass || newPass.length < 6) {
            alert('Le mot de passe doit comporter au moins 6 caractères.');
            return;
        }
        if (supabaseClient) {
            try {
                const { error } = await supabaseClient.auth.updateUser({ password: newPass });
                if (error) {
                    alert(`Erreur : ${error.message}`);
                    return;
                }
                document.getElementById('accNewPassword').value = '';
                showToast('Mot de passe modifié avec succès.');
                await logUserActivity('changement_mot_de_passe', 'auth', state.currentUser?.id);
            }
            catch (err) {
                alert(`Erreur : ${err.message}`);
            }
        }
        else {
            document.getElementById('accNewPassword').value = '';
            showToast('Mot de passe simulé modifié.');
        }
    });
    // Bascule Période Historique (Hebdo / Mensuel / Tout)
    document.querySelectorAll('#historyPeriodToggle button[data-period]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#historyPeriodToggle button[data-period]').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            state.historyPeriod = target.getAttribute('data-period') || 'weekly';
            renderHistory();
        });
    });
    // Bascule Filtre Statut Historique (Tous / Confirmés & Honorés / Annulés)
    document.querySelectorAll('#historyStatusToggle button[data-status-filter]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#historyStatusToggle button[data-status-filter]').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            state.historyStatusFilter = target.getAttribute('data-status-filter') || 'ALL';
            renderHistory();
        });
    });
    // Bascule Portée Fréquence (Mois / Global)
    document.querySelectorAll('#frequencyScopeToggle button').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#frequencyScopeToggle button').forEach(b => b.classList.remove('active'));
            const target = e.currentTarget;
            target.classList.add('active');
            state.frequencyScope = target.getAttribute('data-scope') || 'month';
            renderFrequency();
        });
    });
    // Synchronisation en direct des saisies dans le formulaire de réservation (évite toute perte de données)
    const formBooking = document.getElementById('formBookingConfig');
    if (formBooking) {
        formBooking.addEventListener('input', (e) => {
            const target = e.target;
            if (!target)
                return;
            if (target.id === 'cfgBusinessName')
                state.bookingConfig.businessName = target.value;
            if (target.id === 'cfgActivityType')
                state.bookingConfig.activityType = target.value;
            if (target.id === 'cfgOpeningTime')
                state.bookingConfig.openingTime = target.value;
            if (target.id === 'cfgClosingTime')
                state.bookingConfig.closingTime = target.value;
            if (target.id === 'cfgPhoneContact')
                state.bookingConfig.phoneContact = target.value;
            if (target.id === 'cfgAddress')
                state.bookingConfig.address = target.value;
            if (target.classList.contains('custom-question-input')) {
                const questions = [];
                formBooking.querySelectorAll('.custom-question-input').forEach(inp => {
                    questions.push(inp.value);
                });
                state.bookingConfig.customQuestions = questions;
            }
        });
        formBooking.addEventListener('change', (e) => {
            const target = e.target;
            if (!target)
                return;
            if (target.id === 'cfgSlotDuration') {
                state.bookingConfig.slotDurationMinutes = Number(target.value) || 30;
            }
            if (target.name === 'cfgDays') {
                const days = [];
                formBooking.querySelectorAll('input[name="cfgDays"]:checked').forEach(cb => {
                    days.push(cb.value.toLowerCase().trim());
                });
                state.bookingConfig.availableDays = days;
            }
            if (target.id === 'cfgEnableGeolocation') {
                state.bookingConfig.enableGeolocation = target.checked;
            }
        });
    }
    // Synchronisation en direct du profil utilisateur
    const formProfile = document.getElementById('formUserProfile');
    if (formProfile) {
        formProfile.addEventListener('input', (e) => {
            const target = e.target;
            if (!target)
                return;
            if (target.id === 'accFullName' && state.currentUser) {
                state.currentUser.fullName = target.value;
            }
            if (target.id === 'accBusinessName') {
                if (state.currentUser)
                    state.currentUser.businessName = target.value;
                state.bookingConfig.businessName = target.value;
            }
            if (target.id === 'accPhone') {
                state.bookingConfig.phoneContact = target.value;
            }
        });
    }
    // Sauvegarde Configuration Réservation (Paramètres)
    document.getElementById('formBookingConfig')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const bizName = document.getElementById('cfgBusinessName').value.trim();
        const openTime = document.getElementById('cfgOpeningTime').value;
        const closeTime = document.getElementById('cfgClosingTime').value;
        const slotDuration = Number(document.getElementById('cfgSlotDuration').value) || 30;
        const phone = document.getElementById('cfgPhoneContact').value.trim();
        const address = document.getElementById('cfgAddress').value.trim();
        const enableGeo = document.getElementById('cfgEnableGeolocation')?.checked ?? true;
        const lat = Number(document.getElementById('cfgLatitude')?.value) || null;
        const lng = Number(document.getElementById('cfgLongitude')?.value) || null;
        const mapsUrl = document.getElementById('cfgGoogleMapsUrl')?.value || '';
        const activityVal = document.getElementById('cfgActivityType')?.value.trim() || '';
        const selectedDays = [];
        document.querySelectorAll('input[name="cfgDays"]:checked').forEach(cb => {
            selectedDays.push(cb.value.toLowerCase().trim());
        });
        // Si l'administrateur n'a coché aucune case spécifique, on applique les jours ouvrables standards (Lundi à Samedi)
        // pour garantir que l'établissement reste ouvert à la réservation pour les clients
        const finalDays = selectedDays.length > 0 ? selectedDays : STANDARD_BUSINESS_DAYS;
        // Récupérer les questions supplémentaires personnalisées
        const customQuestions = [];
        document.querySelectorAll('.custom-question-input').forEach(inp => {
            const v = inp.value.trim();
            if (v)
                customQuestions.push(v);
        });
        state.bookingConfig = {
            ...state.bookingConfig,
            businessName: bizName,
            activityType: activityVal,
            openingTime: openTime,
            closingTime: closeTime,
            slotDurationMinutes: slotDuration,
            phoneContact: phone,
            address: address,
            availableDays: finalDays,
            enableGeolocation: enableGeo,
            latitude: lat,
            longitude: lng,
            googleMapsUrl: mapsUrl,
            customQuestions: customQuestions,
            hasConfiguredSettings: true
        };
        saveStorage();
        renderWorkspaceHeader();
        renderSettings();
        // Révéler le bloc de lien client & code QR et faire défiler dessus
        const shareBox = document.getElementById('clientShareBox');
        if (shareBox) {
            shareBox.style.display = 'block';
            shareBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        showToast('Paramètres de réservation enregistrés et lien client activé.');
        // Sauvegarde API locale partagée (multi-profils Chrome sur localhost)
        try {
            await fetch('/api/config', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: state.currentUser ? state.currentUser.id : 'admin',
                    ...state.bookingConfig,
                    customQuestions: customQuestions
                })
            });
        }
        catch (e) { }
        // Sauvegarde Supabase
        if (supabaseClient && state.currentUser) {
            try {
                await supabaseClient.from('booking_configs').upsert({
                    user_id: state.currentUser.id,
                    business_name: bizName,
                    activity_type: activityVal,
                    opening_time: openTime,
                    closing_time: closeTime,
                    slot_duration_minutes: slotDuration,
                    phone_contact: phone,
                    address: address,
                    available_days: finalDays,
                    enable_geolocation: enableGeo,
                    latitude: lat,
                    longitude: lng,
                    google_maps_url: mapsUrl,
                    custom_fields: customQuestions,
                    services: state.bookingConfig.services || [],
                    updated_at: new Date().toISOString()
                }, { onConflict: 'user_id' });
                await supabaseClient.from('profiles').update({
                    phone: phone,
                    updated_at: new Date().toISOString()
                }).eq('id', state.currentUser.id);
                await logUserActivity('mise_a_jour_parametres', 'booking_config', state.currentUser.id);
            }
            catch (err) {
                console.warn('Erreur mise à jour booking_configs Supabase', err);
            }
        }
    });
    // Copier le lien de réservation client
    document.getElementById('btnCopyShareUrl')?.addEventListener('click', () => {
        const url = getClientBookingUrl();
        navigator.clipboard.writeText(url).then(() => {
            showToast('Lien copié dans le presse-papier.');
        }).catch(() => {
            alert(`Lien de réservation : ${url}`);
        });
    });
    // Télécharger le Code QR
    document.getElementById('btnDownloadQr')?.addEventListener('click', downloadQrCode);
    // Tester la page client (ouvre dans un nouvel onglet)
    document.getElementById('btnTestShareUrl')?.addEventListener('click', () => {
        window.open(getClientBookingUrl(), '_blank');
    });
    // Formulaire d'enregistrement/modification de Rendez-vous
    document.getElementById('formAppointment')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('appointmentId').value;
        const dateVal = document.getElementById('appointmentDate').value;
        const timeVal = document.getElementById('appointmentTime').value;
        const clientVal = document.getElementById('appointmentClientName').value.trim();
        const phoneVal = document.getElementById('appointmentClientPhone').value.trim();
        const emailVal = document.getElementById('appointmentClientEmail').value.trim();
        const durationVal = Number(document.getElementById('appointmentDurationMinutes').value) || 30;
        const serviceVal = document.getElementById('appointmentServiceName').value.trim();
        const statusVal = document.getElementById('appointmentStatus').value;
        const notesVal = document.getElementById('appointmentNotes').value.trim();
        if (id) {
            // Modification
            const apt = state.appointments.find(a => a.id === id);
            if (apt) {
                apt.appointmentDate = dateVal;
                apt.appointmentTime = timeVal;
                apt.clientName = clientVal;
                apt.clientPhone = phoneVal;
                apt.clientEmail = emailVal;
                apt.durationMinutes = durationVal;
                apt.serviceName = serviceVal;
                apt.status = statusVal;
                apt.notes = notesVal;
                if (supabaseClient && state.currentUser) {
                    await supabaseClient.from('appointments').update({
                        date: dateVal,
                        appointment_date: dateVal,
                        time: timeVal,
                        appointment_time: timeVal,
                        client: clientVal,
                        client_name: clientVal,
                        client_phone: phoneVal,
                        client_whatsapp: phoneVal,
                        duration: durationVal,
                        duration_minutes: durationVal,
                        title: serviceVal,
                        service_name: serviceVal,
                        status: statusVal,
                        notes: notesVal
                    }).eq('id', id);
                    await logUserActivity('modification_rdv', 'appointment', id, {
                        clientName: clientVal,
                        date: dateVal,
                        time: timeVal
                    });
                }
            }
        }
        else {
            // Création
            const newId = 'apt-' + Date.now();
            const newApt = {
                id: newId,
                userId: state.currentUser?.id,
                clientName: clientVal,
                clientPhone: phoneVal,
                clientEmail: emailVal,
                appointmentDate: dateVal,
                appointmentTime: timeVal,
                durationMinutes: durationVal,
                serviceName: serviceVal,
                status: statusVal,
                notes: notesVal,
                source: 'manuel',
                createdAt: new Date().toISOString()
            };
            state.appointments.unshift(newApt);
            if (supabaseClient && state.currentUser) {
                const { data } = await supabaseClient.from('appointments').insert([{
                        user_id: state.currentUser.id,
                        client: clientVal,
                        client_name: clientVal,
                        client_phone: phoneVal,
                        client_whatsapp: phoneVal,
                        title: serviceVal,
                        service_name: serviceVal,
                        date: dateVal,
                        appointment_date: dateVal,
                        time: timeVal,
                        appointment_time: timeVal,
                        duration: durationVal,
                        duration_minutes: durationVal,
                        status: statusVal,
                        notes: notesVal,
                        source: 'manuel'
                    }]).select();
                if (data && data[0]) {
                    newApt.id = data[0].id;
                }
                await logUserActivity('creation_rdv', 'appointment', newApt.id, {
                    clientName: clientVal,
                    date: dateVal,
                    time: timeVal
                });
            }
        }
        saveStorage();
        closeAppointmentModal();
        renderCurrentView();
        showToast('Rendez-vous enregistré avec succès.');
    });
    // Cloche de notifications dans le header
    document.getElementById('btnHeaderNotifications')?.addEventListener('click', () => {
        switchView('notifications');
    });
    // Marquer toutes les notifications comme lues
    document.getElementById('btnMarkAllNotificationsRead')?.addEventListener('click', markAllNotificationsAsRead);
    // Détection position GPS (Paramètres)
    document.getElementById('btnDetectGpsLocation')?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert('La géolocalisation n\'est pas supportée par votre navigateur.');
            return;
        }
        const indicator = document.getElementById('gpsStatusIndicator');
        if (indicator)
            indicator.textContent = 'Détection GPS en cours...';
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;
            document.getElementById('cfgLatitude').value = String(lat);
            document.getElementById('cfgLongitude').value = String(lng);
            document.getElementById('cfgGoogleMapsUrl').value = mapsUrl;
            state.bookingConfig.latitude = lat;
            state.bookingConfig.longitude = lng;
            state.bookingConfig.googleMapsUrl = mapsUrl;
            if (indicator)
                indicator.textContent = `Position : ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            showToast('Position GPS capturée.');
        }, (err) => {
            if (indicator)
                indicator.textContent = 'Accès GPS refusé ou indisponible.';
            console.warn('Erreur GPS', err);
        }, { enableHighAccuracy: true });
    });
    // Vider les données locales
    document.getElementById('btnResetToDefaults')?.addEventListener('click', () => {
        if (confirm('Voulez-vous réinitialiser toutes les données locales en mémoire ?')) {
            state.appointments = [];
            state.notifications = [];
            state.bookingConfig = { ...DEFAULT_BOOKING_CONFIG };
            saveStorage();
            renderCurrentView();
            showToast('Données locales réinitialisées.');
        }
    });
    // Télécharger sauvegarde JSON
    document.getElementById('btnDownloadBackup')?.addEventListener('click', () => {
        const backup = {
            exportDate: new Date().toISOString(),
            bookingConfig: state.bookingConfig,
            appointments: state.appointments
        };
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `creno-sauvegarde-${todayIso}.json`;
        a.click();
        URL.revokeObjectURL(url);
    });
}
// ==============================================================================
// 17. UTILITAIRES DE RENDU & FORMATAGE
// ==============================================================================
function escapeHtml(str) {
    if (!str)
        return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function formatDisplayDate(dateStr) {
    if (!dateStr)
        return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}
// ==============================================================================
// 18. SYNCHRONISATION EN TEMPS RÉEL DU DASHBOARD ADMINISTRATEUR
// ==============================================================================
let adminSyncInterval = null;
async function syncNewAppointmentsAndNotifs() {
    if (!supabaseClient || !state.currentUser)
        return;
    try {
        let hasChanges = false;
        // 1. Nouveaux rendez-vous récents ou mises à jour
        const { data: rdvList } = await supabaseClient
            .from('appointments')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .order('date', { ascending: false })
            .order('time', { ascending: false });
        if (rdvList && Array.isArray(rdvList)) {
            for (const item of rdvList) {
                const existing = state.appointments.find(a => a.id === item.id);
                if (!existing) {
                    state.appointments.unshift({
                        id: item.id,
                        userId: item.user_id,
                        collaboratorId: item.collaborator_id || undefined,
                        clientName: item.client || item.client_name || 'Client',
                        clientEmail: item.client_email || '',
                        clientPhone: item.client_whatsapp || item.client_phone || '',
                        serviceName: item.title || item.service_name || 'Rendez-vous standard',
                        servicePrice: Number(item.service_price) || 0,
                        appointmentDate: item.date || item.appointment_date,
                        appointmentTime: (item.time || item.appointment_time || '09:00').substring(0, 5),
                        durationMinutes: item.duration || item.duration_minutes || 30,
                        status: item.status,
                        notes: item.notes || '',
                        internalNotes: item.internal_notes || undefined,
                        clientCancelReason: item.client_cancel_reason || undefined,
                        source: item.source || 'lien_public',
                        createdAt: item.created_at
                    });
                    hasChanges = true;
                }
                else {
                    if (existing.status !== item.status || existing.collaboratorId !== item.collaborator_id || existing.internalNotes !== item.internal_notes) {
                        existing.status = item.status;
                        existing.collaboratorId = item.collaborator_id || undefined;
                        existing.internalNotes = item.internal_notes || undefined;
                        existing.clientCancelReason = item.client_cancel_reason || undefined;
                        existing.appointmentDate = item.date || item.appointment_date;
                        existing.appointmentTime = (item.time || item.appointment_time || '09:00').substring(0, 5);
                        hasChanges = true;
                    }
                }
            }
        }
        // 2. Nouvelles notifications
        const { data: notifList } = await supabaseClient
            .from('notifications')
            .select('*')
            .eq('user_id', state.currentUser.id)
            .order('created_at', { ascending: false });
        if (notifList && Array.isArray(notifList)) {
            for (const n of notifList) {
                if (!state.notifications.some(existing => existing.id === n.id)) {
                    state.notifications.unshift({
                        id: n.id,
                        appointmentId: n.appointment_id,
                        title: n.title,
                        message: n.message,
                        isRead: n.is_read,
                        createdAt: n.created_at
                    });
                    hasChanges = true;
                }
            }
        }
        if (hasChanges) {
            saveStorage();
            updateNotificationBadge();
            // Rafraîchir UNIQUEMENT les vues de contenu de rendez-vous, JAMAIS les formulaires de saisie
            if (state.currentView === 'dashboard')
                renderDashboard();
            if (state.currentView === 'appointments')
                renderAppointments();
            if (state.currentView === 'notifications')
                renderNotifications();
            if (state.currentView === 'history')
                renderHistory();
            if (state.currentView === 'frequency')
                renderFrequency();
        }
    }
    catch (e) {
        console.warn('Sync distant rdv:', e);
    }
}
function initAdminSync() {
    // 1. Écouteur d'événements multi-onglets / stockage local
    window.addEventListener('storage', async (e) => {
        if (e.key === 'creno_sync_appointment_event' ||
            e.key === STORAGE_KEYS.appointments ||
            (state.currentUser && e.key === `creno_appointments_${state.currentUser.id}`)) {
            if (state.currentUser && supabaseClient) {
                await syncNewAppointmentsAndNotifs();
            }
            else {
                loadStorage();
            }
            if (state.currentView === 'dashboard')
                renderDashboard();
            if (state.currentView === 'appointments')
                renderAppointments();
            if (state.currentView === 'notifications')
                renderNotifications();
            if (state.currentView === 'history')
                renderHistory();
            if (state.currentView === 'frequency')
                renderFrequency();
        }
    });
    // 2. Polling automatique toutes les 3 secondes pour récupérer les nouveaux rendez-vous et notifications
    if (adminSyncInterval)
        clearInterval(adminSyncInterval);
    adminSyncInterval = setInterval(async () => {
        if (state.currentUser) {
            if (supabaseClient) {
                await syncNewAppointmentsAndNotifs();
            }
            // Synchronisation avec l'API partagée locale (support multi-profils Chrome sur localhost)
            try {
                const [aptRes, notifRes] = await Promise.all([
                    fetch(`/api/appointments?user_id=${encodeURIComponent(state.currentUser.id)}`),
                    fetch(`/api/notifications?user_id=${encodeURIComponent(state.currentUser.id)}`)
                ]);
                let hasNewData = false;
                if (aptRes.ok) {
                    const aptJson = await aptRes.json();
                    if (aptJson?.data && Array.isArray(aptJson.data)) {
                        aptJson.data.forEach((locApt) => {
                            if (!state.appointments.some(a => a.id === locApt.id)) {
                                state.appointments.unshift({
                                    id: locApt.id,
                                    userId: locApt.user_id || locApt.userId,
                                    clientName: locApt.client || locApt.client_name || 'Client',
                                    clientEmail: locApt.client_email || '',
                                    clientPhone: locApt.client_whatsapp || locApt.client_phone || '',
                                    serviceName: locApt.title || locApt.service_name || 'Rendez-vous standard',
                                    appointmentDate: locApt.date || locApt.appointment_date,
                                    appointmentTime: (locApt.time || locApt.appointment_time || '09:00').substring(0, 5),
                                    durationMinutes: Number(locApt.duration || locApt.duration_minutes || 30),
                                    status: locApt.status,
                                    notes: locApt.notes || '',
                                    source: locApt.source || 'lien_public',
                                    createdAt: locApt.created_at
                                });
                                hasNewData = true;
                            }
                        });
                    }
                }
                if (notifRes.ok) {
                    const notifJson = await notifRes.json();
                    if (notifJson?.data && Array.isArray(notifJson.data)) {
                        notifJson.data.forEach((nItem) => {
                            if (!state.notifications.some(n => n.id === nItem.id)) {
                                state.notifications.unshift({
                                    id: nItem.id,
                                    appointmentId: nItem.appointment_id,
                                    title: nItem.title,
                                    message: nItem.message,
                                    isRead: nItem.is_read ?? false,
                                    createdAt: nItem.created_at
                                });
                                hasNewData = true;
                            }
                        });
                    }
                }
                if (hasNewData) {
                    saveStorage();
                    updateNotificationBadge();
                    if (state.currentView === 'dashboard')
                        renderDashboard();
                    if (state.currentView === 'appointments')
                        renderAppointments();
                    if (state.currentView === 'notifications')
                        renderNotifications();
                    if (state.currentView === 'history')
                        renderHistory();
                    if (state.currentView === 'frequency')
                        renderFrequency();
                }
            }
            catch (e) { }
        }
    }, 3000);
    // 3. Abonnement temps réel Supabase si disponible
    if (supabaseClient && state.currentUser) {
        try {
            supabaseClient
                .channel(`admin_sync_${state.currentUser.id}`)
                .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'appointments',
                filter: `user_id=eq.${state.currentUser.id}`
            }, async () => {
                await syncNewAppointmentsAndNotifs();
            })
                .subscribe();
        }
        catch (e) {
            console.warn('Realtime sync fallback polling', e);
        }
    }
}
// ==============================================================================
// 19. DÉMARRAGE DE L'APPLICATION
// ==============================================================================
async function init() {
    loadStorage();
    initPwaModalEvents(); // Toujours initialisé au démarrage pour tous les écrans
    // Vérifier si un client arrive via le lien public ?reserver=...
    const isClientMode = await checkClientBookingMode();
    if (isClientMode)
        return;
    // Mode Administrateur classique
    bindEvents();
    initAdminSync();
    updateAuthUI();
    if (state.currentUser && supabaseClient) {
        await loadSupabaseData();
    }
}
document.addEventListener('DOMContentLoaded', () => {
    init().catch(err => console.error('Erreur au démarrage', err));
});
// ==============================================================================
// 19. GESTION PWA (PROGRESSIVE WEB APP) & SERVICE WORKER
// ==============================================================================
let deferredPwaPrompt = null;
function initPwaModalEvents() {
    const pwaModal = document.getElementById('pwaInstallModal');
    const btnPwaClose = document.getElementById('btnPwaClose');
    const btnPwaDismiss = document.getElementById('btnPwaDismiss');
    const btnPwaInstall = document.getElementById('btnPwaInstall');
    const pwaIosHint = document.getElementById('pwaIosHint');
    const pwaBrowserHint = document.getElementById('pwaBrowserHint');
    const closePwaModal = () => {
        if (pwaModal)
            pwaModal.style.display = 'none';
        sessionStorage.setItem('creno_pwa_dismissed', 'true');
    };
    btnPwaClose?.addEventListener('click', (e) => {
        e.stopPropagation();
        closePwaModal();
    });
    btnPwaDismiss?.addEventListener('click', (e) => {
        e.stopPropagation();
        closePwaModal();
    });
    // Fermeture si clic sur le voile d'arrière-plan
    pwaModal?.addEventListener('click', (e) => {
        if (e.target === pwaModal)
            closePwaModal();
    });
    btnPwaInstall?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (deferredPwaPrompt) {
            try {
                deferredPwaPrompt.prompt();
                const { outcome } = await deferredPwaPrompt.userChoice;
                console.log('[PWA] Choix utilisateur:', outcome);
                deferredPwaPrompt = null;
            }
            catch (err) {
                console.warn('Erreur prompt PWA', err);
            }
            closePwaModal();
        }
        else {
            const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
            if (isIos) {
                if (pwaIosHint)
                    pwaIosHint.style.display = 'block';
            }
            else {
                if (pwaBrowserHint) {
                    pwaBrowserHint.style.display = 'block';
                }
                else {
                    alert("Pour installer Créno sur votre appareil :\nOuvrez le menu de votre navigateur (⋮) ou l'icône dans la barre d'adresse puis sélectionnez 'Installer l'application' ou 'Ajouter à l'écran d'accueil'.");
                    closePwaModal();
                }
            }
        }
    });
}
function showPwaInstallModal(context) {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    if (isStandalone)
        return;
    const dismissed = sessionStorage.getItem('creno_pwa_dismissed');
    if (dismissed === 'true' && context !== 'client_booking')
        return;
    const modal = document.getElementById('pwaInstallModal');
    const titleEl = document.getElementById('pwaModalTitle');
    const descEl = document.getElementById('pwaModalDesc');
    const featuresEl = document.getElementById('pwaModalFeatures');
    if (context === 'client_booking') {
        if (titleEl)
            titleEl.textContent = 'Installer l\'application Créno';
        if (descEl)
            descEl.textContent = 'Installez l\'application sur votre téléphone pour recevoir en direct la réponse de validation de votre rendez-vous.';
        if (featuresEl) {
            featuresEl.innerHTML = `
        <div class="pwa-feature-item">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Notification dès que votre rendez-vous est validé</span>
        </div>
        <div class="pwa-feature-item">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Suivez le statut de votre demande sans créer de compte</span>
        </div>
        <div class="pwa-feature-item">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Accès direct en un clic depuis votre écran d'accueil</span>
        </div>
      `;
        }
    }
    if (modal)
        modal.style.display = 'flex';
}
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPwaPrompt = e;
    // Ne pas couper le client en plein remplissage du formulaire initial
    const params = new URLSearchParams(window.location.search);
    if (!params.get('reserver')) {
        showPwaInstallModal();
    }
});
// Affichage automatique du pop-up au milieu de l'écran dès l'accès pro classique
window.addEventListener('load', () => {
    setTimeout(() => {
        const params = new URLSearchParams(window.location.search);
        if (!params.get('reserver')) {
            showPwaInstallModal();
        }
    }, 1000);
});
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            console.log('[PWA] Service Worker actif:', reg.scope);
        }).catch((err) => {
            console.warn('[PWA] Enregistrement SW:', err);
        });
    });
}
