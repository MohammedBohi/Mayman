# May'Man — Backend

API REST de l'application de réservation en ligne **maylissman.com** (salon de
coiffure indépendant). En production avec de vrais clients depuis février 2025.

🌐 **Site en ligne :** [maylissman.com](https://maylissman.com)
📦 **Repo frontend :** [MohammedBohi/MaymanFront](https://github.com/MohammedBohi/MaymanFront)

## À propos

Premier projet pro de ma vie, livré et maintenu en production. Il n'est pas
parfait — j'ai appris en construisant. Mais c'est un vrai produit, utilisé par
de vrais clients, et il occupe une place à part dans mon parcours.

## Stack

- **Node.js** + **Express 4**
- **PostgreSQL** via `pg` — requêtes SQL paramétrées, sans ORM
- **JWT** (`jsonwebtoken`) + **bcrypt** pour l'authentification
- **API Brevo** pour les emails transactionnels (HTTP, pas SMTP)
- **express-rate-limit** (limitation globale + stricte sur l'auth)
- Déployé sur **Railway**

## Fonctionnalités

- Authentification JWT (inscription, login, mot de passe oublié, reset, changement)
- Réservation en ligne avec **calcul dynamique des créneaux disponibles**, gérant 2 modes :
  - **Salon** — créneaux selon planning hebdomadaire
  - **Domicile** — ajoute un temps de trajet variable selon le département desservi
- Gestion des exceptions de planning (jours fériés, fermetures ponctuelles) et des indisponibilités
- Espace admin : réservations, prestations, planning, exceptions, indisponibilités, départements
- Emails de confirmation et de reset envoyés via API Brevo
- Rate limiting : 100 req / 15 min globalement, 5 tentatives / 15 min sur les endpoints d'auth

## Architecture

```
backend/
├── controllers/   # 9 controllers (logique métier)
├── routes/        # 10 routes Express (/api/*)
├── middlewares/   # auth (JWT) + role (admin)
├── utils/         # validations
├── db.js          # Pool PostgreSQL
├── mailer.js      # Wrapper API Brevo
└── index.js       # Entrypoint, CORS, rate limit, montage des routes
```

## Démarrage local

**Prérequis :** Node.js 18+ et une instance PostgreSQL accessible.

```bash
git clone https://github.com/MohammedBohi/Mayman.git
cd Mayman
npm install
cp .env.example .env       # remplir avec tes valeurs
npm run serve              # http://localhost:3000
```

## Variables d'environnement

Voir `.env.example` pour la liste complète. Variables requises :

| Variable | Description |
|---|---|
| `DATABASE_URL` | Connection string PostgreSQL |
| `JWT_SECRET` | Secret pour signer les tokens JWT |
| `BREVO_API_KEY` | Clé API Brevo pour l'envoi d'emails |
| `EMAIL_FROM` | Adresse expéditrice des emails transactionnels |
| `ADMIN_EMAIL` | Adresse de réception des notifications admin |
| `FRONTEND_URL` | Origin CORS autorisée |
| `PORT` | Port d'écoute (défaut : 3000) |

## Endpoints principaux

```
POST   /api/auth/register              # Inscription
POST   /api/auth/login                 # Connexion
POST   /api/auth/reset-password        # Demande reset mot de passe
PUT    /api/auth/reset-password        # Application du reset
GET    /api/auth/profil                # Profil connecté

GET    /api/creneaux                   # Créneaux disponibles (calcul dynamique)
GET    /api/prestations                # Liste des prestations
GET    /api/departements               # Départements desservis
POST   /api/reservations               # Créer une réservation

GET    /api/admin/reservations         # Admin : liste des réservations
POST   /api/planning-hebdo             # Admin : édition du planning
POST   /api/planning-exception         # Admin : exceptions de planning
POST   /api/indisponibilites           # Admin : indisponibilités ponctuelles
```

## Sécurité

- Mots de passe hashés avec **bcrypt**
- Authentification par **JWT Bearer**, vérification middleware sur les routes protégées
- Requêtes SQL paramétrées (protection contre SQL injection)
- Rate limiting strict sur les endpoints sensibles (login, reset)
- CORS restrictif (origines listées explicitement)
- Variables sensibles hors du repo (`.env` ignoré)
