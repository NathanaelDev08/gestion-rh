use rusqlite::{Connection, ToSql};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::Mutex;

pub const SCHEMA: &str = include_str!("schema.sql");

/// État partagé : connexion SQLite protégée par un mutex.
pub struct Db(pub Mutex<Connection>);

pub type Res<T> = Result<T, String>;

pub fn es<E: std::fmt::Display>(e: E) -> String {
    e.to_string()
}

/// Ouvre (et migre) la base de données dans le dossier de l'application.
pub fn open(dir: &Path) -> Res<Connection> {
    let path = dir.join("gestion-rh.sqlite3");
    let conn = Connection::open(path).map_err(es)?;
    conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(es)?;
    conn.execute_batch(SCHEMA).map_err(es)?;
    seed(&conn)?;
    Ok(conn)
}

/// Verrouille la connexion pour l durée d'une opération.
pub fn with<T, F: FnOnce(&Connection) -> Res<T>>(db: &Db, f: F) -> Res<T> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    f(&conn)
}

/// Wrapper permettant d'utiliser un `serde_json::Value` comme paramètre SQL.
pub struct J(pub Value);

impl ToSql for J {
    fn to_sql(&self) -> rusqlite::Result<rusqlite::types::ToSqlOutput<'_>> {
        use rusqlite::types::{ToSqlOutput, Value as SqlValue, ValueRef};
        Ok(match &self.0 {
            Value::Null => ToSqlOutput::Borrowed(ValueRef::Null),
            Value::Bool(b) => ToSqlOutput::Owned(SqlValue::Integer(*b as i64)),
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    ToSqlOutput::Owned(SqlValue::Integer(i))
                } else if let Some(f) = n.as_f64() {
                    ToSqlOutput::Owned(SqlValue::Real(f))
                } else {
                    ToSqlOutput::Owned(SqlValue::Text(String::new()))
                }
            }
            Value::String(s) => ToSqlOutput::Owned(SqlValue::Text(s.clone())),
            other => ToSqlOutput::Owned(SqlValue::Text(other.to_string())),
        })
    }
}

fn bind(args: &[Value]) -> Vec<J> {
    args.iter().cloned().map(J).collect()
}

/// Exécute une requête SELECT et renvoie les lignes sous forme d'objets JSON.
pub fn query(conn: &Connection, sql: &str, args: &[Value]) -> Res<Vec<Value>> {
    let mut stmt = conn.prepare(sql).map_err(es)?;
    let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut rows = stmt.query(rusqlite::params_from_iter(bind(args))).map_err(es)?;
    let mut out: Vec<Value> = Vec::new();
    while let Some(row) = rows.next().map_err(es)? {
        let mut map = serde_json::Map::new();
        for (i, name) in names.iter().enumerate() {
            let val = match row.get_ref(i) {
                Ok(rusqlite::types::ValueRef::Integer(x)) => Value::from(x),
                Ok(rusqlite::types::ValueRef::Real(x)) => Value::from(x),
                Ok(rusqlite::types::ValueRef::Text(s)) => {
                    Value::String(String::from_utf8_lossy(s).to_string())
                }
                Ok(rusqlite::types::ValueRef::Blob(b)) => {
                    Value::String(format!("{} octets", b.len()))
                }
                _ => Value::Null,
            };
            map.insert(name.clone(), val);
        }
        out.push(Value::Object(map));
    }
    Ok(out)
}

/// Exécute une requête SELECT et renvoie la première ligne (ou null).
pub fn query_one(conn: &Connection, sql: &str, args: &[Value]) -> Res<Value> {
    let rows = query(conn, sql, args)?;
    Ok(rows.first().cloned().unwrap_or(Value::Null))
}

/// Exécute une requête DML et renvoie le dernier identifiant inséré.
pub fn exec(conn: &Connection, sql: &str, args: &[Value]) -> Res<i64> {
    conn.execute(sql, rusqlite::params_from_iter(bind(args)))
        .map_err(es)?;
    Ok(conn.last_insert_rowid())
}

/// Exécute une requête DML sans résultat.
pub fn run(conn: &Connection, sql: &str, args: &[Value]) -> Res<()> {
    conn.execute(sql, rusqlite::params_from_iter(bind(args)))
        .map_err(es)?;
    Ok(())
}

/// Liste des colonnes réellement présentes sur une table (sécurise les inserts dynamiques).
pub fn columns(conn: &Connection, table: &str) -> Res<Vec<String>> {
    let rows = query(
        conn,
        "SELECT name FROM pragma_table_info(?1)",
        &[json!(table)],
    )?;
    Ok(rows
        .iter()
        .filter_map(|r| r["name"].as_str().map(|s| s.to_string()))
        .collect())
}

