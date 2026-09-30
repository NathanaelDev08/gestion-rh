use crate::db::{query, Res};
use chrono::{Datelike, Local, NaiveDate, NaiveDateTime};
use rusqlite::Connection;
use serde_json::{json, Value};

pub fn round2(v: f64) -> f64 {
    (v * 100.0).round() / 100.0
}

pub fn today() -> NaiveDate {
    Local::now().date_naive()
}

pub fn now_str() -> String {
    Local::now().naive_local().format("%Y-%m-%d %H:%M:%S").to_string()
}

pub fn parse_date(s: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(s, "%Y-%m-%d").ok()
}

pub fn parse_dt(s: &str) -> Option<NaiveDateTime> {
    let s = s.trim();
    if let Ok(d) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S") {
        return Some(d);
    }
    if let Ok(d) = NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M") {
        return Some(d);
    }
    None
}

/// Jours fériés : dates complètes (`YYYY-MM-DD`) ou récurrentes (`MM-DD`).
pub fn load_holidays(conn: &Connection) -> Vec<(String, String)> {
    query(conn, "SELECT date, name FROM holidays", &[])
        .unwrap_or_default()
        .iter()
        .filter_map(|h| {
            Some((h["date"].as_str()?.to_string(), h["name"].as_str()?.to_string()))
        })
        .collect()
}

pub fn is_holiday(date: NaiveDate, holidays: &[(String, String)]) -> bool {
    let full = date.format("%Y-%m-%d").to_string();
    let md = date.format("%m-%d").to_string();
    holidays.iter().any(|(d, _)| d == &full || d == &md)
}

pub fn is_workday(date: NaiveDate, weekdays: &[u32], holidays: &[(String, String)]) -> bool {
    let wd = date.weekday().num_days_from_monday() + 1;
    weekdays.contains(&wd) && !is_holiday(date, holidays)
}

/// Nombre de jours ouvrés entre deux dates incluses.
pub fn working_days(
    start: NaiveDate,
    end: NaiveDate,
    weekdays: &[u32],
    holidays: &[(String, String)],
) -> i64 {
    let mut count = 0;
    let mut d = start;
    while d <= end {
        if is_workday(d, weekdays, holidays) {
            count += 1;
        }
        d = d.succ_opt().unwrap_or(d);
    }
    count
}

pub fn weekdays_from(settings: &Value) -> Vec<u32> {
    settings["work"]["work_weekdays"]
        .as_array()
        .map(|a| {
            a.iter()
                .filter_map(|v| v.as_u64().map(|n| n as u32))
                .collect::<Vec<_>>()
        })
        .filter(|v| !v.is_empty())
        .unwrap_or_else(|| vec![1, 2, 3, 4, 5])
}

// ---------------------------------------------------------------------------
// Moteur de paie
// ---------------------------------------------------------------------------

#[derive(Clone, Copy, Default)]
pub struct PayInput {
    pub base: f64,
    pub overtime_hours: f64,
    pub bonus: f64,
    pub commission: f64,
    pub allowance: f64,
    pub other_deductions: f64,
}

fn contrib_list(value: &Value, gross: f64) -> (Vec<Value>, f64) {
    let mut list = Vec::new();
    let mut total = 0.0;
    if let Some(items) = value.as_array() {
        for item in items {
            let rate = item["rate"].as_f64().unwrap_or(0.0);
            let ceiling = item["ceiling"].as_f64().unwrap_or(0.0);
            let taxable = if ceiling > 0.0 {
                gross.min(ceiling)
            } else {
                gross
            };
            let amount = round2(taxable * rate / 100.0);
            total += amount;
            list.push(json!({
                "label": item["label"].as_str().unwrap_or("Cotisation"),
                "account": item["account"].as_str().map(str::trim)
                    .filter(|s| !s.is_empty()).unwrap_or("431"),
                "rate": rate,
                "ceiling": ceiling,
                "taxable": round2(taxable),
                "amount": amount
            }));
        }
    }
    (list, round2(total))
}

fn progressive_tax(annual: f64, brackets: &Value) -> f64 {
    let mut tax = 0.0;
    let mut lower = 0.0;
    if let Some(list) = brackets.as_array() {
        for b in list {
            let up_to = b["up_to"].as_f64().unwrap_or(f64::MAX);
            let rate = b["rate"].as_f64().unwrap_or(0.0) / 100.0;
            if annual > lower {
                let seg_end = annual.min(up_to);
                if seg_end > lower {
                    tax += (seg_end - lower) * rate;
                }
            }
            lower = up_to;
            if annual <= up_to {
                break;
            }
        }
    }
    round2(tax)
}

