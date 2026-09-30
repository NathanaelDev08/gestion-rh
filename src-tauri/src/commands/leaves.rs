use crate::db::{self, query, query_one, Res};
use crate::Db;
use chrono::Datelike;
use serde_json::{json, Value};
use tauri::State;

// ---------------------------------------------------------------------------
// Types de congés
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_leave_types(db: State<Db>) -> Res<Vec<Value>> {
    db::with(&db, |conn| query(conn, "SELECT * FROM leave_types ORDER BY id", &[]))
}

#[tauri::command]
pub fn save_leave_type(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| db::save(conn, "leave_types", &data))
}

#[tauri::command]
pub fn delete_leave_type(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        let used = query_one(
            conn,
            "SELECT COUNT(*) AS n FROM leave_requests WHERE leave_type_id = ?1",
            &[json!(id)],
        )?["n"]
            .as_i64()
            .unwrap_or(0);
        if used > 0 {
            return Err(format!("Ce type est utilisé par {used} demande(s) : désactivez-le plutôt."));
        }
        db::delete(conn, "leave_types", id)?;
        Ok(json!({"ok": true}))
    })
}

// ---------------------------------------------------------------------------
// Demandes de congés
// ---------------------------------------------------------------------------

/// Liste des demandes (filtres : status, year, employee_id).
#[tauri::command]
pub fn list_leave_requests(
    db: State<Db>,
    status: Option<String>,
    year: Option<String>,
    employee_id: Option<i64>,
) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let mut sql = "
            SELECT l.*, e.first_name || ' ' || e.last_name AS employee_name,
                   e.matricule, COALESCE(d.name, '') AS department,
                   lt.name AS type_name, lt.color AS color, lt.code AS type_code
            FROM leave_requests l
            JOIN employees e ON e.id = l.employee_id
            JOIN leave_types lt ON lt.id = l.leave_type_id
            LEFT JOIN departments d ON d.id = e.department_id
            WHERE 1 = 1"
            .to_string();
        let mut params: Vec<Value> = Vec::new();
        if let Some(s) = status {
            if !s.is_empty() && s != "all" {
                sql.push_str(&format!(" AND l.status = ?{}", params.len() + 1));
                params.push(json!(s));
            }
        }
        if let Some(y) = year {
            if !y.is_empty() && y != "all" {
                sql.push_str(&format!(" AND substr(l.start_date, 1, 4) = ?{}", params.len() + 1));
                params.push(json!(y));
            }
        }
        if let Some(e) = employee_id {
            if e > 0 {
                sql.push_str(&format!(" AND l.employee_id = ?{}", params.len() + 1));
                params.push(json!(e));
            }
        }
        sql.push_str(" ORDER BY l.start_date DESC, l.id DESC");
        query(conn, &sql, &params)
    })
}

/// Crée une demande en calculant le nombre de jours ouvrés.
#[tauri::command]
pub fn create_leave_request(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let mut data = data.clone();
        let start_s = data["start_date"].as_str().unwrap_or("").to_string();
        let end_s = data["end_date"].as_str().unwrap_or("").to_string();
        let start = crate::util::parse_date(&start_s)
            .ok_or_else(|| "Date de début invalide.".to_string())?;
        let end =
            crate::util::parse_date(&end_s).ok_or_else(|| "Date de fin invalide.".to_string())?;
        if end < start {
            return Err("La date de fin doit être postérieure à la date de début.".into());
        }
        let settings = crate::util::load_settings(conn);
        let weekdays = crate::util::weekdays_from(&settings);
        let holidays = crate::util::load_holidays(conn);
        let days = crate::util::working_days(start, end, &weekdays, &holidays) as f64;
        if days <= 0.0 {
            return Err("Aucun jour ouvré sur cette période (week-end ou jour férié).".into());
        }

        let employee_id = data["employee_id"].as_i64().unwrap_or(0);
        let type_id = data["leave_type_id"].as_i64().unwrap_or(0);
        let ty = query_one(conn, "SELECT * FROM leave_types WHERE id = ?1", &[json!(type_id)])?;
        if ty.is_null() {
            return Err("Type de congé introuvable.".into());
        }
        let yearly: f64 = ty["days_per_year"].as_f64().unwrap_or(0.0);
        if yearly > 0.0 {
            let year = format!("{:04}", start.year());
            let used = query_one(
                conn,
                "SELECT COALESCE(SUM(days), 0) AS n FROM leave_requests
                 WHERE employee_id = ?1 AND leave_type_id = ?2 AND status = 'approved'
                   AND substr(start_date, 1, 4) = ?3",
                &[json!(employee_id), json!(type_id), json!(year)],
            )?["n"]
                .as_f64()
                .unwrap_or(0.0);
            if used + days > yearly {
                return Err(format!(
                    "Solde insuffisant : {used:.0} jours déjà pris sur {yearly:.0} (demande de {days:.0} jours)."
                ));
            }
        }
        // Conflit : un congé approuvé couvre déjà cette période ?
        let conflict = query_one(
            conn,
            "SELECT COUNT(*) AS n FROM leave_requests
             WHERE employee_id = ?1 AND status IN ('pending','approved')
               AND NOT (end_date < ?2 OR start_date > ?3)",
            &[json!(employee_id), json!(start_s), json!(end_s)],
        )?["n"]
            .as_i64()
            .unwrap_or(0);
        if conflict > 0 {
            return Err("Une demande existe déjà sur cette période pour cet employé.".into());
        }

        data["days"] = json!(days);
        data["status"] = json!("pending");
        let result = db::save(conn, "leave_requests", &data)?;
        let name = query_one(
            conn,
            "SELECT first_name || ' ' || last_name AS n FROM employees WHERE id = ?1",
            &[json!(employee_id)],
        )?;
        db::log_activity(
            conn,
            "leave",
            "create",
            &format!("Demande de congé de {} ({days:.0} j)", name["n"].as_str().unwrap_or("")),
            "admin",
        );
        Ok(json!({"id": result["id"], "days": days}))
    })
}

