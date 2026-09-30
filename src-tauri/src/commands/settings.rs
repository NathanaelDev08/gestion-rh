use crate::db::{self, query, query_one, Res};
use crate::Db;
use serde_json::{json, Value};
use tauri::State;

/// Retourne tous les paramètres sous forme d'objet (JSON parsé).
#[tauri::command]
pub fn get_settings(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| Ok(crate::util::load_settings(conn)))
}

/// Enregistre un ou plusieurs paramètres : `{ "company": {...}, "payroll": {...} }`.
#[tauri::command]
pub fn save_settings(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let obj = data
            .as_object()
            .ok_or_else(|| "Objet de paramètres attendu".to_string())?;
        for (key, value) in obj {
            if !key.chars().all(|c| c.is_ascii_lowercase() || c == '_') {
                continue;
            }
            let text = if value.is_string() {
                value.as_str().unwrap().to_string()
            } else {
                value.to_string()
            };
            db::run(
                conn,
                "INSERT INTO settings (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                &[
                    json!(key),
                    json!(text),
                ],
            )?;
        }
        db::log_activity(conn, "settings", "update", "Mise à jour des paramètres", "admin");
        Ok(json!({"ok": true}))
    })
}

/// Journal d'activité récent.
#[tauri::command]
pub fn list_activity(db: State<Db>, limit: Option<i64>) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        query(
            conn,
            "SELECT * FROM activity ORDER BY id DESC LIMIT ?1",
            &[json!(limit.unwrap_or(12))],
        )
    })
}

/// Recherche globale (employés, candidatures, offres) pour la barre de recherche.
#[tauri::command]
pub fn global_search(db: State<Db>, term: String) -> Res<Value> {
    db::with(&db, |conn| {
        let like = json!(format!("%{}%", term.trim()));
        let employees = query(
            conn,
            "SELECT id, first_name, last_name, job_title, matricule FROM employees
             WHERE first_name LIKE ?1 OR last_name LIKE ?1 OR matricule LIKE ?1 OR job_title LIKE ?1
             ORDER BY first_name LIMIT 6",
            &[like.clone()],
        )?;
        let offers = query(
            conn,
            "SELECT id, title, status FROM job_offers WHERE title LIKE ?1 ORDER BY id DESC LIMIT 4",
            &[like.clone()],
        )?;
        let candidates = query(
            conn,
            "SELECT id, first_name, last_name, stage FROM candidates
             WHERE first_name LIKE ?1 OR last_name LIKE ?1 ORDER BY id DESC LIMIT 4",
            &[like],
        )?;
        Ok(json!({"employees": employees, "offers": offers, "candidates": candidates}))
    })
}

/// Informations de la base (taille, nombre d'enregistrements).
#[tauri::command]
pub fn database_info(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| {
        let mut info = serde_json::Map::new();
        for table in [
            "employees",
            "departments",
            "leave_requests",
            "attendance",
            "payroll_runs",
            "payroll_lines",
            "job_offers",
            "candidates",
            "evaluations",
            "documents",
            "users",
        ] {
            let rows = query(
                conn,
                &format!("SELECT COUNT(*) AS n FROM {table}"),
                &[],
            )?;
            info.insert(table.to_string(), json!(rows[0]["n"].as_i64().unwrap_or(0)));
        }
        let created = query_one(conn, "SELECT MIN(created_at) AS d FROM activity", &[])?;
        info.insert("first_activity".into(), created["d"].clone());
        Ok(Value::Object(info))
    })
}
