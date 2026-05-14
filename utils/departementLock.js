// Calcul des plages verrouillées par la règle de clustering départemental.
// Pour chaque résa DOMICILE (anchor), le créneau immédiatement suivant est verrouillé
// au département de l'anchor, sauf si la chaîne contiguë same-dept totalise déjà >= 2 personnes.

const toMinutes = (heure) => {
  if (!heure) return 0;
  const [h, m] = heure.toString().split(':').map(Number);
  return h * 60 + m;
};

const norm = (s) => (s && String(s).trim()) || null;

// Compare la chaîne et le client : si les deux ont une ville, compare sur la ville
// (clustering fin) ; sinon, retombe sur le code département (compat ascendante pour
// les résas créées avant l'ajout de la colonne `ville`).
function matchClef(chaine, client) {
  if (chaine.ville && client.ville) return chaine.ville === client.ville;
  return chaine.dept === client.dept;
}

// Construit la liste des chaînes contiguës "même zone" à partir des réservations du jour.
// Une chaîne = suite de résas DOMICILE qui se touchent exactement (fin de l'une = début
// de la suivante) ET qui matchent selon `matchClef`.
function construireChaines(reservationsDuJour) {
  const resasDomicile = reservationsDuJour
    .filter(r => r.mode === 'DOMICILE' && (norm(r.ville) || r.departement))
    .map(r => ({
      ville: norm(r.ville),
      dept: r.departement || null,
      debut: toMinutes(r.heure_debut),
      fin: toMinutes(r.heure_debut) + r.duree_totale_minutes,
      personnes: r.nombre_personnes || 1,
    }))
    .sort((a, b) => a.debut - b.debut);

  const chaines = [];
  for (const r of resasDomicile) {
    const derniere = chaines[chaines.length - 1];
    if (derniere && derniere.fin === r.debut && matchClef(derniere, r)) {
      derniere.fin = r.fin;
      derniere.personnes += r.personnes;
      // Si la chaîne avait ville=null et la nouvelle l'a, on enrichit pour les prochains matchs
      if (!derniere.ville && r.ville) derniere.ville = r.ville;
    } else {
      chaines.push({
        ville: r.ville,
        dept: r.dept,
        fin: r.fin,
        personnes: r.personnes,
      });
    }
  }
  return chaines;
}

// Retourne les plages bloquées pour un client identifié par ville+dept.
// Si pas d'info (mode SALON), retourne [].
function calculerPlagesLockees(reservationsDuJour, villeClient, deptClient, dureeMinutes) {
  const ville = norm(villeClient);
  const dept = deptClient || null;
  if (!ville && !dept) return [];
  const chaines = construireChaines(reservationsDuJour);
  const locks = [];
  for (const ch of chaines) {
    if (ch.personnes < 2 && !matchClef(ch, { ville, dept })) {
      locks.push({ debut: ch.fin, fin: ch.fin + dureeMinutes });
    }
  }
  return locks;
}

// Vérifie qu'un créneau qui démarre à `debutMinutes` n'est pas verrouillé pour ce client.
// Retourne null si OK, sinon une description (ville si dispo, sinon dept) de la zone lockée.
function verifierLockReservation(reservationsDuJour, villeClient, deptClient, debutMinutes) {
  const ville = norm(villeClient);
  const dept = deptClient || null;
  if (!ville && !dept) return null;
  const chaines = construireChaines(reservationsDuJour);
  for (const ch of chaines) {
    if (ch.personnes < 2 && !matchClef(ch, { ville, dept }) && ch.fin === debutMinutes) {
      return ch.ville || ch.dept;
    }
  }
  return null;
}

module.exports = {
  calculerPlagesLockees,
  verifierLockReservation,
  construireChaines,
};
