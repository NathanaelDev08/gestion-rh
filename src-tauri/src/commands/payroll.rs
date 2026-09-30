use crate::db::{self, query, query_one, Res};
use crate::util::{calculate_payroll, PayInput};
use crate::Db;
use serde_json::{json, Value};
use tauri::State;

/// Historique des paies.
#[tauri::command]
pub fn list_payroll_runs(db: State<Db>) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        query(conn, "SELECT * FROM payroll_runs ORDER BY period DESC", &[])
    })
}

/// Détail d'une paie (en-tête + lignes).
#[tauri::command]
pub fn get_payroll_run(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        let run = query_one(conn, "SELECT * FROM payroll_runs WHERE id = ?1", &[json!(id)])?;
        if run.is_null() {
            return Err("Paie introuvable.".into());
        }
        let lines = query(
            conn,
            "SELECT * FROM payroll_lines WHERE run_id = ?1 ORDER BY department, full_name",
            &[json!(id)],
        )?;
        Ok(json!({"run": run, "lines": lines}))
    })
}

/// Écritures comptables de la paie au plan SYSCOHADA (révisé / AUDCIF).
pub fn entries_for(conn: &rusqlite::Connection, run_id: i64) -> Res<Value> {
    let run = query_one(conn, "SELECT * FROM payroll_runs WHERE id = ?1", &[json!(run_id)])?;
    if run.is_null() {
        return Err("Paie introuvable.".into());
    }
    let lines = query(
        conn,
        "SELECT * FROM payroll_lines WHERE run_id = ?1 ORDER BY department, full_name",
        &[json!(run_id)],
    )?;
    let settings = crate::util::load_settings(conn);
    Ok(crate::util::payroll_entries(
        &run,
        &lines,
        &settings.get("payroll").cloned().unwrap_or(json!({})),
    ))
}

#[tauri::command]
pub fn payroll_entries(db: State<Db>, run_id: i64) -> Res<Value> {
    db::with(&db, |conn| entries_for(conn, run_id))
}

/// Supprime une paie.
#[tauri::command]
pub fn delete_payroll_run(db: State<Db>, id: i64) -> Res<Value> {
    db::with(&db, |conn| {
        let run = query_one(conn, "SELECT period FROM payroll_runs WHERE id = ?1", &[json!(id)])?;
        db::delete(conn, "payroll_runs", id)?;
        db::log_activity(
            conn,
            "payroll",
            "delete",
            &format!("Suppression de la paie {}", run["period"].as_str().unwrap_or("")),
            "admin",
        );
        Ok(json!({"ok": true}))
    })
}

