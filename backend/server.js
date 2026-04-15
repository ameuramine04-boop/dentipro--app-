const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());

// IMPORTANT: bodyParser ne doit pas intercepter multipart/form-data (multer le gère)
// On n'applique bodyParser qu'aux requêtes JSON et URL-encoded
app.use((req, res, next) => {
    const ct = req.headers['content-type'] || '';
    if (ct.includes('multipart/form-data')) return next(); // laisser multer gérer
    next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Routes API
const authRouter = require("./routes/auth");
const { authenticate } = require("./routes/auth");

app.use("/api", authRouter); // Public auth routes (login, verify)

// Protected API routes that require a valid token
app.use("/api", authenticate, require("./routes/patients"));
app.use("/api", authenticate, require("./routes/rdv"));
app.use("/api", authenticate, require("./routes/paiements"));
app.use("/api", authenticate, require("./routes/factures"));
app.use("/api", authenticate, require("./routes/salleAttente"));
app.use("/api", authenticate, require("./routes/schema_dentaire"));
app.use("/api", authenticate, require("./routes/chat"));
app.use("/api", authenticate, require("./routes/export"));

// Fichiers uploadés statiques
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// Stats graphiques (endpoints supplémentaires)
const db = require('./config/db');

app.get('/api/paiements/stats/types', authenticate, async(req, res) => {
    try {
        const [r] = await db.query(`SELECT
        COALESCE(SUM(CASE WHEN type_paiement='Especes'  THEN montant ELSE 0 END),0) as especes,
        COALESCE(SUM(CASE WHEN type_paiement='Carte'    THEN montant ELSE 0 END),0) as carte,
        COALESCE(SUM(CASE WHEN type_paiement='Virement' THEN montant ELSE 0 END),0) as virement,
        COALESCE(SUM(CASE WHEN type_paiement='Cheque'   THEN montant ELSE 0 END),0) as cheque
        FROM paiement`);
        res.json(r[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/paiements/stats/chart', authenticate, async(req, res) => {
    try {
        const [r] = await db.query(`SELECT DATE_FORMAT(date_paiement,'%Y-%m') as mois, SUM(montant) as total
              FROM paiement WHERE date_paiement >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
              GROUP BY mois ORDER BY mois ASC`);
        res.json(r);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/rdv/stats/chart', authenticate, async(req, res) => {
    try {
        const [r] = await db.query(`SELECT DATE_FORMAT(date_rdv,'%Y-%m') as mois, COUNT(*) as total
              FROM rendez_vous WHERE date_rdv >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
              GROUP BY mois ORDER BY mois ASC`);
        res.json(r);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Frontend statique
app.use(express.static(path.join(__dirname, "../frontend")));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "../frontend/login.html")));
app.get("/index", (req, res) => res.sendFile(path.join(__dirname, "../frontend/dashboard.html")));

app.listen(3000, () => console.log("🚀 DentiPro sur http://localhost:3000"));