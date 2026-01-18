const db = require('../db');

// 📋 GET /api/departements - Récupérer les départements configurés via planning_hebdo (actifs)
const getAllDepartements = async (req, res) => {
  try {
    const result = await db.query(`
      SELECT DISTINCT 
        phd.code,
        phd.nom,
        ph.mode,
        ph.jour_semaine
      FROM planning_hebdo_departement phd
      JOIN planning_hebdo ph ON ph.id = phd.planning_hebdo_id
      WHERE ph.actif = TRUE
      ORDER BY ph.mode, phd.code, phd.nom
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Erreur getAllDepartements:', error);
    res.status(500).json({ error: "Erreur lors de la récupération des départements." });
  }
};

// 🆕 POST /api/departements - Non utilisé (utiliser /api/planning-hebdo/:id/departements)
const createDepartement = async (req, res) => {
  return res.status(400).json({
    error: "Endpoint obsolète. Utilisez POST /api/planning-hebdo/:id/departements pour ajouter un département au planning DOMICILE."
  });
};

// ✏️ PUT /api/departements/:id - Non utilisé
const updateDepartement = async (req, res) => {
  return res.status(400).json({
    error: "Endpoint obsolète. Utilisez PUT sur les routes planning-hebdo/planning-exception appropriées."
  });
};

// 🗑️ DELETE /api/departements/:id - Non utilisé
const deleteDepartement = async (req, res) => {
  return res.status(400).json({
    error: "Endpoint obsolète. Utilisez DELETE /api/planning-hebdo/departements/:deptId pour retirer un département du planning."
  });
};

module.exports = {
  getAllDepartements,
  createDepartement,
  updateDepartement,
  deleteDepartement
};
