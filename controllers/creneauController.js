const db = require('../db');

const getCreneauxDisponibles = async (req, res) => {
  const { date, duree } = req.query;
  if (!date || !duree) return res.status(400).json({ error: "Paramètres 'date' et 'duree' requis." });

  try {
    const dureeMinutes = parseInt(duree);

    const toMinutes = (heure) => {
      const [h, m] = heure.split(":").map(Number);
      return h * 60 + m;
    };

    const fromMinutes = (m) => {
      const h = Math.floor(m / 60);
      const mn = m % 60;
      return `${h.toString().padStart(2, '0')}:${mn.toString().padStart(2, '0')}`;
    };

    // 📆 Début et fin de la journée
    const plageResult = await db.query(
      'SELECT heure_ouverture, heure_fermeture FROM plage_horaire WHERE date = $1',
      [date]
    );

    let heureOuverture = "09:00";
    let heureFermeture = "21:00";

    const dayOfWeek = new Date(date).getDay();
    if (dayOfWeek === 0 && plageResult.rows.length === 0) return res.json([]);

    if (plageResult.rows.length > 0) {
      heureOuverture = plageResult.rows[0].heure_ouverture;
      heureFermeture = plageResult.rows[0].heure_fermeture;
    }

    const debutJ = toMinutes(heureOuverture);
    const finJ = toMinutes(heureFermeture);

    const maintenant = new Date();
    const aujourdHui = maintenant.toISOString().split("T")[0] === date;
    const heureActuelle = aujourdHui ? maintenant.getHours() * 60 + maintenant.getMinutes() : 0;

    // 🔒 Récupération des plages bloquées (réservations + indispos)
    const reservations = await db.query(
      `SELECT heure_debut, duree_totale_minutes FROM reservation WHERE jour = $1`,
      [date]
    );
    const indispos = await db.query(
      `SELECT heure_debut, heure_fin FROM indisponibilite WHERE jour = $1`,
      [date]
    );

    const plagesBloquees = [];

    for (const row of reservations.rows) {
      const debut = toMinutes(row.heure_debut);
      const fin = debut + row.duree_totale_minutes;
      plagesBloquees.push({ debut, fin });
    }

    for (const row of indispos.rows) {
      plagesBloquees.push({
        debut: toMinutes(row.heure_debut),
        fin: toMinutes(row.heure_fin)
      });
    }

    // 🔁 Générer tous les points de départ potentiels
    const pointsCandidats = new Set();
    for (let t = debutJ; t + dureeMinutes <= finJ; t += dureeMinutes) {
      pointsCandidats.add(t);
    }
    for (const bloc of plagesBloquees) {
      const reprise = bloc.fin;
      if (reprise + dureeMinutes <= finJ) {
        pointsCandidats.add(reprise);
      }
    }

    const creneaux = [];
    const candidats = Array.from(pointsCandidats).sort((a, b) => a - b);

    for (const t of candidats) {
      if (t < heureActuelle) continue;

      const conflit = plagesBloquees.some(p =>
        Math.max(t, p.debut) < Math.min(t + dureeMinutes, p.fin)
      );

      if (!conflit) creneaux.push(fromMinutes(t));
    }

    return res.json(creneaux);
  } catch (err) {
    console.error("Erreur récupération créneaux :", err);
    res.status(500).json({ error: "Erreur lors de la récupération des créneaux." });
  }
};

module.exports = {
  getCreneauxDisponibles
};