fn is_safe_ident(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
}

/// Insère un enregistrement générique (dictionnaire JSON) et renvoie son id.
pub fn insert(conn: &Connection, table: &str, data: &Value) -> Res<i64> {
    let obj = data
        .as_object()
        .ok_param("les données doivent être un objet")?;
    let allowed = columns(conn, table)?;
    let mut cols: Vec<String> = Vec::new();
    let mut marks: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    for (k, v) in obj {
        if !is_safe_ident(k) || !allowed.iter().any(|c| c == k) {
            continue;
        }
        if k == "id" {
            continue;
        }
        cols.push(k.clone());
        marks.push(format!("?{}", vals.len() + 1));
        vals.push(v.clone());
    }
    // Horodatages automatiques lorsque la table les prévoit.
    for stamp in ["created_at", "updated_at"] {
        if allowed.iter().any(|c| c == stamp) && !cols.iter().any(|c| c == stamp) {
            cols.push(stamp.to_string());
            marks.push("datetime('now')".into());
        }
    }
    if cols.is_empty() {
        return Err("aucune donnée à enregistrer".into());
    }
    let sql = format!(
        "INSERT INTO {} ({}) VALUES ({})",
        table,
        cols.join(", "),
        marks.join(", ")
    );
    exec(conn, &sql, &vals)
}

/// Met à jour un enregistrement existant.
pub fn update(conn: &Connection, table: &str, id: i64, data: &Value) -> Res<()> {
    let obj = data
        .as_object()
        .ok_param("les données doivent être un objet")?;
    let allowed = columns(conn, table)?;
    let mut sets: Vec<String> = Vec::new();
    let mut vals: Vec<Value> = Vec::new();
    for (k, v) in obj {
        if !is_safe_ident(k) || k == "id" || !allowed.iter().any(|c| c == k) {
            continue;
        }
        sets.push(format!("{k} = ?{}", vals.len() + 1));
        vals.push(v.clone());
    }
    if sets.is_empty() {
        return Err("aucune donnée à mettre à jour".into());
    }
    if allowed.iter().any(|c| c == "updated_at") {
        sets.push("updated_at = datetime('now')".into());
    }
    vals.push(json!(id));
    run(
        conn,
        &format!(
            "UPDATE {} SET {} WHERE id = ?{}",
            table,
            sets.join(", "),
            vals.len()
        ),
        &vals,
    )
}

/// Insère ou met à jour selon la présence de `id`.
pub fn save(conn: &Connection, table: &str, data: &Value) -> Res<Value> {
    match data.get("id").and_then(|v| v.as_i64()) {
        Some(id) => {
            update(conn, table, id, data)?;
            Ok(json!({ "id": id }))
        }
        None => {
            let id = insert(conn, table, data)?;
            Ok(json!({ "id": id }))
        }
    }
}

/// Supprime une ligne.
pub fn delete(conn: &Connection, table: &str, id: i64) -> Res<()> {
    if !is_safe_ident(table) {
        return Err("table invalide".into());
    }
    run(conn, &format!("DELETE FROM {table} WHERE id = ?1"), &[json!(id)])
}

/// Journalise une action dans le fil d'activité.
pub fn log_activity(conn: &Connection, entity: &str, action: &str, label: &str, author: &str) {
    let _ = run(
        conn,
        "INSERT INTO activity (entity, action, label, author) VALUES (?1, ?2, ?3, ?4)",
        &[
            json!(entity),
            json!(action),
            json!(label),
            json!(author),
        ],
    );
}

pub trait OrParam<T> {
    fn ok_param(self, msg: &str) -> Res<T>;
}

impl<T> OrParam<T> for Option<T> {
    fn ok_param(self, msg: &str) -> Res<T> {
        self.ok_or_else(|| msg.to_string())
    }
}

