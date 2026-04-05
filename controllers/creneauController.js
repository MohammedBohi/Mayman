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
    const codeDepartement = extraireCodeDepartement(departementParam);
    let dureeMinutes = parseInt(duree);

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
          'SELECT * FROM planning_exception_departement WHERE planning_exception_id = $1 AND code_postal LIKE $2',
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
          'SELECT * FROM planning_hebdo_departement WHERE planning_hebdo_id = $1 AND code_postal LIKE $2',
          [hebdo.rows[0].id, codeDepartement + '%']
        );
        if (deptCheck.rows.length === 0) {
          return res.json([]); // Département non couvert
        }
      }
    }

    // 3. Ajouter 20 min de déplacement pour le mode DOMICILE
    if (planningMode === 'DOMICILE') {
      dureeMinutes += 20;
    }

    // 4. Générer les créneaux possibles à partir des plages horaires
    const maintenant = new Date();
    const aujourdHui = maintenant.toISOString().split("T")[0] === dateParam;
    const heureActuelle = aujourdHui ? maintenant.getHours() * 60 + maintenant.getMinutes() : 0;

    // 5. Récupérer les indisponibilités
    const indispos = await db.query(
      'SELECT heure_debut, heure_fin FROM indisponibilite WHERE jour = $1',
      [dateParam]
    );

    const plagesBloquees = [];
    
    for (const row of indispos.rows) {
      const debut = toMinutes(row.heure_debut);
      const fin = toMinutes(row.heure_fin);
      plagesBloquees.push({ debut, fin });
    }

    // 6. Récupérer les réservations existantes
    const reservations = await db.query(
      'SELECT heure_debut, duree_totale_minutes FROM reservation WHERE jour = $1',
      [dateParam]
    );

    for (const row of reservations.rows) {
      const debut = toMinutes(row.heure_debut);
      const fin = debut + row.duree_totale_minutes;
      plagesBloquees.push({ debut, fin });
    }

    // Trier les plages bloquées par ordre chronologique
    plagesBloquees.sort((a, b) => a.debut - b.debut);

    // 7. Générer les créneaux en parcourant intelligemment les plages horaires
    let creneauxPossibles = [];
    
    for (const plage of plagesHoraires) {
      const debutPlage = toMinutes(plage.heure_debut);
      const finPlage = toMinutes(plage.heure_fin);
      
      let curseur = Math.max(debutPlage, heureActuelle);
      
      while (curseur + dureeMinutes <= finPlage) {
        const finCreneau = curseur + dureeMinutes;
        
        // Vérifier si ce créneau chevauche une plage bloquée
        const conflit = plagesBloquees.find(p => 
          Math.max(curseur, p.debut) < Math.min(finCreneau, p.fin)
        );
        
        if (!conflit) {
          // Créneau disponible
          creneauxPossibles.push(curseur);
          curseur += dureeMinutes;
        } else {
          // Conflit détecté → sauter à la fin de la plage bloquée
          curseur = conflit.fin;
        }
      }
    }

    // 8. Formater et retourner les créneaux
    const creneaux = creneauxPossibles
      .sort((a, b) => a - b)
      .map(m => fromMinutes(m));

    return res.json(creneaux);
  } catch (err) {
    console.error("Erreur récupération créneaux :", err);
    res.status(500).json({ error: "Erreur lors de la récupération des créneaux." });
  }
};