/// Approuve ou rejette une demande.
#[tauri::command]
pub fn decide_leave_request(
    db: State<Db>,
    id: i64,
    decision: String,
    note: Option<String>,
    approver: Option<String>,
) -> Res<Value> {
    db::with(&db, |conn| {
        if decision != "approved" && decision != "rejected" && decision != "cancelled" {
            return Err("Décision invalide.".into());
        }
        let req = query_one(
            conn,
            "SELECT l.*, e.first_name || ' ' || e.last_name AS employee_name
             FROM leave_requests l JOIN employees e ON e.id = l.employee_id
             WHERE l.id = ?1",
            &[json!(id)],
        )?;
        if req.is_null() {
            return Err("Demande introuvable.".into());
        }
        if req["status"].as_str().unwrap_or("") != "pending" {
            return Err("Cette demande a déjà été traitée.".into());
        }
        db::run(
            conn,
            "UPDATE leave_requests SET status = ?1, decision_note = ?2, approver_name = ?3,
                    approver_id = NULL, decided_at = ?4 WHERE id = ?5",
            &[
                json!(decision),
                json!(note.unwrap_or_default()),
                json!(approver.clone().unwrap_or_else(|| "Administrateur".into())),
                json!(crate::util::now_str()),
                json!(id),
            ],
        )?;
        db::log_activity(
            conn,
            "leave",
            &decision,
            &format!(
                "Demande de {} : {}",
                req["employee_name"].as_str().unwrap_or(""),
                if decision == "approved" { "approuvée" } else { "refusée" }
            ),
            &approver.unwrap_or_else(|| "admin".into()),
        );
        Ok(json!({"ok": true, "status": decision}))
    })
}

/// Supprime une demande.
#[tauri::command]
pub fn delete_leave_request(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::delete(conn, "leave_requests", id)?;
        Ok(json!({"ok": true}))
    })
}

/// Soldes de congés par employé et par type pour une année.
#[tauri::command]
pub fn leave_balances(db: State<Db>, year: Option<String>) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let year = year.unwrap_or_else(|| crate::util::today().format("%Y").to_string());
        let rows = query(
            conn,
            "SELECT e.id AS employee_id, e.first_name, e.last_name, e.status,
                    COALESCE(d.name, '') AS department,
                    lt.id AS type_id, lt.name AS type_name, lt.color AS color,
                    lt.days_per_year AS acquis,
                    COALESCE((SELECT SUM(l.days) FROM leave_requests l
                               WHERE l.employee_id = e.id AND l.leave_type_id = lt.id
                                 AND l.status = 'approved' AND substr(l.start_date,1,4) = ?1), 0) AS pris,
                    COALESCE((SELECT COUNT(*) FROM leave_requests l
                               WHERE l.employee_id = e.id AND l.leave_type_id = lt.id
                                 AND l.status = 'pending' AND substr(l.start_date,1,4) = ?1), 0) AS en_attente
             FROM employees e
             CROSS JOIN leave_types lt
             LEFT JOIN departments d ON d.id = e.department_id
             WHERE e.status != 'terminated' AND lt.active = 1
             ORDER BY e.last_name, lt.name",
            &[json!(year)],
        )?;
        Ok(rows)
    })
}

// ---------------------------------------------------------------------------
// Jours fériés
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_holidays(db: State<Db>) -> Res<Vec<Value>> {
    db::with(&db, |conn| query(conn, "SELECT * FROM holidays ORDER BY date", &[]))
}

#[tauri::command]
pub fn save_holiday(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| db::save(conn, "holidays", &data))
}

#[tauri::command]
pub fn delete_holiday(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::delete(conn, "holidays", id)?;
        Ok(json!({"ok": true}))
    })
}
