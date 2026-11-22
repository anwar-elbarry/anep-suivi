# Suivi des travaux

Application de suivi des marchés publics de travaux : intervenants, délais et ordres de service, PV de réunion,
attachements, documents à fournir, BPDE, état physique, décomptes, révision des prix et retenue de garantie.

- **Front** : Next.js 16 (App Router, React 19, Tailwind CSS 4)
- **Base de données, authentification, fichiers** : Supabase (Postgres + RLS, Auth, Storage)
- **Assistance documentaire** : Claude (API Anthropic), appelé uniquement côté serveur

## Mise en route

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Appliquez le schéma : collez `supabase/migrations/20261122000000_schema_initial.sql` dans l'éditeur SQL du projet,
   ou avec la CLI : `supabase link --project-ref <ref>` puis `supabase db push`.
   Le script crée les tables, la sécurité par ligne (chaque utilisateur ne voit que ses données), le journal d'activité
   et le bucket privé `scans` (20 Mo par fichier).
3. Dans Supabase > Authentication > URL Configuration, ajoutez `http://localhost:3000/auth/callback`
   (et l'URL de production) aux « Redirect URLs ».
4. Copiez `.env.example` en `.env.local` et renseignez les clés.
5. Lancez :

```bash
npm install
npm run dev
```

Tests des calculs : `npm test`.

## Organisation

| Dossier | Contenu |
|---|---|
| `src/lib/calculs.ts` | Moteur de calcul pur et testé : délais, BPDE, rapprochement, état physique, décompte, K, retenue |
| `src/lib/donnees.ts` | Accès Supabase côté navigateur (lecture d'un dossier, CRUD, fichiers) |
| `src/lib/excel.ts` | Lecture des fichiers Excel (BPDE, attachements) avec détection des en-têtes |
| `src/lib/ia.ts` | Appel à Claude (sortie structurée validée par Zod) |
| `src/app/api/ia/*` | Routes serveur : documents depuis un attachement, documents depuis le CPS |
| `src/components/onglets/*` | Les dix onglets de la fiche marché |
| `supabase/migrations/` | Schéma SQL, RLS, triggers, stockage |

## Règles de calcul

| Résultat | Règle |
|---|---|
| Fin des travaux | Date d'effet de l'OS de démarrage (à défaut, date de début du marché) + délai en mois + jours d'arrêt (OS d'arrêt → OS de reprise ; un arrêt non repris court jusqu'à aujourd'hui) + jours de prolongation |
| Délai écoulé | Part du délai (hors arrêts) déjà écoulée |
| Avancement physique | Par ligne BPDE : quantité exécutée / quantité marché, plafonnée à 100 %, pondérée par la valeur de la ligne. Attachements additionnés, ou dernier attachement si « cumulatifs » ; attachements rejetés exclus |
| Rapprochement | Ligne d'attachement → BPDE par n° de prix, puis par désignation normalisée (sans accents, casse ni ponctuation) |
| Avancement financier | Σ décomptes (travaux + révision) / montant TTC du marché |
| Retenue de garantie | taux × cumul payé, plafonnée à un % du montant du marché (10 % et 7 % par défaut, modifiables) |
| Projet de décompte | Quantités exécutées × prix BPDE (HT) + TVA − décomptes précédents = travaux de la période ; révision = travaux HT × (K − 1) ; net = travaux + révision − retenue de la période |
| Coefficient K | K = partie fixe + Σ (part × indice actuel / indice de base), 3 indices maximum ; partie fixe = 1 − Σ parts |

## Hypothèses et limites

L'application ne connaît ni votre CPS, ni la version du CCAG-T applicable, ni vos procédures internes :

- prix unitaires du BPDE lus **hors taxes**, TVA 20 % par défaut (modifiable) ;
- retenue de garantie 10 % plafonnée à 7 % : valeurs de départ à vérifier ;
- formule de révision et indices à recopier depuis le CPS ;
- pénalités de retard, avances et autres déductions **non calculées** ;
- les résultats sont une aide à la préparation et au contrôle, **pas un décompte officiel**.

### Fonctions Claude

- **Depuis un attachement** : propose, par type de prestation, les documents à fournir (fiches techniques, méthodologies,
  PV d'essais, agréments, garanties…).
- **Depuis le CPS** (PDF, Word .docx ou texte) : propose un document par exigence technique, avec l'article du CPS quand il est
  identifiable. Les PDF sont lus directement par Claude, y compris les PDF scannés (jusqu'à 20 Mo, limite du stockage).
  Le CPS est supprimé du stockage après analyse.

Rien n'est ajouté sans validation : la liste proposée est relue et cochée avant import. Ce sont des suggestions, à contrôler.

## Données

Les données sont dans Supabase et accessibles depuis n'importe quel poste après connexion. Le bouton **Sauvegarde**
exporte toutes les données en JSON ; **Restaurer** les réimporte (les lignes de même identifiant sont remplacées).
Les scans (PDF, photos) sont dans le bucket privé `scans`, ouverts par lien signé valable 5 minutes.

## Déploiement

Sur Vercel : importez le dépôt, renseignez les trois variables d'environnement. Les routes Claude déclarent
`maxDuration = 300` (analyse d'un CPS long) : vérifiez que votre offre l'autorise.