// 📅 Disponibilité batch pour un mois entier (utilisé par le calendrier)
const getDisponibiliteMois = async (req, res) => {
  const { debut, fin, duree } = req.query;

  if (!debut || !fin || !duree) {
    return res.status(400).json({ error: "Paramètres 'debut', 'fin' et 'duree' requis." });
  }

  const validDebut = validateDate(debut);
  const validFin = validateDate(fin);
  if (!validDebut.valid) return res.status(400).json({ error: validDebut.error });
  if (!validFin.valid) return res.status(400).json({ error: validFin.error });

  try {
    const dureeMinutes = parseInt(duree);

    const toMinutes = (heure) => {
      const [h, m] = heure.split(":").map(Number);
      return h * 60 + m;
    };

    // 1. Fetch tout en batch (4-6 queries au lieu de ~150)
    const [hebdoRes, exceptionsRes, indisposRes, reservationsRes] = await Promise.all([
      db.query('SELECT ph.*, array_agg(json_build_object(\'heure_debut\', php.heure_debut, \'heure_fin\', php.heure_fin)) FILTER (WHERE php.id IS NOT NULL) as plages FROM planning_hebdo ph LEFT JOIN planning_hebdo_plage php ON php.planning_hebdo_id = ph.id GROUP BY ph.id'),
      db.query('SELECT pe.*, array_agg(json_build_object(\'heure_debut\', pep.heure_debut, \'heure_fin\', pep.heure_fin)) FILTER (WHERE pep.id IS NOT NULL) as plages FROM planning_exception pe LEFT JOIN planning_exception_plage pep ON pep.planning_exception_id = pe.id WHERE pe.date BETWEEN $1 AND $2 GROUP BY pe.id', [debut, fin]),
      db.query('SELECT jour, heure_debut, heure_fin FROM indisponibilite WHERE jour BETWEEN $1 AND $2', [debut, fin]),
      db.query('SELECT jour, heure_debut, duree_totale_minutes FROM reservation WHERE jour BETWEEN $1 AND $2', [debut, fin]),
    ]);

    // Indexer planning hebdo par jour_semaine
    const hebdoMap = {};
    for (const row of hebdoRes.rows) {
      hebdoMap[row.jour_semaine] = row;
    }

    // Indexer exceptions par date
    const exceptionMap = {};
    for (const row of exceptionsRes.rows) {
      const dateStr = row.date instanceof Date
        ? row.date.toISOString().split('T')[0]
        : String(row.date);
      exceptionMap[dateStr] = row;
    }

    // Grouper indispos par date
    const indispoMap = {};
    for (const row of indisposRes.rows) {
      const dateStr = row.jour instanceof Date
        ? row.jour.toISOString().split('T')[0]
        : String(row.jour);
      if (!indispoMap[dateStr]) indispoMap[dateStr] = [];
      indispoMap[dateStr].push({ debut: toMinutes(row.heure_debut), fin: toMinutes(row.heure_fin) });
    }

    // Grouper réservations par date
    const resaMap = {};
    for (const row of reservationsRes.rows) {
      const dateStr = row.jour instanceof Date
        ? row.jour.toISOString().split('T')[0]
        : String(row.jour);
      if (!resaMap[dateStr]) resaMap[dateStr] = [];
      const d = toMinutes(row.heure_debut);
      resaMap[dateStr].push({ debut: d, fin: d + row.duree_totale_minutes });
    }

    // 2. Itérer sur chaque date de l'intervalle
    const maintenant = new Date();
    const aujourdHuiStr = maintenant.toISOString().split("T")[0];
    const heureActuelleMinutes = maintenant.getHours() * 60 + maintenant.getMinutes();
    const resultats = [];

    const startDate = new Date(debut + 'T12:00:00');
    const endDate = new Date(fin + 'T12:00:00');

    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      const jourSemaine = d.getDay() || 7; // 0→7

      // Déterminer le planning pour cette date (exception > hebdo)
      let planningMode = null;
      let planningActif = false;
      let plagesHoraires = [];

      const exc = exceptionMap[dateStr];
      if (exc) {
        planningActif = exc.actif;
        planningMode = exc.mode;
        plagesHoraires = exc.plages || [];
      } else {
        const hebdo = hebdoMap[jourSemaine];
        if (hebdo) {
          planningActif = hebdo.actif;
          planningMode = hebdo.mode;
          plagesHoraires = hebdo.plages || [];
        }
      }

      // Si inactif → fermé
      if (!planningActif) {
        resultats.push({ date: dateStr, disponible: false, mode: null });
        continue;
      }

      // Durée ajustée pour DOMICILE
      const dureeAjustee = planningMode === 'DOMICILE' ? dureeMinutes + 20 : dureeMinutes;

      // Construire les plages bloquées pour cette date
      const plagesBloquees = [
        ...(indispoMap[dateStr] || []),
        ...(resaMap[dateStr] || []),
      ].sort((a, b) => a.debut - b.debut);

      const heureActuelle = (dateStr === aujourdHuiStr) ? heureActuelleMinutes : 0;

      // Chercher AU MOINS un créneau disponible (short-circuit)
      let auMoinsUnCreneau = false;

      for (const plage of plagesHoraires) {
        if (auMoinsUnCreneau) break;
        const debutPlage = toMinutes(plage.heure_debut);
        const finPlage = toMinutes(plage.heure_fin);
        let curseur = Math.max(debutPlage, heureActuelle);

        while (curseur + dureeAjustee <= finPlage) {
          const finCreneau = curseur + dureeAjustee;
          const conflit = plagesBloquees.find(p =>
            Math.max(curseur, p.debut) < Math.min(finCreneau, p.fin)
          );

          if (!conflit) {
            auMoinsUnCreneau = true;
            break;
          } else {
            curseur = conflit.fin;
          }
        }
      }

      resultats.push({ date: dateStr, disponible: auMoinsUnCreneau, mode: planningMode });
    }

    return res.json(resultats);
  } catch (err) {
    console.error("Erreur récupération disponibilité mois :", err);
    res.status(500).json({ error: "Erreur lors de la récupération de la disponibilité." });
  }
};

module.exports = {
  getCreneauxDisponibles,
  getDisponibiliteMois
};