/// Génère la paie d'une période (YYYY-MM).
#[tauri::command]
pub fn generate_payroll(
    db: State<Db>,
    period: String,
    replace: Option<bool>,
    employee_ids: Option<Vec<i64>>,
) -> Res<Value> {
    db::with(&db, |conn| {
        let period = period.trim().to_string();
        if period.len() != 7 {
            return Err("Période attendue au format AAAA-MM.".into());
        }
        let existing = query_one(
            conn,
            "SELECT id FROM payroll_runs WHERE period = ?1",
            &[json!(period)],
        )?;
        let replace = replace.unwrap_or(false);
        if !existing.is_null() {
            if !replace {
                return Err(format!(
                    "Une paie existe déjà pour {period}. Utilisez « Remplacer »."
                ));
            }
            db::delete(conn, "payroll_runs", existing["id"].as_i64().unwrap_or(0))?;
        }

        // Variables déjà saisies (conservées lors d'une régénération).
        let mut previous: Vec<Value> = Vec::new();
        if !existing.is_null() {
            previous = query(
                conn,
                "SELECT employee_id, overtime_hours, bonus, commission, other_deductions, notes
                 FROM payroll_lines WHERE run_id = ?1",
                &[json!(existing["id"])],
            )?;
        }

        let mut sql = "
            SELECT e.*, COALESCE(d.name, '') AS department
            FROM employees e LEFT JOIN departments d ON d.id = e.department_id
            WHERE e.status != 'terminated'"
                .to_string();
        let mut params: Vec<Value> = Vec::new();
        if let Some(ids) = &employee_ids {
            if !ids.is_empty() {
                sql.push_str(&format!(" AND e.id IN ({})", ids
                    .iter()
                    .enumerate()
                    .map(|(i, _)| format!("?{}", i + 1))
                    .collect::<Vec<_>>()
                    .join(", ")));
                for id in ids {
                    params.push(json!(id));
                }
            }
        }
        sql.push_str(" ORDER BY e.last_name");
        let employees = query(conn, &sql, &params)?;
        if employees.is_empty() {
            return Err("Aucun employé éligible pour cette paie.".into());
        }

        let settings = crate::util::load_settings(conn);
        let payroll_settings = &settings["payroll"];
        let run_id = db::insert(
            conn,
            "payroll_runs",
            &json!({
                "period": period,
                "label": format!("Paie {}", {
                    let (y, m) = period.split_at(4);
                    let month_num: u32 = m.trim_start_matches('-').parse().unwrap_or(1);
                    let names = [
                        "Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet",
                        "Août", "Septembre", "Octobre", "Novembre", "Décembre"
                    ];
                    format!("{} {}", names[(month_num.max(1) - 1) as usize], y)
                }),
            }),
        )?;

        let mut total_gross = 0.0;
        let mut total_net = 0.0;
        let mut total_employer = 0.0;

        for emp in &employees {
            let emp_id = emp["id"].as_i64().unwrap_or(0);
            let prev = previous.iter().find(|p| p["employee_id"].as_i64() == Some(emp_id));
            let num = |key: &str| -> f64 {
                prev.and_then(|p| p[key].as_f64()).unwrap_or(0.0)
            };
            let input = PayInput {
                base: emp["base_salary"].as_f64().unwrap_or(0.0),
                overtime_hours: num("overtime_hours"),
                bonus: num("bonus"),
                commission: num("commission"),
                allowance: emp["transport_allowance"].as_f64().unwrap_or(0.0),
                other_deductions: num("other_deductions"),
            };
            let calc = calculate_payroll(&input, payroll_settings);
            let breakdown = json!({
                "lines": calc["employee_contributions"],
                "employer_lines": calc["employer_contributions"],
                "taxable": calc["taxable"],
                "tax_annual": calc["tax_annual"],
                "hour_rate": calc["hour_rate"],
                "allowance": input.allowance
            });
            total_gross += calc["gross"].as_f64().unwrap_or(0.0);
            total_net += calc["net"].as_f64().unwrap_or(0.0);
            total_employer += calc["employer_cost"].as_f64().unwrap_or(0.0);
            db::insert(
                conn,
                "payroll_lines",
                &json!({
                    "run_id": run_id,
                    "employee_id": emp_id,
                    "matricule": emp["matricule"],
                    "full_name": format!("{} {}", emp["first_name"], emp["last_name"]),
                    "job_title": emp["job_title"],
                    "department": emp["department"],
                    "contract_type": emp["contract_type"],
                    "base_salary": input.base,
                    "overtime_hours": input.overtime_hours,
                    "overtime_amount": calc["overtime_amount"],
                    "bonus": input.bonus,
                    "commission": input.commission,
                    "allowance": input.allowance,
                    "other_deductions": input.other_deductions,
                    "gross": calc["gross"],
                    "social_employee": calc["social_employee"],
                    "tax": calc["tax"],
                    "net": calc["net"],
                    "social_employer": calc["social_employer"],
                    "employer_cost": calc["employer_cost"],
                    "breakdown_json": breakdown.to_string(),
                    "notes": prev.and_then(|p| p["notes"].as_str()).unwrap_or(""),
                }),
            )?;
        }

        db::run(
            conn,
            "UPDATE payroll_runs SET employee_count = ?1, total_gross = ?2, total_net = ?3,
                    total_employer = ?4 WHERE id = ?5",
            &[
                json!(employees.len()),
                json!(crate::util::round2(total_gross)),
                json!(crate::util::round2(total_net)),
                json!(crate::util::round2(total_employer)),
                json!(run_id),
            ],
        )?;
        db::log_activity(
            conn,
            "payroll",
            "generate",
            &format!("Génération de la paie {period} ({} salariés)", employees.len()),
            "admin",
        );
        Ok(json!({
            "id": run_id,
            "period": period,
            "employee_count": employees.len(),
            "total_gross": crate::util::round2(total_gross),
            "total_net": crate::util::round2(total_net),
            "total_employer": crate::util::round2(total_employer)
        }))
    })
}

