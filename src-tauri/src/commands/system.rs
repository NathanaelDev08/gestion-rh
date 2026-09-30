use crate::db::{self, query, query_one, Res};
use crate::Db;
use chrono::Datelike;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::State;

fn db_path(db: &Db) -> Res<PathBuf> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.path()
        .map(PathBuf::from)
        .ok_or_else(|| "Chemin de la base introuvable.".to_string())
}

fn csv_name(prefix: &str, ext: &str) -> String {
    format!("{prefix}-{}.{}", crate::util::today().format("%Y%m%d"), ext)
}

fn pick_save(default_name: &str, filter_name: &str, ext: &str) -> Res<PathBuf> {
    rfd::FileDialog::new()
        .set_title("Enregistrer le fichier")
        .set_file_name(default_name)
        .add_filter(filter_name, &[ext])
        .save_file()
        .ok_or_else(|| "Enregistrement annulé.".to_string())
}

/// Sauvegarde complète de la base de données (fichier SQLite).
#[tauri::command]
pub fn backup_database(db: State<Db>) -> Res<Value> {
    let source = db_path(&db)?;
    if !source.exists() {
        return Err("Fichier de base introuvable.".into());
    }
    let name = format!("sauvegarde-gestion-rh-{}.sqlite3", crate::util::today().format("%Y%m%d"));
    let dest = pick_save(&name, "Base de données SQLite", "sqlite3")?;
    std::fs::copy(&source, &dest).map_err(|e| format!("Copie impossible : {e}"))?;
    let size = std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0);
    let guard = db.0.lock().map_err(|e| e.to_string())?;
    db::log_activity(
        &guard,
        "system",
        "backup",
        &format!("Sauvegarde : {}", dest.display()),
        "admin",
    );
    Ok(json!({"path": dest.display().to_string(), "size": size}))
}

/// Restaure la base depuis un fichier de sauvegarde.
#[tauri::command]
pub fn restore_database(db: State<Db>) -> Res<Value> {
    let source = rfd::FileDialog::new()
        .set_title("Choisir un fichier de sauvegarde")
        .add_filter("Base de données SQLite", &["sqlite3", "db"])
        .pick_file()
        .ok_or_else(|| "Sélection annulée.".to_string())?;

    // Validation du fichier choisi.
    {
        let check = rusqlite::Connection::open(&source).map_err(|e| format!("Fichier illisible : {e}"))?;
        let integrity: String = check
            .query_row("PRAGMA integrity_check", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if integrity != "ok" {
            return Err("Le fichier de sauvegarde est corrompu.".into());
        }
        let table: Option<String> = check
            .query_row(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='employees'",
                [],
                |r| r.get(0),
            )
            .ok();
        if table.is_none() {
            return Err("Ce fichier ne contient pas de base Gestion RH valide.".into());
        }
    }

    let target = db_path(&db)?;
    let bytes = std::fs::read(&source).map_err(|e| e.to_string())?;

    let mut guard = db.0.lock().map_err(|e| e.to_string())?;
    // Libère le fichier (Windows verrouille les bases ouvertes).
    *guard = rusqlite::Connection::open(":memory:").map_err(crate::db::es)?;
    if let Err(e) = std::fs::write(&target, &bytes) {
        // Tente de rouvrir l'ancienne base.
        if let Ok(conn) = crate::db::open(target.parent().unwrap_or(std::path::Path::new("."))) {
            *guard = conn;
        }
        return Err(format!("Écriture impossible : {e}"));
    }
    let conn = crate::db::open(target.parent().unwrap_or(std::path::Path::new(".")))?;
    *guard = conn;
    Ok(json!({"ok": true, "source": source.display().to_string()}))
}

/// Ouvre le dossier de données de l'application dans l'explorateur.
#[tauri::command]
pub fn open_data_folder(db: State<Db>) -> Res<Value> {
    let path = db_path(&db)?;
    let dir = path.parent().map(|p| p.to_path_buf()).unwrap_or(path);
    let _ = std::fs::create_dir_all(&dir);
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("explorer")
            .arg(&dir)
            .spawn();
    }
    Ok(json!({"path": dir.display().to_string()}))
}

