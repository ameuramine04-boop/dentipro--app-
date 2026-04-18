// DENTIPRO — GESTION DE CABINET DENTAIRE
// ============================================

if (typeof API_URL === "undefined") {
  var API_URL =
    typeof window !== "undefined" && window.location && window.location.origin
      ? `${window.location.origin}/api`
      : "http://localhost:3000/api";
}
if (typeof DP_PAGE_SIZE === "undefined") var DP_PAGE_SIZE = 12;
if (typeof _dpPage === "undefined")
  var _dpPage = {
    patients: 1, rdv: 1, facturesPaiement: 1, facturesToutes: 1,
    risques: 1, ordonnances: 1, stock: 1, historique: 1,
  };

// ── Variables globales UNIQUES ─────────────────────────────
var rdvs = [];
var editPatientId = null;
var editRdvId = null;
var _lastPaiementFacturesList = [];
var _lastToutesFacturesList = [];
var _cacheRisques = [];
var _cacheOrdonnances = [];
var _cacheStock = [];
var _lastHistoriqueFiltered = [];
var _toutesFacturesCache = [];
var currentPatientForPaiement = null;
var _fichePatientId = null;
var _chatOpen = false;
var _chatInterval = null;
var _dentalContext = "rdv";
var _dentalMode = "adulte";
var _dentalBuilt = false;
var _dentalConditions = {};
var _dentalSelected = new Set();
var _historiqueData = [];
var _agendaCurrentDate = new Date();


// 1. S'assure que la page actuelle est valide
function dpEnsurePage(key, total) {
    const totalPages = Math.max(1, Math.ceil(total / DP_PAGE_SIZE));
    let page = _dpPage[key] || 1;
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;
    _dpPage[key] = page;
    return { page, totalPages };
}

// 2. Génère le HTML des boutons
function dpPaginationRender(wrapId, key, page, totalPages, total) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;

    // On stocke les infos dans les datasets pour que le click-handler les retrouve
    wrap.dataset.dpKey = key;
    wrap.dataset.dpPage = String(page);
    wrap.dataset.dpTotalPages = String(totalPages);

    if (total === 0) {
        wrap.innerHTML = "";
        wrap.style.display = "none";
        return;
    }
    
    wrap.style.display = "block";
    const from = (page - 1) * DP_PAGE_SIZE + 1;
    const to = Math.min(page * DP_PAGE_SIZE, total);

    // Calcul des numéros de pages à afficher (max 5 boutons)
    let startP = Math.max(1, page - 2);
    let endP = Math.min(totalPages, startP + 4);
    if (endP - startP < 4) startP = Math.max(1, endP - 4);

    let numBtns = "";
    for (let p = startP; p <= endP; p++) {
        numBtns += `<button type="button" class="dp-pg ${p === page ? "is-active" : ""}" data-dp-act="goto" data-dp-page="${p}">${p}</button>`;
    }

    wrap.innerHTML = `
    <div class="dp-pagination">
        <div class="dp-pagination-meta">
            <span>Affichage <strong>${from}-${to}</strong> sur <strong>${total}</strong></span>
        </div>
        <div class="dp-pagination-btns">
            <button type="button" class="dp-pg" data-dp-act="first" ${page <= 1 ? "disabled" : ""}>«</button>
            <button type="button" class="dp-pg" data-dp-act="prev" ${page <= 1 ? "disabled" : ""}>‹</button>
            ${numBtns}
            <button type="button" class="dp-pg" data-dp-act="next" ${page >= totalPages ? "disabled" : ""}>›</button>
            <button type="button" class="dp-pg" data-dp-act="last" ${page >= totalPages ? "disabled" : ""}>»</button>
        </div>
    </div>`;
}

function fermerModal(id) {
    const m = document.getElementById(id);
    if (m) {
        m.classList.remove('open');
        m.style.display = 'none';
    }
}

// 3. Gère les clics sur les boutons (Une seule fois au chargement)

function initDpPaginationClick() {
    if (document.body.dataset.dpPaginationInit) return;
    document.body.dataset.dpPaginationInit = "1";

    document.body.addEventListener("click", function (e) {
        const btn = e.target.closest(".dp-pg");
        if (!btn || btn.disabled) return;

        const wrap = btn.closest(".dp-pagination-wrap");
        if (!wrap || !wrap.dataset.dpKey) return;

        e.preventDefault();
        const key = wrap.dataset.dpKey;
        let p = parseInt(wrap.dataset.dpPage || "1", 10);
        const tp = parseInt(wrap.dataset.dpTotalPages || "1", 10);
        const act = btn.dataset.dpAct;

        if (act === "first") p = 1;
        else if (act === "prev") p = Math.max(1, p - 1);
        else if (act === "next") p = Math.min(tp, p + 1);
        else if (act === "last") p = tp;
        else if (act === "goto") p = parseInt(btn.dataset.dpPage || "1", 10);

        _dpPage[key] = p;

        // Appel de la fonction de rafraîchissement correspondante
        if (typeof window._dpRefresh[key] === "function") {
            window._dpRefresh[key]();
        }
    });
}
// On définit les fonctions à appeler pour chaque type de liste
window._dpRefresh = {
    patients:         () => afficherPatients(document.getElementById('searchPatient')?.value || ''),
    rdv:              () => afficherRdvFiltre(),
    facturesPaiement: () => filtrerFacturesPaiement(),
    facturesToutes:   () => afficherToutesFactures(_lastToutesFacturesList),
    risques:          () => { if (typeof chargerPatientsRisque === 'function') chargerPatientsRisque(); },
    ordonnances:      () => { if (typeof chargerOrdonnancesListe === 'function') chargerOrdonnancesListe(); },
    stock:            () => { if (typeof chargerStock === 'function') chargerStock(); },
    historique:       () => afficherHistorique(_lastHistoriqueFiltered),
};

// On lance l'écouteur de clics
initDpPaginationClick();


// ============================================
// NAVIGATION
// ============================================
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(sectionId);
    if (!target) { console.error('Section introuvable:', sectionId); return; }
    target.classList.add('active');

    document.querySelectorAll('.sidebar-menu li span').forEach(item => item.classList.remove('active'));
    const navItem = document.getElementById('nav-' + sectionId);
    if (navItem) navItem.classList.add('active');

    updateBreadcrumb(sectionId);

    if (sectionId === 'dashboard') { rechargerDashboard(); }
    if (sectionId === 'patients') { chargerPatients(); }
    if (sectionId === 'rdv') {
        chargerRdv();
        setTimeout(() => {
            const dateEl = document.getElementById('dateRdv');
            const timeEl = document.getElementById('heureRdv');
            if (dateEl && !dateEl.value) {
                const now = new Date();
                dateEl.value = now.toISOString().split('T')[0];
                dateEl.min = dateEl.value;
            }
            if (timeEl && !timeEl.value) {
                const n = new Date();
                n.setHours(n.getHours() + 1);
                n.setMinutes(0);
                timeEl.value = String(n.getHours()).padStart(2, '0') + ':00';
            }
        }, 50);
    }
    if (sectionId === 'agenda') {
        buildAgenda();
        chargerRdvAgenda();
    }
    if (sectionId === 'salle-attente') {
        chargerSalleAttente();
        chargerPatientsWaitingRoom();
    }
    if (sectionId === 'paiements') {
        chargerFactures();
        chargerStatsPaiements();
    }
    if (sectionId === 'factures') {
        chargerToutesFactures();
        chargerStatsPaiements();
    }
    if (sectionId === 'historique') { chargerHistorique(); }
    if (sectionId === 'patients-risque') {
        chargerPatientsRisque();
        initPatientPicker('risquePatientSearch', 'risquePatientSuggest', 'risquePatientId');
    }
    if (sectionId === 'ordonnances') {
        chargerOrdonnancesListe();
        initPatientPicker('ordPatientSearch', 'ordPatientSuggest', 'ordPatientId');
        apercuModeleOrdonnance();
    }
    if (sectionId === 'stock') { chargerStock(); }
}

function goToPatients() { showSection('patients'); }

function goToSalleAttente() { showSection('salle-attente'); }

function goToNewFacture() { ouvrirModalNouvelleFacture(); }

function goToAllRdv() {
    const d = document.getElementById('searchRdvDate');
    if (d) d.value = '';
    showSection('rdv');
}

function goToTodayRdv() {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const d = document.getElementById('searchRdvDate');
    if (d) d.value = today;
    showSection('rdv');
    chargerRdv(today);
}

function goToNewRdv() {
    showSection('rdv');
    setTimeout(() => {
        const rdvContainer = document.querySelector('#rdv .form-container');

        if (rdvContainer) rdvContainer.scrollIntoView({ behavior: 'smooth' });
        resetRdvForm();
    }, 100);
}

function goToNewPaiement() {
    showSection('paiements');
    setTimeout(() => {
        document.querySelector('#paiements .form-container') ?.scrollIntoView({ behavior: 'smooth' });
        annulerPaiement();
    }, 100);
}

function showAddPatient() {
    // Ouvre la modal popup directement, sans naviguer vers la section patients
    ouvrirModalNouveauPatient(null);
}

function toggleSidebar() {
    document.querySelector('.sidebar') ?.classList.toggle('active');
    document.querySelector('.sidebar-overlay') ?.classList.toggle('active');
}

// ============================================
// AUTHENTIFICATION
// ============================================
function _authHeaders() {
  const token = localStorage.getItem("token");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

// Vérifie 401 et redirige automatiquement
function _check401(res) {
  if (res.status === 401) { logout(); return true; }
  return false;
}

function logout() {
  localStorage.removeItem("token");
  localStorage.removeItem("user");
  localStorage.removeItem("userId");
  window.location.href = "login.html";
}

function checkAuth() {
  const token = localStorage.getItem("token");
  const path = window.location.pathname;
  if (!token && (path.includes("dashboard.html") || path.endsWith("/") || path.includes("index")))
    window.location.href = "login.html";
  if (token && path.includes("login.html"))
    window.location.href = "dashboard.html";
}
// ============================================
// DATE ET HEURE
// ============================================
function updateDateTime() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
    const de = document.getElementById('currentDate');
    const te = document.getElementById('currentTime');
    if (de) de.textContent = dateStr;
    if (te) te.textContent = timeStr;
}

function startDateTimeUpdater() {
    updateDateTime();
    setInterval(updateDateTime, 1000);
}

// ============================================
// FORMATAGE DES DATES
// ============================================
function formatDateNaissance(dateStr) {
    if (!dateStr) return '-';
    try {
        const part = String(dateStr).split('T')[0].split(' ')[0];
        const [y, m, d] = part.split('-');
        if (!y || !m || !d) return part || '-';
        return `${d}/${m}/${y}`;
    } catch (e) { return String(dateStr).split('T')[0] || '-'; }
}

function formatDateCreation(dateStr) {
    return formatDateNaissance(dateStr);
}

// ============================================
// GESTION DES PATIENTS
// ============================================

async function chargerPatients() {
  try {
    const res = await fetch(`${API_URL}/patients`, { headers: _authHeaders() });
    if (_check401(res)) return;
    const data = await res.json();
    if (!Array.isArray(data)) return; // ← Anti-crash
    patients = data;
    _dpPage.patients = 1;
    afficherPatients();
    chargerPatientsSelect();
    chargerPatientsFacture();
    chargerPatientsWaitingRoom();
  } catch (e) { console.error("Erreur chargement patients:", e); }
}

async function chargerPatientsSelect() {
    const sel = document.getElementById("rdvPatient");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Sélectionner un patient</option>';
    patients.forEach(p => {
        sel.innerHTML += `<option value="${p.id_patient}">${p.nom} ${p.prenom}</option>`;
    });
    if (prev) sel.value = prev;
}

async function chargerPatientsFacture() {
    const sel = document.getElementById("facturePatient");
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">Sélectionner un patient</option>';
    patients.forEach(p => {
        sel.innerHTML += `<option value="${p.id_patient}">${p.nom} ${p.prenom}</option>`;
    });
    if (prev) sel.value = prev;
}

function afficherPatients(filtre = "") {
    const list = document.getElementById("patientList");
    if (!list) return;
    const triValue = document.getElementById("triPatient") ?.value || "";

    let pf = patients.filter(p =>
        p.nom.toLowerCase().includes(filtre.toLowerCase()) ||
        p.prenom.toLowerCase().includes(filtre.toLowerCase()) ||
        (p.cnie && p.cnie.toLowerCase().includes(filtre.toLowerCase()))
    );

    if (triValue) {
        pf.sort((a, b) => {
            switch (triValue) {
                case 'nom_asc':
                    return (a.nom || '').localeCompare(b.nom || '');
                case 'nom_desc':
                    return (b.nom || '').localeCompare(a.nom || '');
                case 'prenom_asc':
                    return (a.prenom || '').localeCompare(b.prenom || '');
                case 'prenom_desc':
                    return (b.prenom || '').localeCompare(a.prenom || '');
                case 'date_ajout_desc':
                    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                case 'date_ajout_asc':
                    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                case 'date_naissance_desc':
                    return new Date(b.date_naissance || 0) - new Date(a.date_naissance || 0);
                case 'date_naissance_asc':
                    return new Date(a.date_naissance || 0) - new Date(b.date_naissance || 0);
                default:
                    return 0;
            }
        });
    }

    if (!pf.length) {
        list.innerHTML = "<tr><td colspan='8' style='text-align:center;color:#888;padding:20px;'>Aucun patient trouvé</td></tr>";
        const el = document.getElementById("totalPatients");
        if (el) el.innerText = patients.length;
        return;
    }

    list.innerHTML = pf.map(p => `
        <tr>
            <td><strong>${p.nom}</strong></td>
            <td>${p.prenom}</td>
            <td>${p.sexe || '-'}</td>
            <td>${p.telephone || '-'}</td>
            <td>${p.cnie || '-'}</td>
            <td>${formatDateNaissance(p.date_naissance)}</td>
            <td>${formatDateCreation(p.created_at)}</td>
            <td>
                <button onclick="modifierPatient(${p.id_patient})" class="btn-edit">✏️</button>
                <button onclick="supprimerPatient(${p.id_patient})" class="btn-delete">🗑️</button>
            </td>
        </tr>`).join('');

    const S = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    S('totalPatients', patients.length);

    const hommes = patients.filter(p => p.sexe === 'Masculin').length;
    const femmes = patients.filter(p => p.sexe === 'Féminin' || p.sexe === 'Feminin').length;
    const enfants = patients.filter(p => p.type_patient === 'enfant').length;
    const assures = patients.filter(p => p.type_assurance && p.type_assurance !== 'Aucune').length;
    S('totalHommes', hommes);
    S('totalFemmes', femmes);
    S('totalEnfants', enfants);
    S('totalAssures', assures);

    let totalAge = 0,
        countAge = 0;
    patients.forEach(p => {
        if (p.date_naissance) {
            const d = new Date(p.date_naissance);
            if (!isNaN(d)) {
                totalAge += Math.floor((new Date() - d) / (365.25 * 24 * 3600 * 1000));
                countAge++;
            }
        }
    });
    S('ageMoyen', countAge > 0 ? Math.round(totalAge / countAge) + ' ans' : '--');
}

function filtrerPatients() {
    _dpPage.patients = 1;
    const filtre = document.getElementById("searchPatient") ?.value || "";
    afficherPatients(filtre);
}

function resetPatientSearch() {
    const s = document.getElementById("searchPatient");
    const t = document.getElementById("triPatient");
    if (s) s.value = "";
    if (t) t.value = "";
    _dpPage.patients = 1;
    afficherPatients("");
}

function updatePatientDashboardStats() {
    const S = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    S("totalPatients", patients.length);
    const hommes = patients.filter(p => p.sexe === "Masculin").length;
    const femmes = patients.filter(p => p.sexe === "Féminin" || p.sexe === "Feminin").length;
    const enfants = patients.filter(p => p.type_patient === "enfant").length;
    const assures = patients.filter(p => p.type_assurance && p.type_assurance !== "Aucune").length;
    S("totalHommes", hommes);
    S("totalFemmes", femmes);
    S("totalEnfants", enfants);
    S("totalAssures", assures);
    let totalAge = 0,
        countAge = 0;
    patients.forEach(p => {
        if (p.date_naissance) {
            const d = new Date(p.date_naissance);
            if (!isNaN(d)) {
                totalAge += Math.floor((new Date() - d) / (365.25 * 24 * 3600 * 1000));
                countAge++;
            }
        }
    });
    S("ageMoyen", countAge > 0 ? Math.round(totalAge / countAge) + " ans" : "--");
}

function modifierPatient(id) {
    const p = patients.find(p => p.id_patient === id);
    if (!p) return;
    document.getElementById("nom").value = p.nom;
    document.getElementById("prenom").value = p.prenom;
    document.getElementById("sexe").value = p.sexe;
    document.getElementById("telephone").value = p.telephone;
    document.getElementById("cnie").value = p.cnie || '';
    document.getElementById("date").value = (p.date_naissance || '').split('T')[0].split(' ')[0];
    editPatientId = id;
    document.getElementById("patientBtn").innerText = "✏️ Modifier";
    document.getElementById("cancelPatientBtn").style.display = "inline-flex";
    document.querySelector('#patients .form-container') ?.scrollIntoView({ behavior: 'smooth' });
}

async function supprimerPatient(id) {
  if (!confirm("Êtes-vous sûr de vouloir supprimer ce patient?")) return;
  try {
    const res = await fetch(`${API_URL}/patients/${id}`, {
      method: "DELETE",
      headers: _authHeaders(),
    });
    if (_check401(res)) return;
    const data = await res.json();
    if (data.success) { showToast("✅ Patient supprimé!", "success"); chargerPatients(); }
    else showToast("❌ Erreur: " + (data.error || ""), "error");
  } catch (e) { showToast("❌ Erreur", "error"); }
}

function resetPatientForm() {
    document.getElementById("patientForm").reset();
    editPatientId = null;
    document.getElementById("patientBtn").innerText = "➕ Ajouter";
    document.getElementById("cancelPatientBtn").style.display = "none";
}

// ============================================
// GESTION DES RENDEZ-VOUS
// ============================================
async function chargerRdv(dateFilter = "") {
  try {
    const url = dateFilter ? `${API_URL}/rdv?date=${dateFilter}` : `${API_URL}/rdv`;
    const res = await fetch(url, { headers: _authHeaders() });
    if (_check401(res)) return;
    const data = await res.json();
    if (!Array.isArray(data)) return; // ← Anti-crash
    rdvs = data;
    _dpPage.rdv = 1;
    afficherRdvFiltre();
    if (!dateFilter) updateDashboardCounts(rdvs);
  } catch (e) { console.error("Erreur chargement RDV:", e); }
}

function updateDashboardCounts(allRdv) {
    const S = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const mois = now.getMonth();
    const annee = now.getFullYear();

    const normD = r => {
        if (!r.date_rdv) return '';
        if (typeof r.date_rdv === 'string') return r.date_rdv.split('T')[0].split(' ')[0];
        return new Date(r.date_rdv).toISOString().split('T')[0];
    };

    const all = allRdv || [];
    S('totalRdv', all.length);
    S('rdvToday', all.filter(r => normD(r) === todayStr).length);
    S('rdvEnCours', all.filter(r => r.statut === 'en-cours' || r.statut === 'En cours').length);

    const thisMonth = all.filter(r => {
        const d = new Date(r.date_rdv);
        return d.getMonth() === mois && d.getFullYear() === annee;
    });
    S('rdvTermines', thisMonth.filter(r => r.statut === 'termine' || r.statut === 'Terminé').length);
    S('rdvAnnules', thisMonth.filter(r => r.statut === 'annule' || r.statut === 'Annulé').length);

    const in7 = new Date();
    in7.setDate(in7.getDate() + 7);
    S('rdvSemaine', all.filter(r => {
        const d = new Date(r.date_rdv);
        return d >= now && d <= in7 && r.statut !== 'annule' && r.statut !== 'Annulé';
    }).length);
}


function filtrerRdv() {
    _dpPage.rdv = 1;
    afficherRdvFiltre();
}

function clearRdvFilter() {
    const n = document.getElementById("searchRdvNom");
    const d = document.getElementById("searchRdvDate");
    const t = document.getElementById("triRdv");
    if (n) n.value = "";
    if (d) d.value = "";
    if (t) t.value = "date_asc";
    _dpPage.rdv = 1;
    afficherRdvFiltre();
}

function afficherRdvFiltre() {
    const searchNom = document.getElementById("searchRdvNom") ?.value || "";
    const searchDate = document.getElementById("searchRdvDate") ?.value || "";
    const triVal = document.getElementById("triRdv") ?.value || "date_asc";

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

    let liste = rdvs.filter(r => {
        const nom = ((r.nom || "") + " " + (r.prenom || "")).toLowerCase();
        const cin = (r.cnie || "").toLowerCase();
        const matchNom = !searchNom || nom.includes(searchNom.toLowerCase()) || cin.includes(searchNom.toLowerCase());
        const matchDate = !searchDate || (r.date_rdv || "").startsWith(searchDate);
        return matchNom && matchDate;
    });

    liste.sort((a, b) => {
        switch (triVal) {
            case "date_desc":
                return new Date(b.date_rdv + " " + b.heure_rdv) - new Date(a.date_rdv + " " + a.heure_rdv);
            case "date_asc":
                return new Date(a.date_rdv + " " + a.heure_rdv) - new Date(b.date_rdv + " " + b.heure_rdv);
            case "nom_asc":
                return (a.nom || "").localeCompare(b.nom || "");
            case "nom_desc":
                return (b.nom || "").localeCompare(a.nom || "");
            case "statut":
                return (a.statut || "").localeCompare(b.statut || "");
            default:
                return 0;
        }
    });

    const list = document.getElementById("rdvList");
    if (!list) return;

    if (!liste.length) {
        list.innerHTML = "<tr><td colspan='7' style='text-align:center;color:#888;padding:20px;'>Aucun rendez-vous trouvé</td></tr>";
        dpPaginationRender("paginationRdv", "rdv", 1, 1, 0);
        return;
    }

    const { page, totalPages } = dpEnsurePage("rdv", liste.length);
    const slice = liste.slice((page - 1) * DP_PAGE_SIZE, page * DP_PAGE_SIZE);

    list.innerHTML = slice.map(r => {
        const sc = getStatutClass(r.statut);
        const dateStr = r.date_rdv ? formatDateNaissance(r.date_rdv) : "-";
        const isToday = r.date_rdv === today;
        const todayBadge = isToday ?
            ' <span style="background:#16a34a;color:#fff;font-size:10px;padding:1px 6px;border-radius:10px;margin-left:4px;">Aujourd\'hui</span>' :
            '';
        return `<tr${isToday ? ' style="background:#f0fdf4;"' : ''}>
            <td><strong>${r.nom} ${r.prenom}</strong></td>
            <td>${dateStr}${todayBadge}</td>
            <td>${r.heure_rdv || '-'}</td>
            <td>${r.motif || '-'}</td>
            <td>${r.dent  || '-'}</td>
            <td><span class="statut-badge ${sc}">${r.statut}</span></td>
            <td>
                <button onclick="modifierRdv(${r.id_rdv})"  class="btn-edit">✏️</button>
                <button onclick="supprimerRdv(${r.id_rdv})" class="btn-delete">🗑️</button>
            </td>
        </tr>`;
    }).join('');
    dpPaginationRender("paginationRdv", "rdv", page, totalPages, liste.length);
}

function getStatutClass(statut) {
    switch (statut) {
        case 'Prevu':
            return 'statut-prevu';
        case 'Termine':
            return 'statut-termine';
        case 'Annule':
            return 'statut-annule';
        case 'En cours':
            return 'statut-en-cours';
        default:
            return '';
    }
}

function modifierRdv(id) {
    const rdv = rdvs.find(r => r.id_rdv === id);
    if (!rdv) return;
    document.getElementById("rdvPatient").value = rdv.id_patient;
    document.getElementById("dateRdv").value = (rdv.date_rdv || '').split('T')[0].split(' ')[0];
    document.getElementById("heureRdv").value = rdv.heure_rdv || '';
    document.getElementById("motifRdv").value = rdv.motif || '';
    document.getElementById("dentRdv").value = rdv.dent || '';
    document.getElementById("statutRdv").value = rdv.statut;
    editRdvId = id;
    document.getElementById("rdvBtn").innerText = "✏️ Modifier";
    document.getElementById("cancelRdvBtn").style.display = "inline-flex";
    document.querySelector('#rdv .form-container') ?.scrollIntoView({ behavior: 'smooth' });
}

async function supprimerRdv(id) {
  if (!confirm("Êtes-vous sûr de vouloir supprimer ce RDV?")) return;
  try {
    const res = await fetch(`${API_URL}/rdv/${id}`, {
      method: "DELETE",
      headers: _authHeaders(),
    });
    if (_check401(res)) return;
    const data = await res.json();
    if (data.success) { showToast("✅ RDV supprimé!", "success"); chargerRdv(); }
    else showToast("❌ Erreur: " + (data.error || ""), "error");
  } catch (e) { showToast("❌ Erreur", "error"); }
}

function resetRdvForm() {
    document.getElementById("rdvForm").reset();
    editRdvId = null;
    document.getElementById("rdvBtn").innerText = "➕ Ajouter RDV";
    document.getElementById("cancelRdvBtn").style.display = "none";
    effacerDentsRdv();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const nextHour = new Date(now.getTime() + 30 * 60000);
    const timeStr = `${String(nextHour.getHours()).padStart(2,'0')}:${String(Math.ceil(nextHour.getMinutes()/15)*15%60).padStart(2,'0')}`;
    const dateEl = document.getElementById("dateRdv");
    const timeEl = document.getElementById("heureRdv");
    if (dateEl) {
        dateEl.value = today;
        dateEl.min = today;
    }
    if (timeEl) timeEl.value = timeStr;
}

// ============================================
// LOGIN
// ============================================
function loadSavedCredentials() {
    if (localStorage.getItem("rememberMe") === "true") {
        const u = localStorage.getItem("savedUsername");
        const p = localStorage.getItem("savedPassword");
        if (u) document.getElementById("username").value = u;
        if (p) document.getElementById("password").value = p;
        const r = document.getElementById("rememberMe");
        if (r) r.checked = true;
    }
}

const loginForm = document.getElementById("loginForm");
if (loginForm) {
    loadSavedCredentials();
    loginForm.addEventListener("submit", async function(e) {
        e.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        const rememberMe = document.getElementById("rememberMe").checked;
        try {
            const res = await fetch(`${API_URL}/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
            const data = await res.json();
            if (data.success) {
                if (rememberMe) {
                    localStorage.setItem("savedUsername", username);
                    localStorage.setItem("savedPassword", password);
                    localStorage.setItem("rememberMe", "true");
                } else {
                    localStorage.removeItem("savedUsername");
                    localStorage.removeItem("savedPassword");
                    localStorage.removeItem("rememberMe");
                }
                localStorage.setItem("token", data.token);
                localStorage.setItem("user", JSON.stringify(data.user));
                localStorage.setItem("userId", String(data.user.id || data.user.id_user || ''));
                window.location.href = "dashboard.html";
            } else {
                document.getElementById("errorMsg").innerText = data.message || "Identifiants incorrects";
            }
        } catch (e) {
            document.getElementById("errorMsg").innerText = "Erreur de connexion au serveur";
        }
    });
}

// ============================================
// PAIEMENTS & FACTURES
// ============================================

async function chargerStatsPaiements() {
    try {
        const token = localStorage.getItem("token");
        const headers = { 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        const [statsRes, monthRes, todayRes, moisPatientsRes, factListRes] = await Promise.all([
            fetch(`${API_URL}/factures/stats/summary`, { headers }),
            fetch(`${API_URL}/paiements/stats/month`, { headers }),
            fetch(`${API_URL}/paiements/stats/today`, { headers }),
            fetch(`${API_URL}/patients/stats/month`, { headers }),
            fetch(`${API_URL}/factures`, { headers })
        ]);

        // Vérification de sécurité pour l'authentification
        if (statsRes.status === 401) return logout();

        const stats = await statsRes.json();
        const month = await monthRes.json();
        const today = await todayRes.json();
        const moisPat = await moisPatientsRes.json();
        const factures = await factListRes.json();

        const fmt = v => (parseFloat(v) || 0).toFixed(2) + ' DH';
        const S = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

        // Mise à jour de l'interface
        S('totalPayer', fmt(stats.montant_regle));
        S('totalRestant', fmt(stats.montant_restant));
        S('totalImpaye', fmt(stats.montant_restant));
        S('totalPayer2', fmt(stats.montant_regle));
        S('totalRestant2', fmt(stats.montant_restant));
        S('caMois', fmt(month.total_montant));
        S('revenusAujourdhui', fmt(today.total_montant));

        const total = parseFloat(stats.montant_total || 0);
        const paye = parseFloat(stats.montant_regle || 0);
        const taux = total > 0 ? Math.round((paye / total) * 100) : 0;
        S('tauxRecouvrement', taux + '%');

        S('patientsMois', moisPat.total_patients || 0);

        const now = new Date();
        const allF = Array.isArray(factures) ? factures : [];

        const factMois = allF.filter(f => {
            const d = new Date(f.date_facture || f.created_at);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        S('facturesMois', factMois.length);

        S('totalFactures', allF.length);
        S('facturesPayees', allF.filter(f => f.statut === 'Payee').length);
        S('facturesImpayees', allF.filter(f => f.statut === 'Impayee').length);
        S('facturesPartielles', allF.filter(f => f.statut === 'Partiellement payee').length);

    } catch (e) { 
        console.error('Erreur stats paiements:', e); 
    }
}
async function chercherPatientPaiement() {
    const term = document.getElementById("searchPatientPaiement") ?.value ?.trim();
    if (!term) { showToast("Veuillez saisir un nom, prénom ou CIN", "warning"); return; }
    try {
        const res = await fetch(`${API_URL}/patients/search/${encodeURIComponent(term)}`);
        const data = await res.json();
        if (data.length > 0) {
            currentPatientForPaiement = data[0];
            document.getElementById("paiementPatientId").value = currentPatientForPaiement.id_patient;
            document.getElementById("paiementPatientNom").textContent = currentPatientForPaiement.nom + " " + currentPatientForPaiement.prenom;
            document.getElementById("ajoutPaiementForm").style.display = "block";
            document.getElementById("datePaiement").value = new Date().toISOString().split('T')[0];
            chargerFacturesPatientPourPaiement(currentPatientForPaiement.id_patient);
        } else {
            showToast("Aucun patient trouvé", "warning");
        }
    } catch (e) { showToast("❌ Erreur de recherche", "error"); }
}

async function chargerFacturesPatientPourPaiement(patientId) {
    try {
        const res = await fetch(`${API_URL}/factures?patient_id=${patientId}`);
        const data = await res.json();
        const sel = document.getElementById("facturePatientPaiement");
        if (!sel) return;
        sel.innerHTML = '<option value="">Lier à une facture (optionnel)</option>';
        data.forEach(f => {
            const restant = (parseFloat(f.montant_total) - parseFloat(f.montant_regle)).toFixed(2);
            sel.innerHTML += `<option value="${f.id_facture}">${f.numero_facture} — Restant: ${restant} DH</option>`;
        });
    } catch (e) { console.error("Erreur chargement factures patient:", e); }
}

function updateMontantRestant() {
    const sel = document.getElementById("facturePatientPaiement");
    if (!sel || !sel.value) return;
    const fac = _toutesFacturesCache.find(f => f.id_facture == sel.value);
    if (fac) {
        const restant = (parseFloat(fac.montant_total) - parseFloat(fac.montant_regle)).toFixed(2);
        const montantEl = document.getElementById("montantPaiement");
        if (montantEl && parseFloat(restant) > 0) montantEl.value = restant;
    }
}

function annulerPaiement() {
    document.getElementById("ajoutPaiementForm").style.display = "none";
    const s = document.getElementById("searchPatientPaiement");
    if (s) s.value = "";
    currentPatientForPaiement = null;
}

const paiementForm = document.getElementById("paiementForm");
if (paiementForm) {
    paiementForm.addEventListener("submit", async function(e) {
        e.preventDefault();
        const id_patient = document.getElementById("paiementPatientId").value;
        const id_facture_sel = document.getElementById("facturePatientPaiement").value;
        const montant = parseFloat(document.getElementById("montantPaiement").value);
        const type_paiement = document.getElementById("typePaiement").value;
        const date_paiement = document.getElementById("datePaiement").value;
        const notes = document.getElementById("notesPaiement").value;
        const id_user = localStorage.getItem("userId") || 1;

        try {
            let id_facture = id_facture_sel || null;

            if (!id_facture) {
                const numRes = await fetch(`${API_URL}/factures/next-numero`);
                const numData = await numRes.json();
                const autoFac = {
                    id_patient,
                    id_user,
                    numero_facture: numData.numero_facture,
                    date_facture: date_paiement,
                    montant_total: montant,
                    montant_regle: 0,
                    statut: 'Impayee',
                    motif: notes || 'Consultation',
                    notes: 'Facture créée automatiquement lors du paiement'
                };
                const facRes = await fetch(`${API_URL}/factures`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(autoFac) });
                const facData = await facRes.json();
                if (facData.success) {
                    id_facture = facData.id;
                    showToast("📄 Facture créée automatiquement", "info");
                }
            }

            const paiement = { id_patient, id_facture, montant, type_paiement, date_paiement, notes, id_user };
            const res = await fetch(`${API_URL}/paiements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(paiement) });
            const data = await res.json();
            if (data.success) {
                showToast("✅ Paiement enregistré!", "success");
                annulerPaiement();
                chargerFactures();
                chargerToutesFactures();
                chargerStatsPaiements();
            } else {
                showToast("❌ Erreur: " + (data.error || ""), "error");
            }
        } catch (e) {
            showToast("❌ Erreur", "error");
            console.error(e);
        }
    });
}

async function chargerFactures() {
  try {
    const res = await fetch(`${API_URL}/factures`, { headers: _authHeaders() });
    if (_check401(res)) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;
    _toutesFacturesCache = data;
    filtrerFacturesPaiement();
  } catch (e) { console.error("Erreur chargement factures:", e); }
}


async function chargerToutesFactures() {
  try {
    const res = await fetch(`${API_URL}/factures`, { headers: _authHeaders() });
    if (_check401(res)) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;
    _toutesFacturesCache = data;
    _dpPage.facturesToutes = 1;
    const nom    = document.getElementById("searchFactureNom")?.value || "";
    const statut = document.getElementById("filtreStatutFacture2")?.value || "";
    const date   = document.getElementById("searchDateFacture2")?.value || "";
    const tri    = document.getElementById("triFacture")?.value || "date_desc";
    let liste = data.slice();
    if (statut) liste = liste.filter((f) => f.statut === statut);
    if (date)   liste = liste.filter((f) => (f.date_facture || "").startsWith(date));
    liste = trierEtFiltrerFactures(liste, nom, tri);
    _lastToutesFacturesList = liste;
    afficherToutesFactures(liste);
  } catch (e) { console.error("Erreur chargement factures:", e); }
}

function trierEtFiltrerFactures(liste, nomSearch, triVal) {
    if (nomSearch) {
        const q = nomSearch.toLowerCase();
        liste = liste.filter(f => {
            const nom = ((f.patient_nom || "") + " " + (f.patient_prenom || "")).toLowerCase();
            const cin = (f.patient_cnie || "").toLowerCase();
            return nom.includes(q) || cin.includes(q);
        });
    }
    liste.sort((a, b) => {
        const rA = parseFloat(a.montant_total || 0) - parseFloat(a.montant_regle || 0);
        const rB = parseFloat(b.montant_total || 0) - parseFloat(b.montant_regle || 0);
        switch (triVal) {
            case "date_desc":
                return new Date(b.date_facture || 0) - new Date(a.date_facture || 0);
            case "date_asc":
                return new Date(a.date_facture || 0) - new Date(b.date_facture || 0);
            case "nom_asc":
                return (a.patient_nom || "").localeCompare(b.patient_nom || "");
            case "nom_desc":
                return (b.patient_nom || "").localeCompare(a.patient_nom || "");
            case "montant_desc":
                return parseFloat(b.montant_total || 0) - parseFloat(a.montant_total || 0);
            case "montant_asc":
                return parseFloat(a.montant_total || 0) - parseFloat(b.montant_total || 0);
            case "restant_desc":
                return rB - rA;
            default:
                return 0;
        }
    });
    return liste;
}

