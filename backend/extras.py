"""
Tables additionnelles + API : patients à risque, ordonnances, stock.
"""
from __future__ import annotations

import io
from datetime import datetime

from flask import jsonify, request, send_file
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

# Modèles d'ordonnances (texte prêt à imprimer)
ORDONNANCE_MODELES = {
    "extraction_simple": {
        "titre": "Extraction simple",
        "contenu": """Extraction simple

Antalgique : Paracetamol 1 cp / chaque 6 heures
Anticeptique bain de bouche : rincage 3 fois par jour""",
    },
    "extraction_chirurgical": {
        "titre": "Extraction chirurgicale",
        "contenu": """Extraction chirurgicale

Antibiotique : Amoxicilline 1 cp / 1 g / 3 fois par jour pendant 7 jours
Antalgique : Paracetamol 1 cp / chaque 6 heures
Anticeptique bain de bouche : rinçage 3 fois par jour""",
    },
    "abces": {
        "titre": "Abcès",
        "contenu": """Abcès dentaire

Antibiotique : Amoxicilline 1 cp / 1 g / 3 fois par jour pendant 7 jours
Antalgique : Paracetamol 1 cp / chaque 6 heures
Anticeptique bain de bouche : rinçage 3 fois par jour""",
    },
}


def ensure_extra_tables(conn_fn):
    """conn_fn: () -> pymysql connection — sans FK pour éviter les échecs si ordre des tables / données."""
    stmts = [
        """CREATE TABLE IF NOT EXISTS chat_message (
          id INT AUTO_INCREMENT PRIMARY KEY,
          id_user INT NOT NULL,
          message TEXT,
          fichier_url VARCHAR(500),
          fichier_nom VARCHAR(255),
          fichier_type VARCHAR(120),
          lu TINYINT(1) DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX ix_chat_created (created_at),
          INDEX ix_chat_user (id_user)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS patient_risque (
          id INT AUTO_INCREMENT PRIMARY KEY,
          id_patient INT NOT NULL,
          type_risque ENUM('diabete','hypertension','allergie','anticoagulant','cardio','autre') NOT NULL,
          detail TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX ix_pr_patient (id_patient)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS stock_article (
          id INT AUTO_INCREMENT PRIMARY KEY,
          nom VARCHAR(200) NOT NULL,
          reference VARCHAR(100),
          quantite INT NOT NULL DEFAULT 0,
          seuil_alerte INT DEFAULT 5,
          unite VARCHAR(20) DEFAULT 'unité',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
        """CREATE TABLE IF NOT EXISTS ordonnance (
          id INT AUTO_INCREMENT PRIMARY KEY,
          id_patient INT NOT NULL,
          id_user INT NOT NULL,
          modele VARCHAR(80) NOT NULL,
          titre VARCHAR(255),
          contenu TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX ix_ord_patient (id_patient),
          INDEX ix_ord_user (id_user)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4""",
    ]
    conn = conn_fn()
    try:
        with conn.cursor() as cur:
            for sql in stmts:
                try:
                    cur.execute(sql)
                except Exception as ex:
                    print("[ensure_extra_tables]", ex)
            try:
                cur.execute(
                    "ALTER TABLE utilisateur ADD COLUMN linked_user_id INT NULL"
                )
            except Exception:
                pass
        conn.commit()
    finally:
        conn.close()


def register_extras_routes(app, query_all, execute, sj, sjl):
    """Inject DB helpers from app (execute supports fetch_last=True)."""

    @app.get("/api/ordonnance-modeles")
    def ord_modeles():
        out = [
            {"id": k, "titre": v["titre"], "contenu": v["contenu"]}
            for k, v in ORDONNANCE_MODELES.items()
        ]
        return jsonify(out)

    def _pdf_ordonnance(pat, ord_row, praticien_nom):
        buf = io.BytesIO()
        c = canvas.Canvas(buf, pagesize=A4)
        w, h = A4
        blue = colors.HexColor("#1a73e8")
        c.setFillColor(blue)
        c.rect(0, h - 70, w, 70, fill=1, stroke=0)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(w / 2, h - 32, "ORDONNANCE")
        c.setFont("Helvetica", 9)
        c.drawCentredString(w / 2, h - 48, "Cabinet dentaire — DentiPro")
        c.setFillColor(colors.black)
        y = h - 95
        c.setFont("Helvetica-Bold", 11)
        c.drawString(50, y, "Patient")
        y -= 16
        c.setFont("Helvetica", 10)
        c.drawString(50, y, f"{pat.get('nom', '')} {pat.get('prenom', '')}")
        y -= 14
        if pat.get("date_naissance"):
            c.drawString(50, y, f"Né(e) le : {pat.get('date_naissance')}")
            y -= 14
        y -= 10
        c.setFont("Helvetica-Bold", 11)
        c.drawString(50, y, ord_row.get("titre") or "Prescription")
        y -= 18
        c.setFont("Helvetica", 10)
        for line in (ord_row.get("contenu") or "").split("\n"):
            if not line.strip():
                y -= 8
                continue
            c.drawString(50, y, line[:95])
            y -= 14
            if y < 120:
                c.showPage()
                y = h - 50
        y -= 30
        c.setFont("Helvetica-Oblique", 9)
        c.drawString(50, y, f"Fait le {datetime.now().strftime('%d/%m/%Y à %H:%M')}")
        y -= 36
        c.setFont("Helvetica-Bold", 10)
        c.drawString(w - 220, y, praticien_nom or "Praticien")
        c.line(w - 220, y - 4, w - 50, y - 4)
        c.setFont("Helvetica", 8)
        c.drawString(w - 220, y - 16, "Signature / Cachet")
        c.save()
        buf.seek(0)
        return buf

    @app.get("/api/ordonnances/patient/<int:pid>")
    def ord_list_pat(pid):
        r = query_all(
            """SELECT o.*, u.nom as praticien_nom, u.prenom as praticien_prenom FROM ordonnance o
            JOIN utilisateur u ON o.id_user = u.id_user WHERE o.id_patient=%s ORDER BY o.created_at DESC""",
            (pid,),
        )
        return jsonify(sjl(r))

    @app.get("/api/ordonnances")
    def ord_list_all():
        r = query_all(
            """SELECT o.*, p.nom as patient_nom, p.prenom as patient_prenom,
            u.nom as praticien_nom, u.prenom as praticien_prenom FROM ordonnance o
            JOIN patient p ON o.id_patient = p.id_patient
            JOIN utilisateur u ON o.id_user = u.id_user
            ORDER BY o.created_at DESC LIMIT 200"""
        )
        return jsonify(sjl(r))

    @app.post("/api/ordonnances")
    def ord_create():
        b = request.get_json(silent=True) or {}
        pid = b.get("id_patient")
        uid = b.get("id_user") or 1
        modele = b.get("modele") or "custom"
        contenu_custom = b.get("contenu")
        if modele in ORDONNANCE_MODELES:
            titre = ORDONNANCE_MODELES[modele]["titre"]
            contenu = contenu_custom or ORDONNANCE_MODELES[modele]["contenu"]
        else:
            titre = b.get("titre") or "Ordonnance"
            contenu = contenu_custom or ""
        if not pid or not contenu:
            return jsonify({"error": "id_patient et contenu requis"}), 400
        oid = execute(
            """INSERT INTO ordonnance (id_patient, id_user, modele, titre, contenu)
            VALUES (%s,%s,%s,%s,%s)""",
            (pid, uid, modele, titre, contenu),
            True,
        )
        return jsonify({"success": True, "id": oid})

    @app.post("/api/ordonnances/apercu-pdf")
    def ord_apercu_pdf():
        """PDF sans enregistrement (modèles prêts à imprimer)."""
        b = request.get_json(silent=True) or {}
        pid = b.get("id_patient")
        uid = int(b.get("id_user") or 1)
        modele = b.get("modele") or "custom"
        contenu_custom = b.get("contenu")
        if modele in ORDONNANCE_MODELES:
            titre = ORDONNANCE_MODELES[modele]["titre"]
            contenu = contenu_custom or ORDONNANCE_MODELES[modele]["contenu"]
        else:
            titre = b.get("titre") or "Ordonnance"
            contenu = contenu_custom or ""
        if not pid or not contenu:
            return jsonify({"error": "id_patient et contenu requis"}), 400
        pat_rows = query_all("SELECT * FROM patient WHERE id_patient=%s", (pid,))
        if not pat_rows:
            return jsonify({"error": "Patient inconnu"}), 404
        pat = pat_rows[0]
        urows = query_all(
            "SELECT nom, prenom FROM utilisateur WHERE id_user=%s", (uid,)
        )
        prat = "Praticien"
        if urows:
            prat = f"Dr. {urows[0].get('prenom') or ''} {urows[0].get('nom') or ''}".strip()
        ord_row = {"titre": titre, "contenu": contenu}
        buf = _pdf_ordonnance(pat, ord_row, prat)
        return send_file(
            buf,
            mimetype="application/pdf",
            as_attachment=False,
            download_name="ordonnance-apercu.pdf",
        )

    @app.get("/api/ordonnances/<int:oid>/pdf")
    def ord_pdf(oid):
        rows = query_all(
            """SELECT o.*, p.nom, p.prenom, p.date_naissance, u.nom as pn, u.prenom as pp
            FROM ordonnance o JOIN patient p ON o.id_patient=p.id_patient
            JOIN utilisateur u ON o.id_user=u.id_user WHERE o.id=%s""",
            (oid,),
        )
        if not rows:
            return jsonify({"error": "Non trouvé"}), 404
        row = rows[0]
        prat = f"Dr. {row.get('pp') or ''} {row.get('pn') or ''}".strip()
        buf = _pdf_ordonnance(row, row, prat)
        return send_file(
            buf,
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"ordonnance-{oid}.pdf",
        )

    @app.delete("/api/ordonnances/<int:oid>")
    def ord_del(oid):
        execute("DELETE FROM ordonnance WHERE id=%s", (oid,))
        return jsonify({"success": True})

    @app.get("/api/patient-risques")
    def pr_list():
        r = query_all(
            """SELECT pr.*, p.nom, p.prenom, p.telephone, p.cnie
            FROM patient_risque pr
            JOIN patient p ON pr.id_patient = p.id_patient
            ORDER BY p.nom ASC, p.prenom ASC, pr.type_risque ASC"""
        )
        return jsonify(sjl(r))

    @app.post("/api/patient-risques")
    def pr_add():
        b = request.get_json(silent=True) or {}
        if not b.get("id_patient") or not b.get("type_risque"):
            return jsonify({"error": "id_patient et type_risque requis"}), 400
        iid = execute(
            "INSERT INTO patient_risque (id_patient, type_risque, detail) VALUES (%s,%s,%s)",
            (b["id_patient"], b["type_risque"], b.get("detail") or None),
            fetch_last=True,
        )
        return jsonify({"success": True, "id": iid})

    @app.delete("/api/patient-risques/<int:rid>")
    def pr_del(rid):
        execute("DELETE FROM patient_risque WHERE id=%s", (rid,))
        return jsonify({"success": True})

    @app.get("/api/stock")
    def stock_list():
        r = query_all("SELECT * FROM stock_article ORDER BY nom ASC")
        return jsonify(sjl(r))

    @app.post("/api/stock")
    def stock_add():
        b = request.get_json(silent=True) or {}
        if not b.get("nom"):
            return jsonify({"error": "nom requis"}), 400
        iid = execute(
            """INSERT INTO stock_article (nom, reference, quantite, seuil_alerte, unite)
            VALUES (%s,%s,%s,%s,%s)""",
            (
                b["nom"],
                b.get("reference") or None,
                int(b.get("quantite") or 0),
                int(b.get("seuil_alerte") or 5),
                b.get("unite") or "unité",
            ),
            fetch_last=True,
        )
        return jsonify({"success": True, "id": iid})

    @app.put("/api/stock/<int:sid>")
    def stock_put(sid):
        b = request.get_json(silent=True) or {}
        execute(
            """UPDATE stock_article SET nom=%s, reference=%s, seuil_alerte=%s, unite=%s WHERE id=%s""",
            (
                b.get("nom"),
                b.get("reference") or None,
                int(b.get("seuil_alerte") or 5),
                b.get("unite") or "unité",
                sid,
            ),
        )
        return jsonify({"success": True})

    @app.post("/api/stock/<int:sid>/adjust")
    def stock_adj(sid):
        b = request.get_json(silent=True) or {}
        delta = int(b.get("delta") or 0)
        rows = query_all("SELECT quantite FROM stock_article WHERE id=%s", (sid,))
        if not rows:
            return jsonify({"error": "Article inconnu"}), 404
        nq = max(0, int(rows[0]["quantite"]) + delta)
        execute("UPDATE stock_article SET quantite=%s WHERE id=%s", (nq, sid))
        return jsonify({"success": True, "quantite": nq})

    @app.get("/api/equipe/eligibles")
    def equipe_eligibles():
        uid = request.args.get("id_user", type=int)
        if not uid:
            return jsonify([])
        me_rows = query_all(
            "SELECT id_user, role FROM utilisateur WHERE id_user=%s", (uid,)
        )
        if not me_rows:
            return jsonify([])
        role = (me_rows[0].get("role") or "").lower()
        if "dentiste" in role:
            others = query_all(
                """SELECT id_user, username, nom, prenom, role FROM utilisateur
                WHERE id_user != %s AND LOWER(role) LIKE %s ORDER BY nom, prenom""",
                (uid, "%secret%"),
            )
        elif "secret" in role:
            others = query_all(
                """SELECT id_user, username, nom, prenom, role FROM utilisateur
                WHERE id_user != %s AND LOWER(role) LIKE %s ORDER BY nom, prenom""",
                (uid, "%dentiste%"),
            )
        else:
            others = query_all(
                """SELECT id_user, username, nom, prenom, role FROM utilisateur
                WHERE id_user != %s ORDER BY nom, prenom LIMIT 100""",
                (uid,),
            )
        return jsonify(sjl(others))

    @app.get("/api/equipe/mon-lien")
    def equipe_mon_lien():
        uid = request.args.get("id_user", type=int)
        if not uid:
            return jsonify({"partenaire": None})
        rows = query_all(
            """SELECT u.id_user, u.nom, u.prenom, u.role, u.username
            FROM utilisateur me
            JOIN utilisateur u ON u.id_user = me.linked_user_id
            WHERE me.id_user=%s""",
            (uid,),
        )
        if not rows:
            return jsonify({"partenaire": None})
        return jsonify({"partenaire": sj(rows[0])})

    @app.put("/api/equipe/liaison")
    def equipe_liaison():
        b = request.get_json(silent=True) or {}
        uid = int(b.get("id_user") or 0)
        if not uid:
            return jsonify({"error": "id_user requis"}), 400
        raw_pid = b.get("partenaire_id")
        cur = query_all(
            "SELECT linked_user_id FROM utilisateur WHERE id_user=%s", (uid,)
        )
        oldp = None
        if cur and cur[0].get("linked_user_id") is not None:
            oldp = int(cur[0]["linked_user_id"])
        if oldp:
            execute(
                "UPDATE utilisateur SET linked_user_id=NULL WHERE id_user=%s", (oldp,)
            )
        execute("UPDATE utilisateur SET linked_user_id=NULL WHERE id_user=%s", (uid,))
        if raw_pid is None or raw_pid == "":
            return jsonify({"success": True})
        try:
            pid = int(raw_pid)
        except (TypeError, ValueError):
            return jsonify({"success": True})
        if pid == uid:
            return jsonify({"error": "Choix invalide"}), 400
        execute(
            "UPDATE utilisateur SET linked_user_id=%s WHERE id_user=%s", (pid, uid)
        )
        execute(
            "UPDATE utilisateur SET linked_user_id=%s WHERE id_user=%s", (uid, pid)
        )
        return jsonify({"success": True})