/// Calcule un bulletin de paie à partir des paramètres de paie.
pub fn calculate_payroll(input: &PayInput, payroll: &Value) -> Value {
    let monthly_hours = payroll["monthly_hours"].as_f64().unwrap_or(191.0).max(1.0);
    let overtime_rate = payroll["overtime_rate"].as_f64().unwrap_or(1.5);
    let hour_rate = if input.base > 0.0 {
        input.base / monthly_hours
    } else {
        0.0
    };
    let overtime_amount = round2(input.overtime_hours * hour_rate * overtime_rate);
    let gross = round2(
        input.base + overtime_amount + input.bonus + input.commission + input.allowance,
    );

    let (emp_list, social_employee) =
        contrib_list(&payroll["employee_contributions"], gross);
    let (er_list, social_employer) = contrib_list(&payroll["employer_contributions"], gross);

    let taxable_monthly = round2((gross - social_employee).max(0.0));
    let tax_annual = progressive_tax(taxable_monthly * 12.0, &payroll["tax_brackets"]);
    let tax = round2(tax_annual / 12.0);

    let total_deductions = round2(social_employee + tax + input.other_deductions);
    let net = round2(gross - total_deductions);
    let employer_cost = round2(gross + social_employer);

    json!({
        "overtime_amount": overtime_amount,
        "hour_rate": round2(hour_rate),
        "gross": gross,
        "employee_contributions": emp_list,
        "social_employee": social_employee,
        "taxable": taxable_monthly,
        "tax_annual": tax_annual,
        "tax": tax,
        "other_deductions": round2(input.other_deductions),
        "total_deductions": total_deductions,
        "net": net,
        "employer_contributions": er_list,
        "social_employer": social_employer,
        "employer_cost": employer_cost
    })
}

// ---------------------------------------------------------------------------
// Écritures de paie — plan SYSCOHADA (révisé / AUDCIF)
// ---------------------------------------------------------------------------

/// Cumule un montant par compte (une seule ligne par compte).
fn add_amount(list: &mut Vec<(String, String, f64)>, account: &str, label: &str, amount: f64) {
    if amount.abs() < 0.005 {
        return;
    }
    let acc = account.trim().to_string();
    if let Some(entry) = list.iter_mut().find(|e| e.0 == acc) {
        entry.2 += amount;
    } else {
        list.push((acc, label.to_string(), amount));
    }
}

/// Ajoute une opération (débits / crédits) au journal.
fn push_op(
    rows: &mut Vec<Value>,
    period: &str,
    n: usize,
    title: &str,
    debits: &[(String, String, f64)],
    credits: &[(String, String, f64)],
) {
    let piece = format!("{period} · {n:02}");
    for (compte, libelle, montant) in debits {
        let m = round2(*montant);
        if m.abs() < 0.005 {
            continue;
        }
        rows.push(json!({
            "piece": piece, "operation": title, "compte": compte,
            "libelle": libelle, "debit": m, "credit": 0.0
        }));
    }
    for (compte, libelle, montant) in credits {
        let m = round2(*montant);
        if m.abs() < 0.005 {
            continue;
        }
        rows.push(json!({
            "piece": piece, "operation": title, "compte": compte,
            "libelle": libelle, "debit": 0.0, "credit": m
        }));
    }
}