function filtrerFacturesPaiement() {
    const nom = document.getElementById("searchFactureNomPaiement") ?.value || "";
    const statut = document.getElementById("filtreStatutFacture") ?.value || "";
    const date = document.getElementById("searchDateFacture") ?.value || "";
    const tri = document.getElementById("triFacturePaiement") ?.value || "date_desc";
    let liste = _toutesFacturesCache.slice();
    if (statut) liste = liste.filter(f => f.statut === statut);
    if (date) liste = liste.filter(f => (f.date_facture || "").startsWith(date));
    liste = trierEtFiltrerFactures(liste, nom, tri);
    _lastPaiementFacturesList = liste;
    _dpPage.facturesPaiement = 1;
    afficherFactures(liste);
}

function clearFactureFilter() {
    ["searchFactureNomPaiement", "filtreStatutFacture", "searchDateFacture"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const t = document.getElementById("triFacturePaiement");
    if (t) t.value = "date_desc";
    _lastPaiementFacturesList = (typeof _toutesFacturesCache !== 'undefined') ? _toutesFacturesCache : [];
    _dpPage.facturesPaiement = 1;
    afficherFactures(_lastPaiementFacturesList);
}

function clearToutesFacturesFilter() {
    ["searchFactureNom", "filtreStatutFacture2", "searchDateFacture2"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const t = document.getElementById("triFacture");
    if (t) t.value = "date_desc";
    _dpPage.facturesToutes = 1;
    const liste = trierEtFiltrerFactures((_toutesFacturesCache || []).slice(), "", "date_desc");
    _lastToutesFacturesList = liste;
    afficherToutesFactures(liste);
}

function _renderFactureRow(f, actions) {
    const restant = (parseFloat(f.montant_total || 0) - parseFloat(f.montant_regle || 0)).toFixed(2);
    const total = parseFloat(f.montant_total || 0).toFixed(2);
    const paye = parseFloat(f.montant_regle || 0).toFixed(2);
    const sc = getFactureStatutClass(f.statut);
    const sl = getFactureStatutLabel(f.statut);
    const dateStr = f.date_facture ? formatDateNaissance(f.date_facture) : '-';
    const restantCls = parseFloat(restant) > 0 ? 'amount-negative' : 'amount-positive';
    return `<tr>
        <td><strong style="color:var(--primary);font-weight:700;">${f.numero_facture}</strong></td>
        <td><div style="font-weight:600;">${f.patient_nom || ''} ${f.patient_prenom || ''}</div></td>
        <td style="color:var(--text-3);">${dateStr}</td>
        <td style="color:var(--text-2);">${f.motif || '—'}</td>
        <td style="font-size:11px;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:2px 7px;">${f.dent || '—'}</td>
        <td style="font-weight:700;">${total} DH</td>
        <td class="amount-positive">${paye} DH</td>
        <td class="${restantCls}">${restant} DH</td>
        <td><span class="statut-badge ${sc}">${sl}</span></td>
        <td style="white-space:nowrap;">${actions}</td>
    </tr>`;
}

function afficherFactures(factures) {
    const list = document.getElementById("factureList");
    if (!list) return;
    const arr = factures || [];
    if (!arr.length) {
        list.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;padding:20px;">Aucune facture trouvée</td></tr>';
        dpPaginationRender("paginationFacturesPaiement", "facturesPaiement", 1, 1, 0);
        return;
    }
    const { page, totalPages } = dpEnsurePage("facturesPaiement", arr.length);
    const slice = arr.slice((page - 1) * DP_PAGE_SIZE, page * DP_PAGE_SIZE);
    list.innerHTML = slice.map(f => _renderFactureRow(f,
        `<button onclick="payerFacture(${f.id_facture},${f.id_patient})" class="btn-edit">💰 Payer</button>
         <button onclick="downloadFacturePDF(${f.id_facture})" class="btn-pdf" title="PDF">🖨️</button>`
    )).join('');
    dpPaginationRender("paginationFacturesPaiement", "facturesPaiement", page, totalPages, arr.length);
}

function afficherToutesFactures(factures) {
    const list = document.getElementById("toutesFacturesList");
    if (!list) return;
    const arr = factures || [];
    if (!arr.length) {
        list.innerHTML = '<tr><td colspan="10" style="text-align:center;color:#888;padding:20px;">Aucune facture trouvée</td></tr>';
        dpPaginationRender("paginationFacturesToutes", "facturesToutes", 1, 1, 0);
    } else {
        const { page, totalPages } = dpEnsurePage("facturesToutes", arr.length);
        const slice = arr.slice((page - 1) * DP_PAGE_SIZE, page * DP_PAGE_SIZE);
        list.innerHTML = slice.map(f => _renderFactureRow(f,
            `<button onclick="supprimerFacture(${f.id_facture})" class="btn-delete">🗑️</button>
             <button onclick="downloadFacturePDF(${f.id_facture})" class="btn-pdf" title="PDF">🖨️</button>`
        )).join('');
        dpPaginationRender("paginationFacturesToutes", "facturesToutes", page, totalPages, arr.length);
    }
    const allF = _toutesFacturesCache || factures;
    let payees = 0,
        impayees = 0,
        partielles = 0;
    let totalMontant = 0,
        totalPaye = 0;
    allF.forEach(f => {
        if (f.statut === "Payee") payees++;
        else if (f.statut === "Impayee") impayees++;
        else if (f.statut === "Partiellement payee") partielles++;
        totalMontant += parseFloat(f.montant_total || 0);
        totalPaye += parseFloat(f.montant_regle || 0);
    });
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    setEl("totalFactures", allF.length);
    setEl("facturesPayees", payees);
    setEl("facturesImpayees", impayees);
    setEl("facturesPartielles", partielles);
    setEl("totalPayer2", totalPaye.toFixed(2) + ' DH');
    setEl("totalRestant2", (totalMontant - totalPaye).toFixed(2) + ' DH');
    setEl("facturesMontantTotal", totalMontant.toFixed(2) + ' DH');
    setEl("facturesEncaisse", totalPaye.toFixed(2) + ' DH');
    setEl("facturesRestant", (totalMontant - totalPaye).toFixed(2) + ' DH');
}

function getFactureStatutClass(statut) {
    switch (statut) {
        case 'Payee':
            return 'statut-payee';
        case 'Impayee':
            return 'statut-impayee';
        case 'Partiellement payee':
            return 'statut-partiellement-payee';
        default:
            return '';
    }
}

function getFactureStatutLabel(statut) {
    switch (statut) {
        case 'Payee':
            return 'Payée';
        case 'Impayee':
            return 'Impayée';
        case 'Partiellement payee':
            return 'Partiellement payée';
        default:
            return statut || '-';
    }
}

// État du modal paiement
let _mpFactureId = null,
    _mpPatientId = null,
    _mpMontantTotal = 0,
    _mpMontantReste = 0;

async function payerFacture(factureId, patientId) {
    _mpFactureId = factureId;
    _mpPatientId = patientId;
    try {
        const fRes = await fetch(`${API_URL}/factures/${factureId}`);
        const fData = await fRes.json();
        if (fData && fData.montant_total) {
            const total = parseFloat(fData.montant_total) || 0;
            const paye = parseFloat(fData.montant_regle) || 0;
            const reste = total - paye;
            _mpMontantTotal = total;
            _mpMontantReste = reste;
            document.getElementById('mpTotal').textContent = total.toFixed(2) + ' DH';
            document.getElementById('mpPaye').textContent = paye.toFixed(2) + ' DH';
            document.getElementById('mpReste').textContent = reste.toFixed(2) + ' DH';
            document.getElementById('modalPaiementInfos').style.display = 'grid';
            document.getElementById('mpMontant').value = reste > 0 ? reste.toFixed(2) : '';
            document.getElementById('modalPaiementSubtitle').textContent = `Facture ${fData.numero_facture||''} — ${fData.patient_nom||''} ${fData.patient_prenom||''}`;
        } else {
            document.getElementById('modalPaiementInfos').style.display = 'none';
            document.getElementById('mpMontant').value = '';
        }
    } catch (e) {
        document.getElementById('modalPaiementInfos').style.display = 'none';
    }
    document.getElementById('mpDatePaiement').value = new Date().toISOString().split('T')[0];
    document.getElementById('mpNotes').value = '';
    document.getElementById('mpType').value = 'Especes';
    document.querySelectorAll('.mp-type-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.mp-type-btn') ?.classList.add('active');

    // FIX: Open modal with direct style manipulation
    const modal = document.getElementById('modalPaiementRapide');
    if (modal) {
        modal.style.display = 'flex';
        modal.style.alignItems = 'center';
        modal.style.justifyContent = 'center';
        modal.classList.add('modal-open');
        document.body.style.overflow = 'hidden';
    }
    document.getElementById('mpMontant').focus();
}

function fermerModalPaiement(e) {
    const modal = document.getElementById('modalPaiementRapide');
    if (!modal) return;
    if (e && e.target !== modal) return;
    modal.style.display = 'none';
    modal.classList.remove('modal-open');
    document.body.style.overflow = '';
    _mpFactureId = null;
    _mpPatientId = null;
}

function mpSelectType(btn, type) {
    document.querySelectorAll('.mp-type-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('mpType').value = type;
}

function mpRemplirTout() {
    if (_mpMontantReste > 0) document.getElementById('mpMontant').value = _mpMontantReste.toFixed(2);
}

async function validerModalPaiement() {
    const montant = parseFloat(document.getElementById('mpMontant').value);
    const type = document.getElementById('mpType').value;
    const date = document.getElementById('mpDatePaiement').value;
    const notes = document.getElementById('mpNotes').value;
    if (!montant || montant <= 0) {
        showToast('Montant invalide', 'warning');
        document.getElementById('mpMontant').focus();
        return;
    }
    if (!type) { showToast('Choisissez un mode de paiement', 'warning'); return; }
    if (!date) { showToast('Date requise', 'warning'); return; }
    const btn = document.querySelector('.btn-payer-confirm');
    if (btn) {
        btn.textContent = '⏳ Traitement…';
        btn.disabled = true;
    }
    try {
        const res = await fetch(`${API_URL}/paiements`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_patient: _mpPatientId, id_facture: _mpFactureId, montant, type_paiement: type, date_paiement: date, notes, id_user: localStorage.getItem('userId') || 1 })
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Paiement enregistré avec succès!', 'success');
            addNotification(`💰 Paiement de ${montant.toFixed(2)} DH enregistré`, 'success');
            fermerModalPaiement();
            chargerFactures();
            chargerToutesFactures();
            chargerStatsPaiements();
            downloadFacturePDF(_mpFactureId);
        } else { showToast('❌ ' + (data.error || ''), 'error'); }
    } catch (e) { showToast('❌ Erreur réseau', 'error'); } finally {
        if (btn) {
            btn.textContent = '✅ Confirmer le paiement';
            btn.disabled = false;
        }
    }
}

async function supprimerFacture(id) {
  if (!confirm("Supprimer cette facture?")) return;
  try {
    const res = await fetch(`${API_URL}/factures/${id}`, { method: "DELETE", headers: _authHeaders() });
    if (_check401(res)) return;
    const data = await res.json();
    if (data.success) { showToast("✅ Facture supprimée!", "success"); chargerFactures(); chargerToutesFactures(); chargerStatsPaiements(); }
    else showToast("❌ Erreur: " + (data.error || ""), "error");
  } catch (e) { showToast("❌ Erreur", "error"); }
}

const factureForm = document.getElementById("factureForm");
if (factureForm) {
    factureForm.addEventListener("submit", async function(e) {
        e.preventDefault();
        try {
            const numRes = await fetch(`${API_URL}/factures/next-numero`);
            const numData = await numRes.json();
            const facture = {
                id_patient: document.getElementById("facturePatient").value,
                id_user: localStorage.getItem("userId") || 1,
                numero_facture: numData.numero_facture,
                date_facture: document.getElementById("dateFacture").value,
                motif: document.getElementById("factureMotif").value,
                dent: document.getElementById("factureDent").value,
                montant_total: parseFloat(document.getElementById("montantFacture").value),
                montant_regle: 0,
                notes: document.getElementById("factureNotes") ?.value || "",
                statut: "Impayee"
            };
            const res = await fetch(`${API_URL}/factures`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(facture) });
            const data = await res.json();
            if (data.success) {
                showToast("✅ Facture créée!", "success");
                this.reset();
                document.getElementById("factureDent").value = "";
                const btn = document.getElementById("factureDentBtn");
                if (btn) btn.textContent = "🦷 Dents";
                chargerFactures();
                chargerToutesFactures();
                chargerStatsPaiements();
            } else { showToast("❌ Erreur: " + (data.error || ""), "error"); }
        } catch (e) { showToast("❌ Erreur lors de la création", "error"); }
    });
}

async function downloadFacturePDF(id_facture) {
    try {
        const res = await fetch(`${API_URL}/factures/${id_facture}/pdf`);
        if (!res.ok) throw new Error('Erreur PDF');
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `facture-${id_facture}.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (e) { showToast('❌ Erreur génération PDF', 'error'); }
}

// NOTE: DOMContentLoaded unique — voir bloc principal plus bas

function _attachRdvFormListener() {
  const rdvForm = document.getElementById("rdvForm");
  if (!rdvForm || rdvForm.dataset.listenerAttached) return;
  rdvForm.dataset.listenerAttached = "1";
  rdvForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const rdv = {
      id_patient: document.getElementById("rdvPatient").value,
      date_rdv: document.getElementById("dateRdv").value,
      heure_rdv: document.getElementById("heureRdv").value,
      motif: document.getElementById("motifRdv").value,
      dent: document.getElementById("dentRdv").value,
      statut: document.getElementById("statutRdv").value,
      id_user: localStorage.getItem("userId") || 1,
    };
    try {
      const url = editRdvId ? `${API_URL}/rdv/${editRdvId}` : `${API_URL}/rdv`;
      const method = editRdvId ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: _authHeaders(),
        body: JSON.stringify(rdv),
      });
      if (_check401(res)) return;
      const data = await res.json();
      if (data.success || res.ok) {
        showToast(editRdvId ? "✅ RDV modifié!" : "✅ RDV ajouté!", "success");
        resetRdvForm();
        chargerRdv();
      } else showToast("❌ Erreur: " + (data.error || ""), "error");
    } catch (e) { showToast("❌ Erreur lors de l'opération", "error"); }
  });
}


// ============================================
// SALLE D'ATTENTE
// ============================================

let patientActuel = null;
let fileAttente = [];
let salleAttenteData = [];

async function chargerSalleAttente() {
  try {
    const res = await fetch(`${API_URL}/salle-attente`, { headers: _authHeaders() });
    if (_check401(res)) return;
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return; // ← Anti-crash
    salleAttenteData = data;
    patientActuel = salleAttenteData.find((r) => r.statut === "En cours") || null;
    fileAttente = salleAttenteData.filter((r) => r.statut === "En attente").sort((a, b) => a.position - b.position);

    const S = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    const termines = salleAttenteData.filter((r) => r.statut === "Terminé" || r.statut === "Termine").length;
    const enCours1 = salleAttenteData.filter((r) => r.statut === "En cours").length;
    S("totalAttente", fileAttente.length);
    S("patientEnCours", patientActuel ? patientActuel.position : "--");
    S("attenteTermines", termines);
    S("attenteTotal", salleAttenteData.length);
    afficherSalleAttente();
  } catch (e) {
    salleAttenteData = []; patientActuel = null; fileAttente = [];
    afficherSalleAttente();
  }
}

function afficherSalleAttente() {
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
    if (patientActuel) {
        setEl('currentTicket', patientActuel.position);
        setEl('currentPatientName', patientActuel.nom + " " + patientActuel.prenom);
        setEl('currentPatientTime', patientActuel.heure_arrivee || patientActuel.heure_rdv || '');
    } else {
        setEl('currentTicket', '--');
        setEl('currentPatientName', 'Aucun patient');
        setEl('currentPatientTime', '');
    }
    const wl = document.getElementById('waitingList');
    if (!wl) return;
    if (!fileAttente.length) { wl.innerHTML = '<p class="no-patients">Aucun patient en attente</p>'; return; }
    wl.innerHTML = fileAttente.map((r, i) => `
        <div class="waiting-item">
            <div class="waiting-number">${r.position}</div>
            <div class="waiting-info">
                <div class="waiting-name">${r.nom} ${r.prenom}</div>
                <div class="waiting-time">${r.heure_arrivee || '--:--'} — ${r.notes || 'Consultation'}</div>
            </div>
            <div class="waiting-actions">
                <button onclick="deplacerPatient(${r.id},${r.position-1})" class="btn-move-up"   ${r.position===1?'disabled':''} title="Monter">⬆️</button>
                <button onclick="deplacerPatient(${r.id},${r.position+1})" class="btn-move-down" title="Descendre">⬇️</button>
                <button onclick="supprimerPatientAttente(${r.id})"         class="btn-delete"    title="Retirer">🗑️</button>
            </div>
        </div>`).join('');
}

async function appelerPatientSuivant() {
    try {
        const res = await fetch(`${API_URL}/salle-attente/appeler-suivant`, { method: "POST", headers: { "Content-Type": "application/json" } });
        const data = await res.json();
        if (data.success) {
            showToast(`📢 Appeler: ${data.patient.nom} ${data.patient.prenom}`, "success");
            chargerSalleAttente();
        } else showToast("⚠️ " + data.message, "warning");
    } catch (e) { showToast("❌ Erreur", "error"); }
}

// FIX: Waiting room position ordering
async function terminerPatientActuel() {
    if (!patientActuel) { showToast("Aucun patient en cours!", "warning"); return; }
    if (!confirm(`Terminer la consultation de ${patientActuel.nom} ${patientActuel.prenom}?`)) return;
    try {
        const res = await fetch(`${API_URL}/salle-attente/${patientActuel.id}/terminer`, { method: "POST", headers: { "Content-Type": "application/json" } });
        const data = await res.json();
        if (data.success) {
            showToast("✅ Consultation terminée!", "success");
            await _fixWaitingRoomPositions();
            chargerSalleAttente();
        } else showToast("❌ " + data.error, "error");
    } catch (e) { showToast("❌ Erreur", "error"); }
}

async function _fixWaitingRoomPositions() {
    try {
        const res = await fetch(`${API_URL}/salle-attente`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        const waiting = (Array.isArray(data) ? data : [])
            .filter(r => r.statut === 'En attente')
            .sort((a, b) => a.position - b.position);

        for (let i = 0; i < waiting.length; i++) {
            const newPos = i + 1;
            if (waiting[i].position !== newPos) {
                await fetch(`${API_URL}/salle-attente/${waiting[i].id}/position`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                    body: JSON.stringify({ position: newPos })
                });
            }
        }
    } catch (e) { console.error('Position fix error:', e); }
}

async function deplacerPatient(id, nouvellePosition) {
    if (nouvellePosition < 1 || nouvellePosition > fileAttente.length) return;
    try {
        const res = await fetch(`${API_URL}/salle-attente/${id}/position`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ position: nouvellePosition }) });
        const data = await res.json();
        if (data.success) chargerSalleAttente();
        else showToast("❌ " + data.error, "error");
    } catch (e) { showToast("❌ Erreur", "error"); }
}

async function supprimerPatientAttente(id) {
    const p = salleAttenteData.find(x => x.id === id);
    if (!p || !confirm(`Retirer ${p.nom} ${p.prenom} de la file?`)) return;
    try {
        const res = await fetch(`${API_URL}/salle-attente/${id}`, { method: "DELETE" });
        const data = await res.json();
        if (data.success) {
            showToast("✅ Retiré de la file!", "success");
            chargerSalleAttente();
        } else showToast("❌ " + data.error, "error");
    } catch (e) { showToast("❌ Erreur", "error"); }
}

async function resetSalleAttente() {
    if (!confirm("Réinitialiser toute la salle d'attente?")) return;
    try {
        const res = await fetch(`${API_URL}/salle-attente/reset`, { method: "POST", headers: { "Content-Type": "application/json" } });
        const data = await res.json();
        if (data.success) {
            showToast("✅ Salle d'attente réinitialisée!", "success");
            chargerSalleAttente();
        } else showToast("❌ " + data.error, "error");
    } catch (e) { showToast("❌ Erreur", "error"); }
}

async function chargerPatientsWaitingRoom() {
    const sel = document.getElementById("waitingPatient");
    if (!sel) return;
    sel.innerHTML = '<option value="">Sélectionner un patient</option>';
    patients.forEach(p => { sel.innerHTML += `<option value="${p.id_patient}">${p.nom} ${p.prenom}</option>`; });
    const now = new Date();
    const wt = document.getElementById("waitingTime");
    if (wt) wt.value = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

const waitingRoomForm = document.getElementById("waitingRoomForm");
if (waitingRoomForm) {
    waitingRoomForm.addEventListener("submit", async function(e) {
        e.preventDefault();
        const patientAttente = {
            id_patient: document.getElementById("waitingPatient").value,
            id_rdv: null,
            heure_arrivee: document.getElementById("waitingTime").value,
            notes: document.getElementById("waitingMotif").value || "Consultation"
        };
        try {
            const res = await fetch(`${API_URL}/salle-attente`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patientAttente) });
            const data = await res.json();
            if (data.success) {
                showToast("✅ Patient ajouté à la file!", "success");
                this.reset();
                chargerPatientsWaitingRoom();
                chargerSalleAttente();
            } else showToast("❌ Erreur: " + (data.error || ""), "error");
        } catch (e) { showToast("❌ Erreur", "error"); }
    });
}

// ============================================
// INITIALISATION
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    loadTheme();
    initUserUI();

    const path = window.location.pathname;
    const isDash = path.includes('dashboard.html') || path.endsWith('/') || path.includes('index');
    if (!isDash) return;

    initDpPaginationClick();
    startDateTimeUpdater();
    checkAuth();

    // Attacher les listeners formulaires UNE SEULE FOIS
    _attachRdvFormListener();

    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const el = document.getElementById('dashUserName');
        if (el && user.prenom) el.textContent = 'Bienvenue, ' + user.prenom + ' ' + (user.nom || '');
    } catch (e) {}

    Promise.all([
        chargerPatients(),
        chargerRdv(),
        chargerSalleAttente(),
        chargerStatsPaiements(),
        chargerFactures(),
        chargerToutesFactures()
    ]).then(() => {
        rechargerDashboard();
        startLiveRefresh();
    });

    setTimeout(() => {
        const userId = localStorage.getItem('userId');
        if (userId) {
            fetch(API_URL + '/chat/unread/' + userId)
                .then(r => r.json())
                .then(d => {
                    const badge = document.getElementById('chatBadge');
                    if (badge && d.count > 0) {
                        badge.textContent = d.count;
                        badge.style.display = 'inline';
                    }
                }).catch(() => {});
        }
    }, 2000);

    setInterval(() => {
    const active = document.querySelector('.section.active');
    if (!active || active.id === 'dashboard') rechargerDashboard();
}, 30000); 

    setInterval(() => {
        if (typeof _chatOpen !== 'undefined' && !_chatOpen) {
            const uid = localStorage.getItem('userId');
            if (uid) fetch(API_URL + '/chat/unread/' + uid).then(r => r.json()).then(d => {
                const badge = document.getElementById('chatBadge');
                if (badge) {
                    if (d.count > 0) {
                        badge.textContent = d.count;
                        badge.style.display = 'inline';
                    } else badge.style.display = 'none';
                }
            }).catch(() => {});
        }
    }, 15000);
});

// ============================================
// SCHÉMA DENTAIRE
// ============================================



// ── Palette ISO des états dentaires ──
const DENTAL_COLORS = {
    saine:            { fill: 'url(#toothNormal)',   stroke: '#D4B896', rootFill: '#F5ECD7' },
    carie:            { fill: 'url(#toothCarie)',    stroke: '#D97706', rootFill: '#FDE68A' },
    bridge:           { fill: 'url(#toothBridge)',   stroke: '#059669', rootFill: '#A7F3D0' },
    implant:          { fill: '#E5E7EB',             stroke: '#9CA3AF', rootFill: '#E5E7EB' },
    couronne:         { fill: 'url(#toothCouronne)', stroke: '#7C3AED', rootFill: '#DDD6FE' },
    extraction:       { fill: 'url(#toothExtract)',  stroke: '#DC2626', rootFill: '#FECACA' },
    traitement_canal: { fill: 'url(#toothCanal)',    stroke: '#EA580C', rootFill: '#FED7AA' },
    absente:          { fill: 'rgba(203,213,225,0.3)', stroke: '#CBD5E1', rootFill: 'rgba(203,213,225,0.2)' },
    selected:         { fill: 'url(#toothSelected)', stroke: '#2563EB', rootFill: '#93C5FD' },
};

// ── Adulte : 8 dents × 4 quadrants = 32 dents ──
// Format : [numéro, crownW, crownH, rootW, rootH, type]
const _ADULT_TEETH = {
    upper: [
        [18,21,20,14,32,'wisdom'],  [17,23,22,17,36,'molar'],   [16,24,22,18,38,'molar'],
        [15,19,22,13,46,'premolar'],[14,19,22,13,48,'premolar'],[13,17,32,7,60,'canine'],
        [12,18,26,8,55,'lateral'],  [11,21,30,9,55,'central'],
        [21,21,30,9,55,'central'],  [22,18,26,8,55,'lateral'],  [23,17,32,7,60,'canine'],
        [24,19,22,13,48,'premolar'],[25,19,22,13,46,'premolar'],[26,24,22,18,38,'molar'],
        [27,23,22,17,36,'molar'],   [28,21,20,14,32,'wisdom']
    ],
    lower: [
        [48,21,20,14,32,'wisdom'],  [47,23,22,17,36,'molar'],   [46,24,22,18,38,'molar'],
        [45,19,22,13,46,'premolar'],[44,19,22,13,48,'premolar'],[43,17,32,7,60,'canine'],
        [42,18,26,8,55,'lateral'],  [41,21,30,9,55,'central'],
        [31,21,30,9,55,'central'],  [32,18,26,8,55,'lateral'],  [33,17,32,7,60,'canine'],
        [34,19,22,13,48,'premolar'],[35,19,22,13,46,'premolar'],[36,24,22,18,38,'molar'],
        [37,23,22,17,36,'molar'],   [38,21,20,14,32,'wisdom']
    ]
};

// ── Enfant : 5 dents × 4 quadrants = 20 dents ──
const _CHILD_TEETH = {
    upper: [
        [55,19,22,14,34,'deciduous'],[54,20,22,15,36,'deciduous'],[53,16,28,7,52,'deciduous'],
        [52,15,22,7,48,'deciduous'], [51,18,26,8,48,'deciduous'],
        [61,18,26,8,48,'deciduous'], [62,15,22,7,48,'deciduous'], [63,16,28,7,52,'deciduous'],
        [64,20,22,15,36,'deciduous'],[65,19,22,14,34,'deciduous']
    ],
    lower: [
        [85,19,22,14,34,'deciduous'],[84,20,22,15,36,'deciduous'],[83,16,28,7,52,'deciduous'],
        [82,15,22,7,48,'deciduous'], [81,18,26,8,48,'deciduous'],
        [71,18,26,8,48,'deciduous'], [72,15,22,7,48,'deciduous'], [73,16,28,7,52,'deciduous'],
        [74,20,22,15,36,'deciduous'],[75,19,22,14,34,'deciduous']
    ]
};

const _D_GAP  = 3;   // espace entre dents (px)
const _D_CGAP = 6;   // espace au centre (séparateur)
const _D_SVG_W = 900;

function _dentalToggle(label) {
    _dentalSelected.has(label) ? _dentalSelected.delete(label) : _dentalSelected.add(label);
    _dentalUpdateTooth(label);
    _dentalRefreshPanel();
}

/* REMOVED DUPLICATE: _dentalUpdateTooth L1132 */

function _dentalRefreshPanel() {
    const tagsEl = document.getElementById('dentalTags');
    const countEl = document.getElementById('dentalCount');
    const btnEl = document.getElementById('dentalConfirmBtn');
    if (!tagsEl) return;
    countEl.textContent = _dentalSelected.size;
    btnEl.disabled = _dentalSelected.size === 0;
    if (_dentalSelected.size === 0) {
        tagsEl.innerHTML = '<span class="dental-empty">Aucune dent sélectionnée</span>';
        return;
    }
    const sorted = Array.from(_dentalSelected).sort((a, b) => a - b);
    tagsEl.innerHTML = sorted.map(t =>
        `<span class="dental-tag">Dent ${t}<span class="dental-tag-x" data-tooth="${t}">\xd7</span></span>`
    ).join('');
    tagsEl.querySelectorAll('.dental-tag-x').forEach(el => {
        el.addEventListener('click', () => {
            _dentalSelected.delete(Number(el.dataset.tooth));
            _dentalUpdateTooth(Number(el.dataset.tooth));
            _dentalRefreshPanel();
        });
    });
}

async function _dentalLoadConditions(patientId) {
  _dentalConditions = {};
  if (!patientId) return;
  try {
    const res = await fetch(`${API_URL}/schema-dentaire/${patientId}`, { headers: _authHeaders() });
    if (_check401(res)) return;
    if (!res.ok) return;
    const json = await res.json();
    if (json.success && json.data) json.data.forEach((row) => { _dentalConditions[row.numero_dent] = row.etat; });
  } catch (e) { console.error("Erreur chargement schéma dentaire:", e); }
}

/* REMOVED DUPLICATE: ouvrirSchemaDentaire L1181 */

function fermerSchemaDentaire(event) {
    if (event && event.target !== document.getElementById('dentalModal')) return;
    document.getElementById('dentalModal').classList.remove('modal-open');
    document.body.style.overflow = '';
}

function dentalClearAll() {
    Array.from(_dentalSelected).forEach(t => {
        _dentalSelected.delete(t);
        _dentalUpdateTooth(t);
    });
    _dentalRefreshPanel();
}

/* REMOVED DUPLICATE: confirmerDentsRdv L1208 */

function effacerDentsRdv() {
    const dentRdv = document.getElementById('dentRdv');
    if (dentRdv) dentRdv.value = '';
    const label = document.getElementById('dentSelectorLabel');
    if (label) label.textContent = 'Sélectionner les dents (optionnel)';
    const btn = document.getElementById('dentSelectorBtn');
    if (btn) btn.classList.remove('has-selection');
    const clear = document.getElementById('dentClearBtn');
    if (clear) clear.style.display = 'none';
    _dentalSelected.clear();
}

/* REMOVED DUPLICATE: resetRdvForm L1261 */

const _origModifierRdv = window.modifierRdv;
window.modifierRdv = function(id) {
    const rdv = rdvs.find(r => r.id_rdv === id);
    if (!rdv) return;
    document.getElementById("rdvPatient").value = rdv.id_patient;
    document.getElementById("dateRdv").value = (rdv.date_rdv || '').split('T')[0].split(' ')[0];
    document.getElementById("heureRdv").value = rdv.heure_rdv || '';
    document.getElementById("motifRdv").value = rdv.motif || '';
    document.getElementById("dentRdv").value = rdv.dent || '';
    document.getElementById("statutRdv").value = rdv.statut;
    editRdvId = id;
    document.getElementById("rdvBtn").innerText = "✏️ Modifier";
    document.getElementById("cancelRdvBtn").style.display = "inline-flex";
    document.querySelector('#rdv .form-container') ?.scrollIntoView({ behavior: 'smooth' });
    setTimeout(() => {
        const val = document.getElementById('dentRdv').value;
        if (val) {
            const dents = val.split(',').map(Number).filter(Boolean).sort((a, b) => a - b);
            const label = document.getElementById('dentSelectorLabel');
            const btn = document.getElementById('dentSelectorBtn');
            const clear = document.getElementById('dentClearBtn');
            if (label) label.textContent = dents.length === 1 ? `Dent ${dents[0]}` : `${dents.length} dents : ${dents.slice(0,4).join(', ')}${dents.length>4?'…':''}`;
            if (btn) btn.classList.add('has-selection');
            if (clear) clear.style.display = 'inline-block';
            _dentalSelected.clear();
            dents.forEach(d => _dentalSelected.add(d));
        }
    }, 50);
};

document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        const modal = document.getElementById('dentalModal');
        if (modal && modal.style.display !== 'none') fermerSchemaDentaire();
    }
});

// ============================================
// TOAST NOTIFICATIONS
// ============================================
function showToast(message, type = 'success') {
    const existing = document.getElementById('toastNotification');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'toastNotification';
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    requestAnimationFrame(() => requestAnimationFrame(() => toast.classList.add('show')));
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 350);
    }, 3500);
}

// ============================================
// TOPBAR — THÈME / NOTIFICATIONS / USER
// ============================================

// Thème sombre/clair
function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    html.setAttribute('data-theme', isDark ? 'light' : 'dark');
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = isDark ? '🌙' : '☀️';
}

function loadTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', saved);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.textContent = saved === 'dark' ? '☀️' : '🌙';
}

// Menu utilisateur
function toggleUserMenu() {
    document.getElementById('userMenuDropdown') ?.classList.toggle('open');
    document.getElementById('notifDropdown') ?.classList.remove('open');
}

// Notifications
function toggleNotifications() {
    document.getElementById('notifDropdown') ?.classList.toggle('open');
    document.getElementById('userMenuDropdown') ?.classList.remove('open');
}

// Fermer dropdowns en cliquant ailleurs
document.addEventListener('click', function(e) {
    if (!e.target.closest('.topbar-btn')) {
        document.getElementById('notifDropdown') ?.classList.remove('open');
        document.getElementById('userMenuDropdown') ?.classList.remove('open');
    }
});

// Breadcrumb topbar
const _breadcrumbs = {
    'dashboard': '📊 Tableau de bord',
    'patients': '👥 Patients',
    'rdv': '📅 Rendez-vous',
    'agenda': '📆 Agenda RDV',
    'salle-attente': "🪑 Salle d'attente",
    'factures': '📄 Factures',
    'paiements': '💰 Paiements',
    'patients-risque': '⚠️ Patients à risque',
    'ordonnances': '📋 Ordonnances',
    'stock': '📦 Stock',
    'historique': '🕐 Historique',
};

function updateBreadcrumb(sectionId) {
    const el = document.getElementById('topbarBreadcrumb');
    if (el) el.textContent = _breadcrumbs[sectionId] || sectionId;
}

// Ajouter une notification
function addNotification(message, type = 'info') {
    const list = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');
    if (!list) return;
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const icons = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
    const existing = list.querySelector('p');
    if (existing && existing.textContent === 'Aucune notification') existing.remove();
    const item = document.createElement('div');
    item.className = 'notif-item';
    item.innerHTML = `<div class="notif-item-title">${icons[type]||'📌'} ${message}</div><div class="notif-item-time">${now}</div>`;
    list.prepend(item);
    // Garder max 10
    const items = list.querySelectorAll('.notif-item');
    if (items.length > 10) items[items.length - 1].remove();
    // Badge
    if (badge) {
        badge.style.display = 'inline';
        badge.textContent = Math.min(parseInt(badge.textContent || 0) + 1, 99);
    }
}

// ============================================
// GESTION DES RÔLES
// ============================================
function applyRole(role) {
    const body = document.body;
    body.classList.remove('secretaire', 'dentiste');
    if (role === 'secretaire') {
        body.classList.add('secretaire');
    } else {
        body.classList.add('dentiste');
    }
    setTimeout(() => applyRoleExtended(role), 800);
}

function getRoleAvatar(role) {
    const r = (role || '').toLowerCase();
    const isDentiste = r.includes('dentiste') || r.includes('medecin') || r.includes('docteur');
    if (isDentiste) return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%"><defs><radialGradient id="avBg1" cx="50%" cy="30%" r="70%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1d4ed8"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#avBg1)"/><path d="M10 64 Q10 46 20 42 L32 48 L44 42 Q54 46 54 64Z" fill="#ffffff" opacity="0.95"/><path d="M24 44 Q28 52 32 52 Q36 52 40 44" fill="none" stroke="#93c5fd" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="54" r="3.5" fill="#93c5fd"/><ellipse cx="32" cy="27" rx="12" ry="14" fill="#fcd9b6"/><path d="M20 21 Q20 11 32 9 Q44 11 44 21 Q44 15 32 14 Q20 15 20 21Z" fill="#1e293b"/><rect x="21" y="15" width="22" height="5" rx="2.5" fill="#dbeafe" opacity="0.9"/><circle cx="32" cy="17.5" r="3.5" fill="#60a5fa" opacity="0.95"/><ellipse cx="27" cy="29" rx="2" ry="2.2" fill="#1e293b"/><ellipse cx="37" cy="29" rx="2" ry="2.2" fill="#1e293b"/><circle cx="27.8" cy="28" r="0.8" fill="white"/><circle cx="37.8" cy="28" r="0.8" fill="white"/><path d="M27 35 Q32 40 37 35" fill="none" stroke="#c2773a" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%"><defs><radialGradient id="avBg2" cx="50%" cy="30%" r="70%"><stop offset="0%" stop-color="#8b5cf6"/><stop offset="100%" stop-color="#6d28d9"/></radialGradient></defs><circle cx="32" cy="32" r="32" fill="url(#avBg2)"/><path d="M10 64 Q10 46 20 42 L32 48 L44 42 Q54 46 54 64Z" fill="#f3e8ff" opacity="0.95"/><path d="M26 42 L32 48 L38 42 Q32 46 26 42Z" fill="#c4b5fd"/><ellipse cx="32" cy="27" rx="12" ry="14" fill="#fcd9b6"/><path d="M20 19 Q18 35 20 44 Q22 37 20 19Z" fill="#92400e"/><path d="M44 19 Q46 35 44 44 Q42 37 44 19Z" fill="#92400e"/><path d="M20 19 Q20 9 32 8 Q44 9 44 19 Q44 13 32 12 Q20 13 20 19Z" fill="#92400e"/><path d="M20 26 Q17 26 17 30 Q17 33 20 33" fill="none" stroke="#6d28d9" stroke-width="2"/><rect x="15" y="27" width="5" height="5" rx="2" fill="#8b5cf6"/><ellipse cx="27" cy="29" rx="2" ry="2.2" fill="#1e293b"/><ellipse cx="37" cy="29" rx="2" ry="2.2" fill="#1e293b"/><circle cx="27.8" cy="28" r="0.8" fill="white"/><circle cx="37.8" cy="28" r="0.8" fill="white"/><path d="M27 35 Q32 39 37 35" fill="none" stroke="#c2773a" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}

function initUserUI() {
    try {
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        const role = user.role || 'secretaire';
        const initials = ((user.prenom || '')[0] || '') + ((user.nom || '')[0] || '');
        const avatarSVG = getRoleAvatar(role);

        // Topbar avatar
        const topAvatar = document.getElementById('userAvatarTop');
        const lgAvatar = document.getElementById('userAvatarLg');
        if (topAvatar) {
            if (avatarSVG) {
                topAvatar.innerHTML = avatarSVG;
                topAvatar.style.padding = '0';
                topAvatar.style.overflow = 'hidden';
            } else topAvatar.textContent = initials || '?';
        }
        if (lgAvatar) {
            if (avatarSVG) {
                lgAvatar.innerHTML = avatarSVG;
                lgAvatar.style.padding = '0';
                lgAvatar.style.overflow = 'hidden';
            } else lgAvatar.textContent = initials || '?';
        }

        // Hero avatar in dashboard
        const heroAvatar = document.getElementById('ficheAvatar');
        const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        setEl('userMenuNom', (user.prenom || '') + ' ' + (user.nom || ''));
        setEl('userMenuRole', role === 'dentiste' ? '🦷 Dentiste' : '📋 Secrétaire');
        setEl('dashUserName', `Bonjour, ${user.prenom || 'Utilisateur'} 👋`);

        applyRole(role);
        if (role === 'secretaire') {
            const li = document.getElementById('nav-historique-li');
            if (li) li.style.display = 'none';
        }
    } catch (e) {}
}

// ============================================
// HISTORIQUE (section interface)
// ============================================


async function chargerHistorique() {
  try {
    const headers = _authHeaders();
    const [patsRes, rdvsRes, paysRes, facsRes] = await Promise.all([
      fetch(`${API_URL}/patients`, { headers }).catch(() => null),
      fetch(`${API_URL}/rdv`, { headers }).catch(() => null),
      fetch(`${API_URL}/paiements`, { headers }).catch(() => null),
      fetch(`${API_URL}/factures`, { headers }).catch(() => null),
    ]);

    if (patsRes && patsRes.status === 401) return logout();

    const pats     = patsRes && patsRes.ok     ? await patsRes.json()    : [];
    const rdvsList = rdvsRes && rdvsRes.ok     ? await rdvsRes.json()    : [];
    const pays     = paysRes && paysRes.ok     ? await paysRes.json()    : [];
    const facs     = facsRes && facsRes.ok     ? await facsRes.json()    : [];

    const hist = [];

    // ← Anti-crash : vérifier Array.isArray avant forEach
    if (Array.isArray(pats)) {
      pats.forEach((p) => hist.push({ dt: p.created_at, type: "PATIENT_AJOUT", op: "Patient ajouté", patient: `${p.nom} ${p.prenom}`, details: `Tél: ${p.telephone || "-"} | CIN: ${p.cnie || "-"}` }));
    }
    if (Array.isArray(rdvsList)) {
      rdvsList.forEach((r) => hist.push({ dt: r.created_at, type: "RDV_AJOUT", op: "RDV planifié", patient: `${r.nom} ${r.prenom}`, details: `${r.date_rdv} à ${r.heure_rdv || "?"} — ${r.motif || "Consultation"}` }));
    }
    if (Array.isArray(pays)) {
      pays.forEach((p) => hist.push({ dt: p.created_at, type: "PAIEMENT_AJOUT", op: "Paiement enregistré", patient: `${p.patient_nom || ""} ${p.patient_prenom || ""}`.trim(), details: `${parseFloat(p.montant || 0).toFixed(2)} DH — ${p.type_paiement || "Especes"}` }));
    }
    if (Array.isArray(facs)) {
      facs.forEach((f) => hist.push({ dt: f.created_at, type: "FACTURE_AJOUT", op: "Facture créée", patient: `${f.patient_nom || ""} ${f.patient_prenom || ""}`.trim(), details: `${f.numero_facture} — ${parseFloat(f.montant_total || 0).toFixed(2)} DH` }));
    }

    hist.sort((a, b) => new Date(b.dt || 0) - new Date(a.dt || 0));
    _historiqueData = hist;
    _lastHistoriqueFiltered = hist;
    _dpPage.historique = 1;
    if (typeof afficherHistorique === "function") afficherHistorique(hist);
  } catch (e) { console.error("Erreur critique Historique:", e); }
}

const HIST_COLORS_UI = {
    PATIENT_AJOUT: { bg: '#E3F2FD', color: '#1565C0', icon: '👤' },
    PATIENT_MODIF: { bg: '#FCE4EC', color: '#C62828', icon: '✏️' },
    PATIENT_SUPPRIM: { bg: '#FFEBEE', color: '#B71C1C', icon: '🗑️' },
    RDV_AJOUT: { bg: '#E8F5E9', color: '#2E7D32', icon: '📅' },
    RDV_MODIF: { bg: '#FFFFF9C4', color: '#F57F17', icon: '✏️' },
    RDV_SUPPRIM: { bg: '#FFEBEE', color: '#C62828', icon: '🗑️' },
    PAIEMENT_AJOUT: { bg: '#F3E5F5', color: '#6A1B9A', icon: '💰' },
    FACTURE_AJOUT: { bg: '#FFF3E0', color: '#E65100', icon: '📄' },
    FACTURE_MAJ: { bg: '#FBE9E7', color: '#D84315', icon: '🔄' },
    FACTURE_SUPPRIM: { bg: '#FFEBEE', color: '#C62828', icon: '🗑️' },
    SALLE_AJOUT: { bg: '#E8EAF6', color: '#283593', icon: '🪑' },
    DEFAULT: { bg: '#F5F5F5', color: '#424242', icon: '📝' },
};

function afficherHistorique(data) {
    const list = document.getElementById('historiqueList');
    if (!list) return;
    const arr = data || [];
    if (!arr.length) {
        list.innerHTML = "<tr><td colspan='6' style='text-align:center;color:#888;padding:24px;'>Aucune activité enregistrée</td></tr>";
        dpPaginationRender("paginationHistorique", "historique", 1, 1, 0);
        return;
    }
    const { page, totalPages } = dpEnsurePage("historique", arr.length);
    const slice = arr.slice((page - 1) * DP_PAGE_SIZE, page * DP_PAGE_SIZE);
    const base = (page - 1) * DP_PAGE_SIZE;
    list.innerHTML = slice.map((h, idx) => {
        const c = HIST_COLORS_UI[h.type] || HIST_COLORS_UI.DEFAULT;
        const dt = h.dt ? formatDateCreation(h.dt) + ' ' + (new Date(h.dt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })) : '-';
        const rowNum = base + idx + 1;
        return `<tr>
            <td><strong>${rowNum}</strong></td>
            <td style="font-size:12px;color:#64748b;">${dt}</td>
            <td><span class="hist-badge" style="background:${c.bg};color:${c.color};">${c.icon} ${h.type.replace(/_/g,' ')}</span></td>
            <td><strong>${h.op||'-'}</strong></td>
            <td>${h.patient||'-'}</td>
            <td style="font-size:12px;color:#64748b;">${h.details||'-'}</td>
        </tr>`;
    }).join('');
    dpPaginationRender("paginationHistorique", "historique", page, totalPages, arr.length);
}

function filtrerHistorique() {
    const search = document.getElementById('searchHistorique') ?.value ?.toLowerCase() || '';
    const type = document.getElementById('filtreHistType') ?.value || '';
    const deb = document.getElementById('histDateDeb') ?.value || '';
    const fin = document.getElementById('histDateFin') ?.value || '';
    let data = _historiqueData.filter(h => {
        const matchS = !search || (h.patient || '').toLowerCase().includes(search) || (h.op || '').toLowerCase().includes(search) || (h.details || '').toLowerCase().includes(search);
        const matchT = !type || (h.type || '').includes(type);
        const hDate = h.dt ? h.dt.split('T')[0].split(' ')[0] : '';
        const matchD = (!deb || hDate >= deb) && (!fin || hDate <= fin);
        return matchS && matchT && matchD;
    });
    _lastHistoriqueFiltered = data;
    _dpPage.historique = 1;
    afficherHistorique(data);
}

function clearHistoriqueFilter() {
    ['searchHistorique', 'filtreHistType', 'histDateDeb', 'histDateFin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    _lastHistoriqueFiltered = _historiqueData;
    _dpPage.historique = 1;
    afficherHistorique(_historiqueData);
}

// ============================================
// SCHÉMA DENTAIRE AMÉLIORÉ
// ============================================
// Formes des dents selon leur type
/* OLD DENTAL BLOCK 2 - superseded by advanced engine */
/* OLD _dentalUpdateTooth - superseded */

// Ouvrir le schema avec contexte (rdv ou facture)

async function ouvrirSchemaDentaire(context) {
  _dentalContext = context || "rdv";
  _dentalSelected.clear();
  const hiddenId = context === "facture" ? "factureDent" : "dentRdv";
  if (context !== "fiche") {
    const existing = document.getElementById(hiddenId)?.value || "";
    if (existing) existing.split(",").map(Number).filter(Boolean).forEach((d) => _dentalSelected.add(d));
  }
  let patientId = null;
  if (context === "facture") patientId = document.getElementById("facturePatient")?.value;
  else if (context === "fiche") patientId = _fichePatientId;
  else patientId = document.getElementById("rdvPatient")?.value;

  if (context === "fiche" && !patientId) { showToast("Ouvrez d'abord une fiche patient", "warning"); return; }
  if (context !== "fiche" && !patientId) { showToast("Sélectionnez un patient pour le rendez-vous ou la facture", "warning"); return; }

  // Reset et reconstruire
  _dentalBuilt = false;
  _dentalIsBuilding = false; // ← Reset flag anti-récursion
  const up = document.getElementById("dental-upper");
  const lo = document.getElementById("dental-lower");
  if (up) up.innerHTML = "";
  if (lo) lo.innerHTML = "";

  await _dentalLoadConditions(patientId);

  // Attendre que le modal soit visible avant de construire le SVG
  const modal = document.getElementById("dentalModal");
  if (modal) {
    modal.classList.add("modal-open");
    document.body.style.overflow = "hidden";
    // Construire APRÈS que le DOM soit rendu (requestAnimationFrame)
    requestAnimationFrame(() => {
      _dentalBuildChart();
      _dentalSelected.forEach((l) => _dentalUpdateTooth(l));
      _dentalRefreshPanel();
    });
  }
}
function confirmerDentsRdv() {
    if (_dentalContext === 'fiche') {
        document.getElementById('dentalModal').classList.remove('modal-open');
        document.body.style.overflow = '';
        return;
    }
    const sorted = Array.from(_dentalSelected).sort((a, b) => a - b);
    const valeur = sorted.join(',');
    const hiddenId = _dentalContext === 'facture' ? 'factureDent' : 'dentRdv';
    const field = document.getElementById(hiddenId);
    if (field) field.value = valeur;
    // Mettre à jour le bouton correspondant
    if (_dentalContext === 'rdv') {
        const btn = document.getElementById('dentSelectorBtn');
        const label = document.getElementById('dentSelectorLabel');
        const clear = document.getElementById('dentClearBtn');
        if (sorted.length === 0) {
            if (label) label.textContent = 'Dents (optionnel)';
            btn ?.classList.remove('has-selection');
            if (clear) clear.style.display = 'none';
        } else {
            const txt = sorted.length === 1 ? `Dent ${sorted[0]}` : `${sorted.length} dents: ${sorted.slice(0,3).join(',')}${sorted.length>3?'…':''}`;
            if (label) label.textContent = txt;
            btn ?.classList.add('has-selection');
            if (clear) clear.style.display = 'inline-block';
        }
    } else {
        const btn = document.getElementById('factureDentBtn');
        if (btn) btn.textContent = sorted.length ? `🦷 ${sorted.length === 1 ? 'Dent '+sorted[0] : sorted.length+' dents'}` : '🦷 Dents';
    }
    document.getElementById('dentalModal').classList.remove('modal-open');
    document.body.style.overflow = '';
}

function validerSchemaDentaire() {
    confirmerDentsRdv();
}

function _dentalClearSelection() {
    dentalClearAll();
}

function _getDentalPatientId() {
    if (_dentalContext === 'fiche') return _fichePatientId;
    if (_dentalContext === 'facture') return document.getElementById('facturePatient') ?.value;
    return document.getElementById('rdvPatient') ?.value;
}

async function _dentalSetEtat(etatUi) {
    const patientId = _getDentalPatientId();
    if (!patientId) {
        showToast('Patient introuvable pour ce schéma', 'warning');
        return;
    }
    if (_dentalSelected.size === 0) {
        showToast('Cliquez sur une ou plusieurs dents sur le schéma', 'warning');
        return;
    }
    const etatDb = etatUi === 'canal' ? 'traitement_canal' : etatUi;
    let ok = 0;
    for (const num of _dentalSelected) {
        _dentalConditions[num] = etatDb;
        try {
            const res = await fetch(API_URL + '/schema-dentaire', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id_patient: Number(patientId),
                    numero_dent: num,
                    etat: etatDb,
                    notes: null
                })
            });
            if (res.ok) ok++;
        } catch (e) {}
        _dentalUpdateTooth(num);
    }
    showToast(ok ? `État « ${etatUi} » enregistré (${ok} dent(s))` : 'Erreur enregistrement', ok ? 'success' : 'error');
}


// ============================================
// OVERRIDE chercherPatientPaiement — use new input
// ============================================
window.chercherPatientPaiement = async function() {
    // Chercher dans le champ de la searchbar
    const term = (document.getElementById('searchPaiementBtn') ?.value || document.getElementById('searchPatientPaiement') ?.value || '').trim();
    if (!term) { showToast('Saisissez un nom, prénom ou CIN', 'warning'); return; }
    try {
        const res = await fetch(`${API_URL}/patients/search/${encodeURIComponent(term)}`);
        const data = await res.json();
        if (data.length > 0) {
            currentPatientForPaiement = data[0];
            document.getElementById('paiementPatientId').value = currentPatientForPaiement.id_patient;
            document.getElementById('paiementPatientNom').textContent = currentPatientForPaiement.nom + ' ' + currentPatientForPaiement.prenom;
            document.getElementById('ajoutPaiementForm').style.display = 'block';
            document.getElementById('datePaiement').value = new Date().toISOString().split('T')[0];
            chargerFacturesPatientPourPaiement(currentPatientForPaiement.id_patient);
            addNotification(`Patient sélectionné: ${currentPatientForPaiement.nom} ${currentPatientForPaiement.prenom}`, 'info');
        } else {
            showToast('Aucun patient trouvé', 'warning');
        }
    } catch (e) { showToast('❌ Erreur de recherche', 'error'); }
};

// Notifications automatiques
const _origChargerRdv = window.chargerRdv;
window.chargerRdv = async function(dateFilter) {
    if (typeof _origChargerRdv === 'function') await _origChargerRdv(dateFilter);
    // Vérifier RDV du jour
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const count = rdvs.filter(r => r.date_rdv === today && r.statut === 'Prevu').length;
    if (count > 0) addNotification(`${count} rendez-vous prévu(s) aujourd'hui`, 'info');
};

// ============================================
// INITIALISATION — Compléter avec rôles et thème
// ============================================
// loadTheme/initUserUI merged into main DOMContentLoaded

// ============================================
// ASSURANCE — toggle champ immatriculation
// ============================================
function toggleImmatriculation() {
    const ta = document.getElementById('type_assurance');
    const nim = document.getElementById('numero_immatriculation');
    if (!ta || !nim) return;
    nim.style.display = (ta.value === 'CNSS' || ta.value === 'CNOPS') ? 'flex' : 'none';
}

// ============================================
// PATIENTS — champs supplémentaires
// ============================================
// Override patientForm submit pour inclure les nouveaux champs
const _patForm = document.getElementById("patientForm");
if (_patForm) {
    // Remove old listener by replacing element (ou simplement override via patientForm.onsubmit)
    _patForm.addEventListener("submit", async function(e) {
        e.preventDefault();
        const patient = {
            nom: document.getElementById("nom").value,
            prenom: document.getElementById("prenom").value,
            sexe: document.getElementById("sexe").value,
            telephone: document.getElementById("telephone").value,
            cnie: document.getElementById("cnie") ?.value || '',
            date: document.getElementById("date") ?.value || '',
            ville: document.getElementById("ville") ?.value || '',
            pays: document.getElementById("pays") ?.value || 'Maroc',
            email: document.getElementById("email") ?.value || '',
            type_assurance: document.getElementById("type_assurance") ?.value || 'Aucune',
            numero_immatriculation: document.getElementById("numero_immatriculation") ?.value || '',
            type_patient: document.getElementById("type_patient") ?.value || 'adulte',
            antecedents_medicaux: document.getElementById("antecedents_medicaux") ?.value || '',
            allergies: document.getElementById("allergies") ?.value || '',
        };
        try {
            const url = editPatientId ? `${API_URL}/patients/${editPatientId}` : `${API_URL}/patients`;
            const method = editPatientId ? "PUT" : "POST";
            const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(patient) });
            const data = await res.json();
            if (data.success || res.ok) {
                showToast(editPatientId ? "✅ Patient modifié!" : "✅ Patient ajouté!", "success");
                resetPatientForm();
                chargerPatients();
                addNotification(editPatientId ? `Patient modifié: ${patient.nom} ${patient.prenom}` : `Nouveau patient: ${patient.nom} ${patient.prenom}`, 'success');
            } else { showToast("❌ " + (data.error || ''), "error"); }
        } catch (err) { showToast("❌ Erreur", "error"); }
    }, true); // capture = true pour override le listener existant
}

