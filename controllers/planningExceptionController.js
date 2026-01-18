const db = require('../db');
const { validateDate, validateMode, validatePlageHoraire } = require('../utils/validations');

/**
 * GET /api/planning-exception
 * Récupère toutes les exceptions de planning
 */
const getAllExceptions = async (req, res) => {
  try {
    const exceptions = await db.query(`
      SELECT pe.*,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', pep.id,
              'heure_debut', pep.heure_debut,
              'heure_fin', pep.heure_fin
            )
          ) FILTER (WHERE pep.id IS NOT NULL),
          '[]'
        ) AS plages,
        COALESCE(
          JSON_AGG(DISTINCT
            JSON_BUILD_OBJECT(
              'id', ped.id,
              'code_postal', ped.code_postal,
              'nom', ped.nom
            )
          ) FILTER (WHERE ped.id IS NOT NULL),
          '[]'
        ) AS departements
      FROM planning_exception pe
      LEFT JOIN planning_exception_plage pep ON pep.planning_exception_id = pe.id
      LEFT JOIN planning_exception_departement ped ON ped.planning_exception_id = pe.id
      GROUP BY pe.id
      ORDER BY pe.date ASC
    `);

    res.json(exceptions.rows);
  } catch (error) {
    console.error('Erreur getAllExceptions :', error);
    res.status(500).json({ error: 'Erreur lors de la récupération des exceptions.' });
  }
};

/**
 * GET /api/planning-exception/:date
 * Récupère l'exception pour une date donnée
 */
const getExceptionByDate = async (req, res) => {
  const { date } = req.params;

  const validation = validateDate(date);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const exception = await db.query(`
      SELECT pe.*,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id', pep.id,
              'heure_debut', pep.heure_debut,
              'heure_fin', pep.heure_fin
            )
          ) FILTER (WHERE pep.id IS NOT NULL),
          '[]'
        ) AS plages,
        COALESCE(
          JSON_AGG(DISTINCT
            JSON_BUILD_OBJECT(
              'id', ped.id,
              'code_postal', ped.code_postal,
              'nom', ped.nom
            )
          ) FILTER (WHERE ped.id IS NOT NULL),
          '[]'
        ) AS departements
      FROM planning_exception pe
      LEFT JOIN planning_exception_plage pep ON pep.planning_exception_id = pe.id
      LEFT JOIN planning_exception_departement ped ON ped.planning_exception_id = pe.id
      WHERE pe.date = $1
      GROUP BY pe.id
    `, [date]);

    if (exception.rows.length === 0) {
      return res.status(404).json({ error: 'Aucune exception trouvée pour cette date.' });
    }

    res.json(exception.rows[0]);
  } catch (error) {
    console.error('Erreur getExceptionByDate :', error);
    res.status(500).json({ error: 'Erreur lors de la récupération de l\'exception.' });
  }
};

/**
 * POST /api/planning-exception
 * Crée une exception de planning
 */
