# Suivi des travaux

Application de suivi des marchés publics de travaux : intervenants, délais et ordres de service, PV de réunion,
attachements, documents à fournir, BPDE, état physique, décomptes, révision des prix et retenue de garantie.

- **Front** : Next.js 16 (App Router, React 19, Tailwind CSS 4)
- **Base de données, authentification, fichiers** : Supabase (Postgres + RLS, Auth, Storage)
- **Assistance documentaire** : Claude (API Anthropic), appelé uniquement côté serveur

## Mise en route

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Appliquez le schéma : exécutez **dans l'ordre** les fichiers de `supabase/migrations/` dans l'éditeur SQL du projet,
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
| Retenue de garantie | taux × cumul payé, plafonnée à un % du montant du marché (10 % et 7 % par défaut, modifiables) ; nulle si « remplacée par une caution » |
| Pénalités de retard | taux (‰ du montant TTC par jour) × jours de retard non exonérés, limitées au plafond (% du montant). Retard arrêté à la réception provisoire, à défaut à aujourd'hui. Aucun taux par défaut |
| Remboursement de l'avance | avance × part de l'avancement (cumul travaux TTC / montant) comprise entre le seuil de début et le seuil de fin, linéaire. 0 % et 100 % = au prorata |
| Projet de décompte | Quantités exécutées × prix BPDE (HT) + TVA − décomptes précédents = travaux de la période ; révision = travaux HT × (K − 1) ; net = travaux + révision − retenue − pénalités − remboursement d'avance de la période |
| Avenants | Montant actuel = montant initial + Σ variations des avenants (utilisé pour l'avancement financier, le plafond de retenue, l'avance) ; jours d'avenant ajoutés à la fin prévue ; alerte si le cumul dépasse le seuil saisi |
| Base des pénalités | Au choix : montant initial ou modifié par avenants, TTC ou HT |
| Réception définitive | Saisie, ou prévue = réception provisoire + délai de garantie ; alerte 60 jours avant |
| Coefficient K | K = partie fixe + Σ (part × indice actuel / indice de base), 3 indices maximum ; partie fixe = 1 − Σ parts |

## Hypothèses et limites

L'application ne connaît ni votre CPS, ni la version du CCAG-T applicable, ni vos procédures internes :

- prix unitaires du BPDE lus **hors taxes**, TVA 20 % par défaut (modifiable) ;
- retenue de garantie 10 % plafonnée à 7 % : valeurs de départ à vérifier ;
- formule de révision et indices à recopier depuis le CPS ;
- taux et plafond des pénalités, seuils de remboursement de l'avance : **à saisir d'après le CPS** (aucune valeur par défaut) ;
- autres déductions (frais, sanctions diverses) **non calculées** ;
- les résultats sont une aide à la préparation et au contrôle, **pas un décompte officiel**.

### Fonctions Claude

- **Paramètres du CPS** (bouton dans la fiche marché) : propose délai, TVA, retenue et plafond, taux, plafond et base des pénalités,
  avance et seuils de remboursement, délai de garantie, indices de révision. Chaque valeur est accompagnée de l'article et d'une citation
  du CPS ; une valeur que le CPS ne fixe pas explicitement reste vide. Vous cochez ce qui est appliqué.
