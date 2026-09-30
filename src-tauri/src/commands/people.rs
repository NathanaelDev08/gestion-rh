use crate::db::{self, query, query_one, Res};
use crate::Db;
use serde_json::{json, Value};
use tauri::State;

// ---------------------------------------------------------------------------
// Évaluations
// ---------------------------------------------------------------------------

const EVAL_SQL: &str = "
SELECT ev.*, e.first_name || ' ' || e.last_name AS employee_name, e.matricule,
       e.job_title, COALESCE(d.name, '') AS department, e.photo_color
FROM evaluations ev
JOIN employees e ON e.id = ev.employee_id
LEFT JOIN departments d ON d.id = e.department_id";

#[tauri::command]
pub fn list_evaluations(
    db: State<Db>,
    employee_id: Option<i64>,
    status: Option<String>,
    period: Option<String>,
) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let mut sql = EVAL_SQL.to_string();
        let mut params: Vec<Value> = Vec::new();
        let mut extra = String::new();
        if let Some(e) = employee_id {
            if e > 0 {
                extra.push_str(&format!(" AND ev.employee_id = ?{}", params.len() + 1));
                params.push(json!(e));
            }
        }
        if let Some(s) = status {
            if !s.is_empty() && s != "all" {
                extra.push_str(&format!(" AND ev.status = ?{}", params.len() + 1));
                params.push(json!(s));
            }
        }
        if let Some(p) = period {
            if !p.is_empty() && p != "all" {
                extra.push_str(&format!(" AND ev.period = ?{}", params.len() + 1));
                params.push(json!(p));
            }
        }
        if !extra.is_empty() {
            sql.push_str(&format!(" WHERE 1 = 1{extra}"));
        }
        sql.push_str(" ORDER BY ev.created_at DESC, ev.id DESC");
        query(conn, &sql, &params)
    })
}

#[tauri::command]
pub fn save_evaluation(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let mut data = data.clone();
        if data["employee_id"].as_i64().unwrap_or(0) <= 0 {
            return Err("Sélectionnez l'employé à évaluer.".into());
        }
        // Note globale recalculée depuis les critères.
        if let Some(criteria) = data["criteria_json"].as_array() {
            if !criteria.is_empty() {
                let sum: f64 = criteria
                    .iter()
                    .map(|c| c["rating"].as_f64().unwrap_or(0.0))
                    .sum();
                let avg = sum / criteria.len() as f64;
                data["global_rating"] = json!(crate::util::round2(avg));
            }
        } else if let Some(text) = data["criteria_json"].as_str() {
            if let Ok(list) = serde_json::from_str::<Vec<Value>>(text) {
                if !list.is_empty() {
                    let sum: f64 = list
                        .iter()
                        .map(|c| c["rating"].as_f64().unwrap_or(0.0))
                        .sum();
                    data["global_rating"] = json!(crate::util::round2(sum / list.len() as f64));
                }
            }
        }
        if data["status"].as_str().unwrap_or("").is_empty() {
            data["status"] = json!("draft");
        }
        if data["status"].as_str().unwrap_or("") == "completed"
            && data["completed_at"].as_str().unwrap_or("").is_empty()
        {
            data["completed_at"] = json!(crate::util::now_str());
        }
        if data["period"].as_str().unwrap_or("").is_empty() {
            data["period"] = json!(crate::util::today().format("%Y").to_string());
        }
        let result = db::save(conn, "evaluations", &data)?;
        db::log_activity(
            conn,
            "evaluation",
            "save",
            &format!(
                "Évaluation {} ({})",
                data["period"].as_str().unwrap_or(""),
                if data["status"].as_str().unwrap_or("") == "completed" { "finalisée" } else { "brouillon" }
            ),
            "admin",
        );
        Ok(result)
    })
}

#[tauri::command]
pub fn delete_evaluation(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::delete(conn, "evaluations", id)?;
        Ok(json!({"ok": true}))
    })
}