// Override afficherPatients pour inclure clic sur ligne
window.afficherPatients = function(filtre = "") {
    const list = document.getElementById("patientList");
    if (!list) return;
    const triValue = document.getElementById("triPatient") ?.value || "";
    let pf = patients.filter(p =>
        (p.nom || '').toLowerCase().includes(filtre.toLowerCase()) ||
        (p.prenom || '').toLowerCase().includes(filtre.toLowerCase()) ||
        (p.cnie || '').toLowerCase().includes(filtre.toLowerCase()) ||
        (p.telephone || '').includes(filtre)
    );
    if (triValue) {
        pf.sort((a, b) => {
            switch (triValue) {
                case 'nom_asc':
                    return (a.nom || '').localeCompare(b.nom || '');
                case 'nom_desc':
                    return (b.nom || '').localeCompare(a.nom || '');
                case 'date_ajout_desc':
                    return new Date(b.created_at || 0) - new Date(a.created_at || 0);
                case 'date_ajout_asc':
                    return new Date(a.created_at || 0) - new Date(b.created_at || 0);
                default:
                    return 0;
            }
        });
    }
    if (!pf.length) {
        list.innerHTML = `<tr><td colspan="9" style="text-align:center;color:#888;padding:20px;">Aucun patient trouvé</td></tr>`;
        dpPaginationRender("paginationPatients", "patients", 1, 1, 0);
        updatePatientDashboardStats();
        return;
    }
    const { page, totalPages } = dpEnsurePage("patients", pf.length);
    const slice = pf.slice((page - 1) * DP_PAGE_SIZE, page * DP_PAGE_SIZE);
    list.innerHTML = slice.map(p => {
        const assuranceBadge = p.type_assurance && p.type_assurance !== 'Aucune' ?
            `<span class="statut-badge statut-prevu">${p.type_assurance}</span>` : '<span style="color:#888">—</span>';
        return `<tr onclick="ouvrirFichePatient(${p.id_patient})" title="Voir la fiche complète">
            <td><strong>${p.nom}</strong> ${p.prenom}</td>
            <td>${p.sexe||'-'}</td>
            <td>${p.telephone||'-'}</td>
            <td>${p.cnie||'-'}</td>
            <td>${assuranceBadge}</td>
            <td><span class="statut-badge ${p.type_patient==='enfant'?'statut-en-cours':'statut-prevu'}">${p.type_patient||'adulte'}</span></td>
            <td>${formatDateNaissance(p.date_naissance)}</td>
            <td>${formatDateCreation(p.created_at)}</td>
            <td onclick="event.stopPropagation()" style="white-space:nowrap;">
                <button onclick="ouvrirModalNouveauPatient(${p.id_patient})" class="btn-edit" title="Modifier">✏️</button>
                <button onclick="imprimerFichePatient(${p.id_patient})" class="btn-pdf" title="Fiche PDF pré-remplie">📋</button>
                <button onclick="supprimerPatient(${p.id_patient})" class="btn-delete" title="Supprimer">🗑️</button>
            </td>
        </tr>`;
    }).join('');
    dpPaginationRender("paginationPatients", "patients", page, totalPages, pf.length);
    updatePatientDashboardStats();
};

// Override modifierPatient pour inclure les nouveaux champs
window.modifierPatient = function(id) {
    const p = patients.find(x => x.id_patient === id);
    if (!p) return;
    const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v || ''; };
    setVal('nom', p.nom);
    setVal('prenom', p.prenom);
    setVal('sexe', p.sexe);
    setVal('telephone', p.telephone);
    setVal('cnie', p.cnie || '');
    setVal('date', (p.date_naissance || '').split('T')[0].split(' ')[0]);
    setVal('ville', p.ville || '');
    setVal('pays', p.pays || 'Maroc');
    setVal('email', p.email || '');
    setVal('type_assurance', p.type_assurance || 'Aucune');
    setVal('numero_immatriculation', p.numero_immatriculation || '');
    setVal('type_patient', p.type_patient || 'adulte');
    setVal('antecedents_medicaux', p.antecedents_medicaux || '');
    setVal('allergies', p.allergies || '');
    editPatientId = id;
    toggleImmatriculation();
    document.getElementById("patientBtn").innerText = "✏️ Modifier";
    document.getElementById("cancelPatientBtn").style.display = "inline-flex";
    document.querySelector('#patients .form-container') ?.scrollIntoView({ behavior: 'smooth' });
};

// ============================================
// FICHE PATIENT — Modal complète
// ============================================


async function ouvrirFichePatient(id) {
    _fichePatientId = id;
    try {
        // 1. AJOUT DU HEADER D'AUTH (Sinon ton backend te dira "Accès non autorisé")
        const res = await fetch(`${API_URL}/patients/${id}`, { 
            headers: _authHeaders() 
        });
        
        const json = await res.json();
        
        // 2. COMPATIBILITÉ DES FORMATS (Gérer si c'est p ou p.data)
        const p = json.data ? json.data : json;

        // --- Remplissage du Header ---
        const initials = ((p.nom || '')[0] || '') + ((p.prenom || '')[0] || '');
        document.getElementById('ficheAvatar').textContent = initials.toUpperCase();
        document.getElementById('ficheNomPrenom').textContent = `${p.nom} ${p.prenom}`;

        // --- Calcul de l'Âge ---
        let age = '-';
        if (p.date_naissance) {
            const dob = new Date(p.date_naissance);
            if (!isNaN(dob)) {
                age = Math.floor((new Date() - dob) / (365.25 * 24 * 3600 * 1000)) + ' ans';
            }
        }

        const meta = [`${p.sexe||''}`, `${p.type_patient||'adulte'}`, p.type_assurance !== 'Aucune' ? p.type_assurance : ''];
        document.getElementById('ficheMeta').textContent = meta.filter(Boolean).join(' · ');

        // --- Infos Générales ---
        const setT = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v || '—'; };
        
        setT('ficheNomFull', `${p.nom} ${p.prenom}`);
        setT('ficheNaissance', formatDateNaissance(p.date_naissance)); // Utilise ta fonction formatDate
        setT('ficheAge', age);
        setT('ficheSexe', p.sexe);
        setT('ficheTel', p.telephone);
        setT('ficheEmail', p.email);
        setT('ficheVille', p.ville);
        setT('ficheCin', p.cnie);
        setT('ficheAssurance', p.type_assurance);
        setT('ficheImmat', p.numero_immatriculation);
        setT('ficheType', p.type_patient);
        setT('ficheCree', formatDateNaissance(p.created_at));
        setT('ficheAntecedents', p.antecedents_medicaux);
        setT('ficheAllergies', p.allergies);
        setT('ficheNotes', p.notes);

        // --- Stats Financières ---
        if (p.stats) {
            const fmt = v => (parseFloat(v) || 0).toFixed(2) + ' DH';
            setT('ficheTotal', fmt(p.stats.total_facture));
            setT('ficheRecu', fmt(p.stats.total_regle));
            setT('ficheReste', fmt(p.stats.total_restant));
        }

        // --- Rendez-vous ---
        setT('ficheDernierRdv', p.dernier_rdv ? formatDateNaissance(p.dernier_rdv.date_rdv) : '—');
        
        const rdvRes = await fetch(`${API_URL}/rdv?patient_id=${id}`, { headers: _authHeaders() });
        const rdvList = await rdvRes.json();
        const finalRdvList = rdvList.data ? rdvList.data : rdvList; // Compatibilité format

        const ficheRdvList = document.getElementById('ficheRdvList');
        if (ficheRdvList && Array.isArray(finalRdvList)) {
            ficheRdvList.innerHTML = finalRdvList.length ?
                finalRdvList.slice(0, 10).map(r => `
                    <tr>
                        <td>${formatDateNaissance(r.date_rdv)}</td>
                        <td>${r.heure_rdv || '-'}</td>
                        <td>${r.motif || '-'}</td>
                        <td><span class="statut-badge ${getStatutClass(r.statut)}">${r.statut}</span></td>
                    </tr>`).join('') :
                '<tr><td colspan="4" style="text-align:center;padding:20px;">Aucun historique</td></tr>';
        }

        // --- Affichage Modal ---
        const modal = document.getElementById('patientFicheModal');
        if (modal) {
            modal.style.display = 'flex'; 
            modal.classList.add('modal-open');
        }
        document.body.style.overflow = 'hidden';

    } catch (e) {
        console.error("Erreur fiche patient:", e);
        showToast('❌ Erreur lors du chargement de la fiche', 'error');
    }
}

function fermerFichePatient(e) {
    // Appelé soit par clic sur le bouton X (sans argument), soit par clic sur l'overlay
    if (e && e.target !== document.getElementById('patientFicheModal')) return;
    const modal = document.getElementById('patientFicheModal');
    if (modal) {
        modal.classList.remove('modal-open');
        modal.style.display = 'none';
    }
    document.body.style.overflow = '';
}

function switchFicheTab(tabId, btn) {
    document.querySelectorAll('.fiche-tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.fiche-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');
    if (btn) btn.classList.add('active');
    if (tabId === 'imagerie' && _fichePatientId) chargerImagerie(_fichePatientId);
}

// Actions rapides depuis la fiche
function ficheNouveauRdv() {
    fermerFichePatient();
    showSection('rdv');
    setTimeout(() => {
        const sel = document.getElementById('rdvPatient');
        if (sel) sel.value = _fichePatientId;
        document.querySelector('#rdv .form-container')?.scrollIntoView({ behavior: 'smooth' });
    }, 200);
}

// Alias pour boutons actions rapides de la fiche patient
function ficheActionRdv()   { ficheNouveauRdv(); }
function ficheActionPayer() { fichePayer(); }

function ficheAjouterAttente() {
    fermerFichePatient();
    showSection('salle-attente');
    setTimeout(() => {
        const sel = document.getElementById('waitingPatient');
        if (sel) sel.value = _fichePatientId;
    }, 200);
}

function fichePayer() {
    fermerFichePatient();
    const p = patients.find(x => x.id_patient === _fichePatientId);
    if (!p) return;
    showSection('paiements');
    setTimeout(() => {
        currentPatientForPaiement = p;
        document.getElementById('paiementPatientId').value = p.id_patient;
        document.getElementById('paiementPatientNom').textContent = p.nom + ' ' + p.prenom;
        document.getElementById('ajoutPaiementForm').style.display = 'block';
        document.getElementById('datePaiement').value = new Date().toISOString().split('T')[0];
        chargerFacturesPatientPourPaiement(p.id_patient);
    }, 200);
}

function ficheCreerFacture() {
    fermerFichePatient();
    showSection('factures');
    setTimeout(() => {
        const sel = document.getElementById('facturePatient');
        if (sel) sel.value = _fichePatientId;
        document.querySelector('#factures .form-container') ?.scrollIntoView({ behavior: 'smooth' });
    }, 200);
}

function ficheModifier() {
    fermerFichePatient();
    showSection('patients');
    setTimeout(() => modifierPatient(_fichePatientId), 200);
}

// ============================================
// IMAGERIE PATIENT
// ============================================
async function chargerImagerie(patientId) {
    const grid = document.getElementById('imagerieGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="imagerie-empty">Chargement…</div>';
    try {
        const res = await fetch(`${API_URL}/patients/${patientId}/imagerie`, { headers: _authHeaders() });
        const items = await res.json();
        if (!items.length) { grid.innerHTML = '<div class="imagerie-empty">Aucun document importé pour ce patient</div>'; return; }
        grid.innerHTML = items.map(img => {
            const isImg = /\.(jpg|jpeg|png|gif)$/i.test(img.fichier_nom);
            const isPdf = /\.pdf$/i.test(img.fichier_nom);
            const thumb = isImg ?
                `<img class="imagerie-thumb" src="${img.fichier_url}" alt="${img.titre}" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 1 1%22/>'"/>` :
                `<div class="imagerie-thumb-pdf">${isPdf ? '📄' : '📁'}</div>`;
            return `<div class="imagerie-item" onclick="ouvrirLightbox('${img.fichier_url}','${img.titre.replace(/'/g,"\\'")}',${isPdf})">
                ${thumb}
                <div class="imagerie-item-info">
                    <div class="imagerie-item-title" title="${img.titre}">${img.titre}</div>
                    <div class="imagerie-item-type">${img.type_doc} · ${formatDateNaissance(img.date_doc||img.created_at)}</div>
                </div>
                <div class="imagerie-item-actions" onclick="event.stopPropagation()">
                    <a href="${img.fichier_url}" download class="btn-edit" style="padding:3px 8px;font-size:11px;text-decoration:none;">⬇️</a>
                    <button onclick="supprimerImagerie(${img.id})" class="btn-delete">🗑️</button>
                </div>
            </div>`;
        }).join('');
    } catch (e) { grid.innerHTML = '<div class="imagerie-empty">Erreur de chargement</div>'; }
}

async function uploadImagerie() {
    const input = document.getElementById('imagerieFileInput');
    if (!input.files.length || !_fichePatientId) return;
    const file = input.files[0];
    const fd = new FormData();
    fd.append('fichier', file);
    fd.append('titre', document.getElementById('imagerieDesc') ?.value || file.name);
    fd.append('type_doc', document.getElementById('imagerieType') ?.value || 'scanner');
    fd.append('date_doc', document.getElementById('imagerieDate') ?.value || '');
    fd.append('description', '');
    fd.append('id_user', localStorage.getItem('userId') || 1);
    try {
        showToast('📤 Upload en cours…', 'info');
        const res = await fetch(`${API_URL}/patients/${_fichePatientId}/imagerie`, { 
            method: 'POST', 
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: fd 
        });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Document importé!', 'success');
            chargerImagerie(_fichePatientId);
            input.value = '';
        } else showToast('❌ ' + (data.error || ''), 'error');
    } catch (e) { showToast('❌ Erreur upload', 'error'); }
}

async function supprimerImagerie(imgId) {
    if (!confirm('Supprimer ce document?')) return;
    try {
        const res = await fetch(`${API_URL}/patients/imagerie/${imgId}`, { method: 'DELETE', headers: _authHeaders() });
        const d = await res.json();
        if (d.success) {
            showToast('✅ Supprimé!', 'success');
            chargerImagerie(_fichePatientId);
        } else showToast('❌ ' + (d.error || ''), 'error');
    } catch (e) { showToast('❌ Erreur', 'error'); }
}

// Lightbox
function ouvrirLightbox(url, titre, isPdf) {
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImg');
    const pdf = document.getElementById('lightboxPdf');
    const caption = document.getElementById('lightboxCaption');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    if (isPdf) {
        img.style.display = 'none';
        pdf.style.display = 'block';
        pdf.src = url;
    } else {
        pdf.style.display = 'none';
        img.style.display = 'block';
        img.src = url;
    }
    if (caption) caption.textContent = titre;
}

function fermerLightbox() {
    document.getElementById('lightboxOverlay').classList.remove('open');
    document.body.style.overflow = '';
    document.getElementById('lightboxPdf').src = '';
}

// ============================================
// CHAT MESSAGERIE
// ============================================

function toggleChat() {
    const panel = document.getElementById('chatPanel');
    _chatOpen = !_chatOpen;
    panel.classList.toggle('open', _chatOpen);
    if (_chatOpen) {
        chargerMessages();
        marquerMessagesLus();
        _chatInterval = setInterval(chargerMessages, 5000);
    } else {
        clearInterval(_chatInterval);
    }
}

