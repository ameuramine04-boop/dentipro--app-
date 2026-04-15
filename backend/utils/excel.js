/**
 * excel.js — DentiPro v3
 * 5 feuilles : Patients / Rdv / Paiements / Factures / Historique
 * Mutex pour éviter les écritures simultanées
 * Historique coloré par type d'opération
 */
const ExcelJS = require('exceljs');
const db      = require('../config/db');
const path    = require('path');
const EXCEL_FILE = path.join(__dirname, '../../dentipro_data.xlsx');

// ── MUTEX ─────────────────────────────────────────────────────
let _writing = false; const _queue = [];
async function _withLock(fn) {
    return new Promise((resolve, reject) => {
        _queue.push(async () => { try { resolve(await fn()); } catch(e) { reject(e); } });
        _processQueue();
    });
}
async function _processQueue() {
    if (_writing || !_queue.length) return;
    _writing = true;
    const fn = _queue.shift();
    try { await fn(); } finally { _writing = false; _processQueue(); }
}

// ── THÈMES ────────────────────────────────────────────────────
const T = {
    Patients:  { h:'FF1A73E8', f:'FFFFFFFF', tab:'1A73E8', e:'FFE8F0FE', o:'FFFFFFFF' },
    Rdv:       { h:'FF0F9D58', f:'FFFFFFFF', tab:'0F9D58', e:'FFE6F4EA', o:'FFFFFFFF' },
    Paiements: { h:'FF7B1FA2', f:'FFFFFFFF', tab:'7B1FA2', e:'FFF3E5F5', o:'FFFFFFFF' },
    Factures:  { h:'FFE65100', f:'FFFFFFFF', tab:'E65100', e:'FFFFF3E0', o:'FFFFFFFF',
        st: { 'Payee':{f:'FF2E7D32',b:'FFE8F5E9'}, 'Impayee':{f:'FFC62828',b:'FFFFEBEE'}, 'Partiellement payee':{f:'FFF57F17',b:'FFFFF9C4'} }
    },
    Historique:{ h:'FF37474F', f:'FFFFFFFF', tab:'37474F', e:'FFF5F5F5', o:'FFFFFFFF' },
};

// Couleurs par type d'opération
const HC = {
    PATIENT_AJOUT:   {b:'FFE3F2FD',f:'FF1565C0',i:'👤'},
    PATIENT_MODIF:   {b:'FFFCE4EC',f:'FFC62828',i:'✏️'},
    PATIENT_SUPPRIM: {b:'FFFFEBEE',f:'FFB71C1C',i:'🗑️'},
    RDV_AJOUT:       {b:'FFE8F5E9',f:'FF2E7D32',i:'📅'},
    RDV_MODIF:       {b:'FFFFF9C4',f:'FFF57F17',i:'✏️'},
    RDV_SUPPRIM:     {b:'FFFFEBEE',f:'FFC62828',i:'🗑️'},
    PAIEMENT_AJOUT:  {b:'FFF3E5F5',f:'FF6A1B9A',i:'💰'},
    FACTURE_AJOUT:   {b:'FFFFF3E0',f:'FFE65100',i:'📄'},
    FACTURE_MAJ:     {b:'FFFBE9E7',f:'FFD84315',i:'🔄'},
    FACTURE_SUPPRIM: {b:'FFFFEBEE',f:'FFC62828',i:'🗑️'},
    SALLE_AJOUT:     {b:'FFE8EAF6',f:'FF283593',i:'🪑'},
    DEFAULT:         {b:'FFFFFFFF',f:'FF424242',i:'📝'},
};

