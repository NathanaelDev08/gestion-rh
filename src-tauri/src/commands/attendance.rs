use crate::db::{self, query, query_one, Res};
use crate::Db;
use chrono::{Datelike, Local};
use serde_json::{json, Value};
use tauri::State;

const SELECT_SQL: &str = "
SELECT a.*, e.first_name || ' ' || e.last_name AS employee_name, e.matricule,
       e.work_schedule, COALESCE(d.name, '') AS department, e.photo_color
FROM attendance a
JOIN employees e ON e.id = a.employee_id
LEFT JOIN departments d ON d.id = e.department_id";

fn status_label(status: &str) -> &'static str {
    match status {
        "present" => "Présent",
        "late" => "En retard",
        "absent" => "Absent",
        "leave" => "Congé",
        "holiday" => "Jour férié",
        "sick" => "Arrêt maladie",
        "remote" => "Télétravail",
        "mission" => "Mission",
        _ => "Présent",
    }
}

/// Recalcule les champs dérivés d'une journée de présence.
fn compute(conn: &rusqlite::Connection, data: &mut Value, id: Option<i64>) -> Res<()> {
    let settings = crate::util::load_settings(conn);
    let work = &settings["work"];
    let start_hm = work["start"].as_str().unwrap_or("08:30").to_string();
    let grace = work["late_grace_minutes"].as_f64().unwrap_or(10.0);
    let default_break = work["break_minutes"].as_f64().unwrap_or(60.0);
    let standard_hours = work["standard_hours_month"].as_f64().unwrap_or(191.0);

    // Copies : `data` est ensuite modifié (`IndexMut`) pendant le calcul.
    let clock_in = data["clock_in"].as_str().unwrap_or("").to_string();
    let clock_out = data["clock_out"].as_str().unwrap_or("").to_string();
    let status = data["status"].as_str().unwrap_or("present").to_string();

    // Pause par défaut si renseigné mais à zéro.
    if data["break_minutes"].as_f64().is_none() {
        data["break_minutes"] = json!(default_break as i64);
    }

    if !clock_in.is_empty() && !clock_out.is_empty() {
        let fmt = |s: &str| {
            chrono::NaiveTime::parse_from_str(s, "%H:%M")
                .ok()
                .or_else(|| chrono::NaiveTime::parse_from_str(s, "%H:%M:%S").ok())
        };
        if let (Some(i), Some(o)) = (fmt(&clock_in), fmt(&clock_out)) {
            let mut minutes = (o - i).num_minutes() as i64;
            minutes -= data["break_minutes"].as_i64().unwrap_or(0).max(0);
            minutes = minutes.max(0);
            data["worked_minutes"] = json!(minutes);
            let daily_standard = standard_hours * 60.0 / 22.0; // minutes / jour ouvré
            data["overtime_minutes"] = json!((minutes as f64 - daily_standard).max(0.0) as i64);
            if status == "present" || status == "late" {
                if let Some(in_time) = fmt(&clock_in) {
                    let mut sp: Vec<&str> = start_hm.split(':').collect();
                    if sp.len() != 2 {
                        sp = vec!["08", "30"];
                    }
                    let start_time = chrono::NaiveTime::from_hms_opt(
                        sp[0].parse().unwrap_or(8),
                        sp[1].parse().unwrap_or(30),
                        0,
                    );
                    if let Some(st) = start_time {
                        let diff = (in_time - st).num_minutes() as f64;
                        if diff > grace {
                            data["status"] = json!("late");
                        }
                    }
                }
            }
        }
    }
    let _ = id;
    let _ = status_label;
    Ok(())
}