/// Produit les écritures de paie SYSCOHADA d'une période à partir de ses lignes.
///
/// Opérations : rémunérations → retenues salariales → charges patronales →
/// paiement des nets à payer → reversement des cotisations et de l'impôt.
pub fn payroll_entries(run: &Value, lines: &[Value], payroll: &Value) -> Value {
    let acc = &payroll["accounts"];
    let get = |key: &str, default: &str| -> String {
        acc[key]
            .as_str()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(default)
            .to_string()
    };
    let a_salary = get("salary", "6611");
    let a_prime = get("prime", "6612");
    let a_allow = get("allowance", "663");
    let a_emp = get("employee_charges", "431");
    let a_tax = get("tax", "447");
    let a_other = get("other_deductions", "47");
    let a_net = get("net_pay", "422");
    let a_er = get("employer_charges", "664");
    let a_pay = get("payment", "521");

    let period = run["period"].as_str().unwrap_or("PAIE");
    let mut salary = 0.0;
    let mut prime = 0.0;
    let mut allow = 0.0;
    let mut tax_total = 0.0;
    let mut other_total = 0.0;
    let mut net_total = 0.0;
    let mut emp_by: Vec<(String, String, f64)> = Vec::new();
    let mut er_by: Vec<(String, String, f64)> = Vec::new();

    for l in lines {
        salary += l["base_salary"].as_f64().unwrap_or(0.0) + l["overtime_amount"].as_f64().unwrap_or(0.0);
        prime += l["bonus"].as_f64().unwrap_or(0.0) + l["commission"].as_f64().unwrap_or(0.0);
        allow += l["allowance"].as_f64().unwrap_or(0.0);
        tax_total += l["tax"].as_f64().unwrap_or(0.0);
        other_total += l["other_deductions"].as_f64().unwrap_or(0.0);
        net_total += l["net"].as_f64().unwrap_or(0.0);

        let b: Value =
            serde_json::from_str(l["breakdown_json"].as_str().unwrap_or("{}")).unwrap_or(json!({}));
        let (mut has_emp, mut has_er) = (false, false);
        if let Some(list) = b["lines"].as_array() {
            for c in list {
                let m = c["amount"].as_f64().unwrap_or(0.0);
                if m.abs() > 0.005 {
                    has_emp = true;
                    add_amount(
                        &mut emp_by,
                        c["account"].as_str().unwrap_or(a_emp.as_str()),
                        c["label"].as_str().unwrap_or("Cotisation salariale"),
                        m,
                    );
                }
            }
        }
        if let Some(list) = b["employer_lines"].as_array() {
            for c in list {
                let m = c["amount"].as_f64().unwrap_or(0.0);
                if m.abs() > 0.005 {
                    has_er = true;
                    add_amount(
                        &mut er_by,
                        c["account"].as_str().unwrap_or(a_emp.as_str()),
                        c["label"].as_str().unwrap_or("Cotisation patronale"),
                        m,
                    );
                }
            }
        }
        if !has_emp {
            add_amount(&mut emp_by, &a_emp, "Cotisations salariales", l["social_employee"].as_f64().unwrap_or(0.0));
        }
        if !has_er {
            add_amount(&mut er_by, &a_emp, "Cotisations patronales", l["social_employer"].as_f64().unwrap_or(0.0));
        }
    }

    let emp_total: f64 = emp_by.iter().map(|e| e.2).sum();
    let er_total: f64 = er_by.iter().map(|e| e.2).sum();
    let gross_sum = round2(salary + prime + allow);
    let withhold = round2(emp_total + tax_total + other_total);
    let reverse = round2(emp_total + er_total + tax_total);

    let mut rows: Vec<Value> = Vec::new();

    // 1. Rémunérations de la période
    push_op(
        &mut rows,
        period,
        1,
        "Rémunérations de la période",
        &[
            (a_salary.clone(), "Appointements, salaires et commissions".to_string(), salary),
            (a_prime.clone(), "Primes et gratifications".to_string(), prime),
            (a_allow.clone(), "Indemnités versées au personnel".to_string(), allow),
        ],
        &[(a_net.clone(), format!("Rémunérations brutes {period}"), gross_sum)],
    );

    // 2. Retenues salariales et impôt
    let mut credits: Vec<(String, String, f64)> = emp_by
        .iter()
        .map(|(c, l, m)| (c.clone(), format!("Cotisation salariale — {l}"), *m))
        .collect();
    credits.push((a_tax.clone(), "Impôt sur les revenus retainus à la source".to_string(), tax_total));
    credits.push((a_other.clone(), "Autres retenues (avances, oppositions)".to_string(), other_total));
    push_op(
        &mut rows,
        period,
        2,
        "Retenues salariales et impôt",
        &[(a_net.clone(), format!("Retenues sur rémunérations {period}"), withhold)],
        &credits,
    );

    // 3. Charges sociales patronales
    push_op(
        &mut rows,
        period,
        3,
        "Charges sociales patronales",
        &[(a_er.clone(), "Charges sociales sur rémunérations".to_string(), er_total)],
        &er_by
            .iter()
            .map(|(c, l, m)| (c.clone(), format!("Cotisation patronale — {l}"), *m))
            .collect::<Vec<_>>(),
    );

    // 4. Paiement des nets à payer
    push_op(
        &mut rows,
        period,
        4,
        "Paiement des nets à payer",
        &[(a_net.clone(), format!("Nets à payer {period}"), round2(net_total))],
        &[(a_pay.clone(), "Virements bancaires — salaires".to_string(), round2(net_total))],
    );

    // 5. Reversement des cotisations et de l'impôt
    let mut reverse_debits: Vec<(String, String, f64)> = Vec::new();
    for (c, _l, m) in emp_by.iter().chain(er_by.iter()) {
        add_amount(&mut reverse_debits, c, &format!("Reversement {c}"), *m);
    }
    add_amount(&mut reverse_debits, &a_tax, &format!("Reversement {a_tax}"), tax_total);
    push_op(
        &mut rows,
        period,
        5,
        "Reversement des cotisations et de l'impôt",
        &reverse_debits,
        &[(a_pay.clone(), "Reversement organismes sociaux et impôt".to_string(), reverse)],
    );

    let total_debit: f64 = rows.iter().map(|r| r["debit"].as_f64().unwrap_or(0.0)).sum();
    let total_credit: f64 = rows.iter().map(|r| r["credit"].as_f64().unwrap_or(0.0)).sum();

    json!({
        "period": period,
        "label": run["label"].as_str().unwrap_or(""),
        "employee_count": run["employee_count"].as_i64().unwrap_or(0),
        "rows": rows,
        "accounts": {
            "salary": a_salary, "prime": a_prime, "allowance": a_allow,
            "employee_charges": a_emp, "tax": a_tax, "other_deductions": a_other,
            "net_pay": a_net, "employer_charges": a_er, "payment": a_pay
        },
        "summary": {
            "gross": gross_sum,
            "net": round2(net_total),
            "employee_contributions": round2(emp_total),
            "employer_contributions": round2(er_total),
            "tax": round2(tax_total),
            "other_deductions": round2(other_total)
        },
        "totals": {
            "debit": round2(total_debit),
            "credit": round2(total_credit),
            "balanced": (round2(total_debit) - round2(total_credit)).abs() < 0.01
        }
    })
}