const COLS = {
    Patients:[
        {header:'ID',key:'id',width:7},{header:'Nom',key:'nom',width:18},{header:'Prénom',key:'prenom',width:18},
        {header:'Sexe',key:'sexe',width:10},{header:'Téléphone',key:'tel',width:16},{header:'CNIE',key:'cnie',width:14},
        {header:'Date Naissance',key:'dob',width:16},{header:'Email',key:'email',width:26},{header:'Créé le',key:'c',width:20},
    ],
    Rdv:[
        {header:'ID',key:'id',width:7},{header:'Patient ID',key:'pid',width:10},{header:'Patient',key:'pat',width:24},
        {header:'Date',key:'date',width:14},{header:'Heure',key:'h',width:10},{header:'Motif',key:'motif',width:28},
        {header:'Dent(s)',key:'dent',width:12},{header:'Statut',key:'st',width:14},{header:'Créé le',key:'c',width:20},
    ],
    Paiements:[
        {header:'ID',key:'id',width:7},{header:'Patient ID',key:'pid',width:10},{header:'Patient',key:'pat',width:24},
        {header:'Montant (DH)',key:'m',width:14},{header:'Type',key:'type',width:12},{header:'Date',key:'date',width:14},
        {header:'Facture N°',key:'fn',width:14},{header:'Facture ID',key:'fi',width:10},
        {header:'Notes',key:'notes',width:24},{header:'Créé le',key:'c',width:20},
    ],
    Factures:[
        {header:'ID',key:'id',width:7},{header:'Patient ID',key:'pid',width:10},{header:'Patient',key:'pat',width:24},
        {header:'N° Facture',key:'num',width:14},{header:'Date',key:'date',width:14},{header:'Motif',key:'motif',width:20},
        {header:'Dent(s)',key:'dent',width:12},{header:'Total DH',key:'total',width:14},{header:'Payé DH',key:'paye',width:14},
        {header:'Reste DH',key:'reste',width:14},{header:'Statut',key:'st',width:22},{header:'Dernière MAJ',key:'maj',width:20},
    ],
    Historique:[
        {header:'#',key:'n',width:5},{header:'Date/Heure',key:'dt',width:20},{header:'Type',key:'type',width:22},
        {header:'Opération',key:'op',width:28},{header:'Patient',key:'pat',width:24},
        {header:'Détails',key:'det',width:42},{header:'Utilisateur',key:'user',width:18},
    ],
};

// ── HELPERS ───────────────────────────────────────────────────
const fd = v => { if(!v) return ''; const d=v instanceof Date?v:new Date(v); return isNaN(d)?String(v):d.toLocaleDateString('fr-FR'); };
const fdt= v => { if(!v) return ''; const d=v instanceof Date?v:new Date(v); if(isNaN(d)) return String(v); return d.toLocaleDateString('fr-FR')+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'}); };

function sH(ws,name) {
    const t=T[name]; const row=ws.getRow(1); row.height=24;
    row.eachCell(c=>{
        c.fill={type:'pattern',pattern:'solid',fgColor:{argb:t.h}};
        c.font={bold:true,color:{argb:t.f},size:11,name:'Calibri'};
        c.alignment={vertical:'middle',horizontal:'center',wrapText:true};
        c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}};
    });
}
function sD(ws,rn,name,cFill) {
    const t=T[name]; const fill=cFill||(rn%2===0?t.e:t.o);
    const row=ws.getRow(rn); row.height=18;
    row.eachCell({includeEmpty:true},c=>{
        c.fill={type:'pattern',pattern:'solid',fgColor:{argb:fill}};
        c.font={size:10,name:'Calibri'}; c.alignment={vertical:'middle'};
        c.border={top:{style:'hair'},left:{style:'hair'},bottom:{style:'hair'},right:{style:'hair'}};
    });
}

async function getWB() {
    const wb=new ExcelJS.Workbook(); wb.creator='DentiPro';
    try { await wb.xlsx.readFile(EXCEL_FILE); } catch(e) { if(e.code!=='ENOENT') console.error('Excel read:',e.message); }
    for(const [name,cols] of Object.entries(COLS)) {
        if(!wb.getWorksheet(name)) {
            const ws=wb.addWorksheet(name,{properties:{tabColor:{argb:T[name].tab}}});
            ws.columns=cols; sH(ws,name); console.log(`📄 Feuille "${name}" créée`);
        }
    }
    return wb;
}

async function hist(wb, type, op, patient, details, user) {
    const ws=wb.getWorksheet('Historique'); if(!ws) return;
    const rn=ws.rowCount+1; const c=HC[type]||HC.DEFAULT;
    ws.addRow([rn-1, fdt(new Date()), `${c.i} ${type.replace(/_/g,' ')}`, op, patient||'', details||'', user||'Système']);
    sD(ws,rn,'Historique',c.b);
    const row=ws.getRow(rn);
    row.getCell(3).font={bold:true,color:{argb:c.f},size:10,name:'Calibri'};
    row.getCell(4).font={bold:true,color:{argb:c.f},size:10,name:'Calibri'};
}

