use crate::db::{self, query, query_one, Res};
use crate::Db;
use chrono::Datelike;
use serde_json::{json, Value};
use tauri::State;

/// Indicateurs agrégés du tableau de bord.
#[tauri::command]
pub fn dashboard_stats(db: State<Db>) -> Res<Value> {
    db::with(&db, |conn| {
        let today = crate::util::today();
        let today_s = today.format("%Y-%m-%d").to_string();
        let month = today.format("%Y-%m").to_string();
        let settings = crate::util::load_settings(conn);
        let weekdays = crate::util::weekdays_from(&settings);
        let holidays = crate::util::load_holidays(conn);
        let is_workday = crate::util::is_workday(today, &weekdays, &holidays);

        let headcount = query_one(
            conn,
            "SELECT
                COUNT(*) AS total,
                SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
                SUM(CASE WHEN status = 'probation' THEN 1 ELSE 0 END) AS probation,
                SUM(CASE WHEN status = 'terminated' THEN 1 ELSE 0 END) AS terminated,
                SUM(CASE WHEN substr(hire_date,1,7) = ?1 THEN 1 ELSE 0 END) AS hires_month,
                SUM(CASE WHEN termination_date IS NOT NULL AND substr(termination_date,1,7) = ?1
                         THEN 1 ELSE 0 END) AS leaves_month,
                COALESCE(ROUND(AVG((julianday('now') - julianday(hire_date)) / 365.25), 1), 0) AS avg_seniority,
                COALESCE(SUM(base_salary), 0) AS salary_mass
             FROM employees",
            &[json!(month)],
        )?;

        let presence_today = query_one(
            conn,
            "SELECT
                SUM(CASE WHEN a.clock_in IS NOT NULL AND a.status IN ('present','late') THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN a.status = 'late' THEN 1 ELSE 0 END) AS late,
                SUM(CASE WHEN a.clock_in IS NULL AND a.status IS NULL THEN 1 ELSE 0 END) AS missing,
                SUM(CASE WHEN a.status IN ('leave','sick','holiday') THEN 1 ELSE 0 END) AS excused
             FROM employees e
             LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?1
             WHERE e.status NOT IN ('terminated')",
            &[json!(today_s)],
        )?;

        let leaves = query_one(
            conn,
            "SELECT
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
                SUM(CASE WHEN status = 'approved' AND substr(start_date,1,7) = ?1 THEN 1 ELSE 0 END) AS approved_month,
                SUM(CASE WHEN status = 'approved' AND start_date <= ?2 AND end_date >= ?2 THEN 1 ELSE 0 END) AS away_today
             FROM leave_requests",
            &[json!(month), json!(today_s)],
        )?;

        let payroll = query_one(
            conn,
            "SELECT id, period, employee_count, total_gross, total_net, total_employer, generated_at
             FROM payroll_runs ORDER BY period DESC LIMIT 1",
            &[],
        )?;

        let recruitment = query_one(
            conn,
            "SELECT
                (SELECT COUNT(*) FROM job_offers WHERE status = 'open') AS open_offers,
                (SELECT COUNT(*) FROM candidates) AS candidates,
                (SELECT COUNT(*) FROM candidates WHERE stage IN ('new','screening','interview','offer')) AS in_pipeline,
                (SELECT COUNT(*) FROM candidates WHERE stage = 'hired') AS hired,
                (SELECT COUNT(*) FROM interviews WHERE result = 'pending') AS pending_interviews",
            &[],
        )?;

        let by_department = query(
            conn,
            "SELECT COALESCE(d.name, 'Non affecté') AS department, COUNT(e.id) AS n,
                    COALESCE(SUM(e.base_salary), 0) AS salary_mass
             FROM employees e LEFT JOIN departments d ON d.id = e.department_id
             WHERE e.status != 'terminated'
             GROUP BY d.name ORDER BY n DESC",
            &[],
        )?;

        // Évolution de l'effectif sur 12 mois (arrivées / départs cumulés).
        let mut evolution: Vec<Value> = Vec::new();
        let first_of_month = today.with_day(1).unwrap_or(today);
        let mut running = query_one(
            conn,
            "SELECT COUNT(*) AS n FROM employees
             WHERE hire_date < ?1 AND (termination_date IS NULL OR termination_date >= ?1)",
            &[json!(
                (first_of_month - chrono::Duration::days(330))
                    .format("%Y-%m")
                    .to_string()
            )],
        )?["n"]
            .as_i64()
            .unwrap_or(0);
        for i in (0..12).rev() {
            let d = first_of_month - chrono::Duration::days(30 * i);
            let m = d.format("%Y-%m").to_string();
            let counts = query_one(
                conn,
                "SELECT
                    SUM(CASE WHEN substr(hire_date,1,7) = ?1 THEN 1 ELSE 0 END) AS h,
                    SUM(CASE WHEN termination_date IS NOT NULL AND substr(termination_date,1,7) = ?1
                             THEN 1 ELSE 0 END) AS l
                 FROM employees",
                &[json!(m)],
            )?;
            running += counts["h"].as_i64().unwrap_or(0) - counts["l"].as_i64().unwrap_or(0);
            evolution.push(json!({"month": m, "headcount": running}));
        }

        // Congés approuvés par mois sur l'année en cours.
        let leave_monthly = query(
            conn,
            "SELECT substr(start_date, 1, 7) AS month, COUNT(*) AS n
             FROM leave_requests WHERE status = 'approved' AND substr(start_date,1,4) = ?1
             GROUP BY month ORDER BY month",
            &[json!(today.format("%Y").to_string())],
        )?;

        // Prochains jours fériés.
        let mut upcoming: Vec<Value> = Vec::new();
        for h in &holidays {
            let raw = h.1.as_str();
            let next = if let Some(d) = crate::util::parse_date(raw) {
                let mut candidate = d.with_year(today.year()).unwrap_or(d);
                if candidate < today {
                    candidate = d.with_year(today.year() + 1).unwrap_or(d);
                }
                candidate
            } else if raw.len() == 5 {
                // Récurrence MM-DD
                let (mm, dd): (u32, u32) = (
                    raw[0..2].parse().unwrap_or(1),
                    raw[3..5].parse().unwrap_or(1),
                );
                let mut candidate = chrono::NaiveDate::from_ymd_opt(today.year(), mm, dd)
                    .unwrap_or(today);
                if candidate < today {
                    candidate = chrono::NaiveDate::from_ymd_opt(today.year() + 1, mm, dd)
                        .unwrap_or(candidate);
                }
                candidate
            } else {
                continue;
            };
            let diff = (next - today).num_days();
            if diff >= 0 && diff <= 60 {
                upcoming.push(json!({
                    "date": next.format("%Y-%m-%d").to_string(),
                    "name": h.0,
                    "in_days": diff
                }));
            }
        }
        upcoming.sort_by(|a, b| a["date"].as_str().cmp(&b["date"].as_str()));

        let documents_expiring = query(
            conn,
            "SELECT doc.name, doc.expiry_date, doc.category,
                    e.first_name || ' ' || e.last_name AS employee_name
             FROM documents doc JOIN employees e ON e.id = doc.employee_id
             WHERE doc.expiry_date IS NOT NULL AND doc.expiry_date != ''
               AND date(doc.expiry_date) BETWEEN date('now') AND date('now','+60 day')
             ORDER BY doc.expiry_date LIMIT 6",
            &[],
        )?;

        let activity = query(
            conn,
            "SELECT * FROM activity ORDER BY id DESC LIMIT 10",
            &[],
        )?;

        let interviews = query(
            conn,
            "SELECT i.*, c.first_name || ' ' || c.last_name AS candidate_name, o.title AS offer_title
             FROM interviews i
             JOIN candidates c ON c.id = i.candidate_id
             JOIN job_offers o ON o.id = c.offer_id
             WHERE i.scheduled_at >= ?1 AND i.result = 'pending'
             ORDER BY i.scheduled_at ASC LIMIT 5",
            &[json!(format!("{today_s} 00:00"))],
        )?;

        let birthdays = query(
            conn,
            "SELECT id, first_name, last_name, photo_color, birth_date,
                    CAST(strftime('%m', birth_date) AS INTEGER) AS bm
             FROM employees
             WHERE birth_date IS NOT NULL AND birth_date != ''
               AND CAST(strftime('%m', birth_date) AS INTEGER) = ?1
             ORDER BY CAST(strftime('%d', birth_date) AS INTEGER)",
            &[json!(today.month())],
        )?;

        let anniversaries = query(
            conn,
            "SELECT id, first_name || ' ' || last_name AS name, photo_color, hire_date,
                    CAST(strftime('%m', hire_date) AS INTEGER) AS hm,
                    CAST(ROUND((julianday('now') - julianday(hire_date)) / 365.25) AS INTEGER) AS years
             FROM employees
             WHERE CAST(strftime('%m', hire_date) AS INTEGER) = ?1 AND status != 'terminated'
             ORDER BY CAST(strftime('%d', hire_date) AS INTEGER)",
            &[json!(today.month())],
        )?;

        Ok(json!({
            "is_workday": is_workday,
            "today": today_s,
            "headcount": headcount,
            "presence": presence_today,
            "leaves": leaves,
            "payroll": payroll,
            "recruitment": recruitment,
            "by_department": by_department,
            "evolution": evolution,
            "leave_monthly": leave_monthly,
            "upcoming_holidays": upcoming,
            "documents_expiring": documents_expiring,
            "activity": activity,
            "interviews": interviews,
            "birthdays": birthdays,
            "anniversaries": anniversaries
        }))
    })
}
