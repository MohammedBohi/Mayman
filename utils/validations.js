// Validations réutilisables pour le système de planning

/**
 * Valide le mode (SALON ou DOMICILE)
 */
const validateMode = (mode) => {
  const modesValides = ['SALON', 'DOMICILE'];
  if (!mode) {
    return { valid: false, error: "Le mode est requis" };
  }
  if (!modesValides.includes(mode)) {
    return { valid: false, error: "Mode invalide. Valeurs acceptées : SALON, DOMICILE" };
  }
  return { valid: true };
};

/**
 * Valide la cohérence mode + département
 */
const validateModeDepartement = (mode, departement) => {
  if (mode === 'SALON' && departement) {
    return { valid: false, error: "Le mode SALON ne peut pas avoir de département" };
  }
  if (mode === 'DOMICILE' && !departement) {
    return { valid: false, error: "Le mode DOMICILE requiert un département" };
  }
  return { valid: true };
};

/**
 * Valide une plage horaire (heure_debut < heure_fin)
 */
const validatePlageHoraire = (heure_debut, heure_fin) => {
  if (!heure_debut || !heure_fin) {
    return { valid: false, error: "heure_debut et heure_fin sont requis" };
  }

  // Vérifier format HH:MM
  const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (!timeRegex.test(heure_debut) || !timeRegex.test(heure_fin)) {
    return { valid: false, error: "Format horaire invalide. Utilisez HH:MM" };
  }

  // Convertir en minutes pour comparaison
  const toMinutes = (time) => {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  };

  if (toMinutes(heure_debut) >= toMinutes(heure_fin)) {
    return { valid: false, error: "heure_debut doit être inférieure à heure_fin" };
  }

  return { valid: true };
};

/**
 * Valide un jour de la semaine (1-7)
 */
const validateJourSemaine = (jour) => {
  const jourNum = parseInt(jour);
  if (isNaN(jourNum) || jourNum < 1 || jourNum > 7) {
    return { valid: false, error: "jour_semaine doit être entre 1 (lundi) et 7 (dimanche)" };
  }
  return { valid: true };
};

/**
 * Valide une date (format YYYY-MM-DD)
 */
const validateDate = (date) => {
  if (!date) {
    return { valid: false, error: "La date est requise" };
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(date)) {
    return { valid: false, error: "Format de date invalide. Utilisez YYYY-MM-DD" };
  }

  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return { valid: false, error: "Date invalide" };
  }

  return { valid: true };
};

/**
 * Valide un format d'email
 */
const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email) {
    return { valid: false, error: "L'email est requis" };
  }
  if (!emailRegex.test(email)) {
    return { valid: false, error: "Format d'email invalide" };
  }
  return { valid: true };
};

/**
 * Valide un code département français ou code postal
 */
const validateCodeDepartement = (code) => {
  if (!code) {
    return { valid: false, error: "Le code département est requis" };
  }
  
  // Accepter code département (2-3 chars) ou code postal (5 chars)
  if (code.length < 2 || code.length > 5) {
    return { valid: false, error: "Code département invalide" };
  }
  
  return { valid: true };
};

module.exports = {
  validateMode,
  validateModeDepartement,
  validatePlageHoraire,
  validateJourSemaine,
  validateDate,
  validateCodeDepartement,
  validateEmail
};
