-- =====================================================
-- SCRIPT DE CRÉATION BASE DE DONNÉES
-- CABINET DENTAIRE -
-- =====================================================

-- Étape 1: Créer la base de données
DROP DATABASE IF EXISTS cabinet_dentaire;
CREATE DATABASE cabinet_dentaire;
USE cabinet_dentaire;

-- =====================================================
-- TABLEAUX (dans le bon ordre)
-- =====================================================

-- Table des utilisateurs
CREATE TABLE utilisateur (
    id_user INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    role ENUM('dentiste', 'secretaire') NOT NULL DEFAULT 'secretaire',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des patients
CREATE TABLE patient (
    id_patient INT AUTO_INCREMENT PRIMARY KEY,
    nom VARCHAR(100) NOT NULL,
    prenom VARCHAR(100) NOT NULL,
    sexe ENUM('Masculin', 'Feminin') NOT NULL,
    telephone VARCHAR(20) NOT NULL,
    cnie VARCHAR(50),
    date_naissance DATE,
    address TEXT,
    email VARCHAR(100),
    antecedents_medicaux TEXT,
    allergies TEXT,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Table des services
CREATE TABLE service (
    id_service INT AUTO_INCREMENT PRIMARY KEY,
    nom_service VARCHAR(100) NOT NULL,
    description TEXT,
    prix DECIMAL(10, 2) NOT NULL,
    categorie VARCHAR(50),
    active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Table des rendez-vous
CREATE TABLE rendez_vous (
    id_rdv INT AUTO_INCREMENT PRIMARY KEY,
    id_patient INT NOT NULL,
    id_user INT,
    date_rdv DATE NOT NULL,
    heure_rdv TIME NOT NULL,
    motif VARCHAR(255),
    dent VARCHAR(10),
    statut ENUM('Prevu', 'Termine', 'Annule', 'En cours') DEFAULT 'Prevu',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_patient) REFERENCES patient(id_patient) ON DELETE CASCADE,
    FOREIGN KEY (id_user) REFERENCES utilisateur(id_user) ON DELETE SET NULL
);

-- Table de la salle d'attente
CREATE TABLE salle_attente (
    id INT AUTO_INCREMENT PRIMARY KEY,
    id_patient INT NOT NULL,
    id_rdv INT,
    date_attente DATE NOT NULL,
    heure_arrivee TIME NOT NULL,
    position INT DEFAULT 1,
    statut ENUM('En attente', 'En cours', 'Termine') DEFAULT 'En attente',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_patient) REFERENCES patient(id_patient) ON DELETE CASCADE,
    FOREIGN KEY (id_rdv) REFERENCES rendez_vous(id_rdv) ON DELETE SET NULL
);

-- Table des consultations
CREATE TABLE consultation (
    id_consultation INT AUTO_INCREMENT PRIMARY KEY,
    id_patient INT NOT NULL,
    id_rdv INT,
    id_user INT NOT NULL,
    date_consultation DATE NOT NULL,
    diagnostique TEXT,
    traitement TEXT,
    prescriptions TEXT,
    next_rdv DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_patient) REFERENCES patient(id_patient) ON DELETE CASCADE,
    FOREIGN KEY (id_rdv) REFERENCES rendez_vous(id_rdv) ON DELETE SET NULL,
    FOREIGN KEY (id_user) REFERENCES utilisateur(id_user) ON DELETE CASCADE
);

-- Table des factures
CREATE TABLE facture (
    id_facture INT AUTO_INCREMENT PRIMARY KEY,
    id_patient INT NOT NULL,
    id_user INT NOT NULL,
    numero_facture VARCHAR(20) NOT NULL UNIQUE,
    date_facture DATE NOT NULL,
    montant_total DECIMAL(10, 2) NOT NULL,
    montant_regle DECIMAL(10, 2) DEFAULT 0,
    statut ENUM('Impayee', 'Payee', 'Partiellement payee') DEFAULT 'Impayee',
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_patient) REFERENCES patient(id_patient) ON DELETE CASCADE,
    FOREIGN KEY (id_user) REFERENCES utilisateur(id_user) ON DELETE CASCADE
);

-- Table des détails de facture
CREATE TABLE facture_detail (
    id_detail INT AUTO_INCREMENT PRIMARY KEY,
    id_facture INT NOT NULL,
    id_service INT,
    description TEXT NOT NULL,
    quantite INT DEFAULT 1,
    prix_unitaire DECIMAL(10, 2) NOT NULL,
    sous_total DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (id_facture) REFERENCES facture(id_facture) ON DELETE CASCADE,
    FOREIGN KEY (id_service) REFERENCES service(id_service) ON DELETE SET NULL
);

