// Calcul des plages verrouillées par la règle de clustering départemental.
// Pour chaque résa DOMICILE (anchor), le créneau immédiatement suivant est verrouillé
// au département de l'anchor, sauf si la chaîne contiguë same-dept totalise déjà >= 2 personnes.

const toMinutes = (heure) => {
  if (!heure) return 0;
  const [h, m] = heure.toString().split(':').map(Number);
  return h * 60 + m;
};

// Clé d'une résa pour le clustering : nom de ville si présent, sinon code département.
// Permet de chaîner par ville (plus précis) sans casser les anciennes résas qui n'ont que le dept.
const cleResa = (r) => (r.ville && r.ville.trim()) || r.departement;

// Construit la liste des chaînes contiguës same-ville à partir des réservations du jour.
// Une chaîne = suite de résas DOMICILE qui se touchent exactement (fin de l'une = début de la suivante) ET même clé (ville ou dept).
function construireChaines(reservationsDuJour) {
  const resasDomicile = reservationsDuJour
    .filter(r => r.mode === 'DOMICILE' && cleResa(r))
    .map(r => ({
      cle: cleResa(r),
      debut: toMinutes(r.heure_debut),
      fin: toMinutes(r.heure_debut) + r.duree_totale_minutes,
      personnes: r.nombre_personnes || 1,
    }))
    .sort((a, b) => a.debut - b.debut);

  const chaines = [];
  for (const r of resasDomicile) {
    const derniere = chaines[chaines.length - 1];
    if (derniere && derniere.cle === r.cle && derniere.fin === r.debut) {
      derniere.fin = r.fin;
      derniere.personnes += r.personnes;
    } else {
      chaines.push({ cle: r.cle, fin: r.fin, personnes: r.personnes });
    }
  }
  return chaines;
}

// Retourne les plages bloquées à appliquer pour le client identifié par `cleClient` (ville ou dept).
// Si pas de clé (mode SALON), retourne [].
function calculerPlagesLockees(reservationsDuJour, cleClient, dureeMinutes) {
  if (!cleClient) return [];
  const chaines = construireChaines(reservationsDuJour);
  const locks = [];
  for (const ch of chaines) {
    if (ch.personnes < 2 && ch.cle !== cleClient) {
      locks.push({ debut: ch.fin, fin: ch.fin + dureeMinutes });
    }
  }
  return locks;
}

// Vérifie qu'un créneau (debutMinutes) pour le client `cleClient` (ville ou dept)
// ne tombe pas dans une plage verrouillée par une autre chaîne.
// Retourne null si OK, sinon la clé lockée.
function verifierLockReservation(reservationsDuJour, cleClient, debutMinutes) {
  if (!cleClient) return null;
  const chaines = construireChaines(reservationsDuJour);
  for (const ch of chaines) {
    if (ch.personnes < 2 && ch.cle !== cleClient && ch.fin === debutMinutes) {
      return ch.cle;
    }
  }
  return null;
}

module.exports = {
  calculerPlagesLockees,
  verifierLockReservation,
  construireChaines,
};