pub fn hash_password(password: &str, salt: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(format!("gestion-rh|{salt}|{password}").as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Paramètres par défaut + utilisateur administrateur initial.
pub fn seed(conn: &Connection) -> Res<()> {
    let defaults: Vec<(&str, Value)> = vec![
        (
            "company",
            json!({
                "name": "Mon Entreprise",
                "tagline": "Ressources humaines",
                "address": "",
                "city": "",
                "phone": "",
                "email": "",
                "registration": "",
                "currency": "XOF",
                "logo_color": "#4f46e5"
            }),
        ),
        (
            "work",
            json!({
                "start": "08:30",
                "end": "17:30",
                "break_minutes": 60,
                "standard_hours_month": 191,
                "late_grace_minutes": 10,
                "work_weekdays": [1, 2, 3, 4, 5]
            }),
        ),
        (
            "payroll",
            json!({
                "monthly_hours": 191,
                "overtime_rate": 1.5,
                // Aucun taux pré-rempli : chaque organisation saisit ses propres
                // cotisations et son propre barème (Paramètres → Paie).
                "employee_contributions": [],
                "employer_contributions": [],
                "tax_brackets": [],
                // Comptes du plan SYSCOHADA (révisé / AUDCIF) utilisés pour le
                // bulletin de paie et l'édition des écritures de paie.
                "accounts": {
                    "salary": "6611",
                    "prime": "6612",
                    "allowance": "663",
                    "employee_charges": "431",
                    "tax": "447",
                    "other_deductions": "47",
                    "net_pay": "422",
                    "employer_charges": "664",
                    "payment": "521"
                }
            }),
        ),
        (
            "evaluation",
            json!({
                "criteria": [
                    "Qualité du travail",
                    "Productivité",
                    "Ponctualité et assiduité",
                    "Esprit d'équipe",
                    "Communication",
                    "Initiative et autonomie",
                    "Respect des procédures",
                    "Développement des compétences"
                ],
                "scale": 5
            }),
        ),
    ];

    for (key, value) in defaults {
        let exists: i64 = {
            let mut stmt = conn
                .prepare("SELECT COUNT(*) FROM settings WHERE key = ?1")
                .map_err(es)?;
            stmt.query_row([key], |r| r.get(0)).unwrap_or(0)
        };
        if exists == 0 {
            run(
                conn,
                "INSERT INTO settings (key, value) VALUES (?1, ?2)",
                &[json!(key), json!(value.to_string())],
            )?;
        }
    }

    // Utilisateur administrateur initial.
    let user_count: i64 = {
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM users")
            .map_err(es)?;
        stmt.query_row([], |r| r.get(0)).unwrap_or(0)
    };
    if user_count == 0 {
        let salt = "sel-initial";
        run(
            conn,
            "INSERT INTO users (username, full_name, role, password_hash, salt) VALUES (?1, ?2, ?3, ?4, ?5)",
            &[
                json!("admin"),
                json!("Administrateur"),
                json!("admin"),
                json!(hash_password("admin", salt)),
                json!(salt),
            ],
        )?;
    }

    // Types de congés standards.
    let lt_count: i64 = {
        let mut stmt = conn
            .prepare("SELECT COUNT(*) FROM leave_types")
            .map_err(es)?;
        stmt.query_row([], |r| r.get(0)).unwrap_or(0)
    };
    if lt_count == 0 {
        let types: Vec<(&str, &str, f64, &str, i64)> = vec![
            ("Congés payés", "CP", 30.0, "#10b981", 1),
            ("Congé maladie", "MAL", 0.0, "#f59e0b", 1),
            ("Congé maternité / paternité", "MAT", 0.0, "#ec4899", 1),
            ("Congé exceptionnel", "EXC", 5.0, "#8b5cf6", 1),
            ("Congé sans solde", "CSS", 0.0, "#64748b", 0),
            ("Autorisation d'absence", "AUT", 2.0, "#0ea5e9", 1),
        ];
        for (name, code, days, color, paid) in types {
            run(
                conn,
                "INSERT INTO leave_types (name, code, days_per_year, color, is_paid) VALUES (?1, ?2, ?3, ?4, ?5)",
                &[
                    json!(name),
                    json!(code),
                    json!(days),
                    json!(color),
                    json!(paid),
                ],
            )?;
        }
    }

    // Jours fériés par défaut.
    let hol_count: i64 = {
        let mut stmt = conn.prepare("SELECT COUNT(*) FROM holidays").map_err(es)?;
        stmt.query_row([], |r| r.get(0)).unwrap_or(0)
    };
    if hol_count == 0 {
        let days: Vec<(&str, &str)> = vec![
            ("01-01", "Jour de l'An"),
            ("01-11", "Fête de l'Indépendance"),
            ("05-01", "Fête du Travail"),
            ("05-08", "Victoire 1945"),
            ("07-14", "Fête Nationale"),
            ("08-15", "Assomption"),
            ("11-01", "Toussaint"),
            ("11-11", "Armistice 1918"),
            ("12-25", "Noël"),
        ];
        for (date, name) in days {
            run(
                conn,
                "INSERT OR IGNORE INTO holidays (date, name, recurring) VALUES (?1, ?2, 1)",
                &[json!(date), json!(name)],
            )?;
        }
    }
    Ok(())
}
