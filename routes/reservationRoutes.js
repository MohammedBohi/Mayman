const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middlewares/auth');
const reservationController = require('../controllers/reservationController');

router.post('/', authenticateUser, reservationController.creerReservation);
router.get('/mes', authenticateUser, reservationController.getMesReservations);
router.get('/:id', authenticateUser, reservationController.getReservationById);
router.delete('/:id', authenticateUser, reservationController.annulerReservation);

module.exports = router;