/// Met à jour les éléments variables d'une ligne de paie puis recalcule.
#[tauri::command]
pub fn update_payroll_line(db: State<Db>, id: i64, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let line = query_one(
            conn,
            "SELECT pl.*, r.period FROM payroll_lines pl
             JOIN payroll_runs r ON r.id = pl.run_id WHERE pl.id = ?1",
            &[json!(id)],
        )?;
        if line.is_null() {
            return Err("Ligne de paie introuvable.".into());
        }
        let settings = crate::util::load_settings(conn);
        let input = PayInput {
            base: data["base_salary"].as_f64().unwrap_or(line["base_salary"].as_f64().unwrap_or(0.0)),
            overtime_hours: data["overtime_hours"].as_f64().unwrap_or(0.0),
            bonus: data["bonus"].as_f64().unwrap_or(0.0),
            commission: data["commission"].as_f64().unwrap_or(0.0),
            allowance: line["allowance"].as_f64().unwrap_or(0.0),
            other_deductions: data["other_deductions"].as_f64().unwrap_or(0.0),
        };
        let calc = calculate_payroll(&input, &settings["payroll"]);
        let breakdown = json!({
            "lines": calc["employee_contributions"],
            "employer_lines": calc["employer_contributions"],
            "taxable": calc["taxable"],
            "tax_annual": calc["tax_annual"],
            "hour_rate": calc["hour_rate"],
            "allowance": input.allowance
        });
        db::update(
            conn,
            "payroll_lines",
            id,
            &json!({
                "base_salary": input.base,
                "overtime_hours": input.overtime_hours,
                "overtime_amount": calc["overtime_amount"],
                "bonus": input.bonus,
                "commission": input.commission,
                "other_deductions": input.other_deductions,
                "gross": calc["gross"],
                "social_employee": calc["social_employee"],
                "tax": calc["tax"],
                "net": calc["net"],
                "social_employer": calc["social_employer"],
                "employer_cost": calc["employer_cost"],
                "breakdown_json": breakdown.to_string(),
                "notes": data["notes"].as_str().unwrap_or(line["notes"].as_str().unwrap_or("")),
            }),
        )?;
        // Recalcul des totaux de l'en-tête.
        db::run(
            conn,
            "UPDATE payroll_runs SET
                total_gross = (SELECT COALESCE(SUM(gross), 0) FROM payroll_lines WHERE run_id = ?1),
                total_net = (SELECT COALESCE(SUM(net), 0) FROM payroll_lines WHERE run_id = ?1),
                total_employer = (SELECT COALESCE(SUM(employer_cost), 0) FROM payroll_lines WHERE run_id = ?1)
             WHERE id = ?1",
            &[json!(line["run_id"])],
        )?;
        let updated = query_one(conn, "SELECT * FROM payroll_lines WHERE id = ?1", &[json!(id)])?;
        Ok(updated)
    })
}

/// Simulateur : calcule un bulletin sans l'enregistrer.
#[tauri::command]
pub fn simulate_payroll(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let settings = crate::util::load_settings(conn);
        let input = PayInput {
            base: data["base_salary"].as_f64().unwrap_or(0.0),
            overtime_hours: data["overtime_hours"].as_f64().unwrap_or(0.0),
            bonus: data["bonus"].as_f64().unwrap_or(0.0),
            commission: data["commission"].as_f64().unwrap_or(0.0),
            allowance: data["allowance"].as_f64().unwrap_or(0.0),
            other_deductions: data["other_deductions"].as_f64().unwrap_or(0.0),
        };
        Ok(calculate_payroll(&input, &settings["payroll"]))
    })
}
