const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/role');

const {
  getAllExceptions,
  getExceptionByDate,
  createException,
  updateException,
  deleteException,
  addPlageException,
  deletePlageException,
  addDepartementException,
  deleteDepartementException
} = require('../controllers/planningExceptionController');

// Routes planning exception (Admin uniquement)
router.get('/', authenticateUser, checkRole('Admin'), getAllExceptions);
router.get('/:date', authenticateUser, checkRole('Admin'), getExceptionByDate);
router.post('/', authenticateUser, checkRole('Admin'), createException);
router.put('/:date', authenticateUser, checkRole('Admin'), updateException);
router.delete('/:date', authenticateUser, checkRole('Admin'), deleteException);

// Routes gestion des plages d'exception (Admin uniquement)
router.post('/:id/plages', authenticateUser, checkRole('Admin'), addPlageException);
router.delete('/plages/:plageId', authenticateUser, checkRole('Admin'), deletePlageException);

// Routes gestion des départements d'exception (Admin uniquement)
router.post('/:id/departements', authenticateUser, checkRole('Admin'), addDepartementException);
router.delete('/departements/:deptId', authenticateUser, checkRole('Admin'), deleteDepartementException);

module.exports = router;