-- Table des paiements
CREATE TABLE paiement (
    id_paiement INT AUTO_INCREMENT PRIMARY KEY,
    id_patient INT NOT NULL,
    id_rdv INT,
    id_facture INT NULL,
    id_user INT NOT NULL,
    montant DECIMAL(10, 2) NOT NULL,
    type_paiement ENUM('Especes', 'Carte', 'Virement', 'Cheque') DEFAULT 'Especes',
    date_paiement DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (id_patient) REFERENCES patient(id_patient) ON DELETE CASCADE,
    FOREIGN KEY (id_rdv) REFERENCES rendez_vous(id_rdv) ON DELETE SET NULL,
    FOREIGN KEY (id_facture) REFERENCES facture(id_facture) ON DELETE SET NULL,
    FOREIGN KEY (id_user) REFERENCES utilisateur(id_user) ON DELETE CASCADE
);

-- =====================================================
-- DONNÉES DE TEST
-- =====================================================

-- Utilisateurs
INSERT INTO utilisateur (username, password, nom, prenom, role) VALUES
('dentiste', 'admin123', 'Dupont', 'Jean', 'dentiste'),
('secretaire', 'secret123', 'Martin', 'Sophie', 'secretaire');

-- Patients
INSERT INTO patient (nom, prenom, sexe, telephone, cnie, date_naissance, email) VALUES
('Alaoui', 'Fatima', 'Feminin', '0612345678', 'AB123456', '1985-03-15', 'fatima.alaoui@email.com'),
('Benali', 'Mohammed', 'Masculin', '0623456789', 'CD789012', '1978-07-22', 'mohammed.benali@email.com'),
('Khalidi', 'Aicha', 'Feminin', '0634567890', 'EF345678', '1990-11-08', 'aicha.khalidi@email.com'),
('Tazi', 'Youssef', 'Masculin', '0645678901', 'GH901234', '1982-01-30', 'youssef.tazi@email.com'),
('Rachidi', 'Leila', 'Feminin', '0656789012', 'IJ567890', '1995-06-18', 'leila.rachidi@email.com');

-- Rendez-vous (avec dates actuelles pour la salle d'attente)
INSERT INTO rendez_vous (id_patient, id_user, date_rdv, heure_rdv, motif, statut) VALUES
(1, 1, CURDATE(), '09:00:00', 'Consultation de controle', 'Prevu'),
(2, 1, CURDATE(), '10:00:00', 'Detartrage', 'Prevu'),
(3, 1, CURDATE(), '11:30:00', 'Carie - dent 36', 'Prevu'),
(4, 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '09:30:00', 'Extraction dent 47', 'Prevu'),
(5, 1, DATE_ADD(CURDATE(), INTERVAL 1 DAY), '14:00:00', 'Blanchiment dents', 'Prevu'),
(1, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '10:00:00', 'Consultation', 'Termine');

-- Consultations
INSERT INTO consultation (id_patient, id_rdv, id_user, date_consultation, diagnostique, traitement) VALUES
(1, 6, 1, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'Tout va bien, bonne hygiene bucco-dentaire', 'Aucun traitement necessaire, prochain controle dans 6 mois');

-- Services
INSERT INTO service (nom_service, description, prix, categorie) VALUES
('Consultation', 'Examen bucco-dentaire complet', 150.00, 'Consultation'),
('Detartrage', 'Nettoyage professionnel des dents', 200.00, 'Prevention'),
('Blanchiment', 'Traitement de blanchiment des dents', 500.00, 'Esthetique'),
('Carie - Composite', 'Restauration caries avec composite', 250.00, 'Restauration'),
('Couronne', 'Pose de couronne dentaire', 800.00, 'Prothese'),
('Implant', 'Pose implant dentaire', 2000.00, 'Implant'),
('Extraction', 'Extraction dune dent', 150.00, 'Chirurgie'),
('Traitement canal', 'Traitement endodontique', 500.00, 'Endodontie');

-- =====================================================
-- SCHÉMA DENTAIRE
-- =====================================================

-- État de chaque dent par patient
CREATE TABLE IF NOT EXISTS schema_dentaire (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    id_patient   INT NOT NULL,
    numero_dent  TINYINT NOT NULL,
    etat         ENUM('saine','carie','bridge','implant','couronne','extraction','traitement_canal','absente') NOT NULL DEFAULT 'saine',
    notes        TEXT NULL,
    created_at   DATETIME DEFAULT NOW(),
    updated_at   DATETIME DEFAULT NOW() ON UPDATE NOW(),
    UNIQUE KEY uq_patient_dent (id_patient, numero_dent),
    FOREIGN KEY (id_patient) REFERENCES patient(id_patient) ON DELETE CASCADE
);

-- Dents associées à un rendez-vous (plusieurs dents possibles)
CREATE TABLE IF NOT EXISTS rdv_dents (
    id           INT AUTO_INCREMENT PRIMARY KEY,
    id_rdv       INT NOT NULL,
    id_patient   INT NOT NULL,
    numero_dent  TINYINT NOT NULL,
    created_at   DATETIME DEFAULT NOW(),
    UNIQUE KEY uq_rdv_dent (id_rdv, numero_dent),
    FOREIGN KEY (id_rdv)      REFERENCES rendez_vous(id_rdv) ON DELETE CASCADE,
    FOREIGN KEY (id_patient)  REFERENCES patient(id_patient) ON DELETE CASCADE
);

-- =====================================================
-- MESSAGE
-- =====================================================
SELECT 'Base de donnees creee avec succes!' AS message;