async function chargerMessages() {
    try {
        const userId = localStorage.getItem('userId');
        const res = await fetch(`${API_URL}/chat`);
        const msgs = await res.json();
        const box = document.getElementById('chatMessages');
        if (!box) return;

        if (!msgs.length) { box.innerHTML = '<div class="chat-loading">Aucun message</div>'; return; }

        const html = msgs.map(m => {
                    const isMine = String(m.id_user) === String(userId);
                    const time = new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
                    const fileHtml = m.fichier_url ?
                        `<a href="${m.fichier_url}" target="_blank" class="chat-file-link">📎 ${m.fichier_nom||'Fichier'}</a>` : '';
                    return `<div class="chat-msg ${isMine?'mine':'other'}">
                ${!isMine ? `<div class="chat-msg-sender">${m.prenom||''} ${m.nom||''} · ${m.role||''}</div>` : ''}
                <div class="chat-msg-bubble">
                    ${m.message ? `<div>${m.message}</div>` : ''}
                    ${fileHtml}
                </div>
                <div class="chat-msg-meta">${time}</div>
            </div>`;
        }).join('');
        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;

        // Badge messages non lus
        if (!_chatOpen) {
            const unreadRes = await fetch(`${API_URL}/chat/unread/${userId}`);
            const unreadD   = await unreadRes.json();
            const badge     = document.getElementById('chatBadge');
            if (badge) { badge.textContent = unreadD.count||0; badge.style.display = (unreadD.count>0)?'inline':'none'; }
        }
    } catch(e) {}
}

async function envoyerMessageChat() {
    const input  = document.getElementById('chatInput');
    const userId = localStorage.getItem('userId');
    if (!input?.value.trim() || !userId) return;
    const msg = input.value.trim();
    input.value = '';
    try {
        await fetch(`${API_URL}/chat`, { method:'POST', headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id_user:userId, message:msg }) });
        chargerMessages();
    } catch(e) {}
}

async function envoyerFichierChat() {
    const fileInput = document.getElementById('chatFileInput');
    const userId    = localStorage.getItem('userId');
    if (!fileInput.files.length || !userId) return;
    const fd = new FormData();
    fd.append('fichier', fileInput.files[0]);
    fd.append('id_user', userId);
    fd.append('message', fileInput.files[0].name);
    try {
        showToast('📤 Envoi en cours…', 'info');
        await fetch(`${API_URL}/chat/fichier`, { method:'POST', body:fd });
        chargerMessages();
        fileInput.value = '';
    } catch(e) { showToast('❌ Erreur envoi', 'error'); }
}

async function marquerMessagesLus() {
    const userId = localStorage.getItem('userId');
    if (!userId) return;
    await fetch(`${API_URL}/chat/lu/${userId}`, { method:'PATCH' }).catch(()=>{});
    const badge = document.getElementById('chatBadge');
    if (badge) badge.style.display = 'none';
}

// ============================================
// PROFIL & MOT DE PASSE
// ============================================
function ouvrirModalMotDePasse() {
    document.getElementById('userMenuDropdown')?.classList.remove('open');
    document.getElementById('modalMotDePasse').classList.add('modal-open');
    ['oldPassword','newPassword','confirmPassword'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
}

function ouvrirModalProfil() {
    document.getElementById('userMenuDropdown')?.classList.remove('open');
    try {
        const user = JSON.parse(localStorage.getItem('user')||'{}');
        const setVal = (id, v) => { const el=document.getElementById(id); if(el) el.value=v||''; };
        setVal('profileNom', user.nom); setVal('profilePrenom', user.prenom); setVal('profileEmail', user.email||'');
    } catch(e) {}
    document.getElementById('modalProfil').classList.add('modal-open');
}

async function changerMotDePasse() {
    const old = document.getElementById('oldPassword')?.value;
    const nw  = document.getElementById('newPassword')?.value;
    const cf  = document.getElementById('confirmPassword')?.value;
    if (!old || !nw) { showToast('Remplissez tous les champs', 'warning'); return; }
    if (nw !== cf) { showToast('Les mots de passe ne correspondent pas', 'warning'); return; }
    if (nw.length < 6) { showToast('Mot de passe trop court (min 6 chars)', 'warning'); return; }
    const userId = localStorage.getItem('userId');
    try {
        const res  = await fetch(`${API_URL}/change-password`, { method:'PUT', headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id_user:userId, old_password:old, new_password:nw }) });
        const data = await res.json();
        if (data.success) { showToast('✅ Mot de passe changé!', 'success'); document.getElementById('modalMotDePasse').classList.remove('modal-open'); }
        else showToast('❌ ' + (data.error||'Erreur'), 'error');
    } catch(e) { showToast('❌ Erreur', 'error'); }
}

async function sauvegarderProfil() {
    const userId = localStorage.getItem('userId');
    const nom    = document.getElementById('profileNom')?.value;
    const prenom = document.getElementById('profilePrenom')?.value;
    const email  = document.getElementById('profileEmail')?.value;
    if (!nom || !prenom) { showToast('Nom et prénom requis', 'warning'); return; }
    try {
        const res  = await fetch(`${API_URL}/profile`, { method:'PUT', headers:{"Content-Type":"application/json"}, body:JSON.stringify({ id_user:userId, nom, prenom, email }) });
        const data = await res.json();
        if (data.success) {
            showToast('✅ Profil mis à jour!', 'success');
            document.getElementById('modalProfil').classList.remove('modal-open');
            // Mettre à jour localStorage
            try {
                const user = JSON.parse(localStorage.getItem('user')||'{}');
                user.nom=nom; user.prenom=prenom; user.email=email;
                localStorage.setItem('user', JSON.stringify(user));
                initUserUI();
            } catch(e) {}
        } else showToast('❌ ' + (data.error||''), 'error');
    } catch(e) { showToast('❌ Erreur', 'error'); }
}

// ============================================
// GRAPHIQUES DASHBOARD — Chart.js
// ============================================
let _charts = {};

async function chargerGraphiques() {
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    // Seul le dentiste voit les stats financières
    if (user.role !== "dentiste") return;

    try {
        const headers = _authHeaders();
        const [revRes, patRes, rdvChartRes, payTypesRes] = await Promise.all([
            fetch(`${API_URL}/paiements/stats/chart`, { headers }).catch(() => ({ ok: false })),
            fetch(`${API_URL}/patients/stats/chart`, { headers }).catch(() => ({ ok: false })),
            fetch(`${API_URL}/rdv/stats/chart`, { headers }).catch(() => ({ ok: false })),
            fetch(`${API_URL}/paiements/stats/types`, { headers }).catch(() => ({ ok: false })),
        ]);

        if (revRes.status === 401) return logout();

        // --- Extraction des données avec gestion du format hybride ---
        const getFinalData = async (res) => {
            if (!res.ok) return [];
            const json = await res.json();
            return json.data ? json.data : json; // Supporte les deux formats
        };

        const revData = await getFinalData(revRes);
        const patData = await getFinalData(patRes);
        const rdvData = await getFinalData(rdvChartRes);
        const typesData = await getFinalData(payTypesRes);

        // --- Préparation des labels (12 derniers mois) ---
        const labels12 = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            labels12.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
        }
        const labelsFr = labels12.map((l) => {
            const [y, m] = l.split("-");
            return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
        });

        const mapData = (data, labels) => {
            if (!Array.isArray(data)) return labels.map(() => 0);
            return labels.map((l) => {
                const f = data.find((d) => d.mois === l);
                return f ? parseFloat(f.total || f.count || 0) : 0;
            });
        };

        // --- Configuration visuelle (Thème) ---
        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        const gridColor = isDark ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.06)";
        const textColor = isDark ? "#94a3b8" : "#475569";
        
        const baseOpts = { 
            responsive: true, 
            maintainAspectRatio: false, 
            plugins: { legend: { display: false } }, 
            scales: { 
                x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } }, 
                y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 10 } } } 
            } 
        };

        // --- Initialisation des graphiques avec DESTRUCTION ---

        // 1. Graphique Revenus
        const c1 = document.getElementById("chartRevenus");
        if (c1) {
            if (_charts.revenus) _charts.revenus.destroy(); // <--- CRITIQUE : Supprime l'ancien
            _charts.revenus = new Chart(c1, {
                type: "line",
                data: {
                    labels: labelsFr,
                    datasets: [{
                        label: "Revenus DH",
                        data: mapData(revData, labels12),
                        borderColor: "#2563eb",
                        backgroundColor: "rgba(37,99,235,.1)",
                        fill: true,
                        tension: 0.4,
                        pointRadius: 4,
                        pointBackgroundColor: "#2563eb"
                    }]
                },
                options: { ...baseOpts, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => `${ctx.parsed.y.toFixed(0)} DH` } } } }
            });
        }

        // 2. Graphique Patients
        const c2 = document.getElementById("chartPatients");
        if (c2) {
            if (_charts.patients) _charts.patients.destroy(); // <--- CRITIQUE
            _charts.patients = new Chart(c2, {
                type: "bar",
                data: {
                    labels: labelsFr,
                    datasets: [{
                        label: "Patients",
                        data: mapData(patData, labels12),
                        backgroundColor: "rgba(16,185,129,.7)",
                        borderRadius: 5
                    }]
                },
                options: baseOpts
            });
        }

        // 3. Graphique RDV
        const c3 = document.getElementById("chartRdv");
        if (c3) {
            if (_charts.rdv) _charts.rdv.destroy(); // <--- CRITIQUE
            _charts.rdv = new Chart(c3, {
                type: "bar",
                data: {
                    labels: labelsFr,
                    datasets: [{
                        label: "RDV",
                        data: mapData(rdvData, labels12),
                        backgroundColor: "rgba(139,92,246,.7)",
                        borderRadius: 5
                    }]
                },
                options: baseOpts
            });
        }

        // 4. Graphique Répartition Paiements
        const c4 = document.getElementById("chartPaiements");
        if (c4) {
            if (_charts.paiements) _charts.paiements.destroy(); // <--- CRITIQUE
            const types = typesData || {};
            _charts.paiements = new Chart(c4, {
                type: "doughnut",
                data: {
                    labels: ["Espèces", "Carte", "Virement", "Chèque"],
                    datasets: [{
                        data: [types.especes || 0, types.carte || 0, types.virement || 0, types.cheque || 0],
                        backgroundColor: ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6"],
                        borderWidth: 2,
                        borderColor: isDark ? "#1e293b" : "#fff"
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: "bottom", labels: { color: textColor, font: { size: 11 } } } }
                }
            });
        }
    } catch (e) {
        console.error("Erreur lors du chargement des graphiques:", e);
    }
}


// ============================================
// AUTO-REFRESH BLOCS LIVE (RDV + Revenus)
// ============================================
function startLiveRefresh() {
    const getToday = () => {
        const n=new Date();
        return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
    };

    // RDV aujourd'hui — fetch depuis API (pas de stale data)
   async function refreshRdvToday() {
    try {
        const token = localStorage.getItem("token");
        const headers = { 
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        };

        const today = getToday();
        
        // 1. Appel API avec les headers d'autorisation
        const res = await fetch(`${API_URL}/rdv?date=${today}`, { headers });

        // 2. Si le serveur répond 401, on arrête tout (session expirée)
        if (res.status === 401) {
            console.warn("Session expirée dans refreshRdvToday");
            return; // On ne redirige pas forcément ici car c'est un refresh automatique
        }

        const data = await res.json();

        // 3. Mettre à jour le tableau global rdvs
        if (Array.isArray(data)) {
            // On filtre les anciens RDV pour ne pas avoir de doublons
            const nonToday = rdvs.filter(r => !r.date_rdv || !r.date_rdv.startsWith(today));
            rdvs = [...nonToday, ...data];
            
            // Mise à jour du compteur sur le dashboard
            const count = data.filter(r => r.statut !== 'Annule' && r.statut !== 'Annulé').length;
            const el = document.getElementById('rdvToday');
            if (el) el.innerText = count;
        }

        // 4. Mettre à jour rdvSemaine 
        if (typeof refreshRdvSemaine === 'function') {
            await refreshRdvSemaine();
        }

    } catch(e) { 
        console.error('Erreur liveRdv:', e); 
    }
}

    // RDV semaine
    async function refreshRdvSemaine() {
        try {
            const now   = new Date();
            const in7   = new Date(now.getTime() + 7*24*3600*1000);
            const today = getToday();
            const end7  = `${in7.getFullYear()}-${String(in7.getMonth()+1).padStart(2,'0')}-${String(in7.getDate()).padStart(2,'0')}`;
            const count = rdvs.filter(r => r.date_rdv >= today && r.date_rdv <= end7 && r.statut !== 'Annule').length;
            const el = document.getElementById('rdvSemaine');
            if (el) el.innerText = count;
            // RDV terminés ce mois
            const mois = today.slice(0,7);
            const term = rdvs.filter(r => (r.date_rdv||'').startsWith(mois) && r.statut === 'Termine').length;
            const te   = document.getElementById('rdvTermines');
            if (te) te.innerText = term;
        } catch(e) {}
    }

    // Revenus aujourd'hui — fetch API
    async function refreshRevenusToday() {
        try {
            const res  = await fetch(`${API_URL}/paiements/stats/today`);
            const data = await res.json();
            const el   = document.getElementById('revenusAujourdhui');
            if (el) el.innerText = (parseFloat(data.total_montant)||0).toFixed(2) + ' DH';
        } catch(e) {}
    }

    // Stats patients (enfants + assurés)
    async function refreshPatientStats() {
        try {
            const res   = await fetch(`${API_URL}/patients`);
            const pats  = await res.json();
            if (Array.isArray(pats)) {
                const enfants  = pats.filter(p => p.type_patient === 'enfant').length;
                const assures  = pats.filter(p => p.type_assurance && p.type_assurance !== 'Aucune').length;
                const eEl = document.getElementById('totalEnfants');
                const aEl = document.getElementById('totalAssures');
                if (eEl) eEl.innerText = enfants;
                if (aEl) aEl.innerText = assures;
            }
        } catch(e) {}
    }

    // Salle d'attente stats
    async function refreshSalleAttente() {
        try {
            const res  = await fetch(`${API_URL}/salle-attente`);
            const data = await res.json();
            if (Array.isArray(data)) {
                const term = data.filter(r => r.statut === 'Terminé').length;
                const te   = document.getElementById('attenteTermines');
                if (te) te.innerText = term;
            }
        } catch(e) {}
    }

    // Rafraîchir toutes les 30 secondes
    setInterval(() => {
        refreshRdvToday();
        refreshRevenusToday();
        refreshSalleAttente();
    }, 30000);

    // Premier appel immédiat
    refreshRdvToday();
    refreshRevenusToday();
    refreshPatientStats();
    refreshSalleAttente();
}


// ============================================
// SCHÉMA DENTAIRE — MOTEUR ISO FDI PROFESSIONNEL
// ============================================

// Calcul automatique des positions X (centrage dans le SVG)
function _computeDentalXPositions(teeth) {
    const mid    = Math.floor(teeth.length / 2);
    const half1  = teeth.slice(0, mid);
    const half2  = teeth.slice(mid);
    const w1     = half1.reduce((s, t) => s + t[1], 0) + Math.max(0, half1.length - 1) * _D_GAP;
    const w2     = half2.reduce((s, t) => s + t[1], 0) + Math.max(0, half2.length - 1) * _D_GAP;
    const total  = w1 + _D_CGAP + w2;
    const startX = Math.round((_D_SVG_W - total) / 2);
    const positions = [];
    let x = startX;
    half1.forEach(t => { positions.push(x); x += t[1] + _D_GAP; });
    x += _D_CGAP - _D_GAP;
    half2.forEach(t => { positions.push(x); x += t[1] + _D_GAP; });
    return { positions, centerX: Math.round(startX + w1 + _D_CGAP / 2) };
}

// Dessine une racine (chemin SVG effilé)
function _drawDentalRoot(g, NS, rx, ry, rw, rh, isUpper, col) {
    const r   = document.createElementNS(NS, 'path');
    const mid = rx + rw / 2;
    if (isUpper) {
        // Racine allant vers le haut (pointe au sommet)
        r.setAttribute('d', `M${rx},${ry} L${rx + rw * 0.12},${ry - rh + 9} Q${mid},${ry - rh} ${rx + rw * 0.88},${ry - rh + 9} L${rx + rw},${ry} Z`);
    } else {
        // Racine allant vers le bas (pointe en bas)
        r.setAttribute('d', `M${rx},${ry} L${rx + rw},${ry} L${rx + rw * 0.88},${ry + rh - 9} Q${mid},${ry + rh} ${rx + rw * 0.12},${ry + rh - 9} Z`);
    }
    r.setAttribute('fill', col.rootFill);
    r.setAttribute('stroke', col.stroke);
    r.setAttribute('stroke-width', '0.8');
    r.setAttribute('opacity', '0.78');
    r.setAttribute('pointer-events', 'none');
    g.appendChild(r);
}

// Dessine les croix d'extraction sur une dent
function _drawDentalExtractionX(g, NS, x, y, w, h) {
    [[x + 3, y + 3, x + w - 3, y + h - 3], [x + w - 3, y + 3, x + 3, y + h - 3]].forEach(([x1, y1, x2, y2]) => {
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('class', 'extraction-mark');
        l.setAttribute('x1', x1); l.setAttribute('y1', y1);
        l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        l.setAttribute('stroke', '#DC2626'); l.setAttribute('stroke-width', '1.8');
        l.setAttribute('pointer-events', 'none');
        g.appendChild(l);
    });
}

// Dessine une rangée complète de dents
function _drawDentalRow(container, NS, teethArr, xPos, isUpper) {
    const CU = 143; // bas des couronnes supérieures
    const CL = 178; // haut des couronnes inférieures

    teethArr.forEach(([num, cW, cH, rW, rH, type], i) => {
        const x       = xPos[i];
        const sel     = _dentalSelected.has(num);
        const etat    = (_dentalConditions && _dentalConditions[num]) || 'saine';
        const col     = sel ? DENTAL_COLORS.selected : (DENTAL_COLORS[etat] || DENTAL_COLORS.saine);
        const isMolar = (type === 'molar' || type === 'wisdom' || (type === 'deciduous' && cW >= 19));

        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'dental-tooth');
        g.dataset.tooth = num;
        g.style.cursor = 'pointer';

        if (isUpper) {
            const crownBot = CU;
            const crownTop = CU - cH;
            const rootX    = x + (cW - rW) / 2;

            // Racines (vers le haut)
            if (isMolar) {
                const hw = Math.round((rW - 2) / 2);
                _drawDentalRoot(g, NS, rootX,          crownTop, hw, Math.round(rH * 0.85), true, col);
                _drawDentalRoot(g, NS, rootX + hw + 2, crownTop, hw, rH,                   true, col);
            } else {
                _drawDentalRoot(g, NS, rootX, crownTop, rW, rH, true, col);
            }

            // Couronne
            const crown = document.createElementNS(NS, 'rect');
            crown.id = 'dr-' + num;
            crown.setAttribute('x', x);        crown.setAttribute('y', crownTop);
            crown.setAttribute('width', cW);   crown.setAttribute('height', cH);
            crown.setAttribute('rx', type === 'canine' ? 5 : 3);
            crown.setAttribute('fill', col.fill); crown.setAttribute('stroke', col.stroke);
            crown.setAttribute('stroke-width', '1.5');
            crown.style.transition = 'all .15s ease';
            g.appendChild(crown);

            // Marques d'extraction
            if (etat === 'extraction' && !sel) _drawDentalExtractionX(g, NS, x, crownTop, cW, cH);

            // Numéro (sous la couronne)
            const txt = document.createElementNS(NS, 'text');
            txt.id = 'dt-' + num;
            txt.setAttribute('x', x + cW / 2);   txt.setAttribute('y', crownBot + 12);
            txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '8.5');
            txt.setAttribute('font-weight', sel ? '800' : '600');
            txt.setAttribute('fill', sel ? '#1D4ED8' : '#64748B');
            txt.setAttribute('pointer-events', 'none');
            txt.setAttribute('font-family', 'system-ui,sans-serif');
            txt.textContent = num;
            g.appendChild(txt);

        } else {
            // Mâchoire inférieure
            const crownTop = CL;
            const crownBot = CL + cH;
            const rootX    = x + (cW - rW) / 2;

            // Racines (vers le bas)
            if (isMolar) {
                const hw = Math.round((rW - 2) / 2);
                _drawDentalRoot(g, NS, rootX,          crownBot, hw, Math.round(rH * 0.85), false, col);
                _drawDentalRoot(g, NS, rootX + hw + 2, crownBot, hw, rH,                    false, col);
            } else {
                _drawDentalRoot(g, NS, rootX, crownBot, rW, rH, false, col);
            }

            // Couronne
            const crown = document.createElementNS(NS, 'rect');
            crown.id = 'dr-' + num;
            crown.setAttribute('x', x);       crown.setAttribute('y', crownTop);
            crown.setAttribute('width', cW);  crown.setAttribute('height', cH);
            crown.setAttribute('rx', type === 'canine' ? 5 : 3);
            crown.setAttribute('fill', col.fill); crown.setAttribute('stroke', col.stroke);
            crown.setAttribute('stroke-width', '1.5');
            crown.style.transition = 'all .15s ease';
            g.appendChild(crown);

            // Marques d'extraction
            if (etat === 'extraction' && !sel) _drawDentalExtractionX(g, NS, x, crownTop, cW, cH);

            // Numéro (au-dessus de la couronne)
            const txt = document.createElementNS(NS, 'text');
            txt.id = 'dt-' + num;
            txt.setAttribute('x', x + cW / 2);   txt.setAttribute('y', crownTop - 4);
            txt.setAttribute('text-anchor', 'middle'); txt.setAttribute('font-size', '8.5');
            txt.setAttribute('font-weight', sel ? '800' : '600');
            txt.setAttribute('fill', sel ? '#1D4ED8' : '#64748B');
            txt.setAttribute('pointer-events', 'none');
            txt.setAttribute('font-family', 'system-ui,sans-serif');
            txt.textContent = num;
            g.appendChild(txt);
        }

        // Événements
        g.addEventListener('click', () => _dentalToggle(num));
        g.addEventListener('mouseenter', () => {
            const c = document.getElementById('dr-' + num);
            if (c && !_dentalSelected.has(num)) { c.style.opacity = '0.72'; c.style.filter = 'brightness(0.93)'; }
        });
        g.addEventListener('mouseleave', () => {
            const c = document.getElementById('dr-' + num);
            if (c) { c.style.opacity = '1'; c.style.filter = ''; }
        });
        container.appendChild(g);
    });
}

// Dessine le fond SVG (séparateurs + labels de quadrants)
function _buildDentalBackground(container, NS, centerX) {
    const isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
    const lblColor = isDark ? '#6E90CC' : '#94A3B8';
    const sepColor = isDark ? '#243660' : '#D1D9E8';
    const add = el => container.appendChild(el);

    // Ligne horizontale (séparation mâchoire / mandibule)
    const hLine = document.createElementNS(NS, 'line');
    hLine.setAttribute('x1', '220'); hLine.setAttribute('y1', '161');
    hLine.setAttribute('x2', '680'); hLine.setAttribute('y2', '161');
    hLine.setAttribute('stroke', sepColor);
    hLine.setAttribute('stroke-width', '1.5');
    hLine.setAttribute('stroke-dasharray', '5,3');
    add(hLine);

    // Ligne verticale (centre gauche / droite)
    const vLine = document.createElementNS(NS, 'line');
    vLine.setAttribute('x1', centerX); vLine.setAttribute('y1', '32');
    vLine.setAttribute('x2', centerX); vLine.setAttribute('y2', '293');
    vLine.setAttribute('stroke', sepColor);
    vLine.setAttribute('stroke-width', '1');
    vLine.setAttribute('stroke-dasharray', '3,3');
    add(vLine);

    // Labels de texte
    [
        ['mâchoire supérieure', centerX, 16,  'middle', 11,   '700', true ],
        ['mandibule',           centerX, 313, 'middle', 11,   '700', true ],
        ['supérieur à droite',  centerX -  9, 29,  'end',   9.5, '600', true ],
        ['supérieur à gauche',  centerX +  9, 29,  'start', 9.5, '600', true ],
        ['inférieur à droite',  centerX -  9, 295, 'end',   9.5, '600', true ],
        ['inférieur à gauche',  centerX +  9, 295, 'start', 9.5, '600', true ],
    ].forEach(([content, tx, ty, anchor, size, weight, italic]) => {
        const t = document.createElementNS(NS, 'text');
        t.setAttribute('x', tx);          t.setAttribute('y', ty);
        t.setAttribute('text-anchor', anchor);
        t.setAttribute('font-size', size); t.setAttribute('font-weight', weight);
        t.setAttribute('fill', lblColor);
        t.setAttribute('font-family', 'system-ui,sans-serif');
        if (italic) t.setAttribute('font-style', 'italic');
        t.textContent = content;
        add(t);
    });
}

// Mise à jour visuelle d'une dent (couleur + texte + marques extraction)
function _dentalUpdateTooth(num) {
    const crown = document.getElementById('dr-' + num);
    const txt   = document.getElementById('dt-' + num);
    if (!crown) return;
    const sel  = _dentalSelected.has(num);
    const etat = (_dentalConditions && _dentalConditions[num]) || 'saine';
    const col  = sel ? DENTAL_COLORS.selected : (DENTAL_COLORS[etat] || DENTAL_COLORS.saine);
    crown.setAttribute('fill',   col.fill);
    crown.setAttribute('stroke', col.stroke);
    if (txt) {
        txt.setAttribute('fill', sel ? '#1D4ED8' : '#64748B');
        txt.setAttribute('font-weight', sel ? '800' : '600');
    }
    // Marques extraction : retirer et recréer si besoin
    const g = crown.closest('.dental-tooth');
    if (g) {
        g.querySelectorAll('.extraction-mark').forEach(el => el.remove());
        if (etat === 'extraction' && !sel) {
            const NS2 = 'http://www.w3.org/2000/svg';
            _drawDentalExtractionX(g, NS2,
                parseFloat(crown.getAttribute('x')),
                parseFloat(crown.getAttribute('y')),
                parseFloat(crown.getAttribute('width')),
                parseFloat(crown.getAttribute('height'))
            );
        }
    }
}

let _dentalIsBuilding = false;

// Point d'entrée principal — construit tout le schéma dentaire
function _dentalBuildChart() {
    if (_dentalIsBuilding || _dentalBuilt) return;
    _dentalIsBuilding = true;
    try {
        const NS    = 'http://www.w3.org/2000/svg';
        const upper = document.getElementById('dental-upper');
        const lower = document.getElementById('dental-lower');
        if (!upper || !lower) return;

        const teeth = _dentalMode === 'enfant' ? _CHILD_TEETH : _ADULT_TEETH;
        const { positions: upPos, centerX } = _computeDentalXPositions(teeth.upper);
        const { positions: loPos }           = _computeDentalXPositions(teeth.lower);

        _buildDentalBackground(upper, NS, centerX);
        _drawDentalRow(upper, NS, teeth.upper, upPos, true);
        _drawDentalRow(lower, NS, teeth.lower, loPos, false);
        _dentalBuilt = true;
    } finally {
        _dentalIsBuilding = false;
    }
}

// Bascule entre schéma adulte et enfant
function switchDentalType(type) {
    _dentalMode = type;
    document.getElementById('btnAdulte')?.classList.toggle('active', type === 'adulte');
    document.getElementById('btnEnfant')?.classList.toggle('active', type === 'enfant');
    _dentalBuilt = false;
    _dentalSelected.clear();
    const up = document.getElementById('dental-upper');
    const lo = document.getElementById('dental-lower');
    if (up) up.innerHTML = '';
    if (lo) lo.innerHTML = '';
    _dentalBuildChart();
    _dentalRefreshPanel();
}

let _currentTheme = document.documentElement.getAttribute('data-theme') || 'light';

// Taille et forme par type anatomique (adult)
const TOOTH_ANATOMY = {
    // [width, height, radiusTop, radiusBot, hasPoint]
    incCentrale: [20, 32, 7, 4, false],
    incLat:      [17, 30, 6, 3, false],
    canine:      [18, 35, 6, 2, true ],   // pointe canine
    premol1:     [21, 28, 5, 5, false],
    premol2:     [21, 27, 5, 5, false],
    mol1:        [27, 26, 5, 5, false],
    mol2:        [26, 25, 5, 5, false],
    mol3:        [24, 24, 4, 4, false],   // dent de sagesse
};
// Mapping index 0-7 (0=centre) vers type anatomique
const ANAT_MAP = ['incCentrale','incLat','canine','premol1','premol2','mol1','mol2','mol3'];

// Gradient IDs selon état
const TOOTH_GRADIENT = {
    saine:            { fill:'url(#toothNormal)',   stroke:'#D4B896', filter:'url(#toothShadow)'    },
    carie:            { fill:'url(#toothCarie)',    stroke:'#D97706', filter:'url(#toothShadow)'    },
    bridge:           { fill:'url(#toothBridge)',   stroke:'#059669', filter:'url(#toothShadow)'    },
    implant:          { fill:'#E5E7EB',             stroke:'#9CA3AF', filter:'url(#toothShadow)'    },
    couronne:         { fill:'url(#toothCouronne)', stroke:'#7C3AED', filter:'url(#toothShadow)'    },
    extraction:       { fill:'url(#toothExtract)',  stroke:'#DC2626', filter:'url(#toothShadow)'    },
    traitement_canal: { fill:'url(#toothCanal)',    stroke:'#EA580C', filter:'url(#toothShadow)'    },
    absente:          { fill:'rgba(203,213,225,0.4)', stroke:'#CBD5E1', filter:'none'              },
    selected:         { fill:'url(#toothSelected)', stroke:'#2563EB', filter:'url(#toothShadowSel)' },
};

function _toothPathAdvanced(x, y, w, h, anatKey, isUpper) {
    const a   = TOOTH_ANATOMY[anatKey] || [20,28,5,4,false];
    const rT  = a[2], rB = a[3], hasPoint = a[4];
    const x2  = x+w, y2 = y+h;
    const cx  = x + w/2;

    if (hasPoint && isUpper) {
        // Canine supérieure — pointe vers le bas
        return `M${x+rT} ${y} Q${x} ${y} ${x} ${y+rT} L${x} ${y2-8} L${cx} ${y2} L${x2} ${y2-8} L${x2} ${y+rT} Q${x2} ${y} ${x2-rT} ${y} Z`;
    } else if (hasPoint && !isUpper) {
        // Canine inférieure — pointe vers le haut
        return `M${x} ${y+8} L${cx} ${y} L${x2} ${y+8} L${x2} ${y2-rB} Q${x2} ${y2} ${x2-rB} ${y2} L${x+rB} ${y2} Q${x} ${y2} ${x} ${y2-rB} Z`;
    } else if (anatKey === 'absente') {
        return `M${x+rT} ${y} H${x2-rT} Q${x2} ${y} ${x2} ${y+rT} V${y2-rB} Q${x2} ${y2} ${x2-rB} ${y2} H${x+rB} Q${x} ${y2} ${x} ${y2-rB} V${y+rT} Q${x} ${y} ${x+rT} ${y} Z`;
    } else {
        // Rect arrondi standard — racine plus étroite pour molaires
        const narrow = (anatKey.startsWith('mol')) ? 4 : 0;
        const xN = x+narrow, x2N = x2-narrow;
        return `M${x+rT} ${y} H${x2-rT} Q${x2} ${y} ${x2} ${y+rT} L${x2N} ${y2-rB} Q${x2N} ${y2} ${x2N-rB} ${y2} H${xN+rB} Q${xN} ${y2} ${xN} ${y2-rB} L${x} ${y+rT} Q${x} ${y} ${x+rT} ${y} Z`;
    }
}

// Construire un quadrant avec dents anatomiques réalistes
function _dentalBuildQuadrant(q, container, cx, midY, goLeft) {
    const NS   = 'http://www.w3.org/2000/svg';
    const isUp = (q<=2);
    const gaps = [4,4,5,5,5,4,4,4];  // espacement entre dents
    let x = cx;

    for (let i=0; i<8; i++) {
        const anatKey = ANAT_MAP[i];
        const anat    = TOOTH_ANATOMY[anatKey];
        const w = anat[0], h = anat[1];
        const label   = ({1:10,2:20,3:30,4:40}[q]) + (i+1);
        const tx      = goLeft ? x-w : x;
        const ty      = isUp ? midY-h : midY;
        const etat    = (_dentalConditions && _dentalConditions[label]) || 'saine';
        const sel     = _dentalSelected.has(label);
        const style   = sel ? TOOTH_GRADIENT.selected : (TOOTH_GRADIENT[etat] || TOOTH_GRADIENT.saine);

        const g = document.createElementNS(NS,'g');
        g.setAttribute('class','dental-tooth');
        g.dataset.tooth = label;
        g.style.cursor  = 'pointer';
        g.addEventListener('click', () => _dentalToggle(label));
        // Hover
        g.addEventListener('mouseenter', () => { if(!_dentalSelected.has(label)) { const p=g.querySelector('path.tooth-body'); if(p) p.style.opacity='.82'; } });
        g.addEventListener('mouseleave', () => { const p=g.querySelector('path.tooth-body'); if(p) p.style.opacity='1'; });

        // Chemin principal (couronne)
        const d    = _toothPathAdvanced(tx, ty, w, h*0.62, anatKey, isUp);
        const body = document.createElementNS(NS,'path');
        body.setAttribute('class','tooth-body');
        body.id   = 'dr-'+label;
        body.setAttribute('d', d);
        body.setAttribute('fill',   style.fill);
        body.setAttribute('stroke', style.stroke);
        body.setAttribute('stroke-width','1.5');
        if(style.filter!=='none') body.setAttribute('filter', style.filter);
        body.style.transition = 'all .15s ease';

        // Reflet brillant sur la couronne
        const shineH = h*0.62*0.35;
        const shine  = document.createElementNS(NS,'ellipse');
        shine.setAttribute('cx', tx+w*0.35);
        shine.setAttribute('cy', isUp ? ty+shineH : ty+h*0.62-shineH);
        shine.setAttribute('rx', w*0.22);
        shine.setAttribute('ry', shineH*0.55);
        shine.setAttribute('fill','url(#toothShine)');
        shine.setAttribute('pointer-events','none');

        // Racine (visible en bas/haut selon mâchoire)
        const rootH  = h*0.4;
        const rootW  = Math.max(w*0.45, 8);
        const rootX  = tx + (w-rootW)/2;
        const rootY  = isUp ? ty+h*0.6 : ty-rootH+h*0.02;
        const rootEl = document.createElementNS(NS,'path');
        const rootFill = (etat==='saine'||etat==='couronne') ? '#E8C99A' : style.fill;
        if (!goLeft || i < 6) {  // afficher les racines
            rootEl.setAttribute('d', `M${rootX+3} ${rootY} Q${rootX} ${rootY+rootH*0.6} ${rootX+rootW*0.2} ${rootY+rootH} Q${rootX+rootW/2} ${rootY+rootH+4} ${rootX+rootW*0.8} ${rootY+rootH} Q${rootX+rootW} ${rootY+rootH*0.6} ${rootX+rootW-3} ${rootY} Z`);
            rootEl.setAttribute('fill', rootFill);
            rootEl.setAttribute('stroke', '#C4956A');
            rootEl.setAttribute('stroke-width','0.8');
            rootEl.setAttribute('opacity','0.75');
            rootEl.setAttribute('pointer-events','none');
        }

        // Numéro de dent
        const textY = isUp ? ty + h*0.62 + 12 : ty - 5;
        const txt   = document.createElementNS(NS,'text');
        txt.id      = 'dt-'+label;
        txt.setAttribute('x',     tx+w/2);
        txt.setAttribute('y',     textY);
        txt.setAttribute('text-anchor','middle');
        txt.setAttribute('font-size','8.5');
        txt.setAttribute('font-weight','700');
        txt.setAttribute('fill', sel ? '#1D4ED8' : '#64748B');
        txt.setAttribute('pointer-events','none');
        txt.setAttribute('font-family','system-ui,sans-serif');
        txt.textContent = label;

        // Assembler (racine en premier = derrière)
        if (rootEl.getAttribute('d')) g.appendChild(rootEl);
        g.appendChild(body);
        g.appendChild(shine);
        g.appendChild(txt);
        container.appendChild(g);

        x = goLeft ? x-(w+gaps[i]) : x+(w+gaps[i]);
    }
}