// ---------------------------------------------------------------------------
// Export CSV
// ---------------------------------------------------------------------------

pub fn write_csv(path: &std::path::Path, headers: &[String], rows: &[Vec<String>]) -> Res<()> {
    let mut out = String::from("\u{FEFF}"); // BOM Excel
    out.push_str(&headers.join(";"));
    out.push('\n');
    for row in rows {
        let cells: Vec<String> = row
            .iter()
            .map(|c| {
                let escaped = c.replace('"', "\"\"");
                if escaped.contains(';') || escaped.contains('"') || escaped.contains('\n') {
                    format!("\"{escaped}\"")
                } else {
                    escaped
                }
            })
            .collect();
        out.push_str(&cells.join(";"));
        out.push('\n');
    }
    std::fs::write(path, out).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Données de démonstration
// ---------------------------------------------------------------------------

pub fn load_settings(conn: &Connection) -> Value {
    let rows = query(conn, "SELECT key, value FROM settings", &[]).unwrap_or_default();
    let mut out = serde_json::Map::new();
    for row in rows {
        if let (Some(k), Some(v)) = (row["key"].as_str(), row["value"].as_str()) {
            let parsed = serde_json::from_str::<Value>(v).unwrap_or_else(|_| json!(v));
            out.insert(k.to_string(), parsed);
        }
    }
    Value::Object(out)
}

/// Date à `months_back` mois avant aujourd'hui (négatif = dans le futur).
fn day_of(months_back: i32, day: u32) -> String {
    let t = today();
    let mut y = t.year();
    let mut m = t.month() as i32 - months_back;
    while m <= 0 {
        m += 12;
        y -= 1;
    }
    while m > 12 {
        m -= 12;
        y += 1;
    }
    let d = day.min(days_in_month(y, m as u32));
    NaiveDate::from_ymd_opt(y, m as u32, d)
        .unwrap_or_else(today)
        .format("%Y-%m-%d")
        .to_string()
}

pub fn days_in_month(y: i32, m: u32) -> u32 {
    let (ny, nm) = if m == 12 { (y + 1, 1) } else { (y, m + 1) };
    NaiveDate::from_ymd_opt(ny, nm, 1)
        .unwrap()
        .pred_opt()
        .unwrap()
        .day()
}

pub fn seed_demo(conn: &Connection) -> Res<Value> {
    let existing: i64 = query(conn, "SELECT COUNT(*) AS n FROM employees", &[])?[0]["n"]
        .as_i64()
        .unwrap_or(0);
    if existing > 0 {
        return Err("des données existent déjà : utilisez « Réinitialiser » avant.".into());
    }

    let depts = vec![
        ("Direction générale", "DIR", None),
        ("Ressources humaines", "RH", Some(1)),
        ("Finance & Comptabilité", "FIN", Some(1)),
        ("Commercial", "COM", Some(1)),
        ("Informatique / IT", "IT", Some(1)),
        ("Production", "PRD", Some(1)),
        ("Marketing", "MKT", Some(1)),
    ];
    let mut dept_ids: Vec<i64> = Vec::new();
    for (name, code, parent) in &depts {
        let id = crate::db::insert(
            conn,
            "departments",
            &json!({"name": name, "code": code, "parent_id": parent, "budget": 12_000_000.0}),
        )?;
        dept_ids.push(id);
    }

    let first_names = [
        "Amine", "Salma", "Youssef", "Nadia", "Karim", "Imane", "Hassan", "Loubna",
        "Mehdi", "Sara", "Rachid", "Meryem", "Omar", "Fatima", "Jonas", "Claire",
        "Thiery", "Aïcha",
    ];
    let last_names = [
        "Alaoui", "Bennani", "El Amrani", "Idrissi", "Chraibi", "Tazi", "Fassi",
        "Naciri", "Berrada", "Lahlou", "Ouazzani", "Kadiri", "Mansouri", "Bouazza",
        "Saïdi", "Belhaj", "Rhazi", "Zerhouni",
    ];
    let jobs = [
        "Directeur général",
        "Responsable RH",
        "Comptable",
        "Commercial senior",
        "Développeur full-stack",
        "Technicien de production",
        "Chargé de marketing",
        "Assistant RH",
        "Auditeur financier",
        "Ingénieur qualité",
        "Chef de projet IT",
        "Vendeur",
        "Data analyst",
        "Responsable logistique",
        "Support client",
        "Designer UI/UX",
        "Technicien maintenance",
        "Stagiaire marketing",
    ];
    let contracts = ["CDI", "CDI", "CDI", "CDD", "CDI", "Stage", "Alternance"];
    let statuses = ["active", "active", "active", "active", "active", "probation", "active"];
    let colors = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6"];

    let mut employee_ids: Vec<i64> = Vec::new();
    for i in 0..18usize {
        let dept_idx = if i == 0 { 0 } else { 1 + (i % 6) };
        let manager = if i == 0 { Value::Null } else { json!(1) };
        let hire = day_of((i % 36) as i32, ((i % 27) + 1) as u32);
        let probation = parse_date(&hire)
            .map(|d| (d + chrono::Duration::days(90)).format("%Y-%m-%d").to_string())
            .unwrap_or_default();
        // Montants exprimés en francs CFA (XOF).
        let salary = match i % 7 {
            0 => 1_500_000.0,
            1 => 650_000.0,
            2 => 450_000.0,
            3 => 380_000.0,
            4 => 320_000.0,
            5 => 250_000.0,
            _ => 150_000.0,
        };
        let id = crate::db::insert(
            conn,
            "employees",
            &json!({
                "matricule": format!("EMP-{:03}", i + 1),
                "first_name": first_names[i],
                "last_name": last_names[i],
                "gender": if i % 2 == 0 { "M" } else { "F" },
                "birth_date": day_of(240 + (i as i32) * 9, ((i % 27) + 1) as u32),
                "email": format!(
                    "{}.{}@entreprise.sn",
                    first_names[i].to_lowercase(),
                    last_names[i].to_lowercase()
                ),
                "phone": format!("+221 77 {:02} {:02} {:02} {:02}", i, i + 3, i + 7, i + 11),
                "address": format!("{} {}", 10 + i, "Avenue Léopold Sédar Senghor"),
                "city": (["Dakar", "Thiès", "Saint-Louis", "Touba"][i % 4]),
                "postal_code": format!("{:05}", 12000 + i),
                "country": "Sénégal",
                "national_id": format!("SN{:08}{}", i + 1, i * 7),
                "social_security": format!("{:09}", 100000000 + i * 13),
                "emergency_name": first_names[(i + 5) % 18].to_string() + " " + last_names[(i + 5) % 18],
                "emergency_phone": format!("+221 78 {:02} {:02} {:02} {:02}", i + 1, i + 4, i + 8, i + 12),
                "department_id": dept_ids[dept_idx],
                "job_title": jobs[i % jobs.len()],
                "manager_id": manager,
                "hire_date": hire,
                "probation_end_date": probation,
                "contract_type": contracts[i % contracts.len()],
                "status": statuses[i % statuses.len()],
                "work_location": (["Dakar", "Thiès", "Télétravail"][i % 3]),
                "work_schedule": if i % 5 == 4 { "Temps partiel" } else { "Temps plein" },
                "base_salary": salary,
                "transport_allowance": 50_000.0,
                "other_allowance": 0.0,
                "bank_name": (["Sonabanque", "Crédit du Sénégal", "ECOBANK", "BOA Sénégal"][i % 4]),
                "iban": format!("SN63 {}{:03} 0000 0000 0000 {:03}", 1000 + i, i, i),
                "photo_color": colors[i % colors.len()],
            }),
        )?;
        employee_ids.push(id);
    }
    // Désignation des managers de département.
    for (idx, id) in dept_ids.iter().enumerate() {
        let mgr = employee_ids[(idx + 1) % employee_ids.len()];
        crate::db::run(
            conn,
            "UPDATE departments SET manager_id = ?1 WHERE id = ?2",
            &[json!(mgr), json!(id)],
        )?;
    }

    // Absences : demandes de congés
    let types: Vec<i64> = query(conn, "SELECT id FROM leave_types ORDER BY id", &[])?
        .iter()
        .filter_map(|r| r["id"].as_i64())
        .collect();
    let leave_states = ["approved", "pending", "rejected", "approved", "pending"];
    for i in 0..9usize {
        let emp = employee_ids[(i + 2) % employee_ids.len()];
        let ty = types[i % types.len()];
        let start = day_of((i % 4) as i32, (((i * 3) % 27) + 1) as u32);
        let end_d = parse_date(&start)
            .unwrap_or_else(today)
            .succ_opt()
            .unwrap_or_else(today)
            .succ_opt()
            .unwrap_or_else(today);
        let state = leave_states[i % leave_states.len()];
        crate::db::insert(
            conn,
            "leave_requests",
            &json!({
                "employee_id": emp,
                "leave_type_id": ty,
                "start_date": start,
                "end_date": end_d.format("%Y-%m-%d").to_string(),
                "days": if state == "rejected" { 0.0 } else { (i % 3 + 1) as f64 },
                "reason": (["Vacances familiales", "Raison personnelle", "Repos médical", "Voyage planifié"][i % 4]),
                "status": state,
                "approver_name": "Administrateur",
                "decided_at": if state == "pending" { Value::Null } else { json!(now_str()) },
            }),
        )?;
    }

    // Présence sur les 30 derniers jours ouvrés
    let weekdays = vec![1u32, 2, 3, 4, 5];
    let holidays = load_holidays(conn);
    let mut cursor = today() - chrono::Duration::days(45);
    while cursor <= today() {
        if is_workday(cursor, &weekdays, &holidays) {
            for (k, emp) in employee_ids.iter().enumerate() {
                if (k + cursor.day() as usize) % 9 == 0 {
                    continue; // absence
                }
                let late = (k + cursor.day() as usize) % 5 == 0;
                let (h, m) = if late { (9, 20) } else { (8, 15 + (k % 20) as u32) };
                let in_t = format!("{:02}:{:02}", h, m);
                let out_t = if k % 6 == 0 { "17:10" } else { "18:05" };
                let worked = ((if out_t == "17:10" { 8 * 60 + 55 } else { 8 * 60 + 50 })
                    - (h * 60 + m) as i32)
                    .max(0);
                let _ = crate::db::insert(
                    conn,
                    "attendance",
                    &json!({
                        "employee_id": emp,
                        "date": cursor.format("%Y-%m-%d").to_string(),
                        "clock_in": in_t,
                        "clock_out": out_t,
                        "break_minutes": 60,
                        "worked_minutes": worked.max(0),
                        "overtime_minutes": (worked - 480).max(0),
                        "status": if late { "late" } else { "present" }
                    }),
                );
            }
        }
        cursor = cursor.succ_opt().unwrap_or(cursor);
    }

    // Paie du mois courant
    let period = today().format("%Y-%m").to_string();
    let settings = load_settings(conn);
    let run_id = crate::db::insert(
        conn,
        "payroll_runs",
        &json!({
            "period": period,
            "label": format!("Paie {}", today().format("%m/%Y")),
            "employee_count": 0,
        }),
    )?;
    let mut tg = 0.0;
    let mut tn = 0.0;
    let mut te = 0.0;
    for (i, emp_id) in employee_ids.iter().enumerate() {
        let rows = query(
            conn,
            "SELECT e.*, COALESCE(d.name,'') AS department FROM employees e
             LEFT JOIN departments d ON d.id = e.department_id WHERE e.id = ?1",
            &[json!(emp_id)],
        )?;
        if rows.is_empty() {
            continue;
        }
        let emp = &rows[0];
        let input = PayInput {
            base: emp["base_salary"].as_f64().unwrap_or(0.0),
            overtime_hours: if i % 3 == 0 { 6.0 } else { 0.0 },
            bonus: if i % 4 == 0 { 75_000.0 } else { 0.0 },
            commission: if i % 5 == 0 { 50_000.0 } else { 0.0 },
            allowance: emp["transport_allowance"].as_f64().unwrap_or(0.0),
            other_deductions: 0.0,
        };
        let calc = calculate_payroll(&input, &settings["payroll"]);
        tg += calc["gross"].as_f64().unwrap_or(0.0);
        tn += calc["net"].as_f64().unwrap_or(0.0);
        te += calc["employer_cost"].as_f64().unwrap_or(0.0);
        // Même format de « breakdown » que generate_payroll (lines / employer_lines).
        let breakdown = json!({
            "lines": calc["employee_contributions"],
            "employer_lines": calc["employer_contributions"],
            "taxable": calc["taxable"],
            "tax_annual": calc["tax_annual"],
            "hour_rate": calc["hour_rate"],
            "allowance": input.allowance
        });
        let _ = crate::db::insert(
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
            }),
        );
    }
    crate::db::run(
        conn,
        "UPDATE payroll_runs SET employee_count = ?1, total_gross = ?2, total_net = ?3, total_employer = ?4 WHERE id = ?5",
        &[
            json!(employee_ids.len()),
            json!(round2(tg)),
            json!(round2(tn)),
            json!(round2(te)),
            json!(run_id),
        ],
    )?;

    // Recrutement
    let offers = vec![
        ("Développeur full-stack (H/F)", 5, "CDI", "Dakar", 600_000.0, 900_000.0),
        ("Chargé de clientèle (H/F)", 3, "CDD", "Thiès", 350_000.0, 500_000.0),
        ("Stagiaire marketing digital", 6, "Stage", "Dakar", 150_000.0, 250_000.0),
        ("Ingénieur qualité", 5, "CDI", "Saint-Louis", 700_000.0, 1_000_000.0),
    ];
    let stages = ["new", "screening", "interview", "offer", "hired", "rejected"];
    let sources = ["Site web", "LinkedIn", "Candidature spontanée", "Salaire", "Recommandation"];
    let mut candidate_ids: Vec<i64> = Vec::new();
    for (i, (title, d_idx, ctype, loc, min, max)) in offers.iter().enumerate() {
        let offer_id = crate::db::insert(
            conn,
            "job_offers",
            &json!({
                "title": title,
                "department_id": dept_ids[*d_idx % dept_ids.len()],
                "contract_type": ctype,
                "location": loc,
                "salary_min": min,
                "salary_max": max,
                "description": "Poste à pourvoir au sein d'une équipe dynamique.",
                "requirements": "Bac+3/5, 2 ans d'expérience minimum, esprit d'équipe.",
                "benefits": "Mutuelle, primes de performance, formation continue.",
                "status": if i == 3 { "on_hold" } else { "open" },
                "posted_at": day_of(0, ((i * 7 % 25) + 1) as u32),
            }),
        )?;
        for j in 0..4 {
            let cid = crate::db::insert(
                conn,
                "candidates",
                &json!({
                    "offer_id": offer_id,
                    "first_name": first_names[(i * 4 + j) % 18],
                    "last_name": last_names[(i * 4 + j) % 18],
                    "email": format!(
                        "{}.{}@email.sn",
                        first_names[(i * 4 + j) % 18].to_lowercase(),
                        last_names[(i * 4 + j) % 18].to_lowercase()
                    ),
                    "phone": format!("+221 76 {} {} {} {}", i, j, i + j, j * 3 + 1),
                    "source": sources[(i + j) % sources.len()],
                    "stage": stages[(i + j) % stages.len()],
                    "rating": ((i + j) % 5 + 1) as f64,
                    "salary_expectation": min + (j as f64) * 50_000.0,
                    "availability": (["Immédiat", "1 mois", "2 mois", "3 mois"][(i + j) % 4]),
                    "notes": "Candidature reçue via la plateforme.",
                    "applied_at": day_of(0, (((i * 4 + j) % 25) + 1) as u32),
                }),
            )?;
            candidate_ids.push(cid);
        }
    }

    // Entretiens
    for (i, cid) in candidate_ids.iter().enumerate().take(6) {
        let _ = crate::db::insert(
            conn,
            "interviews",
            &json!({
                "candidate_id": cid,
                "scheduled_at": format!("{} 10:00", day_of(i as i32 % 2, ((i * 3 % 25) + 1) as u32)),
                "type": (["Téléphone", "Visio", "Présentiel"][i % 3]),
                "interviewer": format!("{} {}", first_names[i % 18], last_names[i % 18]),
                "location": "Salle de réunion 2",
                "result": (["pending", "positive", "negative"][i % 3]),
                "feedback": "Bon contact, profil adapté au poste.",
            }),
        )?;
    }

    // Évaluations
    for (i, emp) in employee_ids.iter().enumerate().take(8) {
        let criteria: Vec<Value> = ["Qualité du travail", "Productivité", "Ponctualité et assiduité", "Esprit d'équipe", "Communication"]
            .iter()
            .map(|c| json!({"label": c, "rating": ((i + c.len()) % 5 + 1) as f64}))
            .collect();
        let avg = criteria
            .iter()
            .map(|c| c["rating"].as_f64().unwrap_or(0.0))
            .sum::<f64>()
            / criteria.len() as f64;
        let _ = crate::db::insert(
            conn,
            "evaluations",
            &json!({
                "employee_id": emp,
                "period": format!("{} S{}", today().year(), (i % 2) + 1),
                "evaluator_name": "Administrateur",
                "status": if i % 3 == 0 { "draft" } else { "completed" },
                "global_rating": round2(avg),
                "criteria_json": Value::Array(criteria).to_string(),
                "strengths": "Rigueur, sens des responsabilités, bonne collaboration.",
                "improvements": "Gestion du temps et priorisation des tâches.",
                "goals": "Atteindre les objectifs trimestriels et monter en compétences.",
                "comments": "Évolution positive sur la période.",
                "completed_at": if i % 3 == 0 { Value::Null } else { json!(now_str()) },
            }),
        )?;
    }

    // Documents
    let cats = ["Contrat", "Justificatif", "Diplôme", "Certificat médical", "Pièce d'identité"];
    for (i, emp) in employee_ids.iter().enumerate().take(10) {
        let expiry = day_of(-(i as i32 % 3), (((i * 2) % 27) + 1) as u32);
        let _ = crate::db::insert(
            conn,
            "documents",
            &json!({
                "employee_id": emp,
                "name": format!("{} n°{:03}", cats[i % cats.len()], i + 1),
                "category": cats[i % cats.len()],
                "reference": format!("REF-{:04}", 1000 + i),
                "issue_date": day_of(12, (((i * 2) % 27) + 1) as u32),
                "expiry_date": if i % 4 == 0 { json!(expiry) } else { Value::Null },
                "description": "Document archivé dans le dossier salarié.",
            }),
        )?;
    }

    crate::db::log_activity(
        conn,
        "system",
        "seed",
        "Chargement des données de démonstration",
        "admin",
    );
    Ok(json!({"employees": employee_ids.len(), "offers": offers.len(), "candidates": candidate_ids.len()}))
}

/// Vide les données métier (l'utilisateur administrateur est conservé).
pub fn reset_all(conn: &Connection) -> Res<Value> {
    let tables = [
        "interviews",
        "candidates",
        "job_offers",
        "evaluations",
        "documents",
        "payroll_lines",
        "payroll_runs",
        "leave_requests",
        "leave_types",
        "attendance",
        "holidays",
        "employees",
        "departments",
        "activity",
    ];
    conn.execute_batch("PRAGMA foreign_keys = OFF;").map_err(crate::db::es)?;
    for t in tables {
        conn.execute(&format!("DELETE FROM {t}"), []).map_err(crate::db::es)?;
    }
    conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(crate::db::es)?;
    // Recréer les référentiels par défaut.
    crate::db::seed(conn)?;
    Ok(json!({"ok": true}))
}
