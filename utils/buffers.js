// Marge de battement (en minutes) ajoutée après chaque RDV.
// ⚠️ Ces valeurs sont utilisées à la fois pour GÉNÉRER les créneaux affichés
// (creneauController) et pour VALIDER la création d'une réservation
// (reservationController, adminReservationController).
// Elles doivent rester identiques des deux côtés : sinon un créneau affiché
// comme disponible peut être refusé à la création ("Conflit avec une autre
// réservation") — bug constaté quand l'affichage utilisait +15 et la création +20.
const BUFFER_SALON = 20;    // rotation entre deux clientes au salon
const BUFFER_DOMICILE = 20; // temps de déplacement entre deux domiciles

module.exports = { BUFFER_SALON, BUFFER_DOMICILE };