// ============================================
// AGENDA CALENDRIER — Vue semaine
// ============================================

const AGENDA_START_H = 7;  // 7h
const AGENDA_END_H   = 20; // 20h
const AGENDA_SLOT_H  = 60; // px par heure

function showSection_agenda(id) {
    if (id === 'agenda') buildAgenda();
}

// showSection override 2 merged into main function

// Calcul début de semaine (lundi)
function getWeekStart(date) {
    const d   = new Date(date);
    const day = d.getDay(); // 0=dim
    const diff= (day === 0) ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0,0,0,0);
    return d;
}

function agendaPrevWeek() {
    _agendaCurrentDate.setDate(_agendaCurrentDate.getDate() - 7);
    buildAgenda(); chargerRdvAgenda();
}
function agendaNextWeek() {
    _agendaCurrentDate.setDate(_agendaCurrentDate.getDate() + 7);
    buildAgenda(); chargerRdvAgenda();
}
function agendaGoToday() {
    _agendaCurrentDate = new Date();
    buildAgenda(); chargerRdvAgenda();
}

const DAYS_FR = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const MONTHS_FR = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function buildAgenda() {
    const weekStart  = getWeekStart(_agendaCurrentDate);
    const today      = new Date(); today.setHours(0,0,0,0);

    // Label semaine
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate()+6);
    const lbl = document.getElementById('agendaWeekLabel');
    if (lbl) lbl.textContent = `${weekStart.getDate()} ${MONTHS_FR[weekStart.getMonth()]} – ${weekEnd.getDate()} ${MONTHS_FR[weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;

    // Créneaux horaires (colonne gauche)
    const slotsEl = document.getElementById('agendaTimeSlots');
    if (slotsEl) {
        slotsEl.innerHTML = '';
        for (let h = AGENDA_START_H; h < AGENDA_END_H; h++) {
            const div = document.createElement('div');
            div.className = 'agenda-time-slot';
            div.textContent = `${String(h).padStart(2,'0')}:00`;
            slotsEl.appendChild(div);
        }
    }

    // Grille des jours
    const grid = document.getElementById('agendaDaysGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let d = 0; d < 7; d++) {
        const day  = new Date(weekStart); day.setDate(day.getDate() + d);
        const isToday = day.getTime() === today.getTime();
        const dateStr = `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,'0')}-${String(day.getDate()).padStart(2,'0')}`;

        const col = document.createElement('div');
        col.className = 'agenda-day-col';
        col.dataset.date = dateStr;

        const header = document.createElement('div');
        header.className = 'agenda-day-header' + (isToday?' today':'');
        header.innerHTML = `<div class="agenda-day-name">${DAYS_FR[d]}</div><div class="agenda-day-num">${day.getDate()}</div>`;
        header.onclick = () => { document.getElementById('dateRdv') && (document.getElementById('dateRdv').value=dateStr); goToNewRdv(); };
        col.appendChild(header);

        const body = document.createElement('div');
        body.className = 'agenda-day-body';
        body.id        = 'agenda-body-' + dateStr;

        // Créneaux vides cliquables
        for (let h = AGENDA_START_H; h < AGENDA_END_H; h++) {
            const slot = document.createElement('div');
            slot.className  = 'agenda-slot';
            slot.dataset.h  = h;
            slot.dataset.date = dateStr;
            const addBtn = document.createElement('div');
            addBtn.className = 'agenda-add-slot';
            addBtn.textContent = '+ RDV';
            addBtn.onclick = (e) => {
                e.stopPropagation();
                ouvrirModalAgendaRdv(dateStr, h);
            };
            slot.appendChild(addBtn);
            body.appendChild(slot);
        }

        // Ligne "maintenant"
        if (isToday) {
            const now   = new Date();
            const nowH  = now.getHours() + now.getMinutes()/60;
            if (nowH >= AGENDA_START_H && nowH < AGENDA_END_H) {
                const topPx = (nowH - AGENDA_START_H) * AGENDA_SLOT_H;
                const line  = document.createElement('div');
                line.className = 'agenda-now-line';
                line.style.top = topPx + 'px';
                body.appendChild(line);
            }
        }

        col.appendChild(body);
        grid.appendChild(col);
    }
}

async function chargerRdvAgenda() {
  const normDate = (v) => {
    if (!v) return "";
    if (typeof v === "string") return v.split("T")[0].split(" ")[0];
    if (v instanceof Date) return v.toISOString().split("T")[0];
    return String(v).split("T")[0];
  };

  const weekStart = getWeekStart(_agendaCurrentDate);
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekEnd.getDate() + 6);
  const dateDebStr = normDate(weekStart);
  const dateFinStr = normDate(weekEnd);

  try {
    const res = await fetch(`${API_URL}/rdv`, { headers: _authHeaders() });
    if (_check401(res)) return;
    const all = await res.json();

    // ← Anti-crash
    if (!Array.isArray(all)) { console.error("Les données RDV reçues ne sont pas une liste:", all); return; }

    const week = all.filter((r) => { const d = normDate(r.date_rdv); return d >= dateDebStr && d <= dateFinStr; });

    document.querySelectorAll(".agenda-event").forEach((el) => el.remove());

    week.forEach((rdv) => {
      const dateKey = normDate(rdv.date_rdv);
      const body = document.getElementById("agenda-body-" + dateKey);
      if (!body || !rdv.heure_rdv) return;
      const [hStr, mStr] = rdv.heure_rdv.split(":");
      const h = parseInt(hStr), m = parseInt(mStr || 0);
      if (h < AGENDA_START_H || h >= AGENDA_END_H) return;
      const topPx = (h - AGENDA_START_H) * AGENDA_SLOT_H + (m / 60) * AGENDA_SLOT_H;
      const ev = document.createElement("div");
      const rawStatus = rdv.statut ? rdv.statut.trim() : "Prevu";
      const stClass = { Prevu: "prevu", Termine: "termine", Terminé: "termine", Annule: "annule", Annulé: "annule", "En cours": "en-cours" }[rawStatus] || "prevu";
      ev.className = `agenda-event ${stClass}`;
      ev.style.top = topPx + "px";
      ev.style.height = "52px";
      ev.innerHTML = `<div class="agenda-event-time">${rdv.heure_rdv}</div><div class="agenda-event-name">${rdv.nom || ""} ${rdv.prenom || ""}</div><div class="agenda-event-time">${rdv.motif || ""}</div>`;
      ev.title = `${rdv.heure_rdv} — ${rdv.nom} ${rdv.prenom}\n${rdv.motif || ""}\nStatut: ${rdv.statut}`;
      ev.onclick = (e) => {
        e.stopPropagation();
        if (confirm(`Modifier ce RDV de ${rdv.nom} ${rdv.prenom} ?`)) { showSection("rdv"); setTimeout(() => modifierRdv(rdv.id_rdv), 300); }
      };
      body.appendChild(ev);
    });
  } catch (e) { console.error("Erreur critique Agenda RDV:", e); }
}


// ============================================================
// ██████  SECTION 8 — STATS PAIEMENTS (JWT)
// ============================================================

async function chargerStatsPaiements() {
  try {
    const headers = _authHeaders();
    const [statsRes, monthRes, todayRes, moisPatientsRes, factListRes] = await Promise.all([
      fetch(`${API_URL}/factures/stats/summary`, { headers }),
      fetch(`${API_URL}/paiements/stats/month`, { headers }),
      fetch(`${API_URL}/paiements/stats/today`, { headers }),
      fetch(`${API_URL}/patients/stats/month`, { headers }),
      fetch(`${API_URL}/factures`, { headers }),
    ]);

    if (statsRes.status === 401) return logout();

    const stats   = await statsRes.json();
    const month   = await monthRes.json();
    const today   = await todayRes.json();
    const moisPat = await moisPatientsRes.json();
    const factures = await factListRes.json();

    const fmt = (v) => (parseFloat(v) || 0).toFixed(2) + " DH";
    const S = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };

    S("totalPayer", fmt(stats.montant_regle));
    S("totalRestant", fmt(stats.montant_restant));
    S("totalImpaye", fmt(stats.montant_restant));
    S("totalPayer2", fmt(stats.montant_regle));
    S("totalRestant2", fmt(stats.montant_restant));
    S("caMois", fmt(month.total_montant));
    S("revenusAujourdhui", fmt(today.total_montant));

    const total = parseFloat(stats.montant_total || 0);
    const paye  = parseFloat(stats.montant_regle || 0);
    const taux  = total > 0 ? Math.round((paye / total) * 100) : 0;
    S("tauxRecouvrement", taux + "%");
    S("patientsMois", moisPat.total_patients || 0);

    const now  = new Date();
    const allF = Array.isArray(factures) ? factures : [];
    const factMois = allF.filter((f) => { const d = new Date(f.date_facture || f.created_at); return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); });
    S("facturesMois", factMois.length);
    S("totalFactures", allF.length);
    S("facturesPayees", allF.filter((f) => f.statut === "Payee").length);
    S("facturesImpayees", allF.filter((f) => f.statut === "Impayee").length);
    S("facturesPartielles", allF.filter((f) => f.statut === "Partiellement payee").length);

    _toutesFacturesCache = allF;
  } catch (e) { console.error("Erreur stats paiements:", e); }
}


// ============================================
// EXPORT EXCEL — Toutes les données
// ============================================
async function exporterToutesLesDonnees() {
    showToast('📊 Préparation de l\'export…', 'info');
    try {
        const res = await fetch(`${API_URL}/export/excel`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
        });
        if (!res.ok) {
            // Fallback: export client-side CSV si l'API n'existe pas encore
            await exportCsvFallback();
            return;
        }
        const blob = await res.blob();
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `DentiPro_Export_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
        showToast('✅ Export téléchargé!', 'success');
    } catch(e) {
        await exportCsvFallback();
    }
}

async function exportCsvFallback() {
    try {
        // Export patients en CSV
        const res  = await fetch(`${API_URL}/patients`);
        const data = await res.json();
        const headers = ['ID','Nom','Prénom','Sexe','Téléphone','CIN','Date Naissance','Ville','Email','Assurance','N° Immat','Type','Créé le'];
        const rows    = data.map(p => [
            p.id_patient, p.nom, p.prenom, p.sexe||'', p.telephone||'',
            p.cnie||'', p.date_naissance||'', p.ville||'', p.email||'',
            p.type_assurance||'', p.numero_immatriculation||'', p.type_patient||'adulte', p.created_at||''
        ]);
        const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        const blob = new Blob(['\uFEFF' + csv], { type:'text/csv;charset=utf-8' });
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url; a.download = `DentiPro_Patients_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
        showToast('✅ Export CSV patients téléchargé!', 'success');
    } catch(e) { showToast('❌ Erreur export: ' + e.message, 'error'); }
}

// ============================================
// UPLOAD IMAGERIE — fix: accept all types
// ============================================
// Override uploadImagerie to handle all file types
window.uploadImagerie = async function() {
    const input = document.getElementById('imagerieFileInput');
    if (!input || !input.files.length || !_fichePatientId) {
        showToast('Sélectionnez un fichier', 'warning'); return;
    }
    const file = input.files[0];
    const fd   = new FormData();
    fd.append('fichier',      file);
    fd.append('titre',        document.getElementById('imagerieDesc')?.value || file.name);
    fd.append('type_doc',     document.getElementById('imagerieType')?.value || 'scanner');
    fd.append('date_doc',     document.getElementById('imagerieDate')?.value || '');
    fd.append('description',  '');
    fd.append('id_user',      localStorage.getItem('userId') || 1);
    try {
        showToast(`📤 Importation de "${file.name}"…`, 'info');
        const res  = await fetch(`${API_URL}/patients/${_fichePatientId}/imagerie`, { 
            method: 'POST', 
            headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
            body: fd 
        });
        if (!res.ok) {
            const txt = await res.text();
            throw new Error(txt || `HTTP ${res.status}`);
        }
        const data = await res.json();
        if (data.success) {
            showToast('✅ Document importé avec succès!', 'success');
            chargerImagerie(_fichePatientId);
            input.value = '';
        } else { showToast('❌ ' + (data.error||'Erreur serveur'), 'error'); }
    } catch(e) { showToast('❌ Erreur: ' + e.message, 'error'); console.error(e); }
};

// ============================================
// AGENDA — initialiser quand showSection rdv
// ============================================
// Initialiser la date par défaut quand on charge la section rdv
// dateRdv min merged into showSection rdv block

// ============================================
// SUPPORT MODAL
// ============================================
function ouvrirSupport() {
    document.getElementById('userMenuDropdown')?.classList.remove('open');
    document.getElementById('modalSupport').classList.add('modal-open');
}

// ============================================
// NOTIFICATIONS AUTOMATIQUES SUR AJOUTS
// ============================================

// Override des succès pour déclencher des notifications
// chargerPatients override removed - stats computed in afficherPatients()

// refreshPatientDashStats() merged into afficherPatients()

// Notifications sur patient ajouté (patch le submit)
const _patientFormEl = document.getElementById('patientForm');
if (_patientFormEl) {
    _patientFormEl.addEventListener('submit', function() {
        // sera déclenché après le vrai submit
        setTimeout(() => {
            const nom    = document.getElementById('nom')?.value || '';
            const prenom = document.getElementById('prenom')?.value || '';
            if (nom) addNotification(`👤 Patient ajouté: ${nom} ${prenom}`, 'success');
            animateBell();
        }, 100);
    }, true);
}

// Notifications RDV
const _rdvFormEl = document.getElementById('rdvForm');
if (_rdvFormEl) {
    _rdvFormEl.addEventListener('submit', function() {
        setTimeout(() => {
            const patient = document.getElementById('rdvPatient');
            const date    = document.getElementById('dateRdv')?.value || '';
            const opt     = patient?.options[patient?.selectedIndex];
            if (opt && opt.value) addNotification(`📅 RDV planifié: ${opt.text} le ${date}`, 'success');
            animateBell();
        }, 100);
    }, true);
}

// Notifications salle d'attente
const _waitingFormEl = document.getElementById('waitingRoomForm');
if (_waitingFormEl) {
    _waitingFormEl.addEventListener('submit', function() {
        setTimeout(() => {
            const patient = document.getElementById('waitingPatient');
            const opt     = patient?.options[patient?.selectedIndex];
            if (opt && opt.value) addNotification(`🪑 Patient ajouté à la file: ${opt.text}`, 'info');
            animateBell();
        }, 100);
    }, true);
}

// Animation cloche
function animateBell() {
    const btn = document.querySelector('[onclick="toggleNotifications()"]');
    if (btn) { btn.classList.add('bell-shake'); setTimeout(()=>btn.classList.remove('bell-shake'), 700); }
}

// refreshFinanceExtraStats() merged into chargerStatsPaiements() and chargerSalleAttente()

// startLiveRefresh override removed - stats now updated by source functions

// Counter animation pour les chiffres du dashboard
function animateCounter(el, target) {
    if (!el) return;
    const start    = parseInt(el.innerText) || 0;
    const duration = 600;
    const steps    = 20;
    const step     = (target - start) / steps;
    let current = start, count = 0;
    const timer = setInterval(() => {
        count++;
        current += step;
        el.innerText = Math.round(current);
        if (count >= steps) { clearInterval(timer); el.innerText = target; }
    }, duration / steps);
}

// Rendre les cartes du dashboard s'animer au chargement des stats
// chargerStatsPaiements override removed

// ============================================
// VILLES DU MAROC — Autocomplétion
// ============================================
const VILLES_MAROC = [
    "Casablanca","Rabat","Fès","Marrakech","Agadir","Tanger","Meknès","Oujda","Kénitra",
    "Tétouan","Safi","El Jadida","Béni Mellal","Nador","Mohammédia","Khouribga","Settat",
    "Ksar el-Kébir","Berrechid","Khémisset","Taourirt","Tiznit","Taroudant","Guelmim",
    "Ouarzazate","Errachidia","Figuig","Laâyoune","Dakhla","Smara","Tan-Tan","Sidi Ifni",
    "Zagora","Tinghir","Chefchaouen","Larache","Al Hoceïma","Fnideq","Martil","M'diq",
    "Asilah","Azrou","Ifrane","Midelt","Rich","Erfoud","Rissani","Merzouga","Taza",
    "Guercif","Sefrou","Boulemane","Chichaoua","Essaouira","Sidi Kacem","Khénifra",
    "Azilal","Demnate","Imzouren","Beni Ansar","Zeghanghane","Oued Zem","Youssoufia",
    "Ben Guerir","Benguerir","Had Soualem","Mediouna","Nouaceur","Bouskoura","Dar Bouazza",
    "Lahbichiya","Lqliâa","Oulad Teima","Biougra","Aït Melloul","Inezgane","Drarga",
    "Imi Ouaddar","Aourir","Temsia","Tikiouine","Dcheira El Jihadia","Oulad Dahou",
    "Loulad","Ait Benhaddou","Boumalne-Dadès","Skoura","Kalaat Mgouna","Nekob",
    "Alnif","Tinjdad","Goulmima","Imilchil","Aït Hani","Kerrouchen",
    "Souk Sebt Oulad Nemma","Bradia","Aïn Harrouda","Rommani","Salé","Skhirate",
    "Témara","Ain Aouda","Bouknadel","Harhoura","Mansour","Sidi Allal El Bahraoui"
];

let _villeIdx = -1;

function filtrerVilles() {
    const input = document.getElementById('ville');
    const dd    = document.getElementById('villeDropdown');
    if (!input || !dd) return;
    const q     = input.value.trim().toLowerCase();
    if (!q) { dd.style.display='none'; return; }

    const matched = VILLES_MAROC.filter(v => v.toLowerCase().includes(q)).slice(0, 12);
    if (!matched.length) { dd.style.display='none'; return; }

    dd.innerHTML = matched.map((v, i) => {
        const hl = v.replace(new RegExp(q,'gi'), m => `<mark style="background:#BFDBFE;border-radius:2px;">${m}</mark>`);
        return `<div class="ville-item" data-idx="${i}" onmousedown="choisirVille('${v}')">${hl}</div>`;
    }).join('');
    dd.style.display = 'block';
    _villeIdx = -1;
}

function choisirVille(v) {
    const input = document.getElementById('ville');
    if (input) input.value = v;
    fermerVilles();
}

function fermerVilles() {
    const dd = document.getElementById('villeDropdown');
    if (dd) dd.style.display = 'none';
    _villeIdx = -1;
}

function villeKeyNav(e) {
    const dd    = document.getElementById('villeDropdown');
    const items = dd?.querySelectorAll('.ville-item');
    if (!items || !items.length) return;
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _villeIdx = Math.min(_villeIdx+1, items.length-1);
        items.forEach((it,i) => it.classList.toggle('active', i===_villeIdx));
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _villeIdx = Math.max(_villeIdx-1, 0);
        items.forEach((it,i) => it.classList.toggle('active', i===_villeIdx));
    } else if (e.key === 'Enter' && _villeIdx >= 0) {
        e.preventDefault();
        choisirVille(items[_villeIdx].textContent);
    } else if (e.key === 'Escape') {
        fermerVilles();
    }
}

// ============================================
// STATS DASHBOARD — RECHARGEMENT COMPLET
// ============================================

// Normalise date_rdv (objet Date MySQL → string YYYY-MM-DD)
function _dateStr(v) {
  if (!v) return "";
  if (typeof v === "string") return v.split("T")[0];
  if (v instanceof Date) return v.toISOString().split("T")[0];
  return String(v).split("T")[0];
}


async function rechargerDashboard() {
  try {
    const headers = _authHeaders();
    const [patRes, rdvRes, facRes, paiMoisRes, paiTodayRes, salleRes] = await Promise.all([
      fetch(`${API_URL}/patients`, { headers }).catch(() => null),
      fetch(`${API_URL}/rdv`, { headers }).catch(() => null),
      fetch(`${API_URL}/factures/stats/summary`, { headers }).catch(() => null),
      fetch(`${API_URL}/paiements/stats/month`, { headers }).catch(() => null),
      fetch(`${API_URL}/paiements/stats/today`, { headers }).catch(() => null),
      fetch(`${API_URL}/salle-attente`, { headers }).catch(() => null),
    ]);

    // Vérification 401 globale
    if (patRes && patRes.status === 401) return logout();

    // Extraction sécurisée
    const pats   = patRes  && patRes.ok  ? await patRes.json()      : [];
    const rdvArr = rdvRes  && rdvRes.ok  ? await rdvRes.json()      : [];
    const fac    = facRes  && facRes.ok  ? await facRes.json()      : {};
    const paiM   = paiMoisRes  && paiMoisRes.ok  ? await paiMoisRes.json()  : {};
    const paiT   = paiTodayRes && paiTodayRes.ok ? await paiTodayRes.json() : {};
    const salle  = salleRes && salleRes.ok ? await salleRes.json()  : [];

    // ← Anti-crash critique
    if (!Array.isArray(pats) || !Array.isArray(rdvArr)) {
      console.error("Format de données invalide reçu du serveur.");
      return;
    }

    patients = pats;
    rdvs = rdvArr;

    const setEl = (id, v) => {
      const el = document.getElementById(id);
      if (el) { el.innerText = v; el.classList.add("counting"); setTimeout(() => el.classList.remove("counting"), 400); }
    };
    const fmt = (v) => (parseFloat(v) || 0).toFixed(2);

    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const moisDebut = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

    setEl("totalPatients", pats.length);
    setEl("patientsMois", pats.filter((p) => _dateStr(p.created_at) >= moisDebut).length);
    setEl("totalEnfants", pats.filter((p) => p.type_patient === "enfant").length);
    setEl("totalAssures", pats.filter((p) => p.type_assurance && p.type_assurance !== "Aucune").length);
    setEl("totalHommes", pats.filter((p) => ["M", "Masculin", "masculin"].includes(p.sexe)).length);
    setEl("totalFemmes", pats.filter((p) => ["F", "Féminin", "feminin"].includes(p.sexe)).length);

    let totalAge = 0, countAge = 0;
    pats.forEach((p) => {
      if (p.date_naissance) {
        const d = new Date(p.date_naissance);
        if (!isNaN(d)) { totalAge += Math.floor((now - d) / (365.25 * 24 * 3600 * 1000)); countAge++; }
      }
    });
    setEl("ageMoyen", countAge > 0 ? Math.round(totalAge / countAge) + " ans" : "--");

    setEl("totalRdv", rdvArr.length);
    const rdvToday = rdvArr.filter((r) => _dateStr(r.date_rdv) === todayStr);
    setEl("rdvToday", rdvToday.length);
    setEl("rdvTodayCount", rdvToday.length + " rendez-vous planifiés");
    _renderRdvList("rdvTodayList", rdvToday.sort((a, b) => (a.heure_rdv || "").localeCompare(b.heure_rdv || "")));

    const sevenDays = new Date(now); sevenDays.setDate(now.getDate() + 7);
    const sevenStr = sevenDays.toISOString().split("T")[0];
    setEl("rdvSemaine", rdvArr.filter((r) => _dateStr(r.date_rdv) > todayStr && _dateStr(r.date_rdv) <= sevenStr).length);
    setEl("rdvTermines", rdvArr.filter((r) => ["Termine", "Terminé"].includes(r.statut)).length);
    setEl("rdvAnnules", rdvArr.filter((r) => ["Annule", "Annulé"].includes(r.statut)).length);
    setEl("rdvEnCours", rdvArr.filter((r) => r.statut === "En cours").length);

    setEl("caMois", fmt(paiM.total_montant) + " DH");
    setEl("totalPayer", fmt(fac.montant_regle) + " DH");
    setEl("totalRestant", fmt(fac.montant_restant) + " DH");
    setEl("revenusAujourdhui", fmt(paiT.total_montant) + " DH");
    setEl("totalImpaye", fmt(fac.montant_restant) + " DH");

    const totalFac  = parseFloat(fac.montant_total || 0);
    const totalPaye = parseFloat(fac.montant_regle || 0);
    setEl("tauxRecouvrement", totalFac > 0 ? Math.round((totalPaye / totalFac) * 100) + "%" : "0%");

    setEl("statTotalImpayeStatic", fmt(fac.montant_restant) + " DH");
    setEl("statTauxRecouvrementStatic", totalFac > 0 ? Math.round((totalPaye / totalFac) * 100) + "%" : "0%");
    setEl("statNouveauxPatientsStatic", pats.filter((p) => _dateStr(p.created_at) >= moisDebut).length);

    const salleArr = Array.isArray(salle) ? salle : [];
    setEl("totalAttente", salleArr.filter((s) => s.statut === "En attente").length);
    setEl("attenteTotal", salleArr.length);

    const upcomingRdv = rdvArr
      .filter((r) => _dateStr(r.date_rdv) > todayStr && _dateStr(r.date_rdv) <= sevenStr && !["Annule", "Annulé"].includes(r.statut))
      .sort((a, b) => (_dateStr(a.date_rdv) + a.heure_rdv).localeCompare(_dateStr(b.date_rdv) + b.heure_rdv))
      .slice(0, 5);
    _renderRdvList("rdvUpcomingList", upcomingRdv, true);

    // Alertes & animations
    checkAlertImpaye(fac.montant_restant || 0);
    _calcTrends();
    _updateOccupationBar();
    initQuickNotes();
    const d2 = document.getElementById("currentDate2");
    if (d2) d2.textContent = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  } catch (e) { console.error("Erreur rechargerDashboard:", e); }
}
// Rendu liste RDV moderne
function _renderRdvList(containerId, rdvArr, showDate) {
    const el = document.getElementById(containerId);
    if (!el) return;
    if (!rdvArr || !rdvArr.length) {
        el.innerHTML = '<div class="db-empty">Aucun RDV prévu</div>';
        return;
    }
    const colors = ['#2563eb','#7c3aed','#059669','#dc2626','#d97706','#0891b2','#9333ea'];
    const isSidebar = containerId === 'rdvUpcomingList';
    el.innerHTML = rdvArr.map(function(r, i) {
        const nom    = r.patient_nom || r.nom || '?';
        const prenom = r.patient_prenom || r.prenom || '';
        const init   = (nom[0]||'?').toUpperCase() + (prenom[0]||'').toUpperCase();
        const color  = colors[i % colors.length];
        const statut = r.statut || 'Prevu';
        const sCls   = statut === 'Terminé' || statut === 'Termine' ? 'db-status-termine'
                     : statut === 'En cours'                        ? 'db-status-en-cours'
                     : statut === 'Annule'  || statut === 'Annulé'  ? 'db-status-annule'
                     : 'db-status-confirme';
        const sLbl   = statut === 'Terminé' || statut === 'Termine' ? 'Terminé'
                     : statut === 'En cours'                        ? 'En cours'
                     : statut === 'Annule'  || statut === 'Annulé'  ? 'Annulé'
                     : 'Confirmé';
        const mont   = r.montant ? ' · ' + parseFloat(r.montant).toFixed(0) + ' MAD' : '';

        if (isSidebar) {
            const d = _dateStr(r.date_rdv).split('-');
            const dl = d.length === 3 ? d[2]+'/'+d[1] : r.date_rdv||'';
            const tm = (r.heure_rdv||'--:--').slice(0,5);
            return [
                '<div class="db-upcoming-item" onclick="showSection(\'rdv\')">',
                '<div class="db-upcoming-avatar" style="background:'+color+'">'+init+'</div>',
                '<div class="db-upcoming-info">',
                '<div class="db-upcoming-name">'+nom+' '+prenom+'</div>',
                '<div class="db-upcoming-date">'+dl+' · '+tm+mont+'</div>',
                '</div>',
                '<span class="db-upcoming-arrow">↗</span>',
                '</div>'
            ].join('');
        }

        return [
            '<div class="db-rdv-item" onclick="showSection(\'rdv\')">',
            '<div class="db-rdv-time">'+(r.heure_rdv||'--:--').slice(0,5)+'</div>',
            '<div class="db-rdv-avatar" style="background:'+color+'">'+init+'</div>',
            '<div class="db-rdv-info">',
            '<div class="db-rdv-name">'+nom+' '+prenom+'</div>',
            '<div class="db-rdv-motif">🦷 '+(r.motif||'Consultation')+mont+'</div>',
            '</div>',
            '<span class="db-rdv-status '+sCls+'">'+sLbl+'</span>',
            '<span class="db-rdv-arrow">↗</span>',
            '</div>'
        ].join('');
    }).join('');
}

// ════════════════════════════════════════════════════════
// SKELETON LOADING
// ════════════════════════════════════════════════════════
function showSkeletons() {
    // KPI values
    ['rdvToday','totalPatients','caMois','tauxRecouvrement'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<span class="skeleton skel-val"></span>';
    });
    // RDV lists
    ['rdvTodayList','rdvUpcomingList'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = [1,2,3].map(() =>
            `<div class="skeleton skel-rdv"></div>`).join('');
    });
}

function hideSkeletons() {
    // Nothing needed — real data replaces skeleton content
}

// ════════════════════════════════════════════════════════
// KPI COUNTER ANIMATION
// ════════════════════════════════════════════════════════
function animateKPI(id, targetRaw) {
    const el = document.getElementById(id);
    if (!el) return;

    // Extract numeric part and suffix
    const str     = String(targetRaw);
    const numMatch= str.match(/[\d.,]+/);
    if (!numMatch) { el.innerText = targetRaw; return; }

    const num    = parseFloat(numMatch[0].replace(',','.'));
    const suffix = str.replace(numMatch[0], '');
    const start  = 0;
    const steps  = 24;
    const dur    = 520;
    let   count  = 0;

    el.classList.remove('kpi-updated');
    void el.offsetWidth; // reflow
    el.classList.add('kpi-updated');

    const timer = setInterval(() => {
        count++;
        const val = Math.round(start + (num - start) * (count / steps));
        el.innerText = (suffix.includes('DH') ? val.toFixed(2) : val) + suffix;
        if (count >= steps) {
            clearInterval(timer);
            el.innerText = targetRaw;
        }
    }, dur / steps);
}

// ════════════════════════════════════════════════════════
// TENDANCES KPI (compare avec hier / semaine dernière)
// ════════════════════════════════════════════════════════
function updateTrendBadge(id, current, previous, suffix) {
    const el = document.getElementById(id);
    if (!el) return;
    if (previous === 0 && current === 0) {
        el.className = 'db-trend-badge db-trend-flat';
        el.innerHTML = '— stable';
        return;
    }
    const diff = current - previous;
    const pct  = previous > 0 ? Math.round(Math.abs(diff / previous) * 100) : 0;
    if (diff > 0) {
        el.className = 'db-trend-badge db-trend-up';
        el.innerHTML = `↑ +${pct}% vs sem. préc.`;
    } else if (diff < 0) {
        el.className = 'db-trend-badge db-trend-down';
        el.innerHTML = `↓ −${pct}% vs sem. préc.`;
    } else {
        el.className = 'db-trend-badge db-trend-flat';
        el.innerHTML = '— stable';
    }
}

// ════════════════════════════════════════════════════════
// ALERTE IMPAYÉS
// ════════════════════════════════════════════════════════
function checkAlertImpaye(montantRestant) {
    const seuil  = 500; // MAD
    const banner = document.getElementById('dbAlertImpaye');
    const label  = document.getElementById('dbAlertImpayes');
    if (!banner) return;
    if (parseFloat(montantRestant) >= seuil) {
        if (label) label.textContent = `${parseFloat(montantRestant).toFixed(2)} MAD à recouvrer sur vos factures`;
        banner.style.display = 'flex';
    } else {
        banner.style.display = 'none';
    }
}

// ════════════════════════════════════════════════════════
// RECHERCHE GLOBALE
// ════════════════════════════════════════════════════════
let _gsrIdx   = -1;
let _gsrItems = [];

function globalSearchFocus() {
    const val = document.getElementById('globalSearchInput')?.value || '';
    if (val.length > 0) openGlobalSearch(val);
}

async function globalSearch(query) {
    const box = document.getElementById('globalSearchResults');
    if (!box) return;
    query = query.trim();
    if (!query || query.length < 2) { box.classList.remove('open'); return; }

    box.innerHTML = '<div class="gsr-empty">🔍 Recherche…</div>';
    box.classList.add('open');

    try {
        // Search patients
        const pRes  = await fetch(`${API_URL}/patients/search/${encodeURIComponent(query)}`, { headers: _authHeaders() });
        const pData = await pRes.json();

        // Search RDV by matching against loaded rdvs array
        const q    = query.toLowerCase();
        const rData = (rdvs||[]).filter(r =>
            (r.patient_nom||'').toLowerCase().includes(q) ||
            (r.patient_prenom||'').toLowerCase().includes(q) ||
            (r.motif||'').toLowerCase().includes(q)
        ).slice(0, 4);

        const colors = ['#2563eb','#7c3aed','#059669','#dc2626','#d97706'];
        let html = '';

        if (pData.length > 0) {
            html += '<div class="gsr-section">👥 Patients</div>';
            html += pData.slice(0,5).map((p, i) => {
                const init = (p.nom[0]||'?').toUpperCase() + (p.prenom[0]||'').toUpperCase();
                const color = colors[i % colors.length];
                return `<div class="gsr-item" onclick="gsrOpenPatient(${p.id_patient})">
                    <div class="gsr-avatar" style="background:${color}">${init}</div>
                    <div>
                        <div class="gsr-main">${p.nom} ${p.prenom}</div>
                        <div class="gsr-sub">${p.telephone||'—'} · ${p.ville||'—'}</div>
                    </div>
                    <span class="gsr-tag">Patient</span>
                </div>`;
            }).join('');
        }

        if (rData.length > 0) {
            html += '<div class="gsr-section">📅 Rendez-vous</div>';
            html += rData.map((r, i) => {
                const init = ((r.patient_nom||'?')[0]||'?').toUpperCase() + ((r.patient_prenom||'')[0]||'').toUpperCase();
                const color = colors[i % colors.length];
                const d = _dateStr(r.date_rdv).split('-').reverse().join('/');
                return `<div class="gsr-item" onclick="showSection('rdv')">
                    <div class="gsr-avatar" style="background:${color}">${init}</div>
                    <div>
                        <div class="gsr-main">${r.patient_nom||''} ${r.patient_prenom||''}</div>
                        <div class="gsr-sub">${d} · ${(r.heure_rdv||'--:--').slice(0,5)} · ${r.motif||'Consultation'}</div>
                    </div>
                    <span class="gsr-tag">RDV</span>
                </div>`;
            }).join('');
        }

        if (!html) {
            html = `<div class="gsr-empty">Aucun résultat pour "<strong>${query}</strong>"</div>`;
        }

        html += `<div class="gsr-shortcut">
            <span><kbd>↑↓</kbd> Naviguer</span>
            <span><kbd>Entrée</kbd> Ouvrir</span>
            <span><kbd>Esc</kbd> Fermer</span>
        </div>`;

        box.innerHTML = html;
        _gsrItems = box.querySelectorAll('.gsr-item');
        _gsrIdx   = -1;
    } catch(e) {
        box.innerHTML = '<div class="gsr-empty">Erreur de recherche</div>';
    }
}

function gsrOpenPatient(id) {
    closeGlobalSearch();
    // Ouvrir directement la fiche sans naviguer vers la section patients
    ouvrirFichePatient(id);
}

function openGlobalSearch(val) {
    if (val && val.length >= 2) globalSearch(val);
}

function closeGlobalSearch() {
    const box = document.getElementById('globalSearchResults');
    const inp = document.getElementById('globalSearchInput');
    if (box) box.classList.remove('open');
    if (inp) inp.value = '';
    _gsrIdx = -1;
}

function globalSearchNav(e) {
    const box = document.getElementById('globalSearchResults');
    if (!box || !box.classList.contains('open')) return;
    const items = box.querySelectorAll('.gsr-item');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _gsrIdx = Math.min(_gsrIdx + 1, items.length - 1);
        items.forEach((it, i) => it.classList.toggle('active', i === _gsrIdx));
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _gsrIdx = Math.max(_gsrIdx - 1, 0);
        items.forEach((it, i) => it.classList.toggle('active', i === _gsrIdx));
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (_gsrIdx >= 0 && items[_gsrIdx]) items[_gsrIdx].click();
        else closeGlobalSearch();
    } else if (e.key === 'Escape') {
        closeGlobalSearch();
    }
}

// ════════════════════════════════════════════════════════
// RACCOURCIS CLAVIER GLOBAUX
// ════════════════════════════════════════════════════════
document.addEventListener('keydown', function(e) {
    const tag = (e.target.tagName||'').toLowerCase();
    const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

    // ⌘K / Ctrl+K — ouvrir recherche globale
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        const inp = document.getElementById('globalSearchInput');
        if (inp) { inp.focus(); inp.select(); }
        return;
    }

    if (isInput) return; // ne pas intercepter si on tape dans un champ

    // Esc — fermer modals ouverts
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(m => {
            if (m.style.display === 'flex') m.style.display = 'none';
        });
        closeGlobalSearch();
        document.body.style.overflow = '';
        return;
    }

    // Alt + N — nouveau RDV
    if (e.altKey && e.key === 'n') { e.preventDefault(); goToNewRdv(); showKbdHint(); return; }
    // Alt + P — patients
    if (e.altKey && e.key === 'p') { e.preventDefault(); showSection('patients'); showKbdHint(); return; }
    // Alt + A — agenda
    if (e.altKey && e.key === 'a') { e.preventDefault(); showSection('agenda'); showKbdHint(); return; }
    // Alt + D — dashboard
    if (e.altKey && e.key === 'd') { e.preventDefault(); showSection('dashboard'); showKbdHint(); return; }
    // Alt + F — factures
    if (e.altKey && e.key === 'f') { e.preventDefault(); showSection('factures'); showKbdHint(); return; }
});

let _kbdHintTimer = null;
function showKbdHint() {
    const hint = document.getElementById('kbdHint');
    if (!hint) return;
    hint.classList.add('show');
    clearTimeout(_kbdHintTimer);
    _kbdHintTimer = setTimeout(() => hint.classList.remove('show'), 2500);
}

// ════════════════════════════════════════════════════════
// TOAST AVEC ACTIONS
// ════════════════════════════════════════════════════════
function showToastAction(msg, type, actionLabel, actionFn) {
    // Build a toast with an action button
    const container = document.getElementById('toastContainer');
    if (!container) { showToast(msg, type); return; }

    const colors = {
        success: 'linear-gradient(135deg,#10b981,#059669)',
        error:   'linear-gradient(135deg,#ef4444,#dc2626)',
        warning: 'linear-gradient(135deg,#f59e0b,#d97706)',
        info:    'linear-gradient(135deg,#3b82f6,#2563eb)'
    };
    const t = document.createElement('div');
    t.style.cssText = `
        background:${colors[type]||colors.info};
        color:#fff; padding:11px 16px; border-radius:12px;
        font-size:13px; font-weight:600;
        box-shadow:0 4px 16px rgba(0,0,0,.2);
        display:flex; align-items:center; gap:10px;
        animation:slideUp .3s ease; pointer-events:all;
        max-width:360px;
    `;
    t.innerHTML = `<span style="flex:1">${msg}</span>`;
    if (actionLabel && actionFn) {
        const btn = document.createElement('button');
        btn.className = 'toast-action';
        btn.textContent = actionLabel;
        btn.onclick = () => { actionFn(); container.removeChild(t); };
        t.appendChild(btn);
    }
    container.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 5000);
}

// ════════════════════════════════════════════════════════
// RAPPELS WHATSAPP
// ════════════════════════════════════════════════════════
function envoyerRappelWhatsApp(rdv) {
    const nom    = rdv.patient_nom    || rdv.nom    || '';
    const prenom = rdv.patient_prenom || rdv.prenom || '';
    const tel    = rdv.telephone || rdv.patient_tel || '';
    const date   = _dateStr(rdv.date_rdv).split('-').reverse().join('/');
    const heure  = (rdv.heure_rdv||'').slice(0,5);

    const msg = encodeURIComponent(
        `Bonjour ${prenom} ${nom},\n\n` +
        `Nous vous rappelons votre rendez-vous au cabinet dentaire :\n` +
        `📅 ${date} à ${heure}\n\n` +
        `Merci de confirmer votre présence.\n` +
        `En cas d'empêchement, merci de nous prévenir au plus tôt.\n\n` +
        `Cabinet DentiPro`
    );

    // Nettoyer le numéro (enlever espaces, +, 0 initial)
    let phone = tel.replace(/[\s\-\.\(\)]/g,'');
    if (phone.startsWith('0')) phone = '212' + phone.slice(1);
    if (!phone.startsWith('+')) phone = '+' + phone;

    window.open(`https://wa.me/${phone.replace('+','')}?text=${msg}`, '_blank');
}