const createException = async (req, res) => {
  const { date, actif, mode, motif } = req.body;

  // Validations
  const validationDate = validateDate(date);
  if (!validationDate.valid) {
    return res.status(400).json({ error: validationDate.error });
  }

  if (typeof actif !== 'boolean') {
    return res.status(400).json({ error: 'Le champ actif doit être un booléen.' });
  }

  // Si actif = true, le mode est requis
  if (actif === true) {
    const validationMode = validateMode(mode);
    if (!validationMode.valid) {
      return res.status(400).json({ error: validationMode.error });
    }
  }

  // Si actif = false, le mode doit être null
  if (actif === false && mode) {
    return res.status(400).json({ error: 'Le mode doit être null quand actif = false.' });
  }

  try {
    // Vérifier si une exception existe déjà pour cette date
    const existing = await db.query(
      'SELECT * FROM planning_exception WHERE date = $1',
      [date]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: `Une exception existe déjà pour la date ${date}.` });
    }

    const result = await db.query(`
      INSERT INTO planning_exception (date, actif, mode, motif)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [date, actif, actif ? mode : null, motif || null]);

    res.status(201).json({ 
      message: 'Exception créée avec succès.', 
      exception: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur createException :', error);
    res.status(500).json({ error: 'Erreur lors de la création de l\'exception.' });
  }
};

/**
 * PUT /api/planning-exception/:date
 * Modifie une exception de planning
 */
const updateException = async (req, res) => {
  const { date } = req.params;
  const { actif, mode, motif } = req.body;

  const validationDate = validateDate(date);
  if (!validationDate.valid) {
    return res.status(400).json({ error: validationDate.error });
  }

  // Validations
  if (actif !== undefined && typeof actif !== 'boolean') {
    return res.status(400).json({ error: 'Le champ actif doit être un booléen.' });
  }

  if (actif === true && mode) {
    const validationMode = validateMode(mode);
    if (!validationMode.valid) {
      return res.status(400).json({ error: validationMode.error });
    }
  }

  if (actif === false && mode) {
    return res.status(400).json({ error: 'Le mode doit être null quand actif = false.' });
  }

  try {
    const updates = [];
    const values = [];
    let paramIndex = 1;

    if (actif !== undefined) {
      updates.push(`actif = $${paramIndex++}`);
      values.push(actif);
    }

    if (mode !== undefined) {
      updates.push(`mode = $${paramIndex++}`);
      values.push(mode);
    }

    if (motif !== undefined) {
      updates.push(`motif = $${paramIndex++}`);
      values.push(motif);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(date);

    const result = await db.query(`
      UPDATE planning_exception
      SET ${updates.join(', ')}
      WHERE date = $${paramIndex}
      RETURNING *
    `, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Exception non trouvée.' });
    }

    res.json({ 
      message: 'Exception mise à jour avec succès.', 
      exception: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur updateException :', error);
    res.status(500).json({ error: 'Erreur lors de la mise à jour de l\'exception.' });
  }
};

/**
 * DELETE /api/planning-exception/:date
 * Supprime une exception de planning
 */
const deleteException = async (req, res) => {
  const { date } = req.params;

  const validation = validateDate(date);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    const result = await db.query('DELETE FROM planning_exception WHERE date = $1', [date]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Exception non trouvée.' });
    }

    res.json({ message: 'Exception supprimée avec succès.' });
  } catch (error) {
    console.error('Erreur deleteException :', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de l\'exception.' });
  }
};

/**
 * POST /api/planning-exception/:id/plages
 * Ajoute une plage horaire à une exception
 */
const addPlageException = async (req, res) => {
  const { id } = req.params;
  const { heure_debut, heure_fin } = req.body;

  const validation = validatePlageHoraire(heure_debut, heure_fin);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }

  try {
    // Vérifier que l'exception existe
    const exception = await db.query('SELECT * FROM planning_exception WHERE id = $1', [id]);
    if (exception.rows.length === 0) {
      return res.status(404).json({ error: 'Exception non trouvée.' });
    }

    if (!exception.rows[0].actif) {
      return res.status(400).json({ error: 'Impossible d\'ajouter des plages à une exception inactive.' });
    }

    const result = await db.query(`
      INSERT INTO planning_exception_plage (planning_exception_id, heure_debut, heure_fin)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, heure_debut, heure_fin]);

    res.status(201).json({ 
      message: 'Plage horaire ajoutée avec succès.', 
      plage: result.rows[0] 
    });
  } catch (error) {
    console.error('Erreur addPlageException :', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout de la plage horaire.' });
  }
};

/**
 * DELETE /api/planning-exception/plages/:plageId
 * Supprime une plage horaire d'exception
 */
const deletePlageException = async (req, res) => {
  const { plageId } = req.params;

  try {
    const result = await db.query('DELETE FROM planning_exception_plage WHERE id = $1', [plageId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Plage horaire non trouvée.' });
    }

    res.json({ message: 'Plage horaire supprimée avec succès.' });
  } catch (error) {
    console.error('Erreur deletePlageException :', error);
    res.status(500).json({ error: 'Erreur lors de la suppression de la plage horaire.' });
  }
};

/**
 * POST /api/planning-exception/:id/departements
 * Ajoute un département à une exception
 */
const addDepartementException = async (req, res) => {
  const { id } = req.params;
  const { code_postal, nom } = req.body;

  if (!code_postal) {
    return res.status(400).json({ error: 'Le code postal est requis.' });
  }

  if (!nom) {
    return res.status(400).json({ error: 'Le nom du département est requis.' });
  }

  try {
    // Vérifier que l'exception existe et est en mode DOMICILE
    const exception = await db.query('SELECT * FROM planning_exception WHERE id = $1', [id]);
    if (exception.rows.length === 0) {
      return res.status(404).json({ error: 'Exception non trouvée.' });
    }

    if (exception.rows[0].mode !== 'DOMICILE') {
      return res.status(400).json({ error: 'Les départements ne peuvent être ajoutés qu\'en mode DOMICILE.' });
    }

    const result = await db.query(`
      INSERT INTO planning_exception_departement (planning_exception_id, code_postal, nom)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [id, code_postal, nom]);

    res.status(201).json({ 
      message: 'Département ajouté avec succès.', 
      departement: result.rows[0] 
    });
  } catch (error) {
    if (error.code === '23505') { // Violation contrainte unicité
      return res.status(400).json({ error: 'Ce département existe déjà pour cette exception.' });
    }
    console.error('Erreur addDepartementException :', error);
    res.status(500).json({ error: 'Erreur lors de l\'ajout du département.' });
  }
};

/**
 * DELETE /api/planning-exception/departements/:deptId
 * Supprime un département d'une exception
 */
const deleteDepartementException = async (req, res) => {
  const { deptId } = req.params;

  try {
    const result = await db.query('DELETE FROM planning_exception_departement WHERE id = $1', [deptId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Département non trouvé.' });
    }

    res.json({ message: 'Département supprimé avec succès.' });
  } catch (error) {
    console.error('Erreur deleteDepartementException :', error);
    res.status(500).json({ error: 'Erreur lors de la suppression du département.' });
  }
};

module.exports = {
  getAllExceptions,
  getExceptionByDate,
  createException,
  updateException,
  deleteException,
  addPlageException,
  deletePlageException,
  addDepartementException,
  deleteDepartementException
};