/// Journal des pointages (filtres : employee_id, from, to, month).
#[tauri::command]
pub fn list_attendance(
    db: State<Db>,
    employee_id: Option<i64>,
    date_from: Option<String>,
    date_to: Option<String>,
    month: Option<String>,
    status: Option<String>,
) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let mut sql = SELECT_SQL.to_string();
        let mut params: Vec<Value> = Vec::new();
        let mut where_clause = String::new();
        if let Some(e) = employee_id {
            if e > 0 {
                where_clause.push_str(&format!(" AND a.employee_id = ?{}", params.len() + 1));
                params.push(json!(e));
            }
        }
        if let Some(m) = month {
            if !m.is_empty() && m != "all" {
                where_clause.push_str(&format!(" AND substr(a.date, 1, 7) = ?{}", params.len() + 1));
                params.push(json!(m));
            }
        }
        if let Some(f) = date_from {
            if !f.is_empty() {
                where_clause.push_str(&format!(" AND a.date >= ?{}", params.len() + 1));
                params.push(json!(f));
            }
        }
        if let Some(t) = date_to {
            if !t.is_empty() {
                where_clause.push_str(&format!(" AND a.date <= ?{}", params.len() + 1));
                params.push(json!(t));
            }
        }
        if let Some(s) = status {
            if !s.is_empty() && s != "all" {
                where_clause.push_str(&format!(" AND a.status = ?{}", params.len() + 1));
                params.push(json!(s));
            }
        }
        if !where_clause.is_empty() {
            sql.push_str(&format!(" WHERE 1 = 1{where_clause}"));
        }
        sql.push_str(" ORDER BY a.date DESC, e.last_name");
        query(conn, &sql, &params)
    })
}

/// Crée ou corrige une journée de présence.
#[tauri::command]
pub fn save_attendance(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let mut data = data.clone();
        if data["date"].as_str().unwrap_or("").is_empty() {
            data["date"] = json!(crate::util::today().format("%Y-%m-%d").to_string());
        }
        if data["status"].as_str().unwrap_or("").is_empty() {
            data["status"] = json!("present");
        }
        if data["status"].as_str().unwrap_or("") == "absent" {
            data["clock_in"] = Value::Null;
            data["clock_out"] = Value::Null;
            data["worked_minutes"] = json!(0);
            data["overtime_minutes"] = json!(0);
        }
        compute(conn, &mut data, None)?;
        let existing = query_one(
            conn,
            "SELECT id FROM attendance WHERE employee_id = ?1 AND date = ?2",
            &[data["employee_id"].clone(), data["date"].clone()],
        )?;
        if !existing.is_null() {
            data["id"] = existing["id"].clone();
        }
        let result = db::save(conn, "attendance", &data)?;
        Ok(json!({"id": result["id"]}))
    })
}

/// Supprime un pointage.
#[tauri::command]
pub fn delete_attendance(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::delete(conn, "attendance", id)?;
        Ok(json!({"ok": true}))
    })
}

/// Pointeuse : enregistre l'arrivée ou le départ du jour.
#[tauri::command]
pub fn clock_event(db: State<Db>, employee_id: i64, action: String) -> Res<Value> {
    db::with(&db, |conn| {
        let emp = query_one(
            conn,
            "SELECT id, first_name || ' ' || last_name AS name, status FROM employees WHERE id = ?1",
            &[json!(employee_id)],
        )?;
        if emp.is_null() {
            return Err("Employé introuvable.".into());
        }
        if emp["status"].as_str().unwrap_or("") == "terminated" {
            return Err("Cet employé n'est plus en poste.".into());
        }
        let date = crate::util::today().format("%Y-%m-%d").to_string();
        let now = Local::now().format("%H:%M").to_string();
        let existing = query_one(
            conn,
            "SELECT * FROM attendance WHERE employee_id = ?1 AND date = ?2",
            &[json!(employee_id), json!(date)],
        )?;
        let mut data = if existing.is_null() {
            json!({"employee_id": employee_id, "date": date, "status": "present"})
        } else {
            existing.clone()
        };

        match action.as_str() {
            "in" => {
                if !data["clock_in"].as_str().unwrap_or("").is_empty() {
                    return Err("L'arrivée est déjà pointée aujourd'hui.".into());
                }
                data["clock_in"] = json!(now);
                data["status"] = json!("present");
            }
            "out" => {
                if data["clock_in"].as_str().unwrap_or("").is_empty() {
                    return Err("Pointez d'abord votre arrivée.".into());
                }
                if !data["clock_out"].as_str().unwrap_or("").is_empty() {
                    return Err("Le départ est déjà pointé aujourd'hui.".into());
                }
                data["clock_out"] = json!(now);
            }
            "break_start" => {
                data["note"] = json!(format!("Pause à {now}"));
            }
            "break_end" => {
                let note = data["note"].as_str().unwrap_or("").to_string();
                data["note"] = json!(note);
                data["break_minutes"] = json!(60);
            }
            _ => return Err("Action de pointage inconnue.".into()),
        }
        compute(conn, &mut data, None)?;
        let existing_id = data["id"].as_i64();
        if existing_id.is_none() && !existing.is_null() {
            data["id"] = existing["id"].clone();
        }
        let result = db::save(conn, "attendance", &data)?;
        let row = query_one(conn, &format!("{SELECT_SQL} WHERE a.id = ?1"), &[result["id"].clone()])?;
        db::log_activity(
            conn,
            "attendance",
            &action,
            &format!("Pointage {} : {}", emp["name"].as_str().unwrap_or(""), status_label(row["status"].as_str().unwrap_or(""))),
            "admin",
        );
        Ok(row)
    })
}