/// Exporte des données au format CSV (choix du emplacement via dialogue natif).
#[tauri::command]
pub fn export_csv(db: State<Db>, kind: String, params: Value) -> Res<Value> {
    let (headers, rows) = db::with(&db, |conn| -> Res<(Vec<String>, Vec<Vec<String>>)> {
        let s = |v: &Value| -> String {
            match v {
                Value::Null => String::new(),
                Value::String(s) => s.clone(),
                Value::Number(n) => n.to_string(),
                Value::Bool(b) => b.to_string(),
                other => other.to_string(),
            }
        };
        match kind.as_str() {
            "employees" => {
                let data = query(
                    conn,
                    "SELECT e.matricule, e.first_name, e.last_name, e.job_title,
                            COALESCE(d.name,'') AS department, e.contract_type, e.status,
                            e.hire_date, e.email, e.phone, e.base_salary
                     FROM employees e LEFT JOIN departments d ON d.id = e.department_id
                     ORDER BY e.last_name",
                    &[],
                )?;
                Ok((
                    vec![
                        "Matricule".into(),
                        "Prénom".into(),
                        "Nom".into(),
                        "Poste".into(),
                        "Département".into(),
                        "Contrat".into(),
                        "Statut".into(),
                        "Embauche".into(),
                        "Email".into(),
                        "Téléphone".into(),
                        "Salaire de base".into(),
                    ],
                    data.iter()
                        .map(|r| {
                            vec![
                                s(&r["matricule"]),
                                s(&r["first_name"]),
                                s(&r["last_name"]),
                                s(&r["job_title"]),
                                s(&r["department"]),
                                s(&r["contract_type"]),
                                s(&r["status"]),
                                s(&r["hire_date"]),
                                s(&r["email"]),
                                s(&r["phone"]),
                                s(&r["base_salary"]),
                            ]
                        })
                        .collect(),
                ))
            }
            "attendance" => {
                let from = params["from"].as_str().unwrap_or("");
                let to = params["to"].as_str().unwrap_or("");
                let data = query(
                    conn,
                    "SELECT a.date, e.matricule, e.first_name || ' ' || e.last_name AS name,
                            a.clock_in, a.clock_out, a.worked_minutes, a.overtime_minutes, a.status, a.note
                     FROM attendance a JOIN employees e ON e.id = a.employee_id
                     WHERE a.date BETWEEN ?1 AND ?2 ORDER BY a.date, e.last_name",
                    &[
                        json!(if from.is_empty() {
                            crate::util::today()
                                .with_day(1)
                                .unwrap_or_else(crate::util::today)
                                .format("%Y-%m-%d")
                                .to_string()
                        } else {
                            from.to_string()
                        }),
                        json!(if to.is_empty() {
                            crate::util::today().format("%Y-%m-%d").to_string()
                        } else {
                            to.to_string()
                        }),
                    ],
                )?;
                Ok((
                    vec![
                        "Date".into(),
                        "Matricule".into(),
                        "Employé".into(),
                        "Arrivée".into(),
                        "Départ".into(),
                        "Minutes travaillées".into(),
                        "Heures supplémentaires".into(),
                        "Statut".into(),
                        "Note".into(),
                    ],
                    data.iter()
                        .map(|r| {
                            let h = r["worked_minutes"].as_i64().unwrap_or(0) / 60;
                            let m = r["worked_minutes"].as_i64().unwrap_or(0) % 60;
                            vec![
                                s(&r["date"]),
                                s(&r["matricule"]),
                                s(&r["name"]),
                                s(&r["clock_in"]),
                                s(&r["clock_out"]),
                                format!("{h}h{m:02}"),
                                format!(
                                    "{}h{:02}",
                                    r["overtime_minutes"].as_i64().unwrap_or(0) / 60,
                                    r["overtime_minutes"].as_i64().unwrap_or(0) % 60
                                ),
                                s(&r["status"]),
                                s(&r["note"]),
                            ]
                        })
                        .collect(),
                ))
            }
            "payroll_run" => {
                let run_id = params["run_id"].as_i64().unwrap_or(0);
                let run = query_one(conn, "SELECT * FROM payroll_runs WHERE id = ?1", &[json!(run_id)])?;
                let data = query(
                    conn,
                    "SELECT * FROM payroll_lines WHERE run_id = ?1 ORDER BY department, full_name",
                    &[json!(run_id)],
                )?;
                let mut headers = vec![
                    "Matricule".into(),
                    "Employé".into(),
                    "Poste".into(),
                    "Département".into(),
                    "Salaire de base".into(),
                    "H. sup.".into(),
                    "Primes".into(),
                    "Indemnités".into(),
                    "Brut".into(),
                    "Cotisations salariales".into(),
                    "Impôt".into(),
                    "Net à payer".into(),
                    "Coût employeur".into(),
                ];
                headers.push(format!("Période {}", run["period"].as_str().unwrap_or("")));
                Ok((
                    headers,
                    data.iter()
                        .map(|r| {
                            vec![
                                s(&r["matricule"]),
                                s(&r["full_name"]),
                                s(&r["job_title"]),
                                s(&r["department"]),
                                s(&r["base_salary"]),
                                s(&r["overtime_hours"]),
                                format!(
                                    "{:.2}",
                                    r["bonus"].as_f64().unwrap_or(0.0) + r["commission"].as_f64().unwrap_or(0.0)
                                ),
                                s(&r["allowance"]),
                                s(&r["gross"]),
                                s(&r["social_employee"]),
                                s(&r["tax"]),
                                s(&r["net"]),
                                s(&r["employer_cost"]),
                            ]
                        })
                        .collect(),
                ))
            }
            "payroll_entries" => {
                let run_id = params["run_id"].as_i64().unwrap_or(0);
                let entries = crate::commands::payroll::entries_for(conn, run_id)?;
                let period = entries["period"].as_str().unwrap_or("");
                let rows = entries["rows"].as_array().cloned().unwrap_or_default();
                Ok((
                    vec![
                        format!("Pièce ({period})"),
                        "Opération".into(),
                        "Compte SYSCOHADA".into(),
                        "Libellé".into(),
                        "Débit".into(),
                        "Crédit".into(),
                    ],
                    rows.iter()
                        .map(|r| {
                            vec![
                                s(&r["piece"]),
                                s(&r["operation"]),
                                s(&r["compte"]),
                                s(&r["libelle"]),
                                format!("{:.0}", r["debit"].as_f64().unwrap_or(0.0)),
                                format!("{:.0}", r["credit"].as_f64().unwrap_or(0.0)),
                            ]
                        })
                        .collect(),
                ))
            }
            "leaves" => {
                let year = params["year"].as_str().map(|s| s.to_string());
                let year = year.unwrap_or_else(|| crate::util::today().format("%Y").to_string());
                let data = query(
                    conn,
                    "SELECT l.*, e.matricule, e.first_name || ' ' || e.last_name AS name,
                            lt.name AS type_name
                     FROM leave_requests l
                     JOIN employees e ON e.id = l.employee_id
                     JOIN leave_types lt ON lt.id = l.leave_type_id
                     WHERE substr(l.start_date,1,4) = ?1 ORDER BY l.start_date",
                    &[json!(year)],
                )?;
                Ok((
                    vec![
                        "Employé".into(),
                        "Matricule".into(),
                        "Type".into(),
                        "Début".into(),
                        "Fin".into(),
                        "Jours".into(),
                        "Statut".into(),
                        "Motif".into(),
                    ],
                    data.iter()
                        .map(|r| {
                            vec![
                                s(&r["name"]),
                                s(&r["matricule"]),
                                s(&r["type_name"]),
                                s(&r["start_date"]),
                                s(&r["end_date"]),
                                s(&r["days"]),
                                s(&r["status"]),
                                s(&r["reason"]),
                            ]
                        })
                        .collect(),
                ))
            }
            "candidates" => {
                let offer_id = params["offer_id"].as_i64();
                let mut sql =
                    "SELECT c.*, o.title AS offer_title FROM candidates c
                     JOIN job_offers o ON o.id = c.offer_id WHERE 1=1"
                        .to_string();
                let mut args: Vec<Value> = Vec::new();
                if let Some(o) = offer_id {
                    if o > 0 {
                        sql.push_str(&format!(" AND c.offer_id = ?{}", args.len() + 1));
                        args.push(json!(o));
                    }
                }
                sql.push_str(" ORDER BY o.title, c.last_name");
                let data = query(conn, &sql, &args)?;
                Ok((
                    vec![
                        "Prénom".into(),
                        "Nom".into(),
                        "Poste".into(),
                        "Email".into(),
                        "Téléphone".into(),
                        "Étape".into(),
                        "Note".into(),
                        "Source".into(),
                        "Candidature".into(),
                    ],
                    data.iter()
                        .map(|r| {
                            vec![
                                s(&r["first_name"]),
                                s(&r["last_name"]),
                                s(&r["offer_title"]),
                                s(&r["email"]),
                                s(&r["phone"]),
                                s(&r["stage"]),
                                s(&r["rating"]),
                                s(&r["source"]),
                                s(&r["applied_at"]),
                            ]
                        })
                        .collect(),
                ))
            }
            _ => Err(format!("Type d'export inconnu : {kind}")),
        }
    })?;

    if rows.is_empty() {
        return Err("Aucune donnée à exporter.".into());
    }
    let default_name = csv_name(&format!("export-{kind}"), "csv");
    let path = pick_save(&default_name, "Fichier CSV", "csv")?;
    crate::util::write_csv(&path, &headers, &rows)?;
    Ok(json!({"path": path.display().to_string(), "rows": rows.len()}))
}

/// Charge un jeu de données de démonstration.
#[tauri::command]
pub fn seed_demo(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| {
        let result = crate::util::seed_demo(conn)?;
        Ok(result)
    })
}

/// Réinitialise toutes les données métier.
#[tauri::command]
pub fn reset_data(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| crate::util::reset_all(conn))
}
