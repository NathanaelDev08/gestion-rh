use crate::db::{self, query, query_one, Res};
use crate::Db;
use serde_json::{json, Value};
use tauri::State;

// ---------------------------------------------------------------------------
// Offres d'emploi
// ---------------------------------------------------------------------------

/// Liste des offres avec compteurs de candidats.
#[tauri::command]
pub fn list_job_offers(db: State<Db>) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        query(
            conn,
            "SELECT o.*, COALESCE(d.name, '') AS department_name,
                    (SELECT COUNT(*) FROM candidates c WHERE c.offer_id = o.id) AS candidates_count,
                    (SELECT COUNT(*) FROM candidates c WHERE c.offer_id = o.id
                       AND c.stage = 'hired') AS hired_count
             FROM job_offers o
             LEFT JOIN departments d ON d.id = o.department_id
             ORDER BY CASE o.status WHEN 'open' THEN 0 WHEN 'on_hold' THEN 1 ELSE 2 END,
                      o.id DESC",
            &[],
        )
    })
}

#[tauri::command]
pub fn save_job_offer(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let mut data = data.clone();
        if data["status"].as_str().unwrap_or("").is_empty() {
            data["status"] = json!("open");
        }
        if data["status"].as_str().unwrap_or("") == "open" && data["posted_at"].as_str().unwrap_or("").is_empty() {
            data["posted_at"] = json!(crate::util::today().format("%Y-%m-%d").to_string());
        }
        if data["status"].as_str().unwrap_or("") == "closed" && data["closed_at"].as_str().unwrap_or("").is_empty() {
            data["closed_at"] = json!(crate::util::today().format("%Y-%m-%d").to_string());
        }
        let result = db::save(conn, "job_offers", &data)?;
        db::log_activity(
            conn,
            "offer",
            "save",
            &format!("Offre : {}", data["title"].as_str().unwrap_or("")),
            "admin",
        );
        Ok(result)
    })
}

#[tauri::command]
pub fn delete_job_offer(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::delete(conn, "job_offers", id)?;
        Ok(json!({"ok": true}))
    })
}

// ---------------------------------------------------------------------------
// Candidats
// ---------------------------------------------------------------------------

const CANDIDATE_SQL: &str = "
SELECT c.*, o.title AS offer_title, o.status AS offer_status
FROM candidates c
JOIN job_offers o ON o.id = c.offer_id";

#[tauri::command]
pub fn list_candidates(
    db: State<Db>,
    offer_id: Option<i64>,
    stage: Option<String>,
    search: Option<String>,
) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let mut sql = CANDIDATE_SQL.to_string();
        let mut params: Vec<Value> = Vec::new();
        let mut extra = String::new();
        if let Some(o) = offer_id {
            if o > 0 {
                extra.push_str(&format!(" AND c.offer_id = ?{}", params.len() + 1));
                params.push(json!(o));
            }
        }
        if let Some(s) = stage {
            if !s.is_empty() && s != "all" {
                extra.push_str(&format!(" AND c.stage = ?{}", params.len() + 1));
                params.push(json!(s));
            }
        }
        if let Some(t) = search {
            let t = t.trim();
            if !t.is_empty() {
                extra.push_str(&format!(
                    " AND (c.first_name LIKE ?{} OR c.last_name LIKE ?{} OR c.email LIKE ?{})",
                    params.len() + 1,
                    params.len() + 1,
                    params.len() + 1
                ));
                params.push(json!(format!("%{t}%")));
            }
        }
        if !extra.is_empty() {
            sql.push_str(&format!(" WHERE 1 = 1{extra}"));
        }
        sql.push_str(" ORDER BY c.updated_at DESC, c.id DESC");
        query(conn, &sql, &params)
    })
}