// ── PATIENTS ──────────────────────────────────────────────────
async function appendPatient(id) {
    db.query('SELECT * FROM patient WHERE id_patient=?',[id],async(err,rows)=>{
        if(err||!rows.length) return;
        const p=rows[0];
        _withLock(async()=>{
            try {
                const wb=await getWB(); const ws=wb.getWorksheet('Patients');
                const rn=ws.rowCount+1;
                ws.addRow([p.id_patient,p.nom,p.prenom,p.sexe||'',p.telephone||'',p.cnie||'',fd(p.date_naissance),p.email||'',fdt(p.created_at)]);
                sD(ws,rn,'Patients');
                await hist(wb,'PATIENT_AJOUT','Nouveau patient',`${p.nom} ${p.prenom}`,`Tél: ${p.telephone||'-'} | CIN: ${p.cnie||'-'}`);
                await wb.xlsx.writeFile(EXCEL_FILE);
                console.log(`✅ Excel Patients: ${p.nom} ${p.prenom}`);
            } catch(e){ console.error('appendPatient:',e.message); }
        });
    });
}

// ── RDV ───────────────────────────────────────────────────────
async function appendRDV(id) {
    db.query(`SELECT r.*,CONCAT(p.nom,' ',p.prenom) as pn FROM rendez_vous r LEFT JOIN patient p ON r.id_patient=p.id_patient WHERE r.id_rdv=?`,[id],async(err,rows)=>{
        if(err||!rows.length) return;
        const r=rows[0];
        _withLock(async()=>{
            try {
                const wb=await getWB(); const ws=wb.getWorksheet('Rdv');
                const rn=ws.rowCount+1;
                ws.addRow([r.id_rdv,r.id_patient,r.pn,fd(r.date_rdv),r.heure_rdv||'',r.motif||'',r.dent||'',r.statut||'',fdt(r.created_at)]);
                const sf={'Prevu':'FFFFF9C4','En cours':'FFE3F2FD','Termine':'FFE8F5E9','Annule':'FFFFEBEE'};
                sD(ws,rn,'Rdv',sf[r.statut]);
                await hist(wb,'RDV_AJOUT','RDV planifié',r.pn,`${fd(r.date_rdv)} à ${r.heure_rdv||'?'} — ${r.motif||'Consultation'}`);
                await wb.xlsx.writeFile(EXCEL_FILE);
                console.log(`✅ Excel Rdv: #${r.id_rdv}`);
            } catch(e){ console.error('appendRDV:',e.message); }
        });
    });
}

// ── PAIEMENTS ─────────────────────────────────────────────────
async function appendPaiement(id) {
    db.query(`SELECT p.*,CONCAT(pt.nom,' ',pt.prenom) as pn,f.numero_facture FROM paiement p LEFT JOIN patient pt ON p.id_patient=pt.id_patient LEFT JOIN facture f ON p.id_facture=f.id_facture WHERE p.id_paiement=?`,[id],async(err,rows)=>{
        if(err||!rows.length) return;
        const p=rows[0];
        _withLock(async()=>{
            try {
                const wb=await getWB(); const ws=wb.getWorksheet('Paiements');
                const rn=ws.rowCount+1;
                ws.addRow([p.id_paiement,p.id_patient,p.pn,parseFloat(p.montant),p.type_paiement||'',fd(p.date_paiement),p.numero_facture||'',p.id_facture||'',p.notes||'',fdt(p.created_at)]);
                sD(ws,rn,'Paiements');
                ws.getRow(rn).getCell(4).numFmt='#,##0.00 "DH"';
                await hist(wb,'PAIEMENT_AJOUT','Paiement reçu',p.pn,`${parseFloat(p.montant).toFixed(2)} DH — ${p.type_paiement||'Especes'}${p.numero_facture?' | Fac.'+p.numero_facture:''}`);
                await wb.xlsx.writeFile(EXCEL_FILE);
                console.log(`✅ Excel Paiements: #${p.id_paiement}`);
            } catch(e){ console.error('appendPaiement:',e.message); }
        });
    });
}

