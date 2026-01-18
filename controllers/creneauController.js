const db = require('../db');
const { validateDate } = require('../utils/validations');

// 🔧 Fonction utilitaire pour extraire le code département
const extraireCodeDepartement = (departementParam) => {
  if (!departementParam) return null;

  // Si c'est déjà un code simple (ex: "46", "82")
  if (/^\d{2,3}$/.test(departementParam)) {
    return departementParam;
  }

  // Si c'est un JSON stringifié : "{\"nom\":\"...\",\"codePostal\":\"46260\"}"
  try {
    const parsed = JSON.parse(departementParam);
    if (parsed.codePostal) {
      return parsed.codePostal.substring(0, 2); // Premiers 2 chiffres
    }
    if (parsed.code) {
      return parsed.code;
    }
  } catch (e) {
    // Pas du JSON, continuer
  }

  // Si c'est un code postal direct (ex: "46260")
  if (/^\d{5}$/.test(departementParam)) {
    return departementParam.substring(0, 2);
  }

  return null;
};

const getCreneauxDisponibles = async (req, res) => {
  // Accepter "date" ou "jour" pour rétrocompatibilité
  const dateParam = req.query.date || req.query.jour;
  const { duree, mode: modeParam, departement: departementParam } = req.query;
  
  // Validations des paramètres
  if (!dateParam || !duree) {
    return res.status(400).json({ error: "Paramètres 'date' et 'duree' requis." });
  }

  const validationDate = validateDate(dateParam);
  if (!validationDate.valid) {
    return res.status(400).json({ error: validationDate.error });
  }

  try {
    const dureeMinutes = parseInt(duree);
    const codeDepartement = extraireCodeDepartement(departementParam);

    const toMinutes = (heure) => {
      const [h, m] = heure.split(":").map(Number);
      return h * 60 + m;
    };

    const fromMinutes = (m) => {
      const h = Math.floor(m / 60);
      const mn = m % 60;
      return `${h.toString().padStart(2, '0')}:${mn.toString().padStart(2, '0')}`;
    };

    // 1. Déterminer le jour de la semaine (1=lundi, 7=dimanche)
    const dateObj = new Date(dateParam + 'T12:00:00');
    const jourSemaine = dateObj.getDay() || 7; // 0 (dimanche) devient 7

    // 2. Chercher une exception pour cette date
    const exception = await db.query(
      'SELECT * FROM planning_exception WHERE date = $1',
      [dateParam]
    );

    let planningActif = false;
    let planningMode = null; // 👈 Mode détecté automatiquement
    let plagesHoraires = [];

    if (exception.rows.length > 0) {
      // Exception trouvée → utiliser l'exception
      const exc = exception.rows[0];
      planningActif = exc.actif;
      planningMode = exc.mode;

      if (!planningActif) {
        // Jour fermé
        return res.json([]);
      }

      // Récupérer les plages de l'exception
      const plages = await db.query(
        'SELECT heure_debut, heure_fin FROM planning_exception_plage WHERE planning_exception_id = $1',
        [exc.id]
      );
      plagesHoraires = plages.rows;

      // Si mode DOMICILE, vérifier le département
      if (planningMode === 'DOMICILE' && codeDepartement) {
        const deptCheck = await db.query(
          'SELECT * FROM planning_exception_departement WHERE planning_exception_id = $1 AND code LIKE $2',
          [exc.id, codeDepartement + '%']
        );
        if (deptCheck.rows.length === 0) {
          return res.json([]); // Département non couvert ce jour
        }
      }

    } else {
      // Pas d'exception → utiliser planning hebdo
      const hebdo = await db.query(
        'SELECT * FROM planning_hebdo WHERE jour_semaine = $1',
        [jourSemaine]
      );

      if (hebdo.rows.length === 0 || !hebdo.rows[0].actif) {
        // Pas de planning ou jour fermé
        return res.json([]);
      }

      planningActif = hebdo.rows[0].actif;
      planningMode = hebdo.rows[0].mode;

      // Récupérer les plages du planning hebdo
      const plages = await db.query(
        'SELECT heure_debut, heure_fin FROM planning_hebdo_plage WHERE planning_hebdo_id = $1',
        [hebdo.rows[0].id]
      );
      plagesHoraires = plages.rows;

      // Si mode DOMICILE, vérifier le département
      if (planningMode === 'DOMICILE' && codeDepartement) {
        const deptCheck = await db.query(
          'SELECT * FROM planning_hebdo_departement WHERE planning_hebdo_id = $1 AND code LIKE $2',
          [hebdo.rows[0].id, codeDepartement + '%']
        );
        if (deptCheck.rows.length === 0) {
          return res.json([]); // Département non couvert
        }
      }
    }

    // 3. Générer les créneaux possibles à partir des plages horaires
    const maintenant = new Date();
    const aujourdHui = maintenant.toISOString().split("T")[0] === dateParam;
    const heureActuelle = aujourdHui ? maintenant.getHours() * 60 + maintenant.getMinutes() : 0;

    let creneauxPossibles = [];
    for (const plage of plagesHoraires) {
      const debutPlage = toMinutes(plage.heure_debut);
      const finPlage = toMinutes(plage.heure_fin);

      // 🎯 Générer créneaux avec un pas égal à la durée de la prestation
      // Ex: prestation 60 min → créneaux espacés de 60 min (9h00, 10h00, 11h00...)
      for (let t = debutPlage; t + dureeMinutes <= finPlage; t += dureeMinutes) {
        if (t >= heureActuelle) {
          creneauxPossibles.push(t);
        }
      }
    }

    // 4. Retirer les indisponibilités
    const indispos = await db.query(
      'SELECT heure_debut, heure_fin FROM indisponibilite WHERE jour = $1',
      [dateParam]
    );

    const plagesBloquees = [];
    const finsDeReservations = []; // 👈 Stocker les fins pour générer des créneaux
    
    for (const row of indispos.rows) {
      const debut = toMinutes(row.heure_debut);
      const fin = toMinutes(row.heure_fin);
      
      plagesBloquees.push({ debut, fin });
      finsDeReservations.push(fin); // 👈 Ajouter la fin
    }

    // 5. Retirer les réservations existantes
    const reservations = await db.query(
      'SELECT heure_debut, duree_totale_minutes FROM reservation WHERE jour = $1',
      [dateParam]
    );

    for (const row of reservations.rows) {
      const debut = toMinutes(row.heure_debut);
      const dureeExacte = row.duree_totale_minutes;
      
      // Bloquer exactement la durée de la réservation
      const fin = debut + dureeExacte;
      
      plagesBloquees.push({ debut, fin });
      finsDeReservations.push(fin); // 👈 Ajouter la fin
    }

    // 5b. Pour chaque fin de réservation/indisponibilité, générer des créneaux avec le pas
    for (const finResa of finsDeReservations) {
      // Vérifier dans quelle plage horaire on se trouve
      for (const plage of plagesHoraires) {
        const debutPlage = toMinutes(plage.heure_debut);
        const finPlage = toMinutes(plage.heure_fin);
        
        // Si la fin de réservation est dans cette plage, générer à partir de là
        if (finResa >= debutPlage && finResa < finPlage) {
          for (let t = finResa; t + dureeMinutes <= finPlage; t += dureeMinutes) {
            if (t >= heureActuelle && !creneauxPossibles.includes(t)) {
              creneauxPossibles.push(t);
            }
          }
        }
      }
    }

    // 6. Filtrer les créneaux disponibles
    const creneaux = creneauxPossibles
    .filter((creneau, index, self) => {
      // Supprimer les doublons
      return self.indexOf(creneau) === index;
    })
    .filter(creneau => {
      const finCreneau = creneau + dureeMinutes;
      
      // Vérifier qu'il n'y a AUCUN chevauchement avec les plages bloquées
      // Le créneau est valide UNIQUEMENT si [creneau, finCreneau[ ne touche AUCUNE plage bloquée
      const conflit = plagesBloquees.some(p => {
        // Chevauchement si : max(debut1, debut2) < min(fin1, fin2)
        return Math.max(creneau, p.debut) < Math.min(finCreneau, p.fin);
      });
      
      return !conflit;
    })
    .sort((a, b) => a - b) // 👈 Trier par ordre chronologique
    .filter((creneau, index, sorted) => {
      // 🎯 Supprimer les créneaux qui cassent le pas régulier
      // Si deux créneaux sont trop proches (< durée de prestation), garder seulement le premier
      if (index === 0) return true;
      const precedent = sorted[index - 1];
      return (creneau - precedent) >= dureeMinutes;
    })
    .map(m => fromMinutes(m));

    return res.json(creneaux);
  } catch (err) {
    console.error("Erreur récupération créneaux :", err);
    res.status(500).json({ error: "Erreur lors de la récupération des créneaux." });
  }
};

module.exports = {
  getCreneauxDisponibles
};