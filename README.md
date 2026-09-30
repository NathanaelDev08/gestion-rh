# Gestion RH — Logiciel complet de gestion des ressources humaines

Application de bureau **Tauri 2 + Rust + SQLite**, entièrement en **français**, sans serveur ni connexion Internet.

![Modules](https://img.shields.io/badge/modules-8-blueviolet) ![Base](https://img.shields.io/badge/base-SQLite-green) ![Langue](https://img.shields.io/badge/langue-Fran%C3%A7ais-blue)

## Modules inclus

| Module | Fonctionnalités |
|---|---|
| **Tableau de bord** | Effectif, présence du jour, congés en attente, masse salariale, évolution 12 mois, répartition par service, jours fériés, anniversaires, activité récente |
| **Employés** | Dossiers salariés complets, matricules auto, recherche & filtres, contrat, rémunération, contacts d'urgence, export CSV |
| **Organigramme** | Arborescence hiérarchique, services (responsable, effectif, budget), statistiques d'effectif |
| **Congés & absences** | Demandes, validation/refus, calcul automatique des jours ouvrés, soldes par type et par salarié, calendrier annuel (Gantt), jours fériés |
| **Présence** | Pointeuse (arrivée/départ), registre mensuel cliquable, retards, heures supplémentaires, rapports & exports |
| **Paie & primes** | Génération mensuelle, cotisations paramétrables, barème progressif, heures sup., primes, **bulletins SYSCOHADA** imprimables, **écritures de paie** équilibrées (affichage, impression, export CSV), simulateur |
| **Recrutement** | Offres d'emploi, pipeline de candidats en kanban (glisser-déposer), entretiens, notation des candidats, exports |
| **Évaluations** | Critères personnalisables, notes 1-5, forces / améliorations / objectifs, analyses par service |
| **Documents** | Pièces des dossiers salariés, échéances et alertes d'expiration |
| **Paramètres** | Entreprise, horaires, structure de paie (taux + comptes SYSCOHADA), congés & fériés, comptes utilisateurs, sauvegarde/restauration de la base, données de démonstration |

## Paie : plan SYSCOHADA et montants en XOF

* **Aucun taux pré-rempli** : l'application ne suppose aucun régime. Le chef de paie saisit ses lignes
  dans **Paramètres → Paie** (libellé, taux %, plafond mensuel, compte SYSCOHADA) et son barème
  d'impôt (paliers annuels). Tant que rien n'est saisi, le net à payer égale le brut (un avertissement
  s'affiche dans la paie et dans le simulateur).
* **Montants en XOF** par défaut (franc CFA, sans décimale : `1 250 000 XOF`) ; la devise est modifiable
  dans **Paramètres → Entreprise**. Les devises sans sous-unité (XOF, XAF, FCFA, GNF, KMF, JPY, KRW)
  s'affichent sans décimales.
* **Comptes du plan SYSCOHADA révisé (AUDCIF)**, tous paramétrables :

  | Rubrique | Compte | Intitulé |
  |---|---|---|
  | Salaire de base, heures supplémentaires | 6611 | Appointements, salaires et commissions |
  | Primes et commissions | 6612 | Primes et gratifications |
  | Indemnités (transport, fonctions…) | 663 | Indemnités forfaitaires versées au personnel |
  | Cotisations patronales (débit) | 664 | Charges sociales |
  | Cotisations salariales (crédit) | 431 / 432 / 438 | Sécurité sociale / Caisses de retraite / Autres organismes |
  | Impôt sur les revenus | 447 | État, impôts retenus à la source |
  | Autres retenues (avances, oppositions) | 47 | Débiteurs et créditeurs divers |
  | Net à payer | 422 | Personnel, rémunérations dues |
  | Règlement des salaires | 521 | Banques locales (ou 571 Caisse) |

* **Écritures de paie** (bouton *Écritures SYSCOHADA* dans le détail d'une paie) : journal équilibré
  en cinq opérations, affichable, imprimable et exportable en CSV :

  1. Rémunérations : D 6611 / 6612 / 663 → C 422 (brut)
  2. Retenues salariales : D 422 → C 431 / 432 / 438 / 447 / 47
  3. Charges patronales : D 664 → C 431 / 432 / 438
  4. Paiement des nets : D 422 → C 521
  5. Reversement : D 431 / 432 / 447 → C 521

## Prérequis

1. **Rust** (rustup) — `cargo --version`
2. **Node.js ≥ 18** (uniquement pour l'outil Tauri CLI)
3. **Microsoft Edge WebView2** (préinstallé sur Windows 11)
4. ⚠️ **Smart App Control doit être désactivé** : sur Windows 11/10 récent, il bloque tout exécutable compilé localement
   (donc `cargo build` **et** l'application elle-même).
   *Sécurité Windows → Contrôle des applications et des navigateurs → Smart App Control → **Désactivé***
   (action à effectuer avec un compte administrateur ; elle est irréversible sans réinstallation de Windows).

## Compilation et lancement

```powershell
cd "gestion-rh\src-tauri"
cargo run            # compilation + lancement de l'application
```

Création d'un installeur (MSI/NSIS) :

```powershell
npm create tauri-app@latest   # ou, si tauri-cli est installé :
cargo install tauri-cli --locked
cd src-tauri ; cargo tauri build
```

Les exécutables produits se trouvent dans `src-tauri\target\release\` et les installateurs
dans `src-tauri\target\release\bundle\`.

### Si Windows bloque la compilation

```
error: could not execute process ... build-script-build ... (os error 4551)
error[E0463]: can't find crate for `thiserror_impl`
Une stratégie de contrôle d'application a bloqué ce fichier.
```

→ désactiver **Smart App Control** (voir prérequis n°4), puis relancer `cargo run`.

Même le contrôle désactivé, certains binaires fraîchement compilés restent bloqués **selon leur
empreinte** (`os error 4551` à l'exécution des `.exe` de build, `E0463` au chargement des `.dll` de
macros de procédure par rustc). Le script suivant relance `cargo` et réécrit un octet inoffensif
(`TimeDateStamp` de l'en-tête COFF) de chaque artefact avant chaque tentative :

```powershell
powershell -File scripts\force-cargo.ps1 -Task run      # compile puis lance l'application
powershell -File scripts\force-cargo.ps1 -Task check    # simple vérification
powershell -File scripts\force-cargo-check.ps1          # raccourci pour -Task check
```

Si l'application compilée est malgré tout bloquée au lancement, simplemente relancer une fois la
commande ci-dessus (ou exécuter directement `src-tauri\target\debug\gestion-rh.exe`).

## Première connexion

* Utilisateur : **`admin`**
* Mot de passe : **`admin`**

À changer immédiatement dans **Paramètres → Utilisateurs**.

## Données

* Base **SQLite** stockée dans :
  `%APPDATA%\com.gestionrh.desktop\gestion-rh.sqlite3`
* **Sauvegarde / restauration** : Paramètres → Sauvegarde & données (dialogues natifs Windows).
* **Données de démonstration** : Paramètres → Sauvegarde & données → « Charger les données de démonstration »
  (18 salariés, congés, présences, paie du mois, offres et candidats).

## Architecture

```
gestion-rh/
├── frontend/                     # Interface (HTML/CSS/JS vanilla, sans dépendance externe)
│   ├── index.html                # Coquille + sprite d'icônes SVG
│   ├── css/app.css               # Design system complet
│   ├── dev.html                  # Harnais de test en navigateur (mock Tauri)
│   └── js/
│       ├── core.js               # État, appels Rust, formats FR, libellés
│       ├── ui.js                 # Modales, formulaires, tableaux triables, composants
│       ├── router.js             # Routeur par ancre (#/employees/12)
│       ├── app.js                # Connexion, navigation, recherche globale
│       ├── dev-mock.js           # Faux backend pour tests en navigateur
│       └── views/                # 10 modules (dashboard, employees, leaves…)
├── scripts/
│   ├── make-icons.ps1            # Génération des icônes PNG/ICO
│   └── serve.js                  # Serveur statique local (tests)
└── src-tauri/                    # Backend Rust
    ├── Cargo.toml
    ├── tauri.conf.json
    ├── icons/
    └── src/
        ├── main.rs / lib.rs      # Amorçage + déclaration des commandes
        ├── db.rs                 # Connexion SQLite, schéma, helpers génériques
        ├── schema.sql            # 15 tables indexées
        ├── util.rs               # Jours ouvrés, moteur de paie, CSV, données démo
        └── commands/             # ~60 commandes exposées à l'interface
            ├── auth.rs  settings.rs  employees.rs  leaves.rs
            ├── attendance.rs  payroll.rs  recruitment.rs
            ├── people.rs  dashboard.rs  system.rs
```

### Points clés

* **Zéro dépendance front** : pas de React, pas de CDN, fonctionne hors-ligne.
* **Moteur de paie SYSCOHADA** : cotisations plafonnées, barème progressif annuel, patronal, coût employeur —
  aucun régime n'est pré-rempli (chaque organisation saisit ses taux) et le tout est modifiable dans
  Paramètres → Paie. Le bulletin imprime les comptes du plan **SYSCOHADA révisé** (6611, 6612, 663, 664,
  431, 447, 422, 521…) et l'on peut éditer/imprimer/exporter les **écritures de paie** (journal équilibré).
* **Devise** : montants exprimés en **XOF (franc CFA)** par défaut, sans décimale ; modifiable dans
  Paramètres → Entreprise.
* **Jours ouvrés** : week-ends paramétrables + jours fériés récurrents (MM-JJ) ou datés.
* **Sécurité** : mots de passe hachés SHA-256 salés, journaux d'activité, listes blanches SQL
  (aucune requête construite à partir de saisies utilisateur non filtrées).

## Tests frontend sans compilation

```powershell
node scripts\serve.js      # http://127.0.0.1:8347
# puis ouvrir http://127.0.0.1:8347/dev.html
```

`dev.html` charge l'interface complète avec un faux backend (`js/dev-mock.js`) : utile pour
vérifier le rendu et les interactions sans compiler le backend Rust.