- **Depuis un attachement** : propose, par type de prestation, les documents à fournir (fiches techniques, méthodologies,
  PV d'essais, agréments, garanties…).
- **Depuis le CPS** (PDF, Word .docx ou texte) : propose un document par exigence technique, avec l'article du CPS quand il est
  identifiable. Les PDF sont lus directement par Claude, y compris les PDF scannés (jusqu'à 20 Mo, limite du stockage).
  Le CPS est supprimé du stockage après analyse.

Rien n'est ajouté sans validation : la liste proposée est relue et cochée avant import. Ce sont des suggestions, à contrôler.

## Exports

Menu **Exporter** de la fiche marché :

- **Classeur Excel** : synthèse, projet de décompte, écarts, BPDE, décomptes, documents, garanties, ordres de service ;
- **Impression / PDF** (via la fenêtre d'impression du navigateur) : projet de décompte avec cadres de signature, tableau des écarts,
  fiche de synthèse, liste des documents à fournir. Chaque décompte enregistré s'imprime depuis l'onglet Financier.

Chaque document imprimé porte la mention « document de travail, ne vaut pas décompte officiel ».

## Avenants et réception

- Onglet **Avenants** : variation de montant et de délai, scan de l'avenant, prix nouveaux ajoutés au BPDE (repérés « Prix nouveau »).
- Onglet **Réception** : dates de réception provisoire et définitive, délai de garantie, liste des réserves (localisation, responsable,
  délai, levée en un clic, photo), impression de la liste des réserves.

## Garanties et assurances

Onglet **Garanties** : cautions (provisoire, définitive, retenue de garantie, restitution d'avance) et assurances (RC, TRC, décennale)
avec organisme, référence, montant, dates et scan. Alerte 30 jours avant expiration, et alerte si une avance ou une retenue remplacée
n'est pas couverte par la caution correspondante.

## Modèles de documents

Page **Modèles de documents** (lien dans l'en-tête) : déposez par glisser-déposer ou à l'aide du bouton vos modèles Word (.docx) ou
Excel (.xlsx) — décomptes, bordereaux d'envoi, notes ou décisions de pénalités, courriers, bordereaux… La bibliothèque s'enrichit au fil
du temps ; chaque modèle est classé par catégorie, téléchargeable pour modification et remplaçable.

Depuis la fiche d'un marché, **Générer un document** remplit le modèle avec les données du marché et télécharge le fichier produit.
Un modèle peut aussi être déposé directement dans cette fenêtre pour un usage ponctuel.

Syntaxe (dans Word ou Excel) :

| Besoin | Syntaxe |
|---|---|
| Donnée du marché | `{marche_numero}`, `{decompte_net_a_payer}`, `{penalites_montant_lettres}`… (liste complète dans « Données disponibles ») |
| Tableau répété (Word) | dans une ligne de tableau : `{#lignes_decompte}` dans la première cellule, `{/lignes_decompte}` dans la dernière |
| Condition (Word) | `{#en_retard}texte affiché si le délai est dépassé{/en_retard}` |
| Champ à saisir | toute balise hors catalogue, ex. `{destinataire}` : demandée à la génération et mémorisée pour la fois suivante |

Les montants en lettres suivent l'orthographe traditionnelle (« quatre-vingts », « deux cent mille », « deux cents millions ») et sont
exprimés en dirhams. Excel : champs simples uniquement (pas de tableaux répétés). Le remplissage se fait dans le navigateur ;
les modèles sont stockés dans le bucket privé `scans` (`<utilisateur>/modeles/`). Quatre modèles d'exemple sont fournis
(`public/modeles-exemples/`) et s'ajoutent à la bibliothèque en un clic.

### Créer un modèle avec l'IA

Bouton **Créer avec l'IA** (page Modèles) ou icône ✦ sur un modèle existant (variante) :

- **Copier le prompt** : prompt complet (besoin décrit, syntaxe des balises, catalogue des données, règles de rédaction)
  à coller dans l'agent IA de votre choix ; le fichier .docx obtenu se dépose ensuite dans la bibliothèque ;
- **Générer avec Claude** : Claude conçoit la structure du document (route `/api/ia/modele`, sortie structurée),
  l'application construit le .docx, l'analyse et l'ajoute à la bibliothèque après relecture.

Le prompt interdit d'inventer des références juridiques (champs à saisir à la place) et impose la mention
« PROJET — À VALIDER » sur les décisions et mises en demeure.

## Interface

Charte : encre `#10141A`, gris `#E4E4E4`, bleu `#83A2DB` (ton soutenu `#5B7FC7` pour les jauges, contraste ≥ 3:1),
rouge `#CE6969` réservé aux alertes, police Outfit (proche de Lufga, police commerciale : remplaçable via `next/font/local`
si vous disposez d'une licence). Cartes arrondies translucides, navigation en pilules, boutons ronds.
Mobile : barre de navigation en bas d'écran, onglets défilants, fenêtres en feuilles montant du bas, tableaux défilant
horizontalement dans leur carte.

## Données

Les données sont dans Supabase et accessibles depuis n'importe quel poste après connexion. Le bouton **Sauvegarde**
exporte toutes les données en JSON ; **Restaurer** les réimporte (les lignes de même identifiant sont remplacées).
Les scans (PDF, photos) sont dans le bucket privé `scans`, ouverts par lien signé valable 5 minutes.

## Déploiement

Sur Vercel : importez le dépôt, renseignez les trois variables d'environnement. Les routes Claude déclarent
`maxDuration = 300` (analyse d'un CPS long) : vérifiez que votre offre l'autorise.
