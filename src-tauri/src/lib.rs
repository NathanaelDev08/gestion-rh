mod commands;
mod db;
mod util;

pub use db::Db;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&dir)?;
            let conn = db::open(&dir)?;
            app.manage(Db(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Authentification & paramètres
            commands::auth::login,
            commands::auth::change_password,
            commands::auth::list_users,
            commands::auth::save_user,
            commands::auth::delete_user,
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::settings::list_activity,
            commands::settings::global_search,
            commands::settings::database_info,
            // Employés & organisation
            commands::employees::list_employees,
            commands::employees::get_employee,
            commands::employees::save_employee,
            commands::employees::delete_employee,
            commands::employees::employee_stats,
            commands::employees::list_departments,
            commands::employees::save_department,
            commands::employees::delete_department,
            commands::employees::org_chart,
            // Congés & absences
            commands::leaves::list_leave_types,
            commands::leaves::save_leave_type,
            commands::leaves::delete_leave_type,
            commands::leaves::list_leave_requests,
            commands::leaves::create_leave_request,
            commands::leaves::decide_leave_request,
            commands::leaves::delete_leave_request,
            commands::leaves::leave_balances,
            commands::leaves::list_holidays,
            commands::leaves::save_holiday,
            commands::leaves::delete_holiday,
            // Présence / pointeuse
            commands::attendance::list_attendance,
            commands::attendance::save_attendance,
            commands::attendance::delete_attendance,
            commands::attendance::clock_event,
            commands::attendance::today_presence,
            commands::attendance::monthly_grid,
            commands::attendance::attendance_summary,
            // Paie
            commands::payroll::list_payroll_runs,
            commands::payroll::get_payroll_run,
            commands::payroll::payroll_entries,
            commands::payroll::delete_payroll_run,
            commands::payroll::generate_payroll,
            commands::payroll::update_payroll_line,
            commands::payroll::simulate_payroll,
            // Recrutement
            commands::recruitment::list_job_offers,
            commands::recruitment::save_job_offer,
            commands::recruitment::delete_job_offer,
            commands::recruitment::list_candidates,
            commands::recruitment::save_candidate,
            commands::recruitment::move_candidate,
            commands::recruitment::delete_candidate,
            commands::recruitment::list_interviews,
            commands::recruitment::save_interview,
            commands::recruitment::delete_interview,
            commands::recruitment::recruitment_stats,
            // Évaluations & documents
            commands::people::list_evaluations,
            commands::people::save_evaluation,
            commands::people::delete_evaluation,
            commands::people::evaluation_stats,
            commands::people::list_documents,
            commands::people::save_document,
            commands::people::delete_document,
            commands::people::document_alerts,
            // Tableau de bord & système
            commands::dashboard::dashboard_stats,
            commands::system::backup_database,
            commands::system::restore_database,
            commands::system::open_data_folder,
            commands::system::export_csv,
            commands::system::seed_demo,
            commands::system::reset_data
        ])
        .run(tauri::generate_context!())
        .expect("erreur lors du lancement de Gestion RH");
}