// ════════════════════════════════════════════════════════
// NOTES RAPIDES (localStorage)
// ════════════════════════════════════════════════════════
let _notesSaveTimer = null;

function initQuickNotes() {
    const ta  = document.getElementById('quickNotes');
    const cnt = document.getElementById('notesCount');
    if (!ta) return;
    const saved = localStorage.getItem('dentipro_notes_' + new Date().toDateString()) || '';
    ta.value = saved;
    if (cnt) cnt.textContent = saved.length + ' caractères';
}

function saveQuickNotes() {
    const ta   = document.getElementById('quickNotes');
    const cnt  = document.getElementById('notesCount');
    const lbl  = document.getElementById('notesSaved');
    if (!ta) return;
    if (cnt) cnt.textContent = ta.value.length + ' caractères';
    clearTimeout(_notesSaveTimer);
    _notesSaveTimer = setTimeout(() => {
        localStorage.setItem('dentipro_notes_' + new Date().toDateString(), ta.value);
        if (lbl) {
            lbl.classList.add('show');
            setTimeout(() => lbl.classList.remove('show'), 1800);
        }
    }, 600);
}

// ════════════════════════════════════════════════════════
// PATCH rechargerDashboard — squelettes + animations + alertes
// ════════════════════════════════════════════════════════
// Augment rechargerDashboard with skeleton + animations + alerts + trends
const _origRecharger = window.rechargerDashboard || rechargerDashboard;
window.rechargerDashboard = async function() {
    showSkeletons();
    if (typeof _origRecharger === 'function') await _origRecharger();

    // ── Animate KPI counters ──────────────────
    ['rdvToday','totalPatients','caMois','tauxRecouvrement'].forEach(id => {
        const el = document.getElementById(id);
        if (el) animateKPI(id, el.innerText);
    });

    // ── Trends badges (compare semaine / mois) ────
    _calcTrends();

    // ── Taux occupation bar ───────────────────
    _updateOccupationBar();

    // ── Alerte impayés ────────────────────────
    const imp = document.getElementById('totalImpaye');
    if (imp) checkAlertImpaye(imp.innerText.replace(' DH','').trim());

    // ── Notes du jour ─────────────────────────
    initQuickNotes();

    // ── Hero date ─────────────────────────────
    const d2 = document.getElementById('currentDate2');
    if (d2) {
        d2.textContent = new Date().toLocaleDateString('fr-FR', {
            weekday:'long', day:'numeric', month:'long', year:'numeric'
        });
    }
};

// ═══ TENDANCES ═══════════════════════════════════════════
function _calcTrends() {
    if (!rdvs || !rdvs.length) return;
    const now    = new Date();
    const today  = now.toISOString().split('T')[0];

    // Cette semaine vs semaine dernière
    const startThisWeek  = new Date(now); startThisWeek.setDate(now.getDate() - now.getDay());
    const startLastWeek  = new Date(startThisWeek); startLastWeek.setDate(startThisWeek.getDate() - 7);
    const endLastWeek    = new Date(startThisWeek); endLastWeek.setDate(startThisWeek.getDate() - 1);

    const strThisStart = startThisWeek.toISOString().split('T')[0];
    const strLastStart = startLastWeek.toISOString().split('T')[0];
    const strLastEnd   = endLastWeek.toISOString().split('T')[0];

    const rdvThisWeek = rdvs.filter(r => _dateStr(r.date_rdv) >= strThisStart).length;
    const rdvLastWeek = rdvs.filter(r => _dateStr(r.date_rdv) >= strLastStart && _dateStr(r.date_rdv) <= strLastEnd).length;

    updateTrendBadge('trendRdv', rdvThisWeek, rdvLastWeek, '');

    // Patients : ce mois vs mois dernier
    if (patients && patients.length) {
        const mois = now.getMonth(); const annee = now.getFullYear();
        const lastM = mois === 0 ? 11 : mois - 1;
        const lastY = mois === 0 ? annee - 1 : annee;
        const thisMoPat  = patients.filter(p => { const d=new Date(p.created_at); return d.getMonth()===mois && d.getFullYear()===annee; }).length;
        const lastMoPat  = patients.filter(p => { const d=new Date(p.created_at); return d.getMonth()===lastM && d.getFullYear()===lastY; }).length;
        // Display new patients count as sub-trend
        const trendEl = document.getElementById('trendPat');
        if (trendEl) updateTrendBadge('trendPat', thisMoPat, lastMoPat, '');
    }
}

// ═══ BARRE OCCUPATION ════════════════════════════════════
function _updateOccupationBar() {
    const bar   = document.getElementById('occBar');
    const label = document.getElementById('occLabel');
    if (!bar || !rdvs) return;

    const today    = new Date().toISOString().split('T')[0];
    const rdvAuj   = rdvs.filter(r => _dateStr(r.date_rdv) === today).length;
    const capacity = 10;
    const pct      = Math.min(Math.round((rdvAuj / capacity) * 100), 100);
    const color    = pct < 50 ? '#10b981' : pct < 80 ? '#f59e0b' : '#ef4444';

    bar.style.width   = pct + '%';
    bar.style.background = color;
    if (label) label.textContent = rdvAuj + '/' + capacity + ' créneaux · ' + pct + '%';
}

// ════════════════════════════════════════════════════════
// PATCH _renderRdvList — ajouter bouton WhatsApp
// ════════════════════════════════════════════════════════
const _origRenderRdv = _renderRdvList;
window._renderRdvListWithWA = function(containerId, rdvArr, showDate) {
    _origRenderRdv(containerId, rdvArr, showDate);
    // Add WhatsApp buttons to today's list
    if (containerId === 'rdvTodayList' && rdvArr && rdvArr.length) {
        const items = document.querySelectorAll('#rdvTodayList .db-rdv-item');
        items.forEach((item, i) => {
            if (!rdvArr[i] || !rdvArr[i].telephone && !rdvArr[i].patient_tel) return;
            const waBtn = document.createElement('button');
            waBtn.title = 'Envoyer rappel WhatsApp';
            waBtn.style.cssText = 'background:none;border:none;cursor:pointer;font-size:17px;flex-shrink:0;padding:2px;line-height:1;';
            waBtn.textContent = '📱';
            waBtn.onclick = function(e) {
                e.stopPropagation();
                envoyerRappelWhatsApp(rdvArr[i]);
            };
            item.insertBefore(waBtn, item.lastElementChild);
        });
    }
};


// ════════════════════════════════════════════════════════
// RÉINITIALISATION COMPLÈTE DES DONNÉES
// ════════════════════════════════════════════════════════
function confirmerReinitialisation() {
    document.getElementById('userMenuDropdown')?.classList.remove('open');
    const modal = document.getElementById('modalReinit');
    if (!modal) return;
    const inp = document.getElementById('reinitConfirmInput');
    const btn = document.getElementById('btnReinitConfirm');
    if (inp) inp.value = '';
    if (btn) { btn.disabled = true; btn.style.opacity = '.5'; }
    modal.style.display = 'flex';
}

async function executerReinitialisation() {
    const btn = document.getElementById('btnReinitConfirm');
    if (btn) { btn.textContent = '⏳ Suppression…'; btn.disabled = true; }

    try {
        // Delete in correct order (foreign key constraints)
        const steps = [
            { url: `${API_URL}/paiements`,      label: 'Paiements' },
            { url: `${API_URL}/factures`,        label: 'Factures' },
            { url: `${API_URL}/rdv`,             label: 'Rendez-vous' },
            { url: `${API_URL}/salle-attente`,   label: "Salle d'attente" },
            { url: `${API_URL}/patients`,        label: 'Patients' },
        ];

        let errors = [];
        for (const step of steps) {
            try {
                // Get all IDs then delete each
                const res  = await fetch(step.url);
                const data = await res.json();
                const items = Array.isArray(data) ? data : [];
                for (const item of items) {
                    const id = item.id_paiement || item.id_facture || item.id_rdv || item.id || item.id_patient;
                    if (id) {
                        await fetch(`${step.url}/${id}`, { method: 'DELETE' }).catch(() => {});
                    }
                }
            } catch(e) { errors.push(step.label); }
        }

        // Close modal
        document.getElementById('modalReinit').classList.remove('modal-open');

        if (errors.length > 0) {
            showToast(`⚠️ Partiellement réinitialisé (erreurs: ${errors.join(', ')})`, 'warning');
        } else {
            showToast('✅ Toutes les données ont été supprimées', 'success');
        }

        // Refresh everything
        await Promise.all([
            chargerPatients(),
            chargerRdv(),
            chargerSalleAttente(),
            chargerStatsPaiements(),
            chargerFactures(),
            chargerToutesFactures()
        ]);
        rechargerDashboard();

    } catch(e) {
        showToast('❌ Erreur lors de la réinitialisation', 'error');
        console.error(e);
    }
}

// ════════════════════════════════════════════════════════
// FORMULAIRE PATIENT IMPRIMABLE (FR + AR)
// ════════════════════════════════════════════════════════
function ouvrirModalFormPatient() {
    document.getElementById('userMenuDropdown')?.classList.remove('open');
    const m = document.getElementById('modalFormPatient');
    if (m) m.classList.add('modal-open');
}

