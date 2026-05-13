// Calcul des plages verrouillées par la règle de clustering départemental.
// Pour chaque résa DOMICILE (anchor), le créneau immédiatement suivant est verrouillé
// au département de l'anchor, sauf si la chaîne contiguë same-dept totalise déjà >= 2 personnes.

const toMinutes = (heure) => {
  if (!heure) return 0;
  const [h, m] = heure.toString().split(':').map(Number);
  return h * 60 + m;
};

// Construit la liste des chaînes contiguës same-dept à partir des réservations du jour.
// Une chaîne = suite de résas DOMICILE qui se touchent exactement (fin de l'une = début de la suivante) ET même département.
function construireChaines(reservationsDuJour) {
  const resasDomicile = reservationsDuJour
    .filter(r => r.mode === 'DOMICILE' && r.departement)
    .map(r => ({
      dept: r.departement,
      debut: toMinutes(r.heure_debut),
      fin: toMinutes(r.heure_debut) + r.duree_totale_minutes,
      personnes: r.nombre_personnes || 1,
    }))
    .sort((a, b) => a.debut - b.debut);

  const chaines = [];
  for (const r of resasDomicile) {
    const derniere = chaines[chaines.length - 1];
    if (derniere && derniere.dept === r.dept && derniere.fin === r.debut) {
      derniere.fin = r.fin;
      derniere.personnes += r.personnes;
    } else {
      chaines.push({ dept: r.dept, fin: r.fin, personnes: r.personnes });
    }
  }
  return chaines;
}

// Retourne les plages bloquées à appliquer pour le client en dept `codeDepartementClient`.
// Si pas de dept (mode SALON), retourne [].
function calculerPlagesLockees(reservationsDuJour, codeDepartementClient, dureeMinutes) {
  if (!codeDepartementClient) return [];
  const chaines = construireChaines(reservationsDuJour);
  const locks = [];
  for (const ch of chaines) {
    if (ch.personnes < 2 && ch.dept !== codeDepartementClient) {
      locks.push({ debut: ch.fin, fin: ch.fin + dureeMinutes });
    }
  }
  return locks;
}

// Vérifie qu'un créneau (debutMinutes, finMinutes) en dept `codeDepartementClient`
// ne tombe pas dans une plage verrouillée par une autre chaîne.
// Retourne null si OK, sinon le dept locké.
function verifierLockReservation(reservationsDuJour, codeDepartementClient, debutMinutes) {
  if (!codeDepartementClient) return null;
  const chaines = construireChaines(reservationsDuJour);
  for (const ch of chaines) {
    if (ch.personnes < 2 && ch.dept !== codeDepartementClient && ch.fin === debutMinutes) {
      return ch.dept;
    }
  }
  return null;
}

module.exports = {
  calculerPlagesLockees,
  verifierLockReservation,
  construireChaines,
};