#[tauri::command]
pub fn save_candidate(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let mut data = data.clone();
        if data["stage"].as_str().unwrap_or("").is_empty() {
            data["stage"] = json!("new");
        }
        data["updated_at"] = json!(crate::util::now_str());
        let result = db::save(conn, "candidates", &data)?;
        let id = result["id"].as_i64().unwrap_or(0);
        let who = query_one(
            conn,
            "SELECT first_name || ' ' || last_name AS n FROM candidates WHERE id = ?1",
            &[json!(id)],
        )?;
        db::log_activity(
            conn,
            "candidate",
            "save",
            &format!("Candidature : {}", who["n"].as_str().unwrap_or("")),
            "admin",
        );
        Ok(result)
    })
}

/// Change l'étape d'un candidat (pipeline).
#[tauri::command]
pub fn move_candidate(db: State<Db>, id: i64, stage: String) -> Res<Value> {
    db::with(&db, |conn| {
        const STAGES: [&str; 6] = ["new", "screening", "interview", "offer", "hired", "rejected"];
        if !STAGES.contains(&stage.as_str()) {
            return Err("Étape inconnue.".into());
        }
        db::run(
            conn,
            "UPDATE candidates SET stage = ?1, updated_at = ?2 WHERE id = ?3",
            &[json!(stage), json!(crate::util::now_str()), json!(id)],
        )?;
        let who = query_one(
            conn,
            "SELECT first_name || ' ' || last_name AS n FROM candidates WHERE id = ?1",
            &[json!(id)],
        )?;
        if who.is_null() {
            return Err("Candidat introuvable.".into());
        }
        db::log_activity(
            conn,
            "candidate",
            "stage",
            &format!("{} → {}", who["n"].as_str().unwrap_or(""), stage),
            "admin",
        );
        Ok(json!({"ok": true, "stage": stage}))
    })
}

#[tauri::command]
pub fn delete_candidate(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::delete(conn, "candidates", id)?;
        Ok(json!({"ok": true}))
    })
}

// ---------------------------------------------------------------------------
// Entretiens
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_interviews(
    db: State<Db>,
    candidate_id: Option<i64>,
    upcoming: Option<bool>,
) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        let mut sql = "
            SELECT i.*, c.first_name || ' ' || c.last_name AS candidate_name,
                   c.stage, o.title AS offer_title
            FROM interviews i
            JOIN candidates c ON c.id = i.candidate_id
            JOIN job_offers o ON o.id = c.offer_id
            WHERE 1 = 1"
                .to_string();
        let mut params: Vec<Value> = Vec::new();
        if let Some(c) = candidate_id {
            if c > 0 {
                sql.push_str(&format!(" AND i.candidate_id = ?{}", params.len() + 1));
                params.push(json!(c));
            }
        }
        if upcoming.unwrap_or(false) {
            sql.push_str(&format!(" AND i.scheduled_at >= ?{}", params.len() + 1));
            params.push(json!(crate::util::now_str()));
        }
        sql.push_str(" ORDER BY i.scheduled_at ASC");
        query(conn, &sql, &params)
    })
}

#[tauri::command]
pub fn save_interview(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let data = data.clone();
        if data["scheduled_at"].as_str().unwrap_or("").is_empty() {
            return Err("La date et l'heure de l'entretien sont obligatoires.".into());
        }
        db::save(conn, "interviews", &data)
    })
}

#[tauri::command]
pub fn delete_interview(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        db::delete(conn, "interviews", id)?;
        Ok(json!({"ok": true}))
    })
}

/// Statistiques du recrutement (par étape).
#[tauri::command]
pub fn recruitment_stats(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| {
        let by_stage = query(
            conn,
            "SELECT stage, COUNT(*) AS n FROM candidates GROUP BY stage",
            &[],
        )?;
        let by_offer = query(
            conn,
            "SELECT o.id, o.title, o.status,
                    (SELECT COUNT(*) FROM candidates c WHERE c.offer_id = o.id) AS n
             FROM job_offers o ORDER BY o.id DESC",
            &[],
        )?;
        let conversion = query_one(
            conn,
            "SELECT COUNT(*) AS total,
                    SUM(CASE WHEN stage = 'hired' THEN 1 ELSE 0 END) AS hired
             FROM candidates",
            &[],
        )?;
        Ok(json!({"by_stage": by_stage, "by_offer": by_offer, "conversion": conversion}))
    })
}
