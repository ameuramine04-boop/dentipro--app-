// connection à la base de données MySQL
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
    host: "localhost",
    user: "root",
    password: "",
    database: "cabinet_dentaire",
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

pool.getConnection()
    .then(conn => {
        console.log("✅ Connecté à MySQL: cabinet_dentaire");
        conn.release(); // return the connection to pool
    })
    .catch(err => {
        console.error("❌ Erreur connexion MySQL:", err.message);
        process.exit(1);
    });

module.exports = pool;