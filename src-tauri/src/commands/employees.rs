use crate::db::{self, query, query_one, Res};
use crate::Db;
use serde_json::{json, Value};
use tauri::State;

const LIST_SQL: &str = "
SELECT e.*,
       COALESCE(d.name, '') AS department_name,
       CASE WHEN m.id IS NULL THEN '' ELSE m.first_name || ' ' || m.last_name END AS manager_name,
       COALESCE(ROUND((julianday('now') - julianday(e.hire_date)) / 365.25, 1), 0) AS seniority_years
FROM employees e
LEFT JOIN departments d ON d.id = e.department_id
LEFT JOIN employees   m ON m.id = e.manager_id
WHERE 1 = 1";

/// Liste des employés avec filtres optionnels.
#[tauri::command]
pub fn list_employees(
    db: State<Db>,
    search: Option<String>,
    status: Option<String>,
    department_id: Option<i64>,
    contract_type: Option<String>,
) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let mut sql = LIST_SQL.to_string();
        let mut params: Vec<Value> = Vec::new();
        if let Some(term) = search {
            let term = term.trim();
            if !term.is_empty() {
                sql.push_str(
                    " AND (e.first_name LIKE ?1 OR e.last_name LIKE ?1 OR e.matricule LIKE ?1
                          OR e.email LIKE ?1 OR e.job_title LIKE ?1)",
                );
                params.push(json!(format!("%{term}%")));
            }
        }
        if let Some(s) = status {
            if !s.is_empty() && s != "all" {
                sql.push_str(&format!(" AND e.status = ?{}", params.len() + 1));
                params.push(json!(s));
            }
        }
        if let Some(d) = department_id {
            if d > 0 {
                sql.push_str(&format!(" AND e.department_id = ?{}", params.len() + 1));
                params.push(json!(d));
            }
        }
        if let Some(c) = contract_type {
            if !c.is_empty() && c != "all" {
                sql.push_str(&format!(" AND e.contract_type = ?{}", params.len() + 1));
                params.push(json!(c));
            }
        }
        sql.push_str(" ORDER BY e.last_name, e.first_name");
        query(conn, &sql, &params)
    })
}

/// Fiche complète d'un employé + indicateurs associés.
#[tauri::command]
pub fn get_employee(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        let employee = query_one(conn, &format!("{LIST_SQL} AND e.id = ?1"), &[json!(id)])?;
        if employee.is_null() {
            return Err("Employé introuvable.".into());
        }
        let leaves = query_one(
            conn,
            "SELECT COUNT(*) AS total,
                    SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
             FROM leave_requests WHERE employee_id = ?1",
            &[json!(id)],
        )?;
        let documents = query_one(
            conn,
            "SELECT COUNT(*) AS total,
                    SUM(CASE WHEN expiry_date IS NOT NULL AND expiry_date != ''
                              AND date(expiry_date) <= date('now','+60 day') THEN 1 ELSE 0 END) AS expiring
             FROM documents WHERE employee_id = ?1",
            &[json!(id)],
        )?;
        let attendance = query_one(
            conn,
            "SELECT COUNT(*) AS days,
                    SUM(worked_minutes) AS minutes,
                    SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) AS lates
             FROM attendance WHERE employee_id = ?1 AND date >= date('now','-12 month')",
            &[json!(id)],
        )?;
        let evaluations = query_one(
            conn,
            "SELECT COUNT(*) AS total, AVG(global_rating) AS avg_rating
             FROM evaluations WHERE employee_id = ?1",
            &[json!(id)],
        )?;
        let last_run = query_one(
            conn,
            "SELECT net, gross, period FROM payroll_lines pl
             JOIN payroll_runs r ON r.id = pl.run_id
             WHERE pl.employee_id = ?1 ORDER BY r.period DESC LIMIT 1",
            &[json!(id)],
        )?;
        let history = query(
            conn,
            "SELECT start_date, end_date, days, status, lt.name AS type_name, lt.color AS color
             FROM leave_requests lrt
             JOIN leave_types lt ON lt.id = lrt.leave_type_id
             WHERE employee_id = ?1 ORDER BY start_date DESC LIMIT 12",
            &[json!(id)],
        )?;
        Ok(json!({
            "employee": employee,
            "leaves": leaves,
            "documents": documents,
            "attendance": attendance,
            "evaluations": evaluations,
            "last_payroll": last_run,
            "leave_history": history
        }))
    })
}

