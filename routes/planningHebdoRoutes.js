const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/role');

const {
  getAllPlannings,
  getPlanningByJour,
  createPlanning,
  updatePlanning,
  deletePlanning,
  addPlage,
  updatePlage,
  deletePlage,
  addDepartement,
  deleteDepartement,
  updateDepartement
} = require('../controllers/planningHebdoController');

// Routes planning hebdomadaire
router.get('/', getAllPlannings); // Public - pour récupérer les départements disponibles
router.get('/:jour', authenticateUser, checkRole('Admin'), getPlanningByJour);
router.post('/', authenticateUser, checkRole('Admin'), createPlanning);
router.put('/:id', authenticateUser, checkRole('Admin'), updatePlanning);
router.delete('/:id', authenticateUser, checkRole('Admin'), deletePlanning);

// Routes gestion des plages horaires (Admin uniquement)
router.post('/:id/plages', authenticateUser, checkRole('Admin'), addPlage);
router.put('/plages/:plageId', authenticateUser, checkRole('Admin'), updatePlage);
router.delete('/plages/:plageId', authenticateUser, checkRole('Admin'), deletePlage);

// Routes gestion des départements (Admin uniquement)
router.post('/:id/departements', authenticateUser, checkRole('Admin'), addDepartement);
router.delete('/departements/:deptId', authenticateUser, checkRole('Admin'), deleteDepartement);
router.put('/departements/:deptId', authenticateUser, checkRole('Admin'), updateDepartement);

module.exports = router;