function genererFormulairePatient() {
    const cabinet = localStorage.getItem('dentipro_cabinet') || 'Cabinet Dentaire DentiPro';
    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Fiche Patient — ${cabinet}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Plus Jakarta Sans',Arial,sans-serif; background:#fff; color:#1e293b; }

  @media print {
    body { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    .no-print { display:none !important; }
    .page { page-break-after: always; }
    .page:last-child { page-break-after: avoid; }
  }

  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 14mm 16mm;
    margin: 0 auto;
    background: #fff;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 12px;
    border-bottom: 3px solid #2563eb;
    margin-bottom: 18px;
  }
  .header-logo {
    font-size: 22px; font-weight: 900;
    color: #2563eb; letter-spacing: -.5px;
  }
  .header-logo span { color: #7c3aed; }
  .header-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .header-date { text-align: right; font-size: 11px; color: #94a3b8; }
  .header-date span { display: block; font-size: 13px; font-weight: 700; color: #1e293b; }

  /* Section titles */
  .sec-title {
    display: flex; align-items: center; gap: 8px;
    font-size: 11px; font-weight: 800;
    text-transform: uppercase; letter-spacing: 1px;
    color: #fff;
    background: linear-gradient(135deg, #2563eb, #7c3aed);
    padding: 6px 14px;
    border-radius: 20px;
    margin: 14px 0 10px;
  }
  .sec-title-ar {
    direction: rtl;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    font-size: 12px;
    margin-left: auto;
    font-weight: 700;
  }

  /* Fields grid */
  .fields-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin-bottom: 6px;
  }
  .fields-grid.cols-3 { grid-template-columns: 1fr 1fr 1fr; }
  .fields-grid.cols-1 { grid-template-columns: 1fr; }
  .field {
    display: flex; flex-direction: column; gap: 2px;
  }
  .field-label {
    font-size: 9.5px; font-weight: 700;
    text-transform: uppercase; letter-spacing: .6px;
    color: #64748b;
  }
  .field-label-ar {
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    direction: rtl; font-size: 10px; font-weight: 600;
    color: #94a3b8;
  }
  .field-line {
    border: none; border-bottom: 1.5px solid #cbd5e1;
    background: #f8fafc;
    padding: 7px 10px;
    font-size: 13px;
    border-radius: 4px 4px 0 0;
    min-height: 30px;
    width: 100%;
  }
  .field-line-tall {
    border: 1.5px solid #e2e8f0;
    border-radius: 6px;
    background: #f8fafc;
    padding: 8px 10px;
    min-height: 54px;
    width: 100%;
  }

  /* Checkbox row */
  .check-row {
    display: flex; flex-wrap: wrap; gap: 6px;
    margin-bottom: 4px;
  }
  .check-item {
    display: flex; align-items: center; gap: 5px;
    font-size: 11px; font-weight: 600; color: #475569;
    padding: 4px 10px;
    border: 1.5px solid #e2e8f0;
    border-radius: 20px;
    background: #f8fafc;
    min-width: 70px;
  }
  .check-box {
    width: 14px; height: 14px;
    border: 1.5px solid #94a3b8;
    border-radius: 3px;
    flex-shrink: 0;
    background: #fff;
  }
  .check-item-ar {
    direction: rtl;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    font-size: 11px;
  }

  /* Divider */
  .page-divider {
    border: none; border-top: 2px dashed #e2e8f0;
    margin: 20px 0; position: relative;
  }
  .page-divider::after {
    content: '✂';
    position: absolute; top: -9px; left: 50%;
    transform: translateX(-50%);
    background: #fff; padding: 0 8px;
    color: #94a3b8; font-size: 14px;
  }

  /* Consent */
  .consent {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 12px 14px;
    font-size: 10px;
    color: #64748b;
    line-height: 1.6;
    margin-top: 12px;
  }
  .consent-ar {
    direction: rtl;
    font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    text-align: right;
    margin-top: 6px;
  }

  /* Signature row */
  .sign-row {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 20px; margin-top: 16px;
  }
  .sign-box { display: flex; flex-direction: column; gap: 4px; }
  .sign-label { font-size: 10px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .5px; }
  .sign-line { border-top: 1.5px solid #cbd5e1; margin-top: 32px; padding-top: 4px; font-size: 10px; color: #94a3b8; }

  /* Photo box */
  .photo-box {
    width: 90px; height: 110px;
    border: 2px dashed #cbd5e1;
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    flex-direction: column; gap: 4px;
    color: #94a3b8; font-size: 10px; font-weight: 600;
    text-align: center; padding: 8px;
    background: #f8fafc;
  }
  .photo-box-icon { font-size: 24px; }

  /* Top row with photo */
  .top-row { display: flex; gap: 14px; align-items: flex-start; }
  .top-fields { flex: 1; }

  /* No-print button */
  .no-print {
    position: fixed; top: 20px; right: 20px;
    display: flex; gap: 10px; z-index: 999;
  }
  .print-btn {
    padding: 10px 20px;
    background: linear-gradient(135deg,#2563eb,#1d4ed8);
    color: #fff; border: none; border-radius: 10px;
    font-size: 14px; font-weight: 700; cursor: pointer;
    font-family: 'Plus Jakarta Sans', Arial, sans-serif;
    box-shadow: 0 4px 14px rgba(37,99,235,.3);
  }
  .print-btn:hover { background: #1d4ed8; }

  /* AR badge */
  .ar-badge {
    background: linear-gradient(135deg,#7c3aed,#6d28d9);
    color: #fff; font-size: 10px; font-weight: 700;
    padding: 2px 8px; border-radius: 10px;
    font-family: 'Segoe UI', Arial, sans-serif;
    margin-left: 6px;
  }
</style>
</head>
<body>

<!-- PRINT BUTTON -->
<div class="no-print">
  <button class="print-btn" onclick="window.print()">🖨️ Imprimer / Enregistrer PDF</button>
  <button class="print-btn" onclick="window.close()" style="background:#64748b;">✕ Fermer</button>
</div>

<!-- ════════════════ PAGE RECTO (FRANÇAIS) ════════════════ -->
<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="header-logo">Denti<span>Pro</span></div>
      <div class="header-sub">${cabinet}</div>
    </div>
    <div style="text-align:center;">
      <div style="font-size:14px;font-weight:900;color:#1e293b;">FICHE PATIENT</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">N°: _______________</div>
    </div>
    <div class="header-date">
      Date d'enregistrement
      <span>______ / ______ / __________</span>
    </div>
  </div>

  <!-- Photo + Identité -->
  <div class="sec-title">👤 Informations personnelles <span class="sec-title-ar">المعلومات الشخصية</span></div>
  <div class="top-row">
    <div class="photo-box">
      <div class="photo-box-icon">📷</div>
      <div>Photo</div>
      <div style="font-family:'Segoe UI',Arial;direction:rtl;margin-top:3px;">صورة</div>
    </div>
    <div class="top-fields">
      <div class="fields-grid">
        <div class="field">
          <div class="field-label">Nom <span class="ar-badge">الاسم العائلي</span></div>
          <div class="field-line"></div>
        </div>
        <div class="field">
          <div class="field-label">Prénom <span class="ar-badge">الاسم الشخصي</span></div>
          <div class="field-line"></div>
        </div>
        <div class="field">
          <div class="field-label">Date de naissance <span class="ar-badge">تاريخ الازدياد</span></div>
          <div class="field-line"></div>
        </div>
        <div class="field">
          <div class="field-label">CIN / Passeport <span class="ar-badge">رقم البطاقة</span></div>
          <div class="field-line"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="fields-grid" style="margin-top:10px;">
    <div class="field">
      <div class="field-label">Sexe <span class="ar-badge">الجنس</span></div>
      <div class="check-row">
        <div class="check-item"><div class="check-box"></div> Masculin <span class="check-item-ar">ذكر</span></div>
        <div class="check-item"><div class="check-box"></div> Féminin <span class="check-item-ar">أنثى</span></div>
      </div>
    </div>
    <div class="field">
      <div class="field-label">Type patient <span class="ar-badge">نوع المريض</span></div>
      <div class="check-row">
        <div class="check-item"><div class="check-box"></div> Adulte <span class="check-item-ar">بالغ</span></div>
        <div class="check-item"><div class="check-box"></div> Enfant <span class="check-item-ar">طفل</span></div>
      </div>
    </div>
  </div>

  <div class="fields-grid cols-3" style="margin-top:10px;">
    <div class="field">
      <div class="field-label">Téléphone <span class="ar-badge">الهاتف</span></div>
      <div class="field-line"></div>
    </div>
    <div class="field">
      <div class="field-label">Email <span class="ar-badge">البريد الإلكتروني</span></div>
      <div class="field-line"></div>
    </div>
    <div class="field">
      <div class="field-label">Ville <span class="ar-badge">المدينة</span></div>
      <div class="field-line"></div>
    </div>
  </div>

  <div class="fields-grid" style="margin-top:10px;">
    <div class="field">
      <div class="field-label">Adresse complète <span class="ar-badge">العنوان الكامل</span></div>
      <div class="field-line-tall"></div>
    </div>
    <div class="field">
      <div class="field-label">Profession <span class="ar-badge">المهنة</span></div>
      <div class="field-line"></div>
    </div>
  </div>

  <!-- Assurance -->
  <div class="sec-title">🏥 Assurance <span class="sec-title-ar">التأمين الصحي</span></div>
  <div class="fields-grid">
    <div class="field">
      <div class="field-label">Type d'assurance <span class="ar-badge">نوع التأمين</span></div>
      <div class="check-row">
        <div class="check-item"><div class="check-box"></div> Aucune <span class="check-item-ar">لا يوجد</span></div>
        <div class="check-item"><div class="check-box"></div> CNSS</div>
        <div class="check-item"><div class="check-box"></div> CNOPS</div>
        <div class="check-item"><div class="check-box"></div> Autre <span class="check-item-ar">أخرى</span></div>
      </div>
    </div>
    <div class="field">
      <div class="field-label">N° immatriculation <span class="ar-badge">رقم التسجيل</span></div>
      <div class="field-line"></div>
    </div>
  </div>

  <!-- Médical -->
  <div class="sec-title">🩺 Informations médicales <span class="sec-title-ar">المعلومات الطبية</span></div>
  <div class="fields-grid">
    <div class="field">
      <div class="field-label">Antécédents médicaux <span class="ar-badge">السوابق المرضية</span></div>
      <div class="field-line-tall"></div>
    </div>
    <div class="field">
      <div class="field-label">Allergies (médicaments, anesthésie…) <span class="ar-badge">الحساسيات</span></div>
      <div class="field-line-tall"></div>
    </div>
  </div>

  <div class="fields-grid" style="margin-top:10px;">
    <div class="field">
      <div class="field-label">Maladies chroniques <span class="ar-badge">الأمراض المزمنة</span></div>
      <div class="check-row">
        <div class="check-item"><div class="check-box"></div> Diabète <span class="check-item-ar">السكري</span></div>
        <div class="check-item"><div class="check-box"></div> HTA <span class="check-item-ar">ضغط الدم</span></div>
        <div class="check-item"><div class="check-box"></div> Cardio <span class="check-item-ar">قلبية</span></div>
        <div class="check-item"><div class="check-box"></div> Autre <span class="check-item-ar">أخرى</span></div>
      </div>
    </div>
    <div class="field">
      <div class="field-label">Médicaments en cours <span class="ar-badge">الأدوية الحالية</span></div>
      <div class="field-line"></div>
    </div>
  </div>

  <!-- Consent + Signature -->
  <div class="consent">
    <strong>Consentement / الموافقة :</strong> Je soussigné(e) autorise le cabinet dentaire à enregistrer et utiliser mes données personnelles et médicales dans le cadre exclusif de ma prise en charge médicale, conformément à la réglementation en vigueur.
    <div class="consent-ar">أوافق على تسجيل واستخدام بياناتي الشخصية والطبية من قِبَل عيادة الأسنان لأغراض الرعاية الطبية حصراً.</div>
  </div>

  <div class="sign-row">
    <div class="sign-box">
      <div class="sign-label">Signature du patient / <span style="font-family:'Segoe UI';direction:rtl;display:inline-block;">توقيع المريض</span></div>
      <div class="sign-line">Nom et signature</div>
    </div>
    <div class="sign-box">
      <div class="sign-label">Cachet et signature du médecin / <span style="font-family:'Segoe UI';direction:rtl;display:inline-block;">توقيع الطبيب</span></div>
      <div class="sign-line">Dr. ___________________________</div>
    </div>
  </div>

</div>

<!-- ════════════════ SEPARATOR ════════════════ -->
<div style="margin:0 auto;width:210mm;padding:0 16mm;">
  <div class="page-divider"></div>
</div>

<!-- ════════════════ PAGE VERSO (ARABE) ════════════════ -->
<div class="page" dir="rtl" style="direction:rtl;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">

  <!-- Header AR -->
  <div class="header" style="direction:rtl;">
    <div class="header-date" style="text-align:left;direction:ltr;">
      تاريخ التسجيل
      <span>______ / ______ / __________</span>
    </div>
    <div style="text-align:center;">
      <div style="font-size:14px;font-weight:900;color:#1e293b;">بطاقة المريض</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px;">الرقم: _______________</div>
    </div>
    <div>
      <div style="font-size:18px;font-weight:900;color:#2563eb;">دنتي<span style="color:#7c3aed;">برو</span></div>
      <div style="font-size:11px;color:#64748b;">${cabinet}</div>
    </div>
  </div>

  <!-- Identité AR -->
  <div class="sec-title" style="direction:rtl;flex-direction:row-reverse;">
    <span>المعلومات الشخصية</span> 👤
    <span style="margin-right:auto;font-family:'Plus Jakarta Sans',Arial;font-size:10px;direction:ltr;">Informations personnelles</span>
  </div>
  <div class="top-row" style="flex-direction:row-reverse;">
    <div class="photo-box">
      <div class="photo-box-icon">📷</div>
      <div style="direction:rtl;">صورة</div>
      <div style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;margin-top:3px;font-size:9px;">Photo</div>
    </div>
    <div class="top-fields">
      <div class="fields-grid" style="direction:rtl;">
        <div class="field" style="text-align:right;">
          <div class="field-label" style="text-align:right;">الاسم العائلي <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;display:inline-block;font-size:9px;color:#94a3b8;">Nom</span></div>
          <div class="field-line"></div>
        </div>
        <div class="field" style="text-align:right;">
          <div class="field-label" style="text-align:right;">الاسم الشخصي <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;display:inline-block;font-size:9px;color:#94a3b8;">Prénom</span></div>
          <div class="field-line"></div>
        </div>
        <div class="field" style="text-align:right;">
          <div class="field-label" style="text-align:right;">تاريخ الازدياد <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;display:inline-block;font-size:9px;color:#94a3b8;">Date naissance</span></div>
          <div class="field-line"></div>
        </div>
        <div class="field" style="text-align:right;">
          <div class="field-label" style="text-align:right;">رقم البطاقة الوطنية <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;display:inline-block;font-size:9px;color:#94a3b8;">CIN</span></div>
          <div class="field-line"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="fields-grid" style="direction:rtl;margin-top:10px;">
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">الجنس <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;display:inline-block;font-size:9px;color:#94a3b8;">Sexe</span></div>
      <div class="check-row" style="flex-direction:row-reverse;">
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> ذكر</div>
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> أنثى</div>
      </div>
    </div>
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">نوع المريض <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;display:inline-block;font-size:9px;color:#94a3b8;">Type patient</span></div>
      <div class="check-row" style="flex-direction:row-reverse;">
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> بالغ</div>
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> طفل</div>
      </div>
    </div>
  </div>

  <div class="fields-grid cols-3" style="direction:rtl;margin-top:10px;">
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">الهاتف <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;font-size:9px;color:#94a3b8;">Tél</span></div>
      <div class="field-line"></div>
    </div>
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">البريد الإلكتروني <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;font-size:9px;color:#94a3b8;">Email</span></div>
      <div class="field-line"></div>
    </div>
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">المدينة <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;font-size:9px;color:#94a3b8;">Ville</span></div>
      <div class="field-line"></div>
    </div>
  </div>

  <!-- Assurance AR -->
  <div class="sec-title" style="direction:rtl;flex-direction:row-reverse;">
    <span>التأمين الصحي</span> 🏥
    <span style="margin-right:auto;font-family:'Plus Jakarta Sans',Arial;font-size:10px;direction:ltr;">Assurance</span>
  </div>
  <div class="fields-grid" style="direction:rtl;">
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">نوع التأمين</div>
      <div class="check-row" style="flex-direction:row-reverse;">
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> لا يوجد</div>
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> CNSS</div>
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> CNOPS</div>
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> أخرى</div>
      </div>
    </div>
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">رقم التسجيل <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;font-size:9px;color:#94a3b8;">N° immatriculation</span></div>
      <div class="field-line"></div>
    </div>
  </div>

  <!-- Médical AR -->
  <div class="sec-title" style="direction:rtl;flex-direction:row-reverse;">
    <span>المعلومات الطبية</span> 🩺
    <span style="margin-right:auto;font-family:'Plus Jakarta Sans',Arial;font-size:10px;direction:ltr;">Informations médicales</span>
  </div>
  <div class="fields-grid" style="direction:rtl;">
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">السوابق المرضية</div>
      <div class="field-line-tall"></div>
    </div>
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">الحساسيات والأدوية</div>
      <div class="field-line-tall"></div>
    </div>
  </div>

  <div class="fields-grid" style="direction:rtl;margin-top:10px;">
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">الأمراض المزمنة</div>
      <div class="check-row" style="flex-direction:row-reverse;">
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> السكري</div>
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> ضغط الدم</div>
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> قلبية</div>
        <div class="check-item" style="flex-direction:row-reverse;"><div class="check-box"></div> أخرى</div>
      </div>
    </div>
    <div class="field" style="text-align:right;">
      <div class="field-label" style="text-align:right;">الأدوية الحالية <span style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;font-size:9px;color:#94a3b8;">Médicaments</span></div>
      <div class="field-line"></div>
    </div>
  </div>

  <!-- Notes additionnelles -->
  <div class="sec-title" style="direction:rtl;flex-direction:row-reverse;">
    <span>ملاحظات إضافية</span> 📝
    <span style="margin-right:auto;font-family:'Plus Jakarta Sans',Arial;font-size:10px;direction:ltr;">Notes additionnelles</span>
  </div>
  <div class="field" style="text-align:right;">
    <div class="field-line-tall" style="min-height:70px;"></div>
  </div>

  <!-- Consent AR + Signature -->
  <div class="consent consent-ar" style="margin-top:14px;">
    <strong>الموافقة :</strong> أوافق على تسجيل واستخدام بياناتي الشخصية والطبية من قِبَل عيادة الأسنان لأغراض الرعاية الطبية حصراً، وفقاً للتشريعات المعمول بها.
    <div style="font-family:'Plus Jakarta Sans',Arial;direction:ltr;margin-top:4px;font-size:10px;color:#94a3b8;">Consentement de traitement des données personnelles conformément à la réglementation en vigueur.</div>
  </div>

  <div class="sign-row" style="direction:rtl;">
    <div class="sign-box" style="text-align:right;">
      <div class="sign-label">توقيع المريض</div>
      <div class="sign-line" style="direction:rtl;">الاسم والتوقيع</div>
    </div>
    <div class="sign-box" style="text-align:right;">
      <div class="sign-label">خاتم وتوقيع الطبيب</div>
      <div class="sign-line" style="direction:rtl;">د. ___________________________</div>
    </div>
  </div>

</div>

<script>
  // Auto-focus print dialog after short delay
  setTimeout(() => { if(!window.location.href.includes('noprint')) window.print(); }, 800);
</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) {
        showToast('Veuillez autoriser les pop-ups pour ce site', 'warning');
        return;
    }
    win.document.write(html);
    win.document.close();
    document.getElementById('modalFormPatient').classList.remove('modal-open');
}

// ════════════════════════════════════════════════════════════════
// FICHE PATIENT PDF — PRÉ-REMPLIE AVEC DONNÉES + SCHÉMA DENTAIRE
// ════════════════════════════════════════════════════════════════
async function imprimerFichePatient(patientId) {
    if (!patientId) return;

    // Chercher le patient
    let p = patients.find(x => x.id_patient === patientId);
    if (!p) {
        try {
            const r = await fetch(`${API_URL}/patients/${patientId}`);
            p = await r.json();
        } catch(e) { showToast('❌ Patient introuvable', 'error'); return; }
    }

    // Charger conditions dentaires
    let dental = {};
    try {
        const dr = await fetch(`${API_URL}/schema-dentaire/${patientId}`, { headers: _authHeaders() });
        if (dr.ok) {
            const dj = await dr.json();
            if (dj.success && dj.data) dj.data.forEach(row => { dental[row.numero_dent] = row.etat; });
        }
    } catch(e) {}

    // Charger RDV du patient
    let rdvList = [];
    try {
        const rr = await fetch(`${API_URL}/rdv?patient_id=${patientId}`, { headers: _authHeaders() });
        if (rr.ok) rdvList = await rr.json();
    } catch(e) {}

    // Calcul âge
    let age = '';
    if (p.date_naissance) {
        const d = new Date(p.date_naissance);
        age = Math.floor((new Date()-d)/(365.25*24*3600*1000)) + ' ans';
    }

    const fmt = d => d ? String(d).split('T')[0].split('-').reverse().join('/') : '';
    const cabinet = localStorage.getItem('dentipro_cabinet') || 'Cabinet Dentaire DentiPro';

    // Générer SVG schéma dentaire 32 dents adulte (compact, A4)
    const ETAT_COLORS = {
        saine:            { fill:'#F5F0E8', stroke:'#D4B896', label:'' },
        carie:            { fill:'#FDE68A', stroke:'#F59E0B', label:'C' },
        bridge:           { fill:'#A7F3D0', stroke:'#059669', label:'B' },
        couronne:         { fill:'#DDD6FE', stroke:'#8B5CF6', label:'Co' },
        extraction:       { fill:'#FCA5A5', stroke:'#EF4444', label:'Ex' },
        traitement_canal: { fill:'#FED7AA', stroke:'#F97316', label:'TC' },
        absente:          { fill:'rgba(200,200,200,0.3)', stroke:'#CBD5E1', label:'Ab' },
        implant:          { fill:'#E5E7EB', stroke:'#9CA3AF', label:'Im' },
    };

    // Build SVG — arc buccal simplifié, 16 dents haut / 16 bas
    // Numérotation FDI: Q1=11-18(droite sup), Q2=21-28(gauche sup), Q3=31-38(gauche inf), Q4=41-48(droite inf)
    function buildDentalSVG() {
        const W = 620, H = 220;
        const teeth = [
            // Upper right Q1 (left→center on page): 18,17,16,15,14,13,12,11
            { n:18,x:28  }, { n:17,x:66  }, { n:16,x:104 }, { n:15,x:140 }, { n:14,x:175 }, { n:13,x:209 }, { n:12,x:240 }, { n:11,x:268 },
            // Upper left Q2 (center→right): 21,22,23,24,25,26,27,28
            { n:21,x:302 }, { n:22,x:332 }, { n:23,x:361 }, { n:24,x:393 }, { n:25,x:428 }, { n:26,x:463 }, { n:27,x:498 }, { n:28,x:534 },
        ];
        const teethLow = [
            // Lower right Q4: 48,47,46,45,44,43,42,41
            { n:48,x:28  }, { n:47,x:66  }, { n:46,x:104 }, { n:45,x:140 }, { n:44,x:175 }, { n:43,x:209 }, { n:42,x:240 }, { n:41,x:268 },
            // Lower left Q3: 31,32,33,34,35,36,37,38
            { n:31,x:302 }, { n:32,x:332 }, { n:33,x:361 }, { n:34,x:393 }, { n:35,x:428 }, { n:36,x:463 }, { n:37,x:498 }, { n:38,x:534 },
        ];

        const WIDTHS = {11:22,12:20,13:20,14:20,15:21,16:26,17:26,18:24,
                       21:22,22:20,23:20,24:20,25:21,26:26,27:26,28:24,
                       41:22,42:20,43:20,44:20,45:21,46:26,47:26,48:24,
                       31:22,32:20,33:20,34:20,35:21,36:26,37:26,38:24};

        function toothRect(n, x, yTop, h) {
            const etat = dental[n] || 'saine';
            const col  = ETAT_COLORS[etat] || ETAT_COLORS.saine;
            const w    = WIDTHS[n] || 22;
            const lbl  = col.label;
            const cx   = x + w/2;
            return `<g>
                <rect x="${x}" y="${yTop}" width="${w}" height="${h}" rx="4"
                      fill="${col.fill}" stroke="${col.stroke}" stroke-width="1.5"/>
                ${lbl ? `<text x="${cx}" y="${yTop+h/2+4}" text-anchor="middle" font-size="7" font-weight="800" fill="${col.stroke}" font-family="Arial">${lbl}</text>` : ''}
                <text x="${cx}" y="${yTop+h+10}" text-anchor="middle" font-size="7" fill="#64748b" font-family="Arial">${n}</text>
            </g>`;
        }

        let rects = '';
        teeth.forEach(t => { rects += toothRect(t.n, t.x, 18, 38); });
        teethLow.forEach(t => { rects += toothRect(t.n, t.x, H-56, 38); });

        // Légende des états présents
        const etatsPresents = [...new Set(Object.values(dental))].filter(e => e !== 'saine');
        let legend = '';
        if (etatsPresents.length > 0) {
            legend = `<g transform="translate(10,${H-14})">`;
            etatsPresents.forEach((e, i) => {
                const col = ETAT_COLORS[e] || ETAT_COLORS.saine;
                legend += `<rect x="${i*75}" y="0" width="12" height="10" rx="2" fill="${col.fill}" stroke="${col.stroke}" stroke-width="1"/>`;
                legend += `<text x="${i*75+16}" y="9" font-size="8" fill="#475569" font-family="Arial">${e.replace('_',' ')}</text>`;
            });
            legend += `</g>`;
        }

        return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;max-height:220px;">
            <text x="14" y="12" font-size="8" font-weight="700" fill="#94a3b8" font-family="Arial" text-anchor="middle">D</text>
            <text x="606" y="12" font-size="8" font-weight="700" fill="#94a3b8" font-family="Arial" text-anchor="middle">G</text>
            <line x1="${W/2}" y1="0" x2="${W/2}" y2="${H-20}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,4"/>
            <line x1="10" y1="${H/2-6}" x2="${W-10}" y2="${H/2-6}" stroke="#e2e8f0" stroke-width="1" stroke-dasharray="4,4"/>
            ${rects}
            ${legend}
        </svg>`;
    }

    // Dernier RDV
    const dernierRdv = rdvList.length > 0 ? rdvList[rdvList.length-1] : null;
    const prochainRdv = rdvList.find(r => new Date(r.date_rdv) >= new Date() && r.statut !== 'Annule');

    const hasDental = Object.keys(dental).length > 0;

    const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Fiche — ${p.nom} ${p.prenom}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Plus Jakarta Sans',Arial,sans-serif;background:#fff;color:#1e293b;font-size:13px}
  @media print{.no-print{display:none!important};body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  .page{width:210mm;min-height:297mm;padding:12mm 14mm;margin:0 auto;background:#fff}
  .header{display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:3px solid #2563eb;margin-bottom:16px}
  .logo{font-size:20px;font-weight:900;color:#2563eb}.logo span{color:#7c3aed}
  .patient-id{text-align:center}.patient-id-name{font-size:18px;font-weight:900;letter-spacing:-.4px;color:#1e293b}
  .patient-id-sub{font-size:11px;color:#64748b;margin-top:2px}
  .date-box{text-align:right;font-size:11px;color:#94a3b8}.date-box strong{display:block;font-size:12px;font-weight:700;color:#1e293b}
  .avatar{width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#7c3aed);color:#fff;font-size:22px;font-weight:900;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .top-hero{display:flex;align-items:center;gap:14px;background:linear-gradient(135deg,#f8fafc,#eff6ff);border:1px solid #e2e8f0;border-radius:12px;padding:14px 18px;margin-bottom:14px}
  .hero-info{flex:1}
  .hero-name{font-size:20px;font-weight:900;color:#1e293b;letter-spacing:-.4px}
  .hero-meta{font-size:12px;color:#64748b;margin-top:3px;display:flex;gap:10px;flex-wrap:wrap}
  .badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700}
  .badge-blue{background:#dbeafe;color:#1d4ed8}.badge-green{background:#dcfce7;color:#15803d}
  .badge-orange{background:#ffedd5;color:#c2410c}.badge-purple{background:#ede9fe;color:#7c3aed}
  .section-title{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.9px;color:#fff;background:linear-gradient(135deg,#2563eb,#7c3aed);padding:5px 12px;border-radius:20px;margin:12px 0 8px;display:inline-flex;align-items:center;gap:6px}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
  .field{display:flex;flex-direction:column;gap:2px}
  .field-lbl{font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#94a3b8}
  .field-val{font-size:13px;font-weight:600;color:#1e293b;padding:5px 8px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;min-height:28px}
  .field-val.empty{color:#cbd5e1}
  .field-val-tall{font-size:12px;font-weight:500;color:#1e293b;padding:7px 9px;background:#f8fafc;border-radius:6px;border:1px solid #e2e8f0;min-height:54px;white-space:pre-wrap}
  .dental-wrap{border:1px solid #e2e8f0;border-radius:10px;padding:10px;background:#fafbfc;margin-bottom:6px;overflow:hidden}
  .dental-no-data{text-align:center;color:#94a3b8;font-size:12px;padding:20px;border:1.5px dashed #e2e8f0;border-radius:8px;font-style:italic}
  .rdv-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:4px}
  .rdv-table th{padding:6px 10px;background:#f1f5f9;font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:.7px;color:#64748b;border-bottom:2px solid #e2e8f0;text-align:left}
  .rdv-table td{padding:7px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}
  .rdv-table tr:last-child td{border-bottom:none}
  .statut-pill{display:inline-block;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
  .st-prevu{background:#dbeafe;color:#1d4ed8}.st-termine{background:#dcfce7;color:#15803d}
  .st-annule{background:#fee2e2;color:#b91c1c}.st-encours{background:#fef9c3;color:#a16207}
  .sign-row{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:16px}
  .sign-box{padding-top:32px;border-top:1.5px solid #cbd5e1}
  .sign-lbl{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px}
  .no-print{position:fixed;top:14px;right:14px;display:flex;gap:8px;z-index:999}
  .btn-p{padding:9px 18px;background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  .btn-c{padding:9px 14px;background:#64748b;color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
  .info-pill{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;background:#f1f5f9;border-radius:20px;font-size:11px;font-weight:600;color:#475569}
</style>
</head>
<body>
<div class="no-print">
  <button class="btn-p" onclick="window.print()">🖨️ Imprimer / PDF</button>
  <button class="btn-c" onclick="window.close()">✕ Fermer</button>
</div>

<div class="page">

  <!-- Header -->
  <div class="header">
    <div>
      <div class="logo">Denti<span>Pro</span></div>
      <div style="font-size:11px;color:#64748b;margin-top:1px;">${cabinet}</div>
    </div>
    <div class="patient-id">
      <div class="patient-id-name">FICHE PATIENT</div>
      <div class="patient-id-sub">N° ${p.id_patient || '—'} · Confidentiel</div>
    </div>
    <div class="date-box">
      Imprimé le
      <strong>${new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'long',year:'numeric'})}</strong>
    </div>
  </div>

  <!-- Hero identité -->
  <div class="top-hero">
    <div class="avatar">${((p.nom||'?')[0]+(p.prenom||'')[0]).toUpperCase()}</div>
    <div class="hero-info">
      <div class="hero-name">${p.nom||''} ${p.prenom||''}</div>
      <div class="hero-meta">
        ${age ? `<span class="info-pill">🎂 ${age}</span>` : ''}
        ${p.sexe ? `<span class="info-pill">👤 ${p.sexe}</span>` : ''}
        ${p.type_patient ? `<span class="badge ${p.type_patient==='enfant'?'badge-orange':'badge-blue'}">${p.type_patient}</span>` : ''}
        ${p.type_assurance && p.type_assurance!=='Aucune' ? `<span class="badge badge-green">${p.type_assurance}</span>` : ''}
        ${p.telephone ? `<span class="info-pill">📞 ${p.telephone}</span>` : ''}
      </div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Créé le</div>
      <div style="font-size:13px;font-weight:700;color:#1e293b;margin-top:2px;">${fmt(p.created_at)}</div>
    </div>
  </div>

  <!-- Section infos personnelles -->
  <div class="section-title">👤 Informations personnelles</div>
  <div class="grid3" style="margin-bottom:10px;">
    <div class="field">
      <div class="field-lbl">Nom complet</div>
      <div class="field-val">${p.nom||''} ${p.prenom||''}</div>
    </div>
    <div class="field">
      <div class="field-lbl">Date de naissance</div>
      <div class="field-val">${fmt(p.date_naissance) || '—'}</div>
    </div>
    <div class="field">
      <div class="field-lbl">CIN / Passeport</div>
      <div class="field-val">${p.cnie||'—'}</div>
    </div>
    <div class="field">
      <div class="field-lbl">Téléphone</div>
      <div class="field-val">${p.telephone||'—'}</div>
    </div>
    <div class="field">
      <div class="field-lbl">Email</div>
      <div class="field-val">${p.email||'—'}</div>
    </div>
    <div class="field">
      <div class="field-lbl">Ville</div>
      <div class="field-val">${p.ville||'—'}${p.pays && p.pays!=='Maroc' ? ', '+p.pays : ''}</div>
    </div>
  </div>

  <!-- Section médicale -->
  <div class="section-title">🩺 Informations médicales</div>
  <div class="grid3" style="margin-bottom:10px;">
    <div class="field">
      <div class="field-lbl">Assurance</div>
      <div class="field-val">${p.type_assurance && p.type_assurance!=='Aucune' ? p.type_assurance : 'Aucune'}</div>
    </div>
    <div class="field">
      <div class="field-lbl">N° immatriculation</div>
      <div class="field-val">${p.numero_immatriculation||'—'}</div>
    </div>
    <div class="field">
      <div class="field-lbl">Type patient</div>
      <div class="field-val">${p.type_patient||'adulte'}</div>
    </div>
  </div>
  <div class="grid2" style="margin-bottom:10px;">
    <div class="field">
      <div class="field-lbl">Antécédents médicaux</div>
      <div class="field-val-tall">${p.antecedents_medicaux||'Aucun'}</div>
    </div>
    <div class="field">
      <div class="field-lbl">Allergies</div>
      <div class="field-val-tall">${p.allergies||'Aucune'}</div>
    </div>
  </div>
  ${p.notes ? `<div class="field" style="margin-bottom:10px;">
    <div class="field-lbl">Notes</div>
    <div class="field-val-tall">${p.notes}</div>
  </div>` : ''}

  <!-- Section schéma dentaire -->
  <div class="section-title">🦷 Schéma dentaire</div>
  ${hasDental ? `
  <div class="dental-wrap">
    ${buildDentalSVG()}
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
    ${Object.entries(ETAT_COLORS).filter(([k])=>k!=='saine').map(([k,v])=>{
      const count = Object.values(dental).filter(e=>e===k).length;
      return count > 0 ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:20px;background:${v.fill};color:${v.stroke};border:1px solid ${v.stroke};font-size:11px;font-weight:700;">${k.replace('_',' ')} × ${count}</span>` : '';
    }).join('')}
  </div>` : `<div class="dental-no-data">Aucun état dentaire enregistré pour ce patient</div>`}

  <!-- Section rendez-vous -->
  <div class="section-title">📅 Historique des rendez-vous</div>
  ${rdvList.length > 0 ? `
  <table class="rdv-table">
    <thead><tr>
      <th>Date</th><th>Heure</th><th>Motif</th><th>Dents</th><th>Statut</th>
    </tr></thead>
    <tbody>
      ${rdvList.slice(-10).reverse().map(r => {
        const st = r.statut||'';
        const cls = st==='Termine'||st==='Terminé' ? 'st-termine'
                  : st==='Annule'||st==='Annulé'   ? 'st-annule'
                  : st==='En cours'                 ? 'st-encours'
                  : 'st-prevu';
        return `<tr>
          <td style="font-weight:600;">${fmt(r.date_rdv)}</td>
          <td>${(r.heure_rdv||'—').slice(0,5)}</td>
          <td>${r.motif||'—'}</td>
          <td style="font-size:11px;color:#64748b;">${r.dent||'—'}</td>
          <td><span class="statut-pill ${cls}">${r.statut||'—'}</span></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table>` : '<div style="text-align:center;color:#94a3b8;font-size:12px;padding:14px;border:1px dashed #e2e8f0;border-radius:8px;">Aucun rendez-vous enregistré</div>'}

  <!-- Signatures -->
  <div class="sign-row" style="margin-top:20px;">
    <div class="sign-box">
      <div class="sign-lbl">Signature du patient</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">${p.nom} ${p.prenom}</div>
    </div>
    <div class="sign-box">
      <div class="sign-lbl">Cachet et signature du médecin</div>
      <div style="font-size:11px;color:#94a3b8;margin-top:4px;">Dr. ___________________________</div>
    </div>
  </div>

</div>

<script>setTimeout(()=>window.print(),600);</script>
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { showToast('⚠️ Autorisez les pop-ups pour imprimer', 'warning'); return; }
    win.document.write(html);
    win.document.close();
}


// ════════════════════════════════════════════════════════════════
// RÔLES — secretaire vs dentiste (dashboard alternatif)
// ════════════════════════════════════════════════════════════════
function applyRoleExtended(role) {
    const isSec = (role === 'secretaire');
    // Charger contenu alternatif secrétaire
    if (isSec) {
        chargerAgendaSemaineSec();
        chargerSalleApercu();
        // Update KPI salle attente
        const el = document.getElementById('salleAttenteKpi');
        if (el) fetch(`${API_URL}/salle-attente`).then(r=>r.json())
            .then(d => { if(el) el.textContent = Array.isArray(d)?d.length:0; }).catch(()=>{});
    }
    // Update facturesImpayees KPI (both roles)
    fetch(`${API_URL}/factures`).then(r=>r.json()).then(all => {
        const n = Array.isArray(all) ? all.filter(f=>f.statut==='Impayee').length : 0;
        const el = document.getElementById('facturesImpayeesKpi');
        if(el) el.textContent = n;
    }).catch(()=>{});
}

async function chargerAgendaSemaineSec() {
    const box = document.getElementById('secAgendaSemaine');
    if (!box) return;
    try {
        const res = await fetch(`${API_URL}/rdv`);
        const all = await res.json();
        const today = new Date(); today.setHours(0,0,0,0);
        const week  = new Date(today); week.setDate(week.getDate()+7);
        const rdvs  = Array.isArray(all) ? all.filter(r => {
            const d = new Date(r.date_rdv); return d >= today && d <= week;
        }).slice(0,6) : [];
        if (!rdvs.length) { box.innerHTML='<div class="db-empty">Aucun RDV cette semaine</div>'; return; }
        const COLORS = ['#2563eb','#7c3aed','#10b981','#f59e0b','#ef4444','#06b6d4'];
        box.innerHTML = rdvs.map((r,i) => {
            const d = new Date(r.date_rdv);
            const label = d.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'});
            const initials = ((r.nom||'')[0]+(r.prenom||'')[0]).toUpperCase();
            return `<div class="db-rdv-item">
                <div class="db-rdv-time">${(r.heure_rdv||'--:--').slice(0,5)}</div>
                <div class="db-rdv-avatar" style="background:${COLORS[i%COLORS.length]}">${initials}</div>
                <div class="db-rdv-info">
                    <div class="db-rdv-name">${r.nom} ${r.prenom}</div>
                    <div class="db-rdv-motif">${label} · ${r.motif||'-'}</div>
                </div>
            </div>`;
        }).join('');
    } catch(e) { box.innerHTML='<div class="db-empty">Erreur chargement</div>'; }
}

async function chargerSalleApercu() {
    const box = document.getElementById('secSalleApercu');
    if (!box) return;
    try {
        const res = await fetch(`${API_URL}/salle-attente`);
        const all = await res.json();
        if (!Array.isArray(all)||!all.length) { box.innerHTML='<div class="db-empty">Salle d\'attente vide</div>'; return; }
        box.innerHTML = all.slice(0,5).map((p,i) => {
            const initials = ((p.nom||'')[0]+(p.prenom||'')[0]).toUpperCase();
            return `<div class="db-rdv-item">
                <div class="db-rdv-avatar" style="background:#10b981">${initials}</div>
                <div class="db-rdv-info">
                    <div class="db-rdv-name">${p.nom} ${p.prenom}</div>
                    <div class="db-rdv-motif">Ticket n°${p.numero_ticket||i+1}</div>
                </div>
                <span class="db-rdv-status db-status-prevu">En attente</span>
            </div>`;
        }).join('');
    } catch(e) {}
}

// ════════════════════════════════════════════════════════════════
// AGENDA — MODAL RDV AU CLIC SUR UN CRÉNEAU
// ════════════════════════════════════════════════════════════════
function ouvrirModalAgendaRdv(dateStr, heure) {
    // Remplir les patients dans le select
    const sel = document.getElementById('agendaRdvPatient');
    if (sel && sel.options.length <= 1) {
        patients.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id_patient;
            opt.textContent = `${p.nom} ${p.prenom}`;
            sel.appendChild(opt);
        });
    }
    // Pré-remplir date + heure
    if (document.getElementById('agendaRdvDate')) document.getElementById('agendaRdvDate').value = dateStr;
    const hh = String(heure).padStart(2,'0');
    if (document.getElementById('agendaRdvHeure')) document.getElementById('agendaRdvHeure').value = `${hh}:00`;
    // Label lisible
    const d = new Date(dateStr + 'T00:00:00');
    const dayLabel = d.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
    const lbl = document.getElementById('agendaRdvSlotLabel');
    if (lbl) lbl.textContent = `${dayLabel} à ${hh}h00`;
    document.getElementById('modalAgendaRdv').classList.add('modal-open');
    document.body.style.overflow='hidden';
}

async function soumettreAgendaRdv(e) {
    e.preventDefault();
    const patientId = document.getElementById('agendaRdvPatient').value;
    const date      = document.getElementById('agendaRdvDate').value;
    const heure     = document.getElementById('agendaRdvHeure').value;
    const motif     = document.getElementById('agendaRdvMotif').value;
    const statut    = document.getElementById('agendaRdvStatut').value;
    if (!patientId || !date || !heure || !motif) { showToast('Remplissez tous les champs', 'warning'); return; }
    try {
        const res  = await fetch(`${API_URL}/rdv`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ id_patient:patientId, date_rdv:date, heure_rdv:heure, motif, statut })
        });
        const data = await res.json();
        if (data.success || data.id_rdv) {
            showToast('✅ RDV créé !', 'success');
            document.getElementById('modalAgendaRdv').classList.remove('modal-open');
            document.body.style.overflow='';
            document.getElementById('agendaRdvForm').reset();
            buildAgenda(); chargerRdvAgenda(); chargerRdv();
        } else { showToast('❌ '+(data.error||data.message||'Erreur'), 'error'); }
    } catch(err) { showToast('❌ Erreur réseau', 'error'); }
}

// ════════════════════════════════════════════════════════════════
// MODAL PATIENT — CRÉER / MODIFIER
// ════════════════════════════════════════════════════════════════
function ouvrirModalNouveauPatient(patientId) {
    const isEdit = !!patientId;
    document.getElementById('modalPatientId').value = patientId || '';
    document.getElementById('modalPatientTitre').textContent = isEdit ? '✏️ Modifier le patient' : '➕ Nouveau patient';
    document.getElementById('modalPatientSub').textContent = isEdit ? 'Modifiez les informations' : 'Remplissez les informations du patient';
    document.getElementById('modalPatientBtn').textContent = isEdit ? '✅ Enregistrer les modifications' : '✅ Ajouter le patient';
    document.getElementById('modalPatientAvatar').textContent = '👤';
    document.getElementById('modalPatientAvatar').innerHTML = '👤';

    if (isEdit) {
        const p = patients.find(x => x.id_patient === patientId);
        if (p) {
            document.getElementById('mpNom').value          = p.nom||'';
            document.getElementById('mpPrenom').value       = p.prenom||'';
            document.getElementById('mpSexe').value         = p.sexe||'';
            document.getElementById('mpTelephone').value    = p.telephone||'';
            document.getElementById('mpCnie').value         = p.cnie||'';
            document.getElementById('mpDate').value         = (p.date_naissance||'').split('T')[0];
            document.getElementById('mpVille').value        = p.ville||'';
            document.getElementById('mpEmail').value        = p.email||'';
            document.getElementById('mpTypePatient').value  = p.type_patient||'adulte';
            document.getElementById('mpTypeAssurance').value= p.type_assurance||'Aucune';
            document.getElementById('mpImmat').value        = p.numero_immatriculation||'';
            document.getElementById('mpAntecedents').value  = p.antecedents_medicaux||'';
            document.getElementById('mpAllergies').value    = p.allergies||'';
            toggleMpImmat();
            updateModalPatientAvatar();
        }
    } else {
        document.getElementById('modalPatientForm').reset();
    }
    document.getElementById('modalNouveauPatient').classList.add('modal-open');
    document.body.style.overflow='hidden';
}

function fermerModalPatient() {
    document.getElementById('modalNouveauPatient').classList.remove('modal-open');
    document.body.style.overflow='';
}

function toggleMpImmat() {
    const v = document.getElementById('mpTypeAssurance').value;
    const el = document.getElementById('mpImmat');
    if (el) el.style.display = (v && v!=='Aucune') ? 'block' : 'none';
}

function updateModalPatientAvatar() {
    const sexe = document.getElementById('mpSexe')?.value;
    const av = document.getElementById('modalPatientAvatar');
    if (!av) return;
    av.classList.remove('avatar-pop');
    void av.offsetWidth; // reflow for animation restart
    if (sexe === 'Masculin') {
        av.innerHTML = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
            <defs><radialGradient id="mBg" cx="50%" cy="30%" r="70%"><stop offset="0%" stop-color="#3b82f6"/><stop offset="100%" stop-color="#1e40af"/></radialGradient></defs>
            <circle cx="32" cy="32" r="32" fill="url(#mBg)"/>
            <path d="M10 64 Q10 46 22 42 L32 47 L42 42 Q54 46 54 64Z" fill="#dbeafe" opacity=".95"/>
            <ellipse cx="32" cy="27" rx="13" ry="15" fill="#fcd9b6"/>
            <path d="M19 20 Q19 9 32 8 Q45 9 45 20 Q45 13 32 12 Q19 13 19 20Z" fill="#1e293b"/>
            <ellipse cx="27" cy="29" rx="2" ry="2.3" fill="#1e293b"/>
            <ellipse cx="37" cy="29" rx="2" ry="2.3" fill="#1e293b"/>
            <circle cx="27.8" cy="28" r=".8" fill="white"/>
            <circle cx="37.8" cy="28" r=".8" fill="white"/>
            <path d="M27 36 Q32 41 37 36" fill="none" stroke="#c2773a" stroke-width="1.8" stroke-linecap="round"/>
            <path d="M22 41 Q27 44 32 43 Q37 44 42 41 Q40 48 32 48 Q24 48 22 41Z" fill="#93c5fd" opacity=".7"/>
        </svg>`;
        av.style.background='linear-gradient(135deg,#2563eb,#1d4ed8)';
    } else if (sexe === 'Féminin') {
        av.innerHTML = `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%">
            <defs><radialGradient id="fBg" cx="50%" cy="30%" r="70%"><stop offset="0%" stop-color="#ec4899"/><stop offset="100%" stop-color="#be185d"/></radialGradient></defs>
            <circle cx="32" cy="32" r="32" fill="url(#fBg)"/>
            <path d="M10 64 Q10 46 22 42 L32 47 L42 42 Q54 46 54 64Z" fill="#fce7f3" opacity=".95"/>
            <path d="M19 43 Q22 48 32 48 Q42 48 45 43 Q42 46 32 46 Q22 46 19 43Z" fill="#f9a8d4" opacity=".8"/>
            <ellipse cx="32" cy="27" rx="13" ry="15" fill="#fcd9b6"/>
            <path d="M19 18 Q18 33 20 43 Q22 37 19 18Z" fill="#92400e"/>
            <path d="M45 18 Q46 33 44 43 Q42 37 45 18Z" fill="#92400e"/>
            <path d="M19 18 Q19 8 32 7 Q45 8 45 18 Q45 12 32 11 Q19 12 19 18Z" fill="#92400e"/>
            <ellipse cx="27" cy="29" rx="2" ry="2.3" fill="#1e293b"/>
            <ellipse cx="37" cy="29" rx="2" ry="2.3" fill="#1e293b"/>
            <circle cx="27.8" cy="28" r=".8" fill="white"/>
            <circle cx="37.8" cy="28" r=".8" fill="white"/>
            <ellipse cx="27" cy="33" rx="3" ry="1.5" fill="#f9a8d4" opacity=".5"/>
            <ellipse cx="37" cy="33" rx="3" ry="1.5" fill="#f9a8d4" opacity=".5"/>
            <path d="M27 36 Q32 40 37 36" fill="none" stroke="#c2773a" stroke-width="1.8" stroke-linecap="round"/>
        </svg>`;
        av.style.background='linear-gradient(135deg,#ec4899,#be185d)';
    } else {
        av.innerHTML = '👤';
        av.style.background='linear-gradient(135deg,#2563eb,#7c3aed)';
    }
    av.classList.add('avatar-pop');
}

async function soumettreModalPatient(e) {
    e.preventDefault();
    const id = document.getElementById('modalPatientId').value;
    const isEdit = !!id;
    const data = {
        nom:                   document.getElementById('mpNom').value,
        prenom:                document.getElementById('mpPrenom').value,
        sexe:                  document.getElementById('mpSexe').value,
        telephone:             document.getElementById('mpTelephone').value,
        cnie:                  document.getElementById('mpCnie').value,
        date_naissance:        document.getElementById('mpDate').value,
        ville:                 document.getElementById('mpVille').value,
        email:                 document.getElementById('mpEmail').value,
        type_patient:          document.getElementById('mpTypePatient').value,
        type_assurance:        document.getElementById('mpTypeAssurance').value,
        numero_immatriculation:document.getElementById('mpImmat').value,
        antecedents_medicaux:  document.getElementById('mpAntecedents').value,
        allergies:             document.getElementById('mpAllergies').value,
    };
    try {
        const url    = isEdit ? `${API_URL}/patients/${id}` : `${API_URL}/patients`;
        const method = isEdit ? 'PUT' : 'POST';
        const res    = await fetch(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(data) });
        const json   = await res.json();
        if (json.success || json.id_patient) {
            showToast(isEdit ? '✅ Patient modifié !' : '✅ Patient ajouté !', 'success');
            fermerModalPatient();
            await chargerPatients();
        } else { showToast('❌ '+(json.error||json.message||'Erreur'), 'error'); }
    } catch(err) { showToast('❌ Erreur réseau', 'error'); }
}

// ════════════════════════════════════════════════════════════════
// MODAL FACTURE — CRÉER
// ════════════════════════════════════════════════════════════════
let mfLignesCount = 0;

function ouvrirModalNouvelleFacture() {
    // Populate patient select
    const sel = document.getElementById('mfPatient');
    if (sel) {
        while(sel.options.length>1) sel.remove(1);
        patients.forEach(p => {
            const opt = new Option(`${p.nom} ${p.prenom}`, p.id_patient);
            sel.add(opt);
        });
    }
    // Set today
    const td = document.getElementById('mfDate');
    if (td) td.value = new Date().toISOString().split('T')[0];
    // Reset lignes
    mfLignesCount = 0;
    const box = document.getElementById('mfLignes');
    if (box) box.innerHTML = '';
    ajouterLigneMf();
    document.getElementById('mfTotal').textContent = '0 DH';
    document.getElementById('modalNouvelleFacture').classList.add('modal-open');
    document.body.style.overflow='hidden';
}

function ajouterLigneMf() {
    mfLignesCount++;
    const idx = mfLignesCount;
    const box = document.getElementById('mfLignes');
    if (!box) return;
    const div = document.createElement('div');
    div.className = 'mf-ligne';
    div.id = 'mfLigne_'+idx;
    div.innerHTML = `
        <input type="text" placeholder="Acte / Service" oninput="calculTotalMf()"
               id="mfDesc_${idx}" style="flex:2;min-width:160px;">
        <input type="number" placeholder="Qté" value="1" min="1"
               id="mfQte_${idx}" style="width:70px;" oninput="calculTotalMf()">
        <input type="number" placeholder="Prix (DH)" min="0" step="0.01"
               id="mfPrix_${idx}" style="width:110px;" oninput="calculTotalMf()">
        <button type="button" class="mf-remove" onclick="document.getElementById('mfLigne_${idx}').remove();calculTotalMf()">✕</button>
    `;
    box.appendChild(div);
}

function calculTotalMf() {
    let total = 0;
    document.querySelectorAll('[id^="mfQte_"]').forEach(q => {
        const idx  = q.id.split('_')[1];
        const prix = parseFloat(document.getElementById('mfPrix_'+idx)?.value||0);
        const qte  = parseFloat(q.value||1);
        total += prix * qte;
    });
    const el = document.getElementById('mfTotal');
    if (el) el.textContent = total.toFixed(2) + ' DH';
}

async function soumettreModalFacture(e) {
    e.preventDefault();
    const patientId = document.getElementById('mfPatient').value;
    const date      = document.getElementById('mfDate').value;
    const statut    = document.getElementById('mfStatut').value;
    const dent      = document.getElementById('mfDent')?.value||'';
    if (!patientId||!date) { showToast('Sélectionnez un patient et une date','warning'); return; }
    // Build details
    const details = [];
    document.querySelectorAll('[id^="mfDesc_"]').forEach(el => {
        const idx  = el.id.split('_')[1];
        const desc = el.value.trim();
        const qte  = parseFloat(document.getElementById('mfQte_'+idx)?.value||1);
        const prix = parseFloat(document.getElementById('mfPrix_'+idx)?.value||0);
        if (desc && prix>0) details.push({ description:desc, quantite:qte, prix_unitaire:prix });
    });
    if (!details.length) { showToast('Ajoutez au moins un service','warning'); return; }
    const montant_total = details.reduce((s,l) => s + l.quantite*l.prix_unitaire, 0);
    try {
        const uid = localStorage.getItem('userId') || 1;
        const res = await fetch(`${API_URL}/factures`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ id_patient:patientId, id_user: Number(uid), date_facture:date, statut, dent, montant_total, details })
        });
        const json = await res.json();
        if (json.success||json.id_facture) {
            showToast('✅ Facture créée !', 'success');
            document.getElementById('modalNouvelleFacture').classList.remove('modal-open');
            document.body.style.overflow='';
            await chargerFactures(); await chargerToutesFactures(); await chargerStatsPaiements();
        } else { showToast('❌ '+(json.error||json.message||'Erreur'),'error'); }
    } catch(err) { showToast('❌ Erreur réseau','error'); }
}

// ════════════════════════════════════════════════════════════════
// CHAT MÉDECIN ↔ SECRÉTAIRE — overrides existing chargerMessages
// ════════════════════════════════════════════════════════════════
// Override the chat to show role badges
const _origChargerMessages = chargerMessages;
chargerMessages = async function() {
    try {
        const userId = localStorage.getItem('userId');
        const res    = await fetch(`${API_URL}/chat`);
        const msgs   = await res.json();
        const box    = document.getElementById('chatMessages');
        if (!box) return;
        if (!msgs.length) { box.innerHTML = '<div class="chat-loading">Aucun message — commencez la conversation</div>'; return; }
        const origin = window.location.origin;
        const html = msgs.map(m => {
            const isMine = String(m.id_user) === String(userId);
            const time   = new Date(m.created_at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
            let furl = m.fichier_url || '';
            if (furl && furl.startsWith('/')) furl = origin + furl;
            const fileHtml = furl
                ? `<a href="${furl}" target="_blank" rel="noopener" class="chat-file-link">📎 ${(m.fichier_nom||'Fichier').replace(/</g,'')}</a>` : '';
            const roleClass = (m.role||'').toLowerCase().includes('dentiste') ? 'chat-role-dentiste' : 'chat-role-secretaire';
            const roleLabel = (m.role||'').toLowerCase().includes('dentiste') ? '🦷 Dentiste' : '📋 Secrétaire';
            return `<div class="chat-msg ${isMine?'mine':'other'}">
                ${!isMine ? `<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                    <span class="chat-msg-sender-role ${roleClass}">${roleLabel}</span>
                    <span style="font-size:11px;color:var(--text-3);font-weight:600;">${m.prenom||''} ${m.nom||''}</span>
                </div>` : ''}
                <div class="chat-msg-bubble">
                    ${m.message ? `<div>${m.message}</div>` : ''}
                    ${fileHtml}
                </div>
                <div class="chat-msg-meta">${time}</div>
            </div>`;
        }).join('');
        box.innerHTML = html;
        box.scrollTop = box.scrollHeight;
        if (!_chatOpen) {
            const unreadRes = await fetch(`${API_URL}/chat/unread/${userId}`).catch(()=>null);
            if (unreadRes) {
                const unreadD = await unreadRes.json().catch(()=>({count:0}));
                const badge   = document.getElementById('chatBadge');
                if (badge) { badge.textContent = unreadD.count||0; badge.style.display = (unreadD.count>0)?'inline':'none'; }
            }
        }
    } catch(e) { console.error('Chat error:', e); }
};

// ════════════════════════════════════════════════════════════════
// Recherche patient (suggestions) — risques, ordonnances, réutilisable
// ════════════════════════════════════════════════════════════════
const _pickerTimers = {};
function initPatientPicker(inputId, suggestId, hiddenId) {
    const inp = document.getElementById(inputId);
    const sug = document.getElementById(suggestId);
    if (!inp || !sug) return;
    if (inp.dataset.pickerInit === '1') return;
    inp.dataset.pickerInit = '1';
    inp.addEventListener('input', function() {
        clearTimeout(_pickerTimers[inputId]);
        _pickerTimers[inputId] = setTimeout(async () => {
            const q = inp.value.trim();
            sug.innerHTML = '';
            if (q.length < 1) { sug.classList.remove('open'); return; }
            try {
                const res = await fetch(`${API_URL}/patients/search/${encodeURIComponent(q)}`);
                const arr = await res.json();
                if (!arr.length) {
                    sug.innerHTML = '<div class="patient-suggest-item muted">Aucun patient</div>';
                    sug.classList.add('open');
                    return;
                }
                sug.innerHTML = arr.slice(0, 15).map(p => {
                    const lab = `${p.nom} ${p.prenom}`.replace(/"/g, '&quot;');
                    return `<button type="button" class="patient-suggest-item" data-id="${p.id_patient}" data-label="${lab}"><strong>${p.nom} ${p.prenom}</strong><span class="sub">${p.telephone || ''} ${p.cnie || ''}</span></button>`;
                }).join('');
                sug.classList.add('open');
                sug.querySelectorAll('button[data-id]').forEach(btn => {
                    btn.addEventListener('click', () => {
                        document.getElementById(hiddenId).value = btn.dataset.id;
                        inp.value = btn.dataset.label.replace(/&quot;/g, '"');
                        sug.innerHTML = '';
                        sug.classList.remove('open');
                    });
                });
            } catch (e) { sug.classList.remove('open'); }
        }, 220);
    });
    inp.addEventListener('blur', () => setTimeout(() => sug.classList.remove('open'), 280));
}

function renderPatientsRisqueTable() {
    const tb = document.getElementById('listePatientsRisque');
    if (!tb) return;
    const rows = _cacheRisques || [];
    if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;padding:20px;">Aucun facteur de risque enregistré</td></tr>';
        dpPaginationRender('paginationPatientsRisque', 'risques', 1, 1, 0);
        return;
    }
    const { page, totalPages } = dpEnsurePage('risques', rows.length);
    const slice = rows.slice((page - 1) * DP_PAGE_SIZE, page * DP_PAGE_SIZE);
    const labels = { diabete: 'Diabète', hypertension: 'Hypertension', allergie: 'Allergie', anticoagulant: 'Anticoagulant', cardio: 'Cardio', autre: 'Autre' };
    tb.innerHTML = slice.map(r => `<tr>
            <td><strong>${r.nom} ${r.prenom}</strong></td>
            <td>${r.telephone || '—'}</td>
            <td><span class="hist-badge" style="background:#fff7ed;color:#c2410c;">${labels[r.type_risque] || r.type_risque}</span></td>
            <td style="font-size:12px;color:var(--text-2);">${(r.detail || '—').replace(/</g,'')}</td>
            <td style="font-size:12px;">${formatDateCreation(r.created_at)}</td>
            <td><button type="button" class="sec-btn-ghost sec-btn-sm" onclick="supprimerPatientRisque(${r.id})">🗑️</button></td>
        </tr>`).join('');
    dpPaginationRender('paginationPatientsRisque', 'risques', page, totalPages, rows.length);
}

async function chargerPatientsRisque() {
    const tb = document.getElementById('listePatientsRisque');
    if (!tb) return;
    try {
        const res = await fetch(`${API_URL}/patient-risques`);
        const rows = await res.json();
        _cacheRisques = Array.isArray(rows) ? rows : [];
        _dpPage.risques = 1;
        renderPatientsRisqueTable();
    } catch (e) {
        _cacheRisques = [];
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#b91c1c;">Erreur chargement</td></tr>';
        dpPaginationRender('paginationPatientsRisque', 'risques', 1, 1, 0);
    }
}

async function ajouterPatientRisque() {
    const pid = document.getElementById('risquePatientId')?.value;
    const type_risque = document.getElementById('risqueType')?.value;
    const detail = document.getElementById('risqueDetail')?.value || '';
    if (!pid) { showToast('Choisissez un patient dans la liste', 'warning'); return; }
    try {
        const res = await fetch(`${API_URL}/patient-risques`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_patient: Number(pid), type_risque, detail })
        });
        const j = await res.json();
        if (j.success) {
            showToast('✅ Facteur de risque enregistré', 'success');
            document.getElementById('risqueDetail').value = '';
            chargerPatientsRisque();
        } else showToast(j.error || 'Erreur', 'error');
    } catch (e) { showToast('Erreur réseau', 'error'); }
}

async function supprimerPatientRisque(id) {
    if (!confirm('Supprimer ce facteur de risque ?')) return;
    try {
        await fetch(`${API_URL}/patient-risques/${id}`, { method: 'DELETE' });
        chargerPatientsRisque();
        showToast('Supprimé', 'success');
    } catch (e) { showToast('Erreur', 'error'); }
}

let _ordModelesCache = null;
async function apercuModeleOrdonnance() {
    const sel = document.getElementById('ordModele')?.value || 'extraction_simple';
    const ta = document.getElementById('ordContenu');
    if (!ta) return;
    try {
        if (!_ordModelesCache) {
            const r = await fetch(`${API_URL}/ordonnance-modeles`);
            _ordModelesCache = await r.json();
        }
        const m = _ordModelesCache.find(x => x.id === sel);
        ta.value = m ? m.contenu : '';
    } catch (e) { ta.value = ''; }
}

async function creerOrdonnance() {
    const pid = document.getElementById('ordPatientId')?.value;
    const modele = document.getElementById('ordModele')?.value;
    const contenu = document.getElementById('ordContenu')?.value || '';
    const uid = localStorage.getItem('userId') || 1;
    if (!pid) { showToast('Sélectionnez un patient', 'warning'); return; }
    if (!contenu.trim()) { showToast('Contenu vide', 'warning'); return; }
    try {
        const res = await fetch(`${API_URL}/ordonnances`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_patient: Number(pid), id_user: Number(uid), modele, contenu })
        });
        const j = await res.json();
        if (j.success && j.id) {
            showToast('✅ Ordonnance enregistrée', 'success');
            window.open(`${API_URL}/ordonnances/${j.id}/pdf`, '_blank');
            chargerOrdonnancesListe();
        } else showToast(j.error || 'Erreur', 'error');
    } catch (e) { showToast('Erreur réseau', 'error'); }
}

async function chargerOrdonnancesListe() {
    const tb = document.getElementById('listeOrdonnances');
    if (!tb) return;
    try {
        const res = await fetch(`${API_URL}/ordonnances`);
        const rows = await res.json();
        if (!rows.length) {
            tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">Aucune ordonnance</td></tr>';
            return;
        }
        tb.innerHTML = rows.map(o => `<tr>
            <td style="font-size:12px;">${formatDateCreation(o.created_at)}</td>
            <td><strong>${o.patient_nom} ${o.patient_prenom}</strong></td>
            <td>${(o.titre || o.modele || '').replace(/</g,'')}</td>
            <td>
                <a href="${API_URL}/ordonnances/${o.id}/pdf" target="_blank" class="sec-btn-ghost sec-btn-sm" style="text-decoration:none;">📄 PDF</a>
                <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="supprimerOrdonnance(${o.id})">🗑️</button>
            </td>
        </tr>`).join('');
    } catch (e) {
        tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#b91c1c;">Erreur</td></tr>';
    }
}

async function supprimerOrdonnance(id) {
    if (!confirm('Supprimer cette ordonnance ?')) return;
    await fetch(`${API_URL}/ordonnances/${id}`, { method: 'DELETE' });
    chargerOrdonnancesListe();
}

async function chargerStock() {
    const tb = document.getElementById('listeStock');
    if (!tb) return;
    try {
        const res = await fetch(`${API_URL}/stock`);
        const rows = await res.json();
        if (!rows.length) {
            tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Stock vide — ajoutez des articles</td></tr>';
            return;
        }
        tb.innerHTML = rows.map(s => {
            const alerte = Number(s.quantite) <= Number(s.seuil_alerte);
            return `<tr class="${alerte ? 'stock-alert-row' : ''}">
                <td><strong>${(s.nom || '').replace(/</g,'')}</strong></td>
                <td>${(s.reference || '—').replace(/</g,'')}</td>
                <td style="font-weight:800;color:${alerte ? '#b91c1c' : 'inherit'}">${s.quantite}</td>
                <td>${s.seuil_alerte}</td>
                <td>${s.unite || '—'}</td>
                <td style="white-space:nowrap;">
                    <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="ajusterStock(${s.id},1)">+1</button>
                    <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="ajusterStock(${s.id},-1)">−1</button>
                    <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="ajusterStock(${s.id},5)">+5</button>
                </td>
            </tr>`;
        }).join('');
    } catch (e) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#b91c1c;">Erreur stock</td></tr>';
    }
}

async function ajusterStock(id, delta) {
    try {
        const res = await fetch(`${API_URL}/stock/${id}/adjust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delta })
        });
        const j = await res.json();
        if (j.success) chargerStock();
    } catch (e) {}
}