// ── FACTURES (UPSERT) ─────────────────────────────────────────
async function _upsertFac(wb, f, isUpd) {
    const ws=wb.getWorksheet('Factures');
    const tot=parseFloat(f.montant_total)||0, pay=parseFloat(f.montant_regle)||0;
    const rest=tot-pay, st=f.statut||'Impayee';
    const pat=((f.patient_nom||'')+' '+(f.patient_prenom||'')).trim();
    const rowData=[f.id_facture,f.id_patient,pat,f.numero_facture||'',fd(f.date_facture),f.motif||'',f.dent||'',tot,pay,rest,st,fdt(new Date())];
    const stC=(T.Factures.st||{})[st]||{f:'FF888888',b:'FFEEEEEE'};

    let existRow=null;
    ws.eachRow((row,num)=>{ if(num===1) return; if(row.getCell(1).value===f.id_facture) existRow=row; });

    if(existRow) {
        rowData.forEach((v,i)=>existRow.getCell(i+1).value=v);
        existRow.height=18;
        existRow.eachCell({includeEmpty:true},c=>{
            c.fill={type:'pattern',pattern:'solid',fgColor:{argb:stC.b}};
            c.font={size:10,name:'Calibri'}; c.alignment={vertical:'middle'};
            c.border={top:{style:'hair'},left:{style:'hair'},bottom:{style:'hair'},right:{style:'hair'}};
        });
        existRow.getCell(11).font={bold:true,color:{argb:stC.f},size:10,name:'Calibri'};
        [8,9,10].forEach(c=>{ existRow.getCell(c).numFmt='#,##0.00 "DH"'; });
    } else {
        const rn=ws.rowCount+1;
        ws.addRow(rowData); sD(ws,rn,'Factures',stC.b);
        const row=ws.getRow(rn);
        row.getCell(11).font={bold:true,color:{argb:stC.f},size:10,name:'Calibri'};
        [8,9,10].forEach(c=>{ row.getCell(c).numFmt='#,##0.00 "DH"'; });
    }
    const typ=isUpd?'FACTURE_MAJ':'FACTURE_AJOUT';
    const det=isUpd
        ?`${f.numero_facture} | Payé: ${pay.toFixed(2)} DH | Reste: ${rest.toFixed(2)} DH | ${st}`
        :`${f.numero_facture} | Total: ${tot.toFixed(2)} DH | ${f.motif||'-'}`;
    await hist(wb,typ,isUpd?'Facture mise à jour':'Facture créée',pat,det);
}

async function appendFacture(id) {
    db.query(`SELECT f.*,pt.nom as patient_nom,pt.prenom as patient_prenom FROM facture f LEFT JOIN patient pt ON f.id_patient=pt.id_patient WHERE f.id_facture=?`,[id],async(err,rows)=>{
        if(err||!rows.length) return;
        _withLock(async()=>{
            try { const wb=await getWB(); await _upsertFac(wb,rows[0],false); await wb.xlsx.writeFile(EXCEL_FILE); console.log(`✅ Excel Factures: #${rows[0].id_facture}`); }
            catch(e){ console.error('appendFacture:',e.message); }
        });
    });
}

async function appendFactureUpdate(id_facture) {
    if(!id_facture) return;
    db.query(`SELECT f.*,pt.nom as patient_nom,pt.prenom as patient_prenom FROM facture f LEFT JOIN patient pt ON f.id_patient=pt.id_patient WHERE f.id_facture=?`,[id_facture],async(err,rows)=>{
        if(err||!rows.length) return;
        _withLock(async()=>{
            try { const wb=await getWB(); await _upsertFac(wb,rows[0],true); await wb.xlsx.writeFile(EXCEL_FILE); console.log(`✅ Excel Factures MAJ: #${rows[0].id_facture}`); }
            catch(e){ console.error('appendFactureUpdate:',e.message); }
        });
    });
}

async function logAction(type, op, patient, details, user) {
    _withLock(async()=>{
        try { const wb=await getWB(); await hist(wb,type,op,patient,details,user); await wb.xlsx.writeFile(EXCEL_FILE); }
        catch(e){ console.error('logAction:',e.message); }
    });
}

module.exports = { appendPatient, appendRDV, appendPaiement, appendFacture, appendFactureUpdate, logAction };
