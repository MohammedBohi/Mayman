const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middlewares/auth');
const { checkRole } = require('../middlewares/role');
const adminReservationController = require('../controllers/adminReservationController');

router.use(authenticateUser, checkRole(['Admin']));

router.get('/', adminReservationController.getReservationsParJour); // ?jour=YYYY-MM-DD
router.get('/:id', adminReservationController.getReservationDetails);
router.post('/', adminReservationController.creerReservationPourClient);
router.delete('/:id', adminReservationController.supprimerReservation);

module.exports = router;