async function ajouterStockArticle() {
    const nom = document.getElementById('stockNom')?.value?.trim();
    if (!nom) { showToast('Nom requis', 'warning'); return; }
    const body = {
        nom,
        reference: document.getElementById('stockRef')?.value || '',
        quantite: Number(document.getElementById('stockQte')?.value || 0),
        seuil_alerte: Number(document.getElementById('stockSeuil')?.value || 5),
        unite: document.getElementById('stockUnite')?.value || 'unité'
    };
    try {
        const res = await fetch(`${API_URL}/stock`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const j = await res.json();
        if (j.success) {
            showToast('Article ajouté', 'success');
            ['stockNom','stockRef'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            document.getElementById('stockQte').value = '0';
            chargerStock();
        } else showToast(j.error || 'Erreur', 'error');
    } catch (e) { showToast('Erreur', 'error'); }
}

// ════════════════════════════════════════════════════════════════
// NOTIFICATIONS — Toggle + Reset badge + addNotification
// ════════════════════════════════════════════════════════════════
let _notifications = [];

function addNotification(message, type = 'info') {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    _notifications.unshift({ message, type, time, id: Date.now() });
    if (_notifications.length > 30) _notifications.pop();

    // Mettre à jour le badge
    const badge = document.getElementById('notifBadge');
    if (badge) {
        badge.textContent = Math.min(_notifications.length, 99);
        badge.style.display = 'inline';
    }
    _renderNotifications();
}

function _renderNotifications() {
    const list = document.getElementById('notifList');
    if (!list) return;
    if (!_notifications.length) {
        list.innerHTML = '<p style="padding:14px;color:#888;text-align:center;font-size:13px;">Aucune notification</p>';
        return;
    }
    const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const colors = {
        success: 'rgba(16,185,129,.08)',
        error:   'rgba(239,68,68,.08)',
        warning: 'rgba(245,158,11,.08)',
        info:    'rgba(37,99,235,.08)'
    };
    list.innerHTML = _notifications.map(n => `
        <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);background:${colors[n.type]||colors.info};transition:.15s;">
            <span style="font-size:16px;flex-shrink:0;margin-top:1px;">${icons[n.type]||'ℹ️'}</span>
            <div style="flex:1;min-width:0;">
                <div style="font-size:13px;font-weight:600;color:var(--text);line-height:1.4;">${n.message}</div>
                <div style="font-size:11px;color:var(--text-3);margin-top:2px;">${n.time}</div>
            </div>
        </div>`).join('');
}

function toggleNotifications() {
    const dropdown = document.getElementById('notifDropdown');
    if (!dropdown) return;
    const isOpen = dropdown.classList.toggle('open');
    if (isOpen) {
        // Réinitialiser le badge à 0 dès l'ouverture
        const badge = document.getElementById('notifBadge');
        if (badge) badge.style.display = 'none';
        _renderNotifications();
    }
}

function effacerNotifications() {
    _notifications = [];
    _renderNotifications();
    const badge = document.getElementById('notifBadge');
    if (badge) badge.style.display = 'none';
}

// Fermer le dropdown si clic en dehors
document.addEventListener('click', function(e) {
    const dd = document.getElementById('notifDropdown');
    if (dd && dd.classList.contains('open')) {
        if (!e.target.closest('[onclick="toggleNotifications()"]') && !e.target.closest('#notifDropdown')) {
            dd.classList.remove('open');
        }
    }
});

// ════════════════════════════════════════════════════════════════
// RDV AUTO-STATUT — En cours / Terminé selon l'heure (automatique)
// L'annulation reste toujours manuelle
// ════════════════════════════════════════════════════════════════
async function _autoUpdateRdvStatuts() {
    const now    = new Date();
    const todayS = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Seulement les RDV d'aujourd'hui qui ne sont pas annulés
    const toUpdate = rdvs.filter(r => {
        const d = (r.date_rdv || '').split('T')[0];
        if (d !== todayS) return false;
        if (r.statut === 'Annule' || r.statut === 'Annulé') return false;
        return true;
    });

    for (const r of toUpdate) {
        if (!r.heure_rdv) continue;
        const [h, m] = r.heure_rdv.split(':').map(Number);
        const startMin = h * 60 + m;
        const endMin   = startMin + 30; // durée supposée : 30 min

        let newStatut = null;

        if (nowMin >= startMin && nowMin < endMin) {
            // Le RDV est en cours maintenant
            if (r.statut !== 'En cours') newStatut = 'En cours';
        } else if (nowMin >= endMin) {
            // Le RDV est terminé
            if (r.statut !== 'Termine' && r.statut !== 'Terminé') newStatut = 'Termine';
        }

        if (newStatut) {
            try {
                const res = await fetch(`${API_URL}/rdv/${r.id_rdv}`, {
                    method: 'PUT',
                    headers: _authHeaders(),
                    body: JSON.stringify({ ...r, statut: newStatut })
                });
                if (res.ok) {
                    r.statut = newStatut; // Mettre à jour localement
                    addNotification(
                        newStatut === 'En cours'
                            ? `🕐 RDV ${r.nom} ${r.prenom} — En cours`
                            : `✅ RDV ${r.nom} ${r.prenom} — Terminé`,
                        newStatut === 'En cours' ? 'info' : 'success'
                    );
                }
            } catch (e) { /* silencieux */ }
        }
    }

    // Refresh la liste si la section RDV est active
    const activeSection = document.querySelector('.section.active');
    if (activeSection && activeSection.id === 'rdv') {
        afficherRdvFiltre();
    }
    updateDashboardCounts(rdvs);
}

// Lancer le moteur auto-statut toutes les minutes
setInterval(_autoUpdateRdvStatuts, 60 * 1000);
// Premier appel 5 secondes après le chargement
setTimeout(_autoUpdateRdvStatuts, 5000);

// ════════════════════════════════════════════════════════════════
// ORDONNANCES — Pagination
// ════════════════════════════════════════════════════════════════

// Override chargerOrdonnancesListe pour ajouter la pagination
window.chargerOrdonnancesListe = async function() {
    const tb = document.getElementById('listeOrdonnances');
    if (!tb) return;
    try {
        const res = await fetch(`${API_URL}/ordonnances`);
        const rows = await res.json();
        _cacheOrdonnances = Array.isArray(rows) ? rows : [];
        _dpPage.ordonnances = 1;
        _renderOrdonnancesPage();
    } catch (e) {
        tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#b91c1c;">Erreur</td></tr>';
    }
};

function _renderOrdonnancesPage() {
    const tb = document.getElementById('listeOrdonnances');
    if (!tb) return;
    const rows = _cacheOrdonnances;
    if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;">Aucune ordonnance</td></tr>';
        dpPaginationRender('paginationOrdonnances', 'ordonnances', 1, 1, 0);
        return;
    }
    const { page, totalPages } = dpEnsurePage('ordonnances', rows.length);
    const slice = rows.slice((page - 1) * DP_PAGE_SIZE, page * DP_PAGE_SIZE);
    tb.innerHTML = slice.map(o => `<tr>
        <td style="font-size:12px;">${formatDateCreation(o.created_at)}</td>
        <td><strong>${o.patient_nom} ${o.patient_prenom}</strong></td>
        <td>${(o.titre || o.modele || '').replace(/</g,'')}</td>
        <td>
            <a href="${API_URL}/ordonnances/${o.id}/pdf" target="_blank" class="sec-btn-ghost sec-btn-sm" style="text-decoration:none;">📄 PDF</a>
            <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="supprimerOrdonnance(${o.id})">🗑️</button>
        </td>
    </tr>`).join('');
    dpPaginationRender('paginationOrdonnances', 'ordonnances', page, totalPages, rows.length);
}

// ════════════════════════════════════════════════════════════════
// STOCK — Pagination
// ════════════════════════════════════════════════════════════════

// Override chargerStock pour ajouter la pagination
window.chargerStock = async function() {
    const tb = document.getElementById('listeStock');
    if (!tb) return;
    try {
        const res = await fetch(`${API_URL}/stock`);
        const rows = await res.json();
        _cacheStock = Array.isArray(rows) ? rows : [];
        _dpPage.stock = 1;
        _renderStockPage();
    } catch (e) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#b91c1c;">Erreur stock</td></tr>';
    }
};

function _renderStockPage() {
    const tb = document.getElementById('listeStock');
    if (!tb) return;
    const rows = _cacheStock;
    if (!rows.length) {
        tb.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#888;">Stock vide — ajoutez des articles</td></tr>';
        dpPaginationRender('paginationStock', 'stock', 1, 1, 0);
        return;
    }
    const { page, totalPages } = dpEnsurePage('stock', rows.length);
    const slice = rows.slice((page - 1) * DP_PAGE_SIZE, page * DP_PAGE_SIZE);
    tb.innerHTML = slice.map(s => {
        const alerte = Number(s.quantite) <= Number(s.seuil_alerte);
        return `<tr class="${alerte ? 'stock-alert-row' : ''}">
            <td><strong>${(s.nom || '').replace(/</g,'')}</strong></td>
            <td>${(s.reference || '—').replace(/</g,'')}</td>
            <td style="font-weight:800;color:${alerte ? '#b91c1c' : 'inherit'}">${s.quantite}</td>
            <td>${s.seuil_alerte}</td>
            <td>${s.unite || '—'}</td>
            <td style="white-space:nowrap;">
                <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="ajusterStock(${s.id},1)">+1</button>
                <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="ajusterStock(${s.id},-1)">−1</button>
                <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="ajusterStock(${s.id},5)">+5</button>
            </td>
        </tr>`;
    }).join('');
    dpPaginationRender('paginationStock', 'stock', page, totalPages, rows.length);
}

// Hook _dpRefresh pour les nouvelles sections (remplace les entrées initiales)
window._dpRefresh.ordonnances = () => _renderOrdonnancesPage();
window._dpRefresh.stock       = () => _renderStockPage();
window._dpRefresh.historique  = () => afficherHistorique(_lastHistoriqueFiltered);

// ════════════════════════════════════════════════════════
// CABINET PROFIL — Chargement et affichage
// ════════════════════════════════════════════════════════
let _cabinetProfil = { nom_cabinet: '', logo_url: '' };

async function chargerCabinetProfil() {
    try {
        const res = await fetch(`${API_URL}/cabinet`, { headers: _authHeaders() });
        if (!res.ok) return;
        _cabinetProfil = await res.json();
        _applyCabinetBranding();
    } catch (e) { /* silencieux */ }
}

function _applyCabinetBranding() {
    const { nom_cabinet, logo_url } = _cabinetProfil;

    // Topbar logo
    const logoImg = document.getElementById('cabinetLogoImg');
    const nomSpan = document.getElementById('cabinetNomTop');

    if (logo_url && logoImg) {
        logoImg.src = logo_url;
        logoImg.style.display = 'block';
    }
    if (nom_cabinet && nomSpan) {
        nomSpan.textContent = nom_cabinet;
        nomSpan.style.display = 'inline';
    }

    // Sidebar branding
    const sideInfo = document.getElementById('sidebarCabinetInfo');
    const sideNom  = document.getElementById('sidebarCabinetNom');
    const sideLogo = document.getElementById('sidebarCabinetLogoImg');

    if (sideInfo && (nom_cabinet || logo_url)) {
        sideInfo.style.display = 'flex';
        if (sideNom && nom_cabinet) sideNom.textContent = nom_cabinet;
        if (sideLogo && logo_url) { sideLogo.src = logo_url; sideLogo.style.display = 'block'; }
        else if (sideLogo) sideLogo.style.display = 'none';
    }
}

async function ouvrirModalProfil() {
    document.getElementById('userMenuDropdown')?.classList.remove('open');
    // Charger données utilisateur
    const stored = JSON.parse(localStorage.getItem('user') || '{}');
    const nomEl   = document.getElementById('profileNom');
    const prenEl  = document.getElementById('profilePrenom');
    const emEl    = document.getElementById('profileEmail');
    if (nomEl)  nomEl.value  = stored.nom   || '';
    if (prenEl) prenEl.value = stored.prenom || '';
    if (emEl)   emEl.value   = stored.email  || '';

    // Charger données cabinet
    await chargerCabinetProfil();
    const input = document.getElementById('cabinetNomInput');
    if (input) input.value = _cabinetProfil.nom_cabinet || '';

    // Aperçu logo actuel
    const previewImg = document.getElementById('cabinetLogoPreviewImg');
    const placeholder = document.getElementById('cabinetLogoPlaceholder');
    if (_cabinetProfil.logo_url && previewImg) {
        previewImg.src = _cabinetProfil.logo_url;
        previewImg.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
    }

    const modal = document.getElementById('modalProfil');
    if (modal) { modal.style.display = 'flex'; }
}

function previewCabinetLogo(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img  = document.getElementById('cabinetLogoPreviewImg');
        const ph   = document.getElementById('cabinetLogoPlaceholder');
        const topImg = document.getElementById('cabinetLogoImg');
        if (img)  { img.src = e.target.result; img.style.display = 'block'; }
        if (ph)   ph.style.display = 'none';
        if (topImg) { topImg.src = e.target.result; topImg.style.display = 'block'; }
    };
    reader.readAsDataURL(file);
}

async function sauvegarderProfilEtCabinet() {
    // 1. Sauvegarder profil utilisateur
    await sauvegarderProfil();

    // 2. Sauvegarder nom cabinet
    const nomCabinet = document.getElementById('cabinetNomInput')?.value?.trim() || '';
    try {
        await fetch(`${API_URL}/cabinet`, {
            method: 'PUT',
            headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom_cabinet: nomCabinet }),
        });
        _cabinetProfil.nom_cabinet = nomCabinet;

        // Update topbar
        const nomSpan = document.getElementById('cabinetNomTop');
        if (nomSpan) {
            nomSpan.textContent = nomCabinet;
            nomSpan.style.display = nomCabinet ? 'inline' : 'none';
        }
    } catch (e) { /* silencieux */ }

    // 3. Uploader logo si sélectionné
    const logoFile = document.getElementById('cabinetLogoFile');
    if (logoFile?.files?.length) {
        const fd = new FormData();
        fd.append('logo', logoFile.files[0]);
        try {
            const res = await fetch(`${API_URL}/cabinet/logo`, {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') },
                body: fd,
            });
            const j = await res.json();
            if (j.logo_url) {
                _cabinetProfil.logo_url = j.logo_url;
                const img = document.getElementById('cabinetLogoImg');
                if (img) { img.src = j.logo_url; img.style.display = 'block'; }
            }
        } catch (e) { /* silencieux */ }
    }

    document.getElementById('modalProfil').style.display = 'none';
    showToast('✅ Profil et cabinet sauvegardés !', 'success');
}

// ════════════════════════════════════════════════════════
// SERVICES & TARIFS
// ════════════════════════════════════════════════════════
let _servicesCache = [];

async function ouvrirModalServices() {
    document.getElementById('userMenuDropdown')?.classList.remove('open');
    const modal = document.getElementById('modalServices');
    if (modal) { modal.style.display = 'flex'; }
    await chargerServices();
}

async function chargerServices() {
    try {
        const res  = await fetch(`${API_URL}/services`, { headers: _authHeaders() });
        const rows = await res.json();
        _servicesCache = Array.isArray(rows) ? rows : [];
        _renderServices();
    } catch (e) {
        document.getElementById('listeServices').innerHTML =
            '<tr><td colspan="4" style="text-align:center;color:#b91c1c;">Erreur de chargement</td></tr>';
    }
}

function _renderServices() {
    const tb = document.getElementById('listeServices');
    if (!tb) return;
    if (!_servicesCache.length) {
        tb.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#888;padding:20px;">Aucun service — ajoutez vos actes ci-dessus</td></tr>';
        return;
    }

    const catColors = {
        'Général': '#3b82f6', 'Chirurgie': '#ef4444', 'Prothèse': '#8b5cf6',
        'Orthodontie': '#f59e0b', 'Parodontologie': '#10b981', 'Esthétique': '#ec4899',
        'Radiologie': '#06b6d4', 'Pédiatrique': '#84cc16',
    };

    tb.innerHTML = _servicesCache.map(s => {
        const cat = s.categorie || 'Général';
        const col = catColors[cat] || '#6b7280';
        const prix = parseFloat(s.prix || 0).toFixed(2);
        return `<tr>
            <td>
                <div style="font-weight:700;color:var(--text);">${(s.nom||'').replace(/</g,'')}</div>
            </td>
            <td><span style="background:${col}18;color:${col};border:1px solid ${col}33;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;">${cat}</span></td>
            <td style="text-align:right;font-weight:800;font-size:15px;color:var(--primary);font-family:var(--font-head);">${prix} <span style="font-size:11px;font-weight:500;color:var(--text-3);">MAD</span></td>
            <td style="white-space:nowrap;">
                <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="modifierService(${s.id})" title="Modifier">✏️</button>
                <button type="button" class="sec-btn-ghost sec-btn-sm" onclick="supprimerService(${s.id})" style="color:#ef4444;" title="Supprimer">🗑️</button>
            </td>
        </tr>`;
    }).join('');

    // Mettre à jour les motifs dans les popups
    _syncServicesIntoForms();
}

function _syncServicesIntoForms() {
    // Synchroniser les services dans le select de la popup facture et dans les formulaires
    const selects = [
        document.getElementById('popupFactureMotif'),
        document.getElementById('factureMotif'),
    ];
    selects.forEach(sel => {
        if (!sel) return;
        const currentVal = sel.value;
        // Keep static options, add service options
        const staticOpts = Array.from(sel.options).filter(o => o.dataset.static === '1' || !o.dataset.svc);
        sel.innerHTML = '<option value="">Sélectionner un service…</option>';
        // Re-add grouped services
        const cats = [...new Set(_servicesCache.map(s => s.categorie || 'Général'))];
        cats.forEach(cat => {
            const og = document.createElement('optgroup');
            og.label = cat;
            _servicesCache.filter(s => (s.categorie || 'Général') === cat).forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.nom;
                opt.textContent = `${s.nom} — ${parseFloat(s.prix).toFixed(0)} MAD`;
                opt.dataset.prix = s.prix;
                opt.dataset.svc = '1';
                og.appendChild(opt);
            });
            sel.appendChild(og);
        });
        sel.value = currentVal;
    });
}

async function ajouterService() {
    const nom  = document.getElementById('svcNom')?.value?.trim();
    const prix = parseFloat(document.getElementById('svcPrix')?.value || 0);
    const cat  = document.getElementById('svcCategorie')?.value || 'Général';
    if (!nom) { showToast('Nom du service requis', 'warning'); return; }

    try {
        const res = await fetch(`${API_URL}/services`, {
            method: 'POST',
            headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom, prix, categorie: cat }),
        });
        const j = await res.json();
        if (j.success) {
            showToast('✅ Service ajouté', 'success');
            document.getElementById('svcNom').value  = '';
            document.getElementById('svcPrix').value = '';
            await chargerServices();
        } else showToast(j.error || 'Erreur', 'error');
    } catch (e) { showToast('Erreur', 'error'); }
}

function modifierService(id) {
    const svc = _servicesCache.find(s => s.id === id);
    if (!svc) return;
    const nouvNom  = prompt('Nom du service :', svc.nom);
    if (nouvNom === null) return;
    const nouvPrix = prompt('Prix (MAD) :', svc.prix);
    if (nouvPrix === null) return;
    fetch(`${API_URL}/services/${id}`, {
        method: 'PUT',
        headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nouvNom.trim(), prix: parseFloat(nouvPrix), categorie: svc.categorie }),
    }).then(() => { showToast('✅ Service modifié', 'success'); chargerServices(); })
      .catch(() => showToast('Erreur', 'error'));
}

async function supprimerService(id) {
    if (!confirm('Supprimer ce service ?')) return;
    try {
        await fetch(`${API_URL}/services/${id}`, { method: 'DELETE', headers: _authHeaders() });
        showToast('🗑️ Service supprimé', 'info');
        chargerServices();
    } catch (e) { showToast('Erreur', 'error'); }
}

// ════════════════════════════════════════════════════════
// POPUP — Nouvelle Facture
// ════════════════════════════════════════════════════════
async function ouvrirModalNouvelleFacture() {
    const modal = document.getElementById('modalNouvelleFacture');
    if (!modal) { goToNewFacture(); return; }

    // Date par défaut = aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('popupFactureDate');
    if (dateEl) dateEl.value = today;

    // Charger patients
    const sel = document.getElementById('popupFacturePatient');
    if (sel && patients && patients.length) {
        sel.innerHTML = '<option value="">Sélectionner un patient…</option>' +
            patients.map(p => `<option value="${p.id_patient}">${p.nom} ${p.prenom}</option>`).join('');
    } else if (sel) {
        try {
            const res = await fetch(`${API_URL}/patients`, { headers: _authHeaders() });
            const pats = await res.json();
            sel.innerHTML = '<option value="">Sélectionner un patient…</option>' +
                pats.map(p => `<option value="${p.id_patient}">${p.nom} ${p.prenom}</option>`).join('');
        } catch (e) {}
    }

    // Charger services
    if (!_servicesCache.length) await chargerServices();
    else _syncServicesIntoForms();

    modal.style.display = 'flex';
}

async function soumettreFacturePopup() {
    const pid    = document.getElementById('popupFacturePatient')?.value;
    const date   = document.getElementById('popupFactureDate')?.value;
    const mont   = parseFloat(document.getElementById('popupFactureMontant')?.value || 0);
    const motif  = document.getElementById('popupFactureMotif')?.value || '';
    const notes  = document.getElementById('popupFactureNotes')?.value || '';

    if (!pid)  { showToast('Sélectionnez un patient', 'warning'); return; }
    if (!date) { showToast('Date requise', 'warning'); return; }
    if (!mont) { showToast('Montant requis', 'warning'); return; }

    try {
        const res = await fetch(`${API_URL}/factures`, {
            method: 'POST',
            headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_patient: pid, date_facture: date, montant_total: mont, motif, notes }),
        });
        const j = await res.json();
        if (j.success || j.id) {
            document.getElementById('modalNouvelleFacture').style.display = 'none';
            showToast('✅ Facture créée !', 'success');
            addNotification('🧾 Nouvelle facture créée', 'success');
            if (typeof chargerStatsPaiements === 'function') chargerStatsPaiements();
        } else showToast(j.error || 'Erreur serveur', 'error');
    } catch (e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ════════════════════════════════════════════════════════
// POPUP — Nouveau RDV
// ════════════════════════════════════════════════════════
async function ouvrirModalNouveauRdv() {
    const modal = document.getElementById('modalNouveauRdv');
    if (!modal) { goToNewRdv(); return; }

    // Date par défaut = aujourd'hui
    const today = new Date().toISOString().split('T')[0];
    const dateEl = document.getElementById('popupRdvDate');
    if (dateEl) dateEl.value = today;

    // Charger patients
    const sel = document.getElementById('popupRdvPatient');
    if (sel) {
        const pats = (patients && patients.length) ? patients : [];
        if (pats.length) {
            sel.innerHTML = '<option value="">Sélectionner un patient…</option>' +
                pats.map(p => `<option value="${p.id_patient}">${p.nom} ${p.prenom}</option>`).join('');
        } else {
            try {
                const res = await fetch(`${API_URL}/patients`, { headers: _authHeaders() });
                const arr = await res.json();
                sel.innerHTML = '<option value="">Sélectionner un patient…</option>' +
                    arr.map(p => `<option value="${p.id_patient}">${p.nom} ${p.prenom}</option>`).join('');
            } catch (e) {}
        }
    }
    modal.style.display = 'flex';
}

async function soumettreRdvPopup() {
    const pid   = document.getElementById('popupRdvPatient')?.value;
    const date  = document.getElementById('popupRdvDate')?.value;
    const heure = document.getElementById('popupRdvHeure')?.value;
    const motif = document.getElementById('popupRdvMotif')?.value || 'Consultation';

    if (!pid)   { showToast('Sélectionnez un patient', 'warning'); return; }
    if (!date)  { showToast('Date requise', 'warning'); return; }
    if (!heure) { showToast('Heure requise', 'warning'); return; }

    try {
        const res = await fetch(`${API_URL}/rdv`, {
            method: 'POST',
            headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ id_patient: pid, date_rdv: date, heure_rdv: heure, motif, statut: 'Prevu' }),
        });
        const j = await res.json();
        if (j.success || j.id) {
            document.getElementById('modalNouveauRdv').style.display = 'none';
            showToast('✅ Rendez-vous planifié !', 'success');
            addNotification(`📅 Nouveau RDV planifié le ${date} à ${heure}`, 'success');
            animateBell();
            if (typeof chargerRdv === 'function') chargerRdv();
        } else showToast(j.error || 'Erreur', 'error');
    } catch (e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ════════════════════════════════════════════════════════
// POPUP — Nouveau Stock
// ════════════════════════════════════════════════════════
function ouvrirModalNouveauStock() {
    const modal = document.getElementById('modalNouveauStock');
    if (!modal) return;
    // Reset form
    ['popupStockNom','popupStockRef'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const qte = document.getElementById('popupStockQte'); if (qte) qte.value = '0';
    const seuil = document.getElementById('popupStockSeuil'); if (seuil) seuil.value = '5';
    const unite = document.getElementById('popupStockUnite'); if (unite) unite.value = 'boîte';
    modal.style.display = 'flex';
}

async function soumettreStockPopup() {
    const nom   = document.getElementById('popupStockNom')?.value?.trim();
    const ref   = document.getElementById('popupStockRef')?.value?.trim() || '';
    const qte   = Number(document.getElementById('popupStockQte')?.value   || 0);
    const seuil = Number(document.getElementById('popupStockSeuil')?.value || 5);
    const unite = document.getElementById('popupStockUnite')?.value?.trim() || 'boîte';

    if (!nom) { showToast('Nom de l\'article requis', 'warning'); return; }

    try {
        const res = await fetch(`${API_URL}/stock`, {
            method: 'POST',
            headers: { ..._authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ nom, reference: ref, quantite: qte, seuil_alerte: seuil, unite }),
        });
        const j = await res.json();
        if (j.success) {
            document.getElementById('modalNouveauStock').style.display = 'none';
            showToast('✅ Article ajouté au stock !', 'success');
            if (typeof window.chargerStock === 'function') window.chargerStock();
        } else showToast(j.error || 'Erreur', 'error');
    } catch (e) { showToast('Erreur: ' + e.message, 'error'); }
}

// ════════════════════════════════════════════════════════
// AUTO-INIT — Charger cabinet profil au démarrage
// ════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function() {
    // Charger cabinet profil si connecté
    const token = localStorage.getItem('token');
    if (token) {
        chargerCabinetProfil();
        chargerServices();
    }
});