/// Crée ou met à jour un employé.
#[tauri::command]
pub fn save_employee(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let mut data = data.clone();
        let generated;
        let matricule = data["matricule"].as_str().unwrap_or("").trim().to_string();
        if matricule.is_empty() {
            let max = query_one(
                conn,
                "SELECT COUNT(*) AS n FROM employees",
                &[],
            )?["n"]
                .as_i64()
                .unwrap_or(0);
            let mut n = max + 1;
            loop {
                let candidate = format!("EMP-{n:03}");
                let taken = query_one(
                    conn,
                    "SELECT COUNT(*) AS n FROM employees WHERE matricule = ?1",
                    &[json!(candidate)],
                )?["n"]
                    .as_i64()
                    .unwrap_or(0);
                if taken == 0 {
                    generated = candidate;
                    break;
                }
                n += 1;
                if n > 99_999 {
                    return Err("Impossible de générer un matricule.".into());
                }
            }
            data["matricule"] = json!(generated);
        }
        if data["hire_date"].as_str().unwrap_or("").is_empty() {
            data["hire_date"] = json!(crate::util::today().format("%Y-%m-%d").to_string());
        }
        if data["status"].as_str().unwrap_or("") == "terminated"
            && data["termination_date"].as_str().unwrap_or("").is_empty()
        {
            data["termination_date"] = json!(crate::util::today().format("%Y-%m-%d").to_string());
        }
        if data["photo_color"].as_str().unwrap_or("").is_empty() {
            data["photo_color"] = json!("#4f46e5");
        }
        let result = db::save(conn, "employees", &data)?;
        let id = result["id"].as_i64().unwrap_or(0);
        let who = query_one(
            conn,
            "SELECT first_name || ' ' || last_name AS name FROM employees WHERE id = ?1",
            &[json!(id)],
        )?;
        db::log_activity(
            conn,
            "employee",
            if data["id"].is_null() { "create" } else { "update" },
            &format!("Fiche employé : {}", who["name"].as_str().unwrap_or("")),
            "admin",
        );
        Ok(json!({"id": id, "matricule": data["matricule"]}))
    })
}

/// Supprime un employé (et ses données liées).
#[tauri::command]
pub fn delete_employee(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        let who = query_one(
            conn,
            "SELECT first_name || ' ' || last_name AS name FROM employees WHERE id = ?1",
            &[json!(id)],
        )?;
        if who.is_null() {
            return Err("Employé introuvable.".into());
        }
        db::run(conn, "UPDATE departments SET manager_id = NULL WHERE manager_id = ?1", &[json!(id)])?;
        db::run(conn, "UPDATE employees SET manager_id = NULL WHERE manager_id = ?1", &[json!(id)])?;
        db::delete(conn, "employees", id)?;
        db::log_activity(
            conn,
            "employee",
            "delete",
            &format!("Suppression de la fiche : {}", who["name"].as_str().unwrap_or("")),
            "admin",
        );
        Ok(json!({"ok": true}))
    })
}

/// Statistiques d'effectif.
#[tauri::command]
pub fn employee_stats(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| {
        let by_status = query(
            conn,
            "SELECT status, COUNT(*) AS n FROM employees GROUP BY status ORDER BY n DESC",
            &[],
        )?;
        let by_department = query(
            conn,
            "SELECT COALESCE(d.name, 'Non affecté') AS department, COUNT(e.id) AS n
             FROM employees e LEFT JOIN departments d ON d.id = e.department_id
             WHERE e.status != 'terminated'
             GROUP BY d.name ORDER BY n DESC",
            &[],
        )?;
        let by_contract = query(
            conn,
            "SELECT contract_type, COUNT(*) AS n FROM employees
             WHERE status != 'terminated' GROUP BY contract_type ORDER BY n DESC",
            &[],
        )?;
        Ok(json!({
            "by_status": by_status,
            "by_department": by_department,
            "by_contract": by_contract
        }))
    })
}

// ---------------------------------------------------------------------------
// Départements / organigramme
// ---------------------------------------------------------------------------

/// Liste des départements (avec responsable et effectif).
#[tauri::command]
pub fn list_departments(db: State<Db>) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        query(
            conn,
            "SELECT d.*,
                    CASE WHEN m.id IS NULL THEN '' ELSE m.first_name || ' ' || m.last_name END AS manager_name,
                    (SELECT COUNT(*) FROM employees e
                      WHERE e.department_id = d.id AND e.status != 'terminated') AS employee_count
             FROM departments d
             LEFT JOIN employees m ON m.id = d.manager_id
             ORDER BY d.name",
            &[],
        )
    })
}

/// Crée ou met à jour un département.
#[tauri::command]
pub fn save_department(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let result = db::save(conn, "departments", &data)?;
        db::log_activity(
            conn,
            "department",
            "save",
            &format!("Département : {}", data["name"].as_str().unwrap_or("")),
            "admin",
        );
        Ok(result)
    })
}

/// Supprime un département.
#[tauri::command]
pub fn delete_department(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::run(
            conn,
            "UPDATE employees SET department_id = NULL WHERE department_id = ?1",
            &[json!(id)],
        )?;
        db::delete(conn, "departments", id)?;
        Ok(json!({"ok": true}))
    })
}

/// Organigramme : arborescence responsable -> équipes.
#[tauri::command]
pub fn org_chart(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| {
        let people = query(
            conn,
            "SELECT id, first_name, last_name, job_title, photo_color, department_id,
                    manager_id, status, job_title AS title
             FROM employees WHERE status != 'terminated'
             ORDER BY CASE WHEN manager_id IS NULL THEN 0 ELSE 1 END, last_name",
            &[],
        )?;
        let departments = query(
            conn,
            "SELECT d.id, d.name, d.code, d.budget,
                    CASE WHEN m.id IS NULL THEN '' ELSE m.first_name || ' ' || m.last_name END AS manager_name,
                    (SELECT COUNT(*) FROM employees e
                      WHERE e.department_id = d.id AND e.status != 'terminated') AS employee_count
             FROM departments d LEFT JOIN employees m ON m.id = d.manager_id
             ORDER BY d.name",
            &[],
        )?;
        Ok(json!({"people": people, "departments": departments}))
    })
}