/// Présence du jour (tous les employés en poste).
#[tauri::command]
pub fn today_presence(db: State<Db>) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let date = crate::util::today().format("%Y-%m-%d").to_string();
        query(
            conn,
            "SELECT e.id AS employee_id, e.first_name, e.last_name, e.job_title,
                    e.photo_color, e.work_schedule, COALESCE(d.name, '') AS department,
                    a.id, a.clock_in, a.clock_out, a.status, a.worked_minutes, a.note
             FROM employees e
             LEFT JOIN departments d ON d.id = e.department_id
             LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?1
             WHERE e.status NOT IN ('terminated')
             ORDER BY CASE WHEN a.clock_in IS NULL THEN 1 ELSE 0 END, a.clock_in DESC, e.last_name",
            &[json!(date)],
        )
    })
}

/// Grille mensuelle : employés x jours.
#[tauri::command]
pub fn monthly_grid(db: State<Db>, month: String) -> Res<Value> {
    db::with(&db, |conn| {
        let prefix = if month.len() >= 7 {
            month[..7].to_string()
        } else {
            crate::util::today().format("%Y-%m").to_string()
        };
        let employees = query(
            conn,
            "SELECT e.id, e.first_name, e.last_name, e.matricule, e.photo_color,
                    e.work_schedule, COALESCE(d.name, '') AS department
             FROM employees e LEFT JOIN departments d ON d.id = e.department_id
             WHERE e.status != 'terminated' ORDER BY e.last_name",
            &[],
        )?;
        let rows = query(
            conn,
            "SELECT a.* FROM attendance a WHERE substr(a.date, 1, 7) = ?1 ORDER BY a.date",
            &[json!(prefix)],
        )?;
        let holidays = query(
            conn,
            "SELECT date, name FROM holidays WHERE substr(date, 1, 7) = ?1",
            &[json!(prefix)],
        )?;
        let requests = query(
            conn,
            "SELECT employee_id, start_date, end_date, lt.name AS type_name, lt.color AS color
             FROM leave_requests l JOIN leave_types lt ON lt.id = l.leave_type_id
             WHERE l.status = 'approved' AND l.start_date <= ?2 AND l.end_date >= ?1",
            &[json!(format!("{prefix}-01")), json!(format!("{prefix}-31"))],
        )?;
        let (y, m) = (
            prefix[0..4].parse::<i32>().unwrap_or(crate::util::today().year()),
            prefix[5..7].parse::<u32>().unwrap_or(9),
        );
        let days = crate::util::days_in_month(y, m);
        Ok(json!({
            "month": prefix,
            "days": days,
            "year": y,
            "month_number": m,
            "employees": employees,
            "attendance": rows,
            "holidays": holidays,
            "leaves": requests
        }))
    })
}

/// Synthèse de présence par employé sur une période.
#[tauri::command]
pub fn attendance_summary(db: State<Db>, date_from: String, date_to: String) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        query(
            conn,
            "SELECT e.id AS employee_id, e.first_name || ' ' || e.last_name AS employee_name,
                    e.matricule, COALESCE(d.name, '') AS department,
                    COUNT(a.id) AS days_present,
                    COALESCE(SUM(a.worked_minutes), 0) AS worked_minutes,
                    COALESCE(SUM(a.overtime_minutes), 0) AS overtime_minutes,
                    COALESCE(SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END), 0) AS lates,
                    COALESCE(SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END), 0) AS absents
             FROM employees e
             LEFT JOIN departments d ON d.id = e.department_id
             LEFT JOIN attendance a ON a.employee_id = e.id AND a.date BETWEEN ?1 AND ?2
             WHERE e.status != 'terminated'
             GROUP BY e.id
             ORDER BY e.last_name",
            &[
                json!(if date_from.is_empty() {
                    crate::util::today().format("%Y-%m-01").to_string()
                } else {
                    date_from
                }),
                json!(if date_to.is_empty() {
                    crate::util::today().format("%Y-%m-%d").to_string()
                } else {
                    date_to
                }),
            ],
        )
    })
}
