const express = require("express");
const router = express.Router();
const db = require("../config/db");

function getLocalDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// 1. Tous les patients de la salle d'attente aujourd'hui
router.get("/salle-attente", async(req, res) => {
    try {
        const today = getLocalDate();
        const sql = `
        SELECT sa.*, p.nom, p.prenom, p.telephone
        FROM salle_attente sa
        JOIN patient p ON sa.id_patient = p.id_patient
        WHERE sa.date_attente = ?
        ORDER BY sa.position ASC
    `;
        const [result] = await db.query(sql, [today]);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Patient en cours
router.get("/salle-attente/actuel", async(req, res) => {
    try {
        const today = getLocalDate();
        const sql = `
        SELECT sa.*, p.nom, p.prenom, p.telephone
        FROM salle_attente sa
        JOIN patient p ON sa.id_patient = p.id_patient
        WHERE sa.date_attente = ? AND sa.statut = 'En cours'
        ORDER BY sa.position ASC
        LIMIT 1
    `;
        const [result] = await db.query(sql, [today]);
        res.json(result.length > 0 ? result[0] : null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. File d'attente
router.get("/salle-attente/file", async(req, res) => {
    try {
        const today = getLocalDate();
        const sql = `
        SELECT sa.*, p.nom, p.prenom, p.telephone
        FROM salle_attente sa
        JOIN patient p ON sa.id_patient = p.id_patient
        WHERE sa.date_attente = ? AND sa.statut = 'En attente'
        ORDER BY sa.position ASC
    `;
        const [result] = await db.query(sql, [today]);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Un patient spécifique
router.get("/salle-attente/:id", async(req, res) => {
    try {
        const sql = `
        SELECT sa.*, p.nom, p.prenom, p.telephone
        FROM salle_attente sa
        JOIN patient p ON sa.id_patient = p.id_patient
        WHERE sa.id = ?
    `;
        const [result] = await db.query(sql, [req.params.id]);
        if (result.length === 0) {
            return res.status(404).json({ error: "Patient non trouvé dans la salle d'attente" });
        }
        res.json(result[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Ajouter un patient
router.post("/salle-attente", async(req, res) => {
    try {
        const { id_patient, id_rdv, heure_arrivee, notes } = req.body;
        const date_attente = getLocalDate();

        // Get max position among ALL patients today (including En cours and Terminé)
        // so new patients always get added at the end
        const [positionResult] = await db.query(
            `SELECT COALESCE(MAX(position), 0) as last_position FROM salle_attente WHERE date_attente = ?`,
            [date_attente]
        );
        const newPosition = positionResult[0].last_position + 1;

        const [insertResult] = await db.query(
            `INSERT INTO salle_attente (id_patient, id_rdv, date_attente, heure_arrivee, position, statut, notes)
             VALUES (?, ?, ?, ?, ?, 'En attente', ?)`,
            [id_patient, id_rdv || null, date_attente, heure_arrivee, newPosition, notes || null]
        );
        res.json({ success: true, id: insertResult.insertId, position: newPosition, message: "Patient ajouté à la salle d'attente" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Modifier
router.put("/salle-attente/:id", async(req, res) => {
    try {
        const { id_patient, id_rdv, heure_arrivee, notes } = req.body;
        await db.query(
            `UPDATE salle_attente SET id_patient = ?, id_rdv = ?, heure_arrivee = ?, notes = ? WHERE id = ?`,
            [id_patient, id_rdv || null, heure_arrivee, notes || null, req.params.id]
        );
        res.json({ success: true, message: "Patient modifié avec succès" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 7. Mettre à jour le statut
router.patch("/salle-attente/:id/statut", async(req, res) => {
    try {
        const { statut } = req.body;
        const statutsValides = ['En attente', 'En cours', 'Terminé'];
        if (!statutsValides.includes(statut)) {
            return res.status(400).json({ error: "Statut invalide. Utilisez: En attente, En cours, Terminé" });
        }
        await db.query("UPDATE salle_attente SET statut = ? WHERE id = ?", [statut, req.params.id]);
        res.json({ success: true, message: "Statut mis à jour" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 8. Mettre à jour la position
router.patch("/salle-attente/:id/position", async(req, res) => {
    try {
        const { position } = req.body;
        const id = req.params.id;
        const newPosition = parseInt(position, 10);

        if (!newPosition || newPosition < 1) {
            return res.status(400).json({ error: "Position invalide" });
        }

        const today = getLocalDate();
        const [currentResult] = await db.query("SELECT position FROM salle_attente WHERE id = ?", [id]);
        if (currentResult.length === 0) return res.status(404).json({ error: "Patient non trouvé" });

        const oldPosition = currentResult[0].position;
        if (oldPosition === newPosition) {
            return res.json({ success: true, message: "Position inchangée" });
        }

        if (newPosition > oldPosition) {
            await db.query(
                `UPDATE salle_attente SET position = position - 1 
                 WHERE date_attente = ? AND position > ? AND position <= ?`,
                [today, oldPosition, newPosition]
            );
        } else {
            await db.query(
                `UPDATE salle_attente SET position = position + 1 
                 WHERE date_attente = ? AND position >= ? AND position < ?`,
                [today, newPosition, oldPosition]
            );
        }

        await db.query("UPDATE salle_attente SET position = ? WHERE id = ?", [newPosition, id]);
        res.json({ success: true, message: "Position mise à jour" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 9. Supprimer
router.delete("/salle-attente/:id", async(req, res) => {
    try {
        const id = req.params.id;
        const [positionResult] = await db.query("SELECT position, date_attente FROM salle_attente WHERE id = ?", [id]);
        if (positionResult.length === 0) return res.status(404).json({ error: "Patient non trouvé" });

        const { position: deletedPosition, date_attente } = positionResult[0];

        await db.query("DELETE FROM salle_attente WHERE id = ?", [id]);

        // Only shift "En attente" patients — don't touch Terminé or En cours
        await db.query(
            `UPDATE salle_attente SET position = position - 1 
             WHERE date_attente = ? AND position > ? AND statut = 'En attente'`,
            [date_attente, deletedPosition]
        );

        res.json({ success: true, message: "Patient supprimé de la salle d'attente" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 10. Appeler le suivant — FIXED: ne remet PAS l'actuel en "En attente"
router.post("/salle-attente/appeler-suivant", async(req, res) => {
    try {
        const today = getLocalDate();

        // Check if someone is already "En cours"
        const [currentResult] = await db.query(
            `SELECT id FROM salle_attente WHERE date_attente = ? AND statut = 'En cours'`,
            [today]
        );

        if (currentResult.length > 0) {
            // Already someone in consultation — don't call next yet
            return res.json({
                success: false,
                message: "Un patient est déjà en consultation. Terminez d'abord la consultation en cours.",
                patient: null
            });
        }

        // Get the next patient by position (smallest position among "En attente")
        const [nextResult] = await db.query(
            `SELECT sa.*, p.nom, p.prenom
             FROM salle_attente sa
             JOIN patient p ON sa.id_patient = p.id_patient
             WHERE sa.date_attente = ? AND sa.statut = 'En attente'
             ORDER BY sa.position ASC
             LIMIT 1`,
            [today]
        );

        if (nextResult.length === 0) {
            return res.json({ success: false, message: "Aucun patient en attente", patient: null });
        }

        const patient = nextResult[0];
        await db.query("UPDATE salle_attente SET statut = 'En cours' WHERE id = ?", [patient.id]);

        res.json({
            success: true,
            patient: patient,
            message: `Appeler: ${patient.nom} ${patient.prenom}`
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 11. Terminer — FIXED: recompact positions correctly
router.post("/salle-attente/:id/terminer", async(req, res) => {
    try {
        const id = req.params.id;
        const today = getLocalDate();

        const [checkResult] = await db.query(
            "SELECT * FROM salle_attente WHERE id = ? AND statut = 'En cours'",
            [id]
        );

        if (checkResult.length === 0) {
            return res.status(400).json({ error: "Aucun patient en cours à terminer" });
        }

        const patient = checkResult[0];
        const terminedPosition = patient.position;

        // Mark as Terminé
        await db.query("UPDATE salle_attente SET statut = 'Terminé' WHERE id = ?", [id]);

        // Shift down only "En attente" patients that had a HIGHER position
        // This ensures sequential numbering 1,2,3... for remaining waiting patients
        await db.query(
            `UPDATE salle_attente 
             SET position = position - 1 
             WHERE date_attente = ? AND statut = 'En attente' AND position > ?`,
            [today, terminedPosition]
        );

        // Re-number all remaining "En attente" from 1 to N to ensure clean sequence
        const [remaining] = await db.query(
            `SELECT id FROM salle_attente 
             WHERE date_attente = ? AND statut = 'En attente' 
             ORDER BY position ASC`,
            [today]
        );

        // Reassign positions cleanly 1, 2, 3...
        for (let i = 0; i < remaining.length; i++) {
            await db.query(
                "UPDATE salle_attente SET position = ? WHERE id = ?",
                [i + 1, remaining[i].id]
            );
        }

        res.json({ success: true, message: "Consultation terminée" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 12. Statistiques
router.get("/salle-attente/stats", async(req, res) => {
    try {
        const today = getLocalDate();
        const sql = `
        SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN statut = 'En attente' THEN 1 ELSE 0 END) as en_attente,
            SUM(CASE WHEN statut = 'En cours' THEN 1 ELSE 0 END) as en_cours,
            SUM(CASE WHEN statut = 'Terminé' THEN 1 ELSE 0 END) as termine
        FROM salle_attente
        WHERE date_attente = ?
    `;
        const [result] = await db.query(sql, [today]);
        res.json(result[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 13. Réinitialiser
router.post("/salle-attente/reset", async(req, res) => {
    try {
        const today = getLocalDate();
        await db.query("DELETE FROM salle_attente WHERE date_attente = ?", [today]);
        res.json({ success: true, message: "Salle d'attente réinitialisée" });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