/// Synthèse des évaluations (moyennes, répartition des notes).
#[tauri::command]
pub fn evaluation_stats(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| {
        let overall = query_one(
            conn,
            "SELECT COUNT(*) AS total, AVG(global_rating) AS avg_rating,
                    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed
             FROM evaluations",
            &[],
        )?;
        let by_period = query(
            conn,
            "SELECT period, COUNT(*) AS n, AVG(global_rating) AS avg_rating
             FROM evaluations GROUP BY period ORDER BY period DESC LIMIT 6",
            &[],
        )?;
        let top = query(
            conn,
            "SELECT e.first_name || ' ' || e.last_name AS employee_name,
                    ev.global_rating, ev.period
             FROM evaluations ev JOIN employees e ON e.id = ev.employee_id
             ORDER BY ev.global_rating DESC, ev.id DESC LIMIT 5",
            &[],
        )?;
        let by_department = query(
            conn,
            "SELECT COALESCE(d.name, 'Non affecté') AS department,
                    AVG(ev.global_rating) AS avg_rating, COUNT(*) AS n
             FROM evaluations ev
             JOIN employees e ON e.id = ev.employee_id
             LEFT JOIN departments d ON d.id = e.department_id
             GROUP BY d.name ORDER BY avg_rating DESC",
            &[],
        )?;
        Ok(json!({
            "overall": overall,
            "by_period": by_period,
            "top": top,
            "by_department": by_department
        }))
    })
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_documents(
    db: State<Db>,
    employee_id: Option<i64>,
    category: Option<String>,
    expiring: Option<bool>,
) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let mut sql = "
            SELECT doc.*, e.first_name || ' ' || e.last_name AS employee_name,
                   e.matricule, COALESCE(d.name, '') AS department
            FROM documents doc
            JOIN employees e ON e.id = doc.employee_id
            LEFT JOIN departments d ON d.id = e.department_id
            WHERE 1 = 1"
                .to_string();
        let mut params: Vec<Value> = Vec::new();
        if let Some(e) = employee_id {
            if e > 0 {
                sql.push_str(&format!(" AND doc.employee_id = ?{}", params.len() + 1));
                params.push(json!(e));
            }
        }
        if let Some(c) = category {
            if !c.is_empty() && c != "all" {
                sql.push_str(&format!(" AND doc.category = ?{}", params.len() + 1));
                params.push(json!(c));
            }
        }
        if expiring.unwrap_or(false) {
            sql.push_str(
                " AND doc.expiry_date IS NOT NULL AND doc.expiry_date != ''
                   AND date(doc.expiry_date) <= date('now','+60 day')",
            );
        }
        sql.push_str(" ORDER BY doc.expiry_date IS NULL, doc.expiry_date, doc.name");
        query(conn, &sql, &params)
    })
}

#[tauri::command]
pub fn save_document(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let mut data = data.clone();
        if data["name"].as_str().unwrap_or("").trim().is_empty() {
            return Err("Le nom du document est obligatoire.".into());
        }
        if data["category"].as_str().unwrap_or("").is_empty() {
            data["category"] = json!("Divers");
        }
        let result = db::save(conn, "documents", &data)?;
        Ok(result)
    })
}

#[tauri::command]
pub fn delete_document(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::delete(conn, "documents", id)?;
        Ok(json!({"ok": true}))
    })
}

/// Catégories de documents déjà utilisées + alertes d'expiration.
#[tauri::command]
pub fn document_alerts(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| {
        let categories = query(
            conn,
            "SELECT DISTINCT category FROM documents ORDER BY category",
            &[],
        )?;
        let expiring = query(
            conn,
            "SELECT doc.*, e.first_name || ' ' || e.last_name AS employee_name
             FROM documents doc JOIN employees e ON e.id = doc.employee_id
             WHERE doc.expiry_date IS NOT NULL AND doc.expiry_date != ''
               AND date(doc.expiry_date) <= date('now','+60 day')
             ORDER BY doc.expiry_date",
            &[],
        )?;
        Ok(json!({"categories": categories, "expiring": expiring}))
    })
}
