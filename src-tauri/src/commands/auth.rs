use crate::db::{self, hash_password, query, query_one, Res};
use crate::Db;
use serde_json::{json, Value};
use tauri::State;

/// Authentifie un utilisateur (compte initial : admin / admin).
#[tauri::command]
pub fn login(db: State<Db>, username: String, password: String) -> Res<Value> {
    db::with(&db, |conn| {
        let user = query_one(
            conn,
            "SELECT id, username, full_name, role, active, salt, password_hash, last_login
             FROM users WHERE lower(username) = lower(?1)",
            &[json!(username)],
        )?;
        if user.is_null() {
            return Err("Utilisateur inconnu.".into());
        }
        if user["active"].as_i64().unwrap_or(0) == 0 {
            return Err("Ce compte est désactivé.".into());
        }
        let salt = user["salt"].as_str().unwrap_or("");
        if hash_password(&password, salt) != user["password_hash"].as_str().unwrap_or("") {
            return Err("Mot de passe incorrect.".into());
        }
        let now = crate::util::now_str();
        db::run(
            conn,
            "UPDATE users SET last_login = ?1 WHERE id = ?2",
            &[json!(now), json!(user["id"])],
        )?;
        db::log_activity(conn, "auth", "login", "Connexion au logiciel", user["username"].as_str().unwrap_or(""));
        let mut safe = user.clone();
        if let Some(obj) = safe.as_object_mut() {
            obj.remove("salt");
            obj.remove("password_hash");
            obj.insert("last_login".into(), json!(now));
        }
        Ok(safe)
    })
}

/// Change le mot de passe de l'utilisateur courant.
#[tauri::command]
pub fn change_password(db: State<Db>, username: String, old_password: String, new_password: String) -> Res<Value> {
    db::with(&db, |conn| {
        if new_password.trim().len() < 4 {
            return Err("Le nouveau mot de passe doit contenir au moins 4 caractères.".into());
        }
        let user = query_one(
            conn,
            "SELECT id, salt, password_hash FROM users WHERE lower(username) = lower(?1)",
            &[json!(username)],
        )?;
        if user.is_null() {
            return Err("Utilisateur inconnu.".into());
        }
        let salt = user["salt"].as_str().unwrap_or("");
        if hash_password(&old_password, salt) != user["password_hash"].as_str().unwrap_or("") {
            return Err("Ancien mot de passe incorrect.".into());
        }
        let new_salt = format!("sel-{}", crate::util::now_str());
        db::run(
            conn,
            "UPDATE users SET password_hash = ?1, salt = ?2 WHERE id = ?3",
            &[
                json!(hash_password(&new_password, &new_salt)),
                json!(new_salt),
                json!(user["id"]),
            ],
        )?;
        db::log_activity(conn, "auth", "password", "Changement de mot de passe", &username);
        Ok(json!({"ok": true}))
    })
}

/// Liste des comptes utilisateurs.
#[tauri::command]
pub fn list_users(db: State<Db>) -> Res<Vec<Value>> {
    db::with(&db, |conn| {
        query(
            conn,
            "SELECT id, username, full_name, role, active, last_login, created_at FROM users ORDER BY username",
            &[],
        )
    })
}

/// Crée ou met à jour un compte. Le mot de passe éventuel est haché.
#[tauri::command]
pub fn save_user(db: State<Db>, data: Value) -> Res<Value> {
    db::with(&db, |conn| {
        let mut data = data.clone();
        let password = data
            .as_object_mut()
            .and_then(|o| o.remove("password"))
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_default();
        let username = data["username"].as_str().unwrap_or("").trim().to_string();
        if username.is_empty() {
            return Err("Le nom d'utilisateur est obligatoire.".into());
        }
        let id = data["id"].as_i64();
        if id.is_none() && password.len() < 4 {
            return Err("Le mot de passe doit contenir au moins 4 caractères.".into());
        }
        if let Some(id) = id {
            if password.len() >= 4 {
                let salt = format!("sel-{}", crate::util::now_str());
                data["password_hash"] = json!(hash_password(&password, &salt));
                data["salt"] = json!(salt);
            } else {
                if let Some(obj) = data.as_object_mut() {
                    obj.remove("password_hash");
                    obj.remove("salt");
                }
            }
            db::update(conn, "users", id, &data)?;
            return Ok(json!({"id": id}));
        }
        let salt = format!("sel-{}", crate::util::now_str());
        data["password_hash"] = json!(hash_password(&password, &salt));
        data["salt"] = json!(salt);
        let new_id = db::insert(conn, "users", &data)?;
        db::log_activity(conn, "user", "create", &format!("Création du compte {username}"), "admin");
        Ok(json!({"id": new_id}))
    })
}

/// Supprime un compte utilisateur (l'administrateur courant est protégé).
#[tauri::command]
pub fn delete_user(db: State<Db>, id: i64, current: String) -> Res<Value> {
    db::with(&db, |conn| {
        let user = query_one(conn, "SELECT username FROM users WHERE id = ?1", &[json!(id)])?;
        let username = user["username"].as_str().unwrap_or("");
        if username.eq_ignore_ascii_case(&current) {
            return Err("Impossible de supprimer le compte connecté.".into());
        }
        let count: i64 = query(conn, "SELECT COUNT(*) AS n FROM users", &[])?[0]["n"]
            .as_i64()
            .unwrap_or(0);
        if count <= 1 {
            return Err("Au moins un compte doit être conservé.".into());
        }
        db::delete(conn, "users", id)?;
        db::log_activity(conn, "user", "delete", &format!("Suppression du compte {username}"), &current);
        Ok(json!({"ok": true}))
    })
}
