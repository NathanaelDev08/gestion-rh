/* ============================================================
   Gestion RH — Faux backend Tauri (tests en navigateur)
   Chargé uniquement par dev.html, jamais par l'application.
   ============================================================ */
(function () {
  "use strict";

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
  };
  const today = new Date();
  const COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

  /* ---------------- Jeu de données ---------------- */
  const departments = [
    { id: 1, name: "Direction générale", code: "DIR", manager_id: 1, budget: 12000000, manager_name: "Amine Alaoui", employee_count: 2 },
    { id: 2, name: "Ressources humaines", code: "RH", manager_id: 2, budget: 4500000, manager_name: "Salma Bennani", employee_count: 3 },
    { id: 3, name: "Informatique / IT", code: "IT", manager_id: 4, budget: 10500000, manager_name: "Karim Chraibi", employee_count: 4 },
    { id: 4, name: "Commercial", code: "COM", manager_id: 5, budget: 6500000, manager_name: "Imane Tazi", employee_count: 3 },
  ];

  // Montants exprimés en francs CFA (XOF).
  const raw = [
    ["Amine", "Alaoui", "Directeur général", 1, "CDI", "active", 1500000, 1, null],
    ["Salma", "Bennani", "Responsable RH", 2, "CDI", "active", 650000, 1, 1],
    ["Youssef", "El Amrani", "Chargé de recrutement", 2, "CDI", "active", 420000, 1, 2],
    ["Nadia", "Idrissi", "Assistante RH", 2, "CDD", "probation", 280000, 1, 2],
    ["Karim", "Chraibi", "Chef de projet IT", 3, "CDI", "active", 750000, 1, 1],
    ["Imane", "Tazi", "Commerciale senior", 4, "CDI", "active", 550000, 1, 1],
    ["Mehdi", "Berrada", "Développeur full-stack", 3, "CDI", "active", 600000, 4, 4],
    ["Sara", "Naciri", "Développeuse front-end", 3, "Alternance", "active", 220000, 4, 4],
    ["Rachid", "Lahlou", "Technicien support", 3, "CDI", "leave", 330000, 4, 4],
    ["Meryem", "Ouazzani", "Chargée de marketing", 4, "Stage", "active", 150000, 5, 5],
  ];

  const employees = raw.map((r, i) => {
    const hire = addDays(today, -(200 + i * 97));
    return {
      id: i + 1,
      matricule: `EMP-${pad(i + 1)}`,
      first_name: r[0],
      last_name: r[1],
      job_title: r[2],
      department_id: r[3],
      department_name: departments.find((d) => d.id === r[3]).name,
      contract_type: r[4],
      status: r[5],
      base_salary: r[6],
      manager_id: r[7],
      manager_name: r[8] ? `${raw[r[8] - 1][0]} ${raw[r[8] - 1][1]}` : "",
      photo_color: COLORS[i % COLORS.length],
      hire_date: iso(hire),
      birth_date: iso(new Date(hire.getFullYear() - 30 - i, i % 12, (i % 27) + 1)),
      probation_end_date: iso(addDays(hire, 90)),
      contract_end_date: i % 4 === 1 ? iso(addDays(today, 120)) : null,
      termination_date: null,
      termination_reason: "",
      email: `${r[0].toLowerCase()}.${r[1].toLowerCase().replace(/\s/g, "")}@entreprise.sn`,
      phone: `+221 77 ${pad(i + 1)} ${pad(i + 3)} ${pad(i + 5)} ${pad(i + 7)}`,
      address: `${10 + i} Avenue Léopold Sédar Senghor`,
      city: ["Dakar", "Thiès", "Saint-Louis", "Touba"][i % 4],
      postal_code: `1200${i}`,
      country: "Sénégal",
      national_id: `SN${10000000 + i}`,
      social_security: `${100000000 + i}`,
      emergency_name: `${raw[(i + 3) % 10][0]} ${raw[(i + 3) % 10][1]}`,
      emergency_phone: `+221 78 ${pad(i + 5)} ${pad(i + 6)} ${pad(i + 7)} ${pad(i + 8)}`,
      work_location: i % 3 === 0 ? "Télétravail" : "Siège",
      work_schedule: i === 3 ? "Temps partiel" : "Temps plein",
      transport_allowance: 50000,
      other_allowance: 0,
      dependents: 0,
      bank_name: ["Sonabanque", "Crédit du Sénégal", "ECOBANK"][i % 3],
      iban: `SN63 ${1000 + i} 0000 0000 0000 ${pad(i)}`,
      notes: i === 8 ? "En arrêt maladie jusqu'à la fin du mois." : "",
      seniority_years: Number((((today - new Date(hire)) / 86400000) / 365.25).toFixed(1)),
      created_at: `${iso(hire)} 09:00:00`,
    };
  });

  const leaveTypes = [
    { id: 1, name: "Congés payés", code: "CP", days_per_year: 30, color: "#10b981", is_paid: 1, active: 1 },
    { id: 2, name: "Congé maladie", code: "MAL", days_per_year: 0, color: "#f59e0b", is_paid: 1, active: 1 },
    { id: 3, name: "Congé maternité / paternité", code: "MAT", days_per_year: 0, color: "#ec4899", is_paid: 1, active: 1 },
    { id: 4, name: "Congé exceptionnel", code: "EXC", days_per_year: 5, color: "#8b5cf6", is_paid: 1, active: 1 },
    { id: 5, name: "Congé sans solde", code: "CSS", days_per_year: 0, color: "#64748b", is_paid: 0, active: 1 },
  ];

  const leaveStatuses = ["approved", "pending", "approved", "rejected", "pending", "approved"];
  const leave_requests = leaveStatuses.map((st, i) => {
    const start = addDays(today, -(20 - i * 6));
    const end = addDays(start, 2 + (i % 4));
    const emp = employees[(i + 2) % employees.length];
    const type = leaveTypes[i % leaveTypes.length];
    return {
      id: i + 1,
      employee_id: emp.id,
      employee_name: `${emp.first_name} ${emp.last_name}`,
      matricule: emp.matricule,
      department: emp.department_name,
      leave_type_id: type.id,
      type_name: type.name,
      type_code: type.code,
      color: type.color,
      start_date: iso(start),
      end_date: iso(end),
      days: 3 + (i % 4),
      reason: ["Vacances familiales", "Raison personnelle", "Repos médical", "Voyage planifié"][i % 4],
      status: st,
      approver_name: st === "pending" ? "" : "Administrateur",
      decision_note: "",
      decided_at: st === "pending" ? null : `${iso(today)} 10:15:00`,
      created_at: `${iso(addDays(today, -12 + i))} 08:30:00`,
    };
  });

  const holidays = [
    { id: 1, date: "01-01", name: "Jour de l'An", recurring: 1 },
    { id: 2, date: "05-01", name: "Fête du Travail", recurring: 1 },
    { id: 3, date: "07-14", name: "Fête Nationale", recurring: 1 },
    { id: 4, date: "08-15", name: "Assomption", recurring: 1 },
    { id: 5, date: "11-11", name: "Armistice 1918", recurring: 1 },
    { id: 6, date: "12-25", name: "Noël", recurring: 1 },
  ];

  const attendance = [];
  let aid = 1;
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  for (let d = new Date(monthStart); d <= today; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    employees.forEach((e, i) => {
      if ((i + d.getDate()) % 9 === 0) return;
      const late = (i + d.getDate()) % 5 === 0;
      const inH = late ? 9 : 8;
      const inM = late ? 20 : 15 + (i % 20);
      attendance.push({
        id: aid++,
        employee_id: e.id,
        employee_name: `${e.first_name} ${e.last_name}`,
        matricule: e.matricule,
        department: e.department_name,
        photo_color: e.photo_color,
        work_schedule: e.work_schedule,
        date: iso(d),
        clock_in: `${pad(inH)}:${pad(inM)}`,
        clock_out: i % 6 === 0 ? "17:10" : "18:05",
        break_minutes: 60,
        worked_minutes: Math.max(0, (i % 6 === 0 ? 545 : 585) - (inH * 60 + inM)),
        overtime_minutes: i % 3 === 0 ? 45 : 0,
        status: late ? "late" : "present",
        note: "",
      });
    });
  }

  const payroll_settings = {
    monthly_hours: 191,
    overtime_rate: 1.5,
    /* Jeu de données de test : taux déjà saisis par l'utilisateur.
       L'application, elle, ne pré-remplit aucun taux. */
    employee_contributions: [
      { label: "Sécurité sociale", rate: 4.2, ceiling: 350000, account: "431" },
      { label: "Caisse de retraite", rate: 2.4, ceiling: 0, account: "432" },
    ],
    employer_contributions: [
      { label: "Sécurité sociale patronale", rate: 16.4, ceiling: 350000, account: "431" },
      { label: "Retraite patronale", rate: 4.2, ceiling: 0, account: "432" },
    ],
    tax_brackets: [
      { up_to: 1800000, rate: 0 },
      { up_to: 3600000, rate: 20 },
      { up_to: 7200000, rate: 30 },
      { up_to: 18000000, rate: 35 },
      { up_to: null, rate: 40 },
    ],
    accounts: {
      salary: "6611",
      prime: "6612",
      allowance: "663",
      employer_charges: "664",
      employee_charges: "431",
      tax: "447",
      other_deductions: "47",
      net_pay: "422",
      payment: "521",
    },
  };

  function calcPayroll(input) {
    const gross = +(input.base + (input.overtime_amount || 0) + (input.bonus || 0) + (input.commission || 0) + (input.allowance || 0)).toFixed(2);
    const lines = payroll_settings.employee_contributions.map((c) => ({
      label: c.label,
      account: c.account || "431",
      rate: c.rate,
      ceiling: c.ceiling,
      taxable: c.ceiling ? Math.min(gross, c.ceiling) : gross,
      amount: +((c.ceiling ? Math.min(gross, c.ceiling) : gross) * (c.rate / 100)).toFixed(2),
    }));
    const social_employee = +lines.reduce((a, c) => a + c.amount, 0).toFixed(2);
    const taxable = +(gross - social_employee).toFixed(2);
    let annual = taxable * 12;
    let tax = 0;
    let lower = 0;
    payroll_settings.tax_brackets.forEach((b) => {
      const up = b.up_to === null ? Infinity : b.up_to;
      if (annual > lower) {
        const seg = Math.min(annual, up);
        if (seg > lower) tax += (seg - lower) * (b.rate / 100);
      }
      lower = up;
    });
    const taxM = +(tax / 12).toFixed(2);
    const other = input.other_deductions || 0;
    const employer_lines = payroll_settings.employer_contributions.map((c) => ({
      label: c.label,
      account: c.account || "431",
      rate: c.rate,
      ceiling: c.ceiling,
      taxable: c.ceiling ? Math.min(gross, c.ceiling) : gross,
      amount: +((c.ceiling ? Math.min(gross, c.ceiling) : gross) * (c.rate / 100)).toFixed(2),
    }));
    const social_employer = +employer_lines.reduce((a, c) => a + c.amount, 0).toFixed(2);
    return {
      overtime_amount: input.overtime_amount || 0,
      hour_rate: +(input.base / 191).toFixed(2),
      gross,
      employee_contributions: lines,
      social_employee,
      taxable,
      tax_annual: +(taxM * 12).toFixed(2),
      tax: taxM,
      other_deductions: other,
      total_deductions: +(social_employee + taxM + other).toFixed(2),
      net: +(gross - social_employee - taxM - other).toFixed(2),
      employer_contributions: employer_lines,
      social_employer,
      employer_cost: +(gross + social_employer).toFixed(2),
    };
  }

  const period = `${today.getFullYear()}-${pad(today.getMonth() + 1)}`;
  const payroll_runs = [
    {
      id: 1,
      period,
      label: `Paie ${today.getMonth() + 1}/${today.getFullYear()}`,
      status: "finalized",
      employee_count: employees.length,
      total_gross: 0,
      total_net: 0,
      total_employer: 0,
      generated_at: `${iso(today)} 14:20:00`,
      notes: "",
    },
  ];
  const payroll_lines = employees.map((e, i) => {
    const calc = calcPayroll({
      base: e.base_salary,
      overtime_amount: i % 3 === 0 ? 15000 : 0,
      bonus: i % 4 === 0 ? 75000 : 0,
      commission: i % 5 === 0 ? 50000 : 0,
      allowance: e.transport_allowance,
      other_deductions: 0,
    });
    return {
      id: i + 1,
      run_id: 1,
      employee_id: e.id,
      matricule: e.matricule,
      full_name: `${e.first_name} ${e.last_name}`,
      job_title: e.job_title,
      department: e.department_name,
      contract_type: e.contract_type,
      base_salary: e.base_salary,
      overtime_hours: i % 3 === 0 ? 6 : 0,
      overtime_amount: calc.overtime_amount,
      bonus: i % 4 === 0 ? 75000 : 0,
      commission: i % 5 === 0 ? 50000 : 0,
      allowance: e.transport_allowance,
      other_deductions: 0,
      gross: calc.gross,
      social_employee: calc.social_employee,
      tax: calc.tax,
      net: calc.net,
      social_employer: calc.social_employer,
      employer_cost: calc.employer_cost,
      breakdown_json: JSON.stringify({
        lines: calc.employee_contributions,
        employer_lines: calc.employer_contributions,
        taxable: calc.taxable,
        tax_annual: calc.tax_annual,
        hour_rate: calc.hour_rate,
        allowance: e.transport_allowance,
      }),
      notes: "",
    };
  });
  payroll_runs[0].total_gross = +payroll_lines.reduce((a, l) => a + l.gross, 0).toFixed(2);
  payroll_runs[0].total_net = +payroll_lines.reduce((a, l) => a + l.net, 0).toFixed(2);
  payroll_runs[0].total_employer = +payroll_lines.reduce((a, l) => a + l.employer_cost, 0).toFixed(2);

  const job_offers = [
    { id: 1, title: "Développeur full-stack (H/F)", department_id: 3, department_name: "Informatique / IT", contract_type: "CDI", location: "Dakar", salary_min: 600000, salary_max: 900000, status: "open", posted_at: iso(addDays(today, -20)), description: "Rejoignez une équipe produit agile.", requirements: "Bac+5, 3 ans d'expérience.", benefits: "Mutuelle, primes.", candidates_count: 3, hired_count: 0 },
    { id: 2, title: "Chargé de clientèle (H/F)", department_id: 4, department_name: "Commercial", contract_type: "CDD", location: "Thiès", salary_min: 350000, salary_max: 500000, status: "open", posted_at: iso(addDays(today, -12)), description: "", requirements: "", benefits: "", candidates_count: 3, hired_count: 1 },
    { id: 3, title: "Stagiaire marketing digital", department_id: 4, department_name: "Commercial", contract_type: "Stage", location: "Dakar", salary_min: 150000, salary_max: 250000, status: "on_hold", posted_at: iso(addDays(today, -40)), description: "", requirements: "", benefits: "", candidates_count: 2, hired_count: 0 },
  ];

  const stages = ["new", "screening", "interview", "offer", "hired", "rejected"];
  const candidates = [];
  let cid = 1;
  job_offers.forEach((o, oi) => {
    for (let j = 0; j < 4; j++) {
      const emp = employees[(oi * 3 + j) % employees.length];
      candidates.push({
        id: cid,
        offer_id: o.id,
        offer_title: o.title,
        first_name: emp.first_name,
        last_name: emp.last_name + " Jr",
        email: `${emp.first_name.toLowerCase()}.cand${j}@email.sn`,
        phone: `+221 76 11 22 ${pad(j)}${pad(oi)}`,
        source: ["Site web", "LinkedIn", "Candidature spontanée", "Recommandation"][(oi + j) % 4],
        stage: stages[(oi + j) % stages.length],
        rating: ((oi + j) % 5) + 1,
        salary_expectation: o.salary_min + j * 50000,
        availability: ["Immédiat", "1 mois", "2 mois"][(oi + j) % 3],
        notes: "Candidature reçue via la plateforme.",
        applied_at: iso(addDays(today, -(5 + j * 4))),
        updated_at: `${iso(today)} 11:00:00`,
      });
      cid++;
    }
  });

  const interviews = [
    { id: 1, candidate_id: 1, candidate_name: "Amine Alaoui Jr", offer_title: job_offers[0].title, stage: "screening", scheduled_at: `${iso(addDays(today, 2))} 10:00`, duration_minutes: 60, type: "Visio", interviewer: "Salma Bennani", location: "Teams", feedback: "", result: "pending" },
    { id: 2, candidate_id: 5, candidate_name: "Nadia Idrissi Jr", offer_title: job_offers[1].title, stage: "interview", scheduled_at: `${iso(addDays(today, 5))} 14:30`, duration_minutes: 45, type: "Présentiel", interviewer: "Imane Tazi", location: "Salle 2", feedback: "Bon contact.", result: "positive" },
    { id: 3, candidate_id: 8, candidate_name: "Mehdi Berrada Jr", offer_title: job_offers[1].title, stage: "hired", scheduled_at: `${iso(addDays(today, -6))} 09:00`, duration_minutes: 60, type: "Téléphone", interviewer: "Salma Bennani", location: "", feedback: "Profil retenu.", result: "positive" },
  ];

  const evaluations = employees.slice(0, 6).map((e, i) => {
    const criteria = ["Qualité du travail", "Productivité", "Ponctualité et assiduité", "Esprit d'équipe", "Communication"].map(
      (label) => ({ label, rating: ((i + label.length) % 5) + 1 })
    );
    const avg = criteria.reduce((a, c) => a + c.rating, 0) / criteria.length;
    return {
      id: i + 1,
      employee_id: e.id,
      employee_name: `${e.first_name} ${e.last_name}`,
      matricule: e.matricule,
      job_title: e.job_title,
      department: e.department_name,
      photo_color: e.photo_color,
      period: `${today.getFullYear()} S${(i % 2) + 1}`,
      evaluator_name: "Administrateur",
      status: i % 3 === 0 ? "draft" : "completed",
      global_rating: Number(avg.toFixed(2)),
      criteria_json: JSON.stringify(criteria),
      strengths: "Rigueur, sens des responsabilités, bonne collaboration.",
      improvements: "Gestion du temps et priorisation des tâches.",
      goals: "Atteindre les objectifs trimestriels.",
      comments: "Évolution positive sur la période.",
      created_at: `${iso(addDays(today, -30))} 09:00:00`,
      completed_at: i % 3 === 0 ? null : `${iso(addDays(today, -2))} 16:00:00`,
    };
  });

  const docCats = ["Contrat", "Justificatif", "Diplôme", "Certificat médical", "Pièce d'identité"];
  const documents = employees.slice(0, 7).map((e, i) => ({
    id: i + 1,
    employee_id: e.id,
    employee_name: `${e.first_name} ${e.last_name}`,
    matricule: e.matricule,
    department: e.department_name,
    name: `${docCats[i % docCats.length]} n°${1000 + i}`,
    category: docCats[i % docCats.length],
    description: "Document archivé dans le dossier salarié.",
    reference: `REF-${1000 + i}`,
    file_path: "",
    issue_date: iso(addDays(today, -400 + i * 20)),
    expiry_date: i < 3 ? iso(addDays(today, i * 25 - 10)) : null,
    created_at: `${iso(addDays(today, -60))} 10:00:00`,
  }));

  const activity = [
    { id: 1, entity: "payroll", action: "generate", label: `Génération de la paie ${period} (10 salariés)`, author: "admin", at: `${iso(today)} 14:20:00` },
    { id: 2, entity: "leave", action: "approved", label: "Demande de congé de Sara Naciri (3 j)", author: "admin", at: `${iso(addDays(today, -1))} 09:40:00` },
    { id: 3, entity: "employee", action: "create", label: "Fiche employé : Nadia Idrissi", author: "admin", at: `${iso(addDays(today, -2))} 11:12:00` },
    { id: 4, entity: "candidate", action: "stage", label: "Mehdi Berrada Jr → hired", author: "admin", at: `${iso(addDays(today, -3))} 15:05:00` },
    { id: 5, entity: "auth", action: "login", label: "Connexion au logiciel", author: "admin", at: `${iso(today)} 08:02:00` },
  ];

  const users = [
    { id: 1, username: "admin", full_name: "Administrateur", role: "admin", active: 1, last_login: `${iso(today)} 08:02:00`, created_at: "2024-01-01 10:00:00" },
    { id: 2, username: "rh", full_name: "Salma Bennani", role: "hr", active: 1, last_login: `${iso(addDays(today, -1))} 09:15:00`, created_at: "2024-03-12 10:00:00" },
  ];

  const settings = {
    company: {
      name: "Atlas Industries",
      tagline: "Ressources humaines",
      address: "12 Avenue Léopold Sédar Senghor",
      city: "Dakar",
      phone: "+221 33 00 00 00 00",
      email: "rh@atlas-industries.sn",
      registration: "RC DKR 2024-B-12345",
      currency: "XOF",
      logo_color: "#4f46e5",
    },
    work: {
      start: "08:30",
      end: "17:30",
      break_minutes: 60,
      standard_hours_month: 191,
      late_grace_minutes: 10,
      work_weekdays: [1, 2, 3, 4, 5],
    },
    payroll: payroll_settings,
    evaluation: {
      criteria: ["Qualité du travail", "Productivité", "Ponctualité et assiduité", "Esprit d'équipe", "Communication", "Initiative et autonomie", "Respect des procédures", "Développement des compétences"],
      scale: 5,
    },
  };

  /* ---------------- Utilitaires de réponse ---------------- */
  const arg = (args, k) => (args && (args[k] !== undefined ? args[k] : args[k.replace(/_([a-z])/g, (m, c) => c.toUpperCase())])) || null;

  function filterEmployees(args) {
    let rows = employees.slice();
    const search = arg(args, "search");
    if (search)
      rows = rows.filter((e) =>
        `${e.first_name} ${e.last_name} ${e.matricule} ${e.job_title} ${e.email}`.toLowerCase().includes(String(search).toLowerCase())
      );
    const status = arg(args, "status");
    if (status && status !== "all") rows = rows.filter((e) => e.status === status);
    const dept = Number(arg(args, "department_id") || 0);
    if (dept) rows = rows.filter((e) => e.department_id === dept);
    const contract = arg(args, "contract_type");
    if (contract && contract !== "all") rows = rows.filter((e) => e.contract_type === contract);
    return rows;
  }

  let nextId = 1000;
  const handlers = {
    login: (a) => ({ id: 1, username: arg(a, "username") || "admin", full_name: "Administrateur", role: "admin" }),
    get_settings: () => settings,
    save_settings: (a) => {
      const data = arg(a, "data") || {};
      Object.entries(data).forEach(([k, v]) => (settings[k] = v));
      return { ok: true };
    },
    list_departments: () => departments,
    list_leave_types: () => leaveTypes,
    list_holidays: () => holidays,
    list_employees: (a) => filterEmployees(a),
    get_employee: (a) => {
      const e = employees.find((x) => x.id === Number(arg(a, "id"))) || employees[0];
      const hist = leave_requests.filter((l) => l.employee_id === e.id);
      const att = attendance.filter((r) => r.employee_id === e.id);
      const evs = evaluations.filter((v) => v.employee_id === e.id);
      const docs = documents.filter((d) => d.employee_id === e.id);
      return {
        employee: e,
        leaves: { total: hist.length, pending: hist.filter((h) => h.status === "pending").length },
        documents: {
          total: docs.length,
          expiring: docs.filter((d) => d.expiry_date && new Date(d.expiry_date) <= addDays(today, 60)).length,
        },
        attendance: {
          days: att.length,
          minutes: att.reduce((s, r) => s + r.worked_minutes, 0),
          lates: att.filter((r) => r.status === "late").length,
        },
        evaluations: { total: evs.length, avg_rating: evs.length ? evs.reduce((s, v) => s + v.global_rating, 0) / evs.length : null },
        last_payroll: payroll_lines.find((l) => l.employee_id === e.id) || null,
        leave_history: hist.map((l) => ({ start_date: l.start_date, end_date: l.end_date, days: l.days, status: l.status, type_name: l.type_name, color: l.color })),
      };
    },
    save_employee: (a) => {
      const d = arg(a, "data") || {};
      if (d.id) Object.assign(employees.find((e) => e.id === d.id), d);
      else {
        const id = ++nextId;
        employees.push(Object.assign({ id, matricule: `EMP-${id}`, photo_color: "#4f46e5", seniority_years: 0 }, d));
        return { id, matricule: d.matricule || `EMP-${id}` };
      }
      return { id: d.id, matricule: d.matricule };
    },
    delete_employee: (a) => {
      const i = employees.findIndex((e) => e.id === Number(arg(a, "id")));
      if (i >= 0) employees.splice(i, 1);
      return { ok: true };
    },
    employee_stats: () => ({
      by_status: ["active", "probation", "leave"].map((s) => ({ status: s, n: employees.filter((e) => e.status === s).length })),
      by_department: departments.map((d) => ({ department: d.name, n: employees.filter((e) => e.department_id === d.id).length })),
      by_contract: ["CDI", "CDD", "Stage", "Alternance"].map((c) => ({ contract_type: c, n: employees.filter((e) => e.contract_type === c).length })),
    }),
    org_chart: () => ({
      people: employees.map((e) => ({ id: e.id, first_name: e.first_name, last_name: e.last_name, job_title: e.job_title, photo_color: e.photo_color, manager_id: e.manager_id, department_id: e.department_id, status: e.status })),
      departments,
    }),
    save_department: (a) => {
      const d = arg(a, "data") || {};
      if (d.id) Object.assign(departments.find((x) => x.id === d.id), d);
      else departments.push(Object.assign({ id: departments.length + 1, employee_count: 0 }, d));
      return { id: d.id || departments.length };
    },
    delete_department: (a) => {
      const i = departments.findIndex((d) => d.id === Number(arg(a, "id")));
      if (i >= 0) departments.splice(i, 1);
      return { ok: true };
    },
    list_leave_requests: (a) => {
      let rows = leave_requests.slice();
      const st = arg(a, "status");
      if (st && st !== "all") rows = rows.filter((r) => r.status === st);
      const y = arg(a, "year");
      if (y && y !== "all") rows = rows.filter((r) => r.start_date.slice(0, 4) === String(y));
      return rows;
    },
    create_leave_request: (a) => {
      const d = arg(a, "data") || {};
      const emp = employees.find((e) => e.id === Number(d.employee_id)) || employees[0];
      const type = leaveTypes.find((t) => t.id === Number(d.leave_type_id)) || leaveTypes[0];
      const start = new Date(d.start_date || today);
      const end = new Date(d.end_date || today);
      let days = 0;
      for (let x = new Date(start); x <= end; x.setDate(x.getDate() + 1)) if (x.getDay() !== 0 && x.getDay() !== 6) days++;
      const row = {
        id: ++nextId,
        employee_id: emp.id,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        matricule: emp.matricule,
        department: emp.department_name,
        leave_type_id: type.id,
        type_name: type.name,
        type_code: type.code,
        color: type.color,
        start_date: d.start_date,
        end_date: d.end_date,
        days,
        reason: d.reason || "",
        status: "pending",
        created_at: `${iso(today)} ${new Date().toTimeString().slice(0, 8)}`,
      };
      leave_requests.unshift(row);
      return { id: row.id, days };
    },
    decide_leave_request: (a) => {
      const r = leave_requests.find((x) => x.id === Number(arg(a, "id")));
      if (r) r.status = arg(a, "decision");
      return { ok: true };
    },
    delete_leave_request: (a) => {
      const i = leave_requests.findIndex((r) => r.id === Number(arg(a, "id")));
      if (i >= 0) leave_requests.splice(i, 1);
      return { ok: true };
    },
    leave_balances: () => {
      const out = [];
      employees
        .filter((e) => e.status !== "terminated")
        .forEach((e) =>
          leaveTypes.forEach((t) => {
            if (!t.active) return;
            const pris = leave_requests
              .filter((l) => l.employee_id === e.id && l.leave_type_id === t.id && l.status === "approved")
              .reduce((s, l) => s + l.days, 0);
            out.push({
              employee_id: e.id,
              first_name: e.first_name,
              last_name: e.last_name,
              status: e.status,
              department: e.department_name,
              type_id: t.id,
              type_name: t.name,
              color: t.color,
              acquis: t.days_per_year,
              pris,
              en_attente: leave_requests.filter((l) => l.employee_id === e.id && l.leave_type_id === t.id && l.status === "pending").length,
            });
          })
        );
      return out;
    },
    save_leave_type: (a) => {
      const d = arg(a, "data") || {};
      if (d.id) Object.assign(leaveTypes.find((t) => t.id === d.id), d);
      else leaveTypes.push(Object.assign({ id: leaveTypes.length + 1, active: 1 }, d));
      return { id: d.id || leaveTypes.length };
    },
    delete_leave_type: (a) => {
      const i = leaveTypes.findIndex((t) => t.id === Number(arg(a, "id")));
      if (i >= 0) leaveTypes.splice(i, 1);
      return { ok: true };
    },
    save_holiday: (a) => {
      const d = arg(a, "data") || {};
      if (d.id) Object.assign(holidays.find((h) => h.id === d.id), d);
      else holidays.push(Object.assign({ id: holidays.length + 1 }, d));
      return { id: d.id || holidays.length };
    },
    delete_holiday: (a) => {
      const i = holidays.findIndex((h) => h.id === Number(arg(a, "id")));
      if (i >= 0) holidays.splice(i, 1);
      return { ok: true };
    },
    today_presence: () =>
      employees
        .filter((e) => e.status !== "terminated")
        .map((e) => {
          const r = attendance.find((a) => a.employee_id === e.id && a.date === iso(today));
          return {
            employee_id: e.id,
            first_name: e.first_name,
            last_name: e.last_name,
            job_title: e.job_title,
            photo_color: e.photo_color,
            work_schedule: e.work_schedule,
            department: e.department_name,
            id: r ? r.id : null,
            clock_in: r ? r.clock_in : null,
            clock_out: r ? r.clock_out : null,
            status: r ? r.status : null,
            worked_minutes: r ? r.worked_minutes : 0,
            note: r ? r.note : "",
          };
        }),
    clock_event: (a) => {
      const empId = Number(arg(a, "employee_id"));
      const action = arg(a, "action");
      let row = attendance.find((r) => r.employee_id === empId && r.date === iso(today));
      if (!row) {
        row = { id: ++nextId, employee_id: empId, date: iso(today), break_minutes: 60, status: "present", note: "", worked_minutes: 0, overtime_minutes: 0, clock_in: null, clock_out: null };
        attendance.push(row);
      }
      if (action === "in") row.clock_in = new Date().toTimeString().slice(0, 5);
      if (action === "out") row.clock_out = new Date().toTimeString().slice(0, 5);
      const emp = employees.find((e) => e.id === empId);
      row.employee_name = emp ? `${emp.first_name} ${emp.last_name}` : "";
      return row;
    },
    list_attendance: (a) => {
      let rows = attendance.slice();
      const month = arg(a, "month");
      if (month) rows = rows.filter((r) => r.date.slice(0, 7) === month);
      const empId = Number(arg(a, "employee_id") || 0);
      if (empId) rows = rows.filter((r) => r.employee_id === empId);
      const from = arg(a, "date_from");
      if (from) rows = rows.filter((r) => r.date >= from);
      const to = arg(a, "date_to");
      if (to) rows = rows.filter((r) => r.date <= to);
      return rows.sort((x, y) => (x.date < y.date ? 1 : -1));
    },
    save_attendance: (a) => {
      const d = arg(a, "data") || {};
      let row = attendance.find((r) => r.employee_id === Number(d.employee_id) && r.date === d.date);
      const emp = employees.find((e) => e.id === Number(d.employee_id));
      const patch = Object.assign({}, d, {
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "",
        worked_minutes: computeWorked(d),
        overtime_minutes: Math.max(0, computeWorked(d) - 480),
      });
      if (row) Object.assign(row, patch);
      else attendance.push(Object.assign({ id: ++nextId, break_minutes: 60 }, patch));
      return { id: row ? row.id : nextId };
    },
    delete_attendance: (a) => {
      const i = attendance.findIndex((r) => r.id === Number(arg(a, "id")));
      if (i >= 0) attendance.splice(i, 1);
      return { ok: true };
    },
    monthly_grid: (a) => {
      const month = String(arg(a, "month") || period).slice(0, 7);
      const [y, m] = month.split("-").map(Number);
      return {
        month,
        year: y,
        month_number: m,
        days: new Date(y, m, 0).getDate(),
        employees: employees.filter((e) => e.status !== "terminated").map((e) => ({ id: e.id, first_name: e.first_name, last_name: e.last_name, matricule: e.matricule, photo_color: e.photo_color, work_schedule: e.work_schedule, department: e.department_name })),
        attendance: attendance.filter((r) => r.date.slice(0, 7) === month),
        holidays: [],
        leaves: leave_requests.filter((l) => l.status === "approved").map((l) => ({ employee_id: l.employee_id, start_date: l.start_date, end_date: l.end_date, type_name: l.type_name, color: l.color })),
      };
    },
    attendance_summary: (a) => {
      const from = arg(a, "date_from") || iso(new Date(today.getFullYear(), today.getMonth(), 1));
      const to = arg(a, "date_to") || iso(today);
      return employees
        .filter((e) => e.status !== "terminated")
        .map((e) => {
          const rows = attendance.filter((r) => r.employee_id === e.id && r.date >= from && r.date <= to);
          return {
            employee_id: e.id,
            employee_name: `${e.first_name} ${e.last_name}`,
            matricule: e.matricule,
            department: e.department_name,
            days_present: rows.length,
            worked_minutes: rows.reduce((s, r) => s + r.worked_minutes, 0),
            overtime_minutes: rows.reduce((s, r) => s + r.overtime_minutes, 0),
            lates: rows.filter((r) => r.status === "late").length,
            absents: rows.filter((r) => r.status === "absent").length,
          };
        });
    },
    list_payroll_runs: () => payroll_runs,
    get_payroll_run: (a) => ({
      run: payroll_runs.find((r) => r.id === Number(arg(a, "id"))) || payroll_runs[0],
      lines: payroll_lines,
    }),
    /* Écritures de paie — plan SYSCOHADA (miroir de la commande Rust). */
    payroll_entries: (a) => {
      const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
      const run = payroll_runs.find((r) => r.id === Number(arg(a, "run_id"))) || payroll_runs[0];
      const A = Object.assign(
        {
          salary: "6611",
          prime: "6612",
          allowance: "663",
          employee_charges: "431",
          tax: "447",
          other_deductions: "47",
          net_pay: "422",
          employer_charges: "664",
          payment: "521",
        },
        payroll_settings.accounts || {}
      );
      let salary = 0,
        prime = 0,
        allow = 0,
        taxTotal = 0,
        otherTotal = 0,
        netTotal = 0;
      const empBy = new Map();
      const erBy = new Map();
      const add = (map, account, label, amount) => {
        if (Math.abs(Number(amount) || 0) < 0.005) return;
        const key = String(account || "").trim() || A.employee_charges;
        const cur = map.get(key) || { compte: key, libelle: label, montant: 0 };
        cur.montant += Number(amount);
        map.set(key, cur);
      };
      payroll_lines.forEach((l) => {
        salary += l.base_salary + (l.overtime_amount || 0);
        prime += (l.bonus || 0) + (l.commission || 0);
        allow += l.allowance || 0;
        taxTotal += l.tax || 0;
        otherTotal += l.other_deductions || 0;
        netTotal += l.net || 0;
        let b = {};
        try {
          b = JSON.parse(l.breakdown_json || "{}");
        } catch (e) {
          b = {};
        }
        let hasEmp = false;
        let hasEr = false;
        (b.lines || []).forEach((c) => {
          if (Math.abs(c.amount || 0) > 0.005) {
            hasEmp = true;
            add(empBy, c.account || A.employee_charges, c.label, c.amount);
          }
        });
        (b.employer_lines || []).forEach((c) => {
          if (Math.abs(c.amount || 0) > 0.005) {
            hasEr = true;
            add(erBy, c.account || A.employee_charges, c.label, c.amount);
          }
        });
        if (!hasEmp) add(empBy, A.employee_charges, "Cotisations salariales", l.social_employee || 0);
        if (!hasEr) add(erBy, A.employee_charges, "Cotisations patronales", l.social_employer || 0);
      });
      const empTotal = [...empBy.values()].reduce((s, e) => s + e.montant, 0);
      const erTotal = [...erBy.values()].reduce((s, e) => s + e.montant, 0);
      const gross = r2(salary + prime + allow);
      const withhold = r2(empTotal + taxTotal + otherTotal);
      const reverse = r2(empTotal + erTotal + taxTotal);
      const rows = [];
      const op = (n, title, debits, credits) => {
        const piece = `${run.period} · ${String(n).padStart(2, "0")}`;
        (debits || []).forEach(([compte, libelle, m]) => {
          const v = r2(m);
          if (Math.abs(v) >= 0.005) rows.push({ piece, operation: title, compte, libelle, debit: v, credit: 0 });
        });
        (credits || []).forEach(([compte, libelle, m]) => {
          const v = r2(m);
          if (Math.abs(v) >= 0.005) rows.push({ piece, operation: title, compte, libelle, debit: 0, credit: v });
        });
      };
      op(
        1,
        "Rémunérations de la période",
        [
          [A.salary, "Appointements, salaires et commissions", salary],
          [A.prime, "Primes et gratifications", prime],
          [A.allowance, "Indemnités versées au personnel", allow],
        ],
        [[A.net, `Rémunérations brutes ${run.period}`, gross]]
      );
      op(
        2,
        "Retenues salariales et impôt",
        [[A.net, `Retenues sur rémunérations ${run.period}`, withhold]],
        [...empBy.values()].map((e) => [e.compte, `Cotisation salariale — ${e.libelle}`, e.montant]).concat([
          [A.tax, "Impôt sur les revenus retainus à la source", taxTotal],
          [A.other_deductions, "Autres retenues (avances, oppositions)", otherTotal],
        ])
      );
      op(
        3,
        "Charges sociales patronales",
        [[A.employer_charges, "Charges sociales sur rémunérations", erTotal]],
        [...erBy.values()].map((e) => [e.compte, `Cotisation patronale — ${e.libelle}`, e.montant])
      );
      op(
        4,
        "Paiement des nets à payer",
        [[A.net, `Nets à payer ${run.period}`, r2(netTotal)]],
        [[A.payment, "Virements bancaires — salaires", r2(netTotal)]]
      );
      const revDebits = new Map();
      [...empBy.values(), ...erBy.values()].forEach((e) => {
        revDebits.set(e.compte, (revDebits.get(e.compte) || 0) + e.montant);
      });
      if (Math.abs(taxTotal) >= 0.005) revDebits.set(A.tax, (revDebits.get(A.tax) || 0) + taxTotal);
      op(
        5,
        "Reversement des cotisations et de l'impôt",
        [...revDebits.entries()].map(([compte, m]) => [compte, `Reversement ${compte}`, m]),
        [[A.payment, "Reversement organismes sociaux et impôt", reverse]]
      );
      const td = r2(rows.reduce((s, r) => s + r.debit, 0));
      const tc = r2(rows.reduce((s, r) => s + r.credit, 0));
      return {
        period: run.period,
        label: run.label || "",
        employee_count: run.employee_count,
        rows,
        accounts: A,
        summary: {
          gross,
          net: r2(netTotal),
          employee_contributions: r2(empTotal),
          employer_contributions: r2(erTotal),
          tax: r2(taxTotal),
          other_deductions: r2(otherTotal),
        },
        totals: { debit: td, credit: tc, balanced: Math.abs(td - tc) < 0.01 },
      };
    },
    generate_payroll: () => ({ id: 1, period, employee_count: employees.length, total_gross: payroll_runs[0].total_gross, total_net: payroll_runs[0].total_net, total_employer: payroll_runs[0].total_employer }),
    delete_payroll_run: () => ({ ok: true }),
    update_payroll_line: (a) => {
      const line = payroll_lines.find((l) => l.id === Number(arg(a, "id")));
      const d = arg(a, "data") || {};
      if (!line) return {};
      Object.assign(line, d);
      const calc = calcPayroll({
        base: line.base_salary,
        overtime_amount: ((line.base_salary / 191) * (d.overtime_hours || line.overtime_hours) * 1.5) || 0,
        bonus: line.bonus,
        commission: line.commission,
        allowance: line.allowance,
        other_deductions: line.other_deductions,
      });
      Object.assign(line, {
        overtime_amount: calc.overtime_amount,
        gross: calc.gross,
        social_employee: calc.social_employee,
        tax: calc.tax,
        net: calc.net,
        social_employer: calc.social_employer,
        employer_cost: calc.employer_cost,
        breakdown_json: JSON.stringify({ lines: calc.employee_contributions, employer_lines: calc.employer_contributions, taxable: calc.taxable, hour_rate: calc.hour_rate, allowance: line.allowance }),
      });
      return line;
    },
    simulate_payroll: (a) => calcPayroll(arg(a, "data") || { base: 0 }),
    list_job_offers: () => job_offers,
    save_job_offer: (a) => {
      const d = arg(a, "data") || {};
      if (d.id) Object.assign(job_offers.find((o) => o.id === d.id), d);
      else job_offers.unshift(Object.assign({ id: job_offers.length + 1, candidates_count: 0, hired_count: 0 }, d));
      return { id: d.id || job_offers.length };
    },
    delete_job_offer: (a) => {
      const i = job_offers.findIndex((o) => o.id === Number(arg(a, "id")));
      if (i >= 0) job_offers.splice(i, 1);
      return { ok: true };
    },
    list_candidates: (a) => {
      let rows = candidates.slice();
      const offer = Number(arg(a, "offer_id") || 0);
      if (offer) rows = rows.filter((c) => c.offer_id === offer);
      const stage = arg(a, "stage");
      if (stage && stage !== "all") rows = rows.filter((c) => c.stage === stage);
      const search = arg(a, "search");
      if (search) rows = rows.filter((c) => `${c.first_name} ${c.last_name} ${c.email}`.toLowerCase().includes(String(search).toLowerCase()));
      return rows;
    },
    save_candidate: (a) => {
      const d = arg(a, "data") || {};
      if (d.id) Object.assign(candidates.find((c) => c.id === d.id), d);
      else candidates.unshift(Object.assign({ id: ++nextId, offer_title: (job_offers.find((o) => o.id === d.offer_id) || {}).title || "" }, d));
      return { id: d.id || nextId };
    },
    move_candidate: (a) => {
      const c = candidates.find((x) => x.id === Number(arg(a, "id")));
      if (c) c.stage = arg(a, "stage");
      return { ok: true };
    },
    delete_candidate: (a) => {
      const i = candidates.findIndex((c) => c.id === Number(arg(a, "id")));
      if (i >= 0) candidates.splice(i, 1);
      return { ok: true };
    },
    list_interviews: () => interviews,
    save_interview: (a) => {
      const d = arg(a, "data") || {};
      const cand = candidates.find((c) => c.id === Number(d.candidate_id));
      if (d.id) Object.assign(interviews.find((i) => i.id === d.id), d);
      else interviews.push(Object.assign({ id: ++nextId, candidate_name: cand ? `${cand.first_name} ${cand.last_name}` : "", offer_title: cand ? cand.offer_title : "", stage: cand ? cand.stage : "" }, d));
      return { id: d.id || nextId };
    },
    delete_interview: (a) => {
      const i = interviews.findIndex((x) => x.id === Number(arg(a, "id")));
      if (i >= 0) interviews.splice(i, 1);
      return { ok: true };
    },
    recruitment_stats: () => ({
      by_stage: stages.map((s) => ({ stage: s, n: candidates.filter((c) => c.stage === s).length })),
      by_offer: job_offers.map((o) => ({ id: o.id, title: o.title, status: o.status, n: candidates.filter((c) => c.offer_id === o.id).length })),
      conversion: { total: candidates.length, hired: candidates.filter((c) => c.stage === "hired").length },
    }),
    list_evaluations: (a) => {
      let rows = evaluations.slice();
      const empId = Number(arg(a, "employee_id") || 0);
      if (empId) rows = rows.filter((v) => v.employee_id === empId);
      const st = arg(a, "status");
      if (st && st !== "all") rows = rows.filter((v) => v.status === st);
      const periodF = arg(a, "period");
      if (periodF && periodF !== "all") rows = rows.filter((v) => v.period === periodF);
      return rows;
    },
    save_evaluation: (a) => {
      const d = arg(a, "data") || {};
      const emp = employees.find((e) => e.id === Number(d.employee_id));
      const criteria = typeof d.criteria_json === "string" ? JSON.parse(d.criteria_json) : d.criteria_json || [];
      const avg = criteria.length ? criteria.reduce((s, c) => s + Number(c.rating || 0), 0) / criteria.length : 0;
      const patch = Object.assign({}, d, {
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "",
        matricule: emp ? emp.matricule : "",
        job_title: emp ? emp.job_title : "",
        department: emp ? emp.department_name : "",
        photo_color: emp ? emp.photo_color : "#4f46e5",
        global_rating: Number(avg.toFixed(2)),
        criteria_json: JSON.stringify(criteria),
        completed_at: d.status === "completed" ? `${iso(today)} 12:00:00` : null,
      });
      if (d.id) Object.assign(evaluations.find((v) => v.id === d.id), patch);
      else evaluations.unshift(Object.assign({ id: ++nextId, created_at: `${iso(today)} 12:00:00` }, patch));
      return { id: d.id || nextId };
    },
    delete_evaluation: (a) => {
      const i = evaluations.findIndex((v) => v.id === Number(arg(a, "id")));
      if (i >= 0) evaluations.splice(i, 1);
      return { ok: true };
    },
    evaluation_stats: () => ({
      overall: { total: evaluations.length, avg_rating: evaluations.reduce((s, v) => s + v.global_rating, 0) / (evaluations.length || 1), completed: evaluations.filter((v) => v.status === "completed").length },
      by_period: [...new Set(evaluations.map((v) => v.period))].map((p) => ({
        period: p,
        n: evaluations.filter((v) => v.period === p).length,
        avg_rating: evaluations.filter((v) => v.period === p).reduce((s, v) => s + v.global_rating, 0) / (evaluations.filter((v) => v.period === p).length || 1),
      })),
      top: evaluations.slice().sort((a, b) => b.global_rating - a.global_rating).slice(0, 5).map((v) => ({ employee_name: v.employee_name, global_rating: v.global_rating, period: v.period })),
      by_department: [...new Set(evaluations.map((v) => v.department))].map((d) => ({
        department: d,
        avg_rating: evaluations.filter((v) => v.department === d).reduce((s, v) => s + v.global_rating, 0) / (evaluations.filter((v) => v.department === d).length || 1),
        n: evaluations.filter((v) => v.department === d).length,
      })),
    }),
    list_documents: (a) => {
      let rows = documents.slice();
      const empId = Number(arg(a, "employee_id") || 0);
      if (empId) rows = rows.filter((d) => d.employee_id === empId);
      const cat = arg(a, "category");
      if (cat && cat !== "all") rows = rows.filter((d) => d.category === cat);
      if (arg(a, "expiring")) rows = rows.filter((d) => d.expiry_date && new Date(d.expiry_date) <= addDays(today, 60));
      return rows;
    },
    save_document: (a) => {
      const d = arg(a, "data") || {};
      const emp = employees.find((e) => e.id === Number(d.employee_id));
      const patch = Object.assign({}, d, {
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : "",
        matricule: emp ? emp.matricule : "",
        department: emp ? emp.department_name : "",
      });
      if (d.id) Object.assign(documents.find((x) => x.id === d.id), patch);
      else documents.unshift(Object.assign({ id: ++nextId, created_at: `${iso(today)} 12:00:00` }, patch));
      return { id: d.id || nextId };
    },
    delete_document: (a) => {
      const i = documents.findIndex((d) => d.id === Number(arg(a, "id")));
      if (i >= 0) documents.splice(i, 1);
      return { ok: true };
    },
    document_alerts: () => ({
      categories: [...new Set(documents.map((d) => d.category))].map((c) => ({ category: c })),
      expiring: documents.filter((d) => d.expiry_date && new Date(d.expiry_date) <= addDays(today, 60)),
    }),
    dashboard_stats: () => {
      const month = period;
      const todayAtt = attendance.filter((r) => r.date === iso(today));
      const active = employees.filter((e) => e.status !== "terminated");
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const evolution = [];
      let running = employees.filter((e) => e.hire_date <= iso(firstOfMonth)).length;
      for (let i = 11; i >= 0; i--) {
        const d = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
        const h = employees.filter((e) => e.hire_date.slice(0, 7) === key).length;
        const l = employees.filter((e) => e.termination_date && e.termination_date.slice(0, 7) === key).length;
        running += h - l;
        evolution.push({ month: key, headcount: Math.max(1, running) });
      }
      return {
        is_workday: today.getDay() !== 0 && today.getDay() !== 6,
        today: iso(today),
        headcount: {
          total: employees.length,
          active: active.filter((e) => e.status === "active").length,
          probation: active.filter((e) => e.status === "probation").length,
          terminated: 0,
          hires_month: employees.filter((e) => e.hire_date.slice(0, 7) === month).length,
          leaves_month: 0,
          avg_seniority: Number((active.reduce((s, e) => s + e.seniority_years, 0) / (active.length || 1)).toFixed(1)),
          salary_mass: active.reduce((s, e) => s + e.base_salary, 0),
        },
        presence: {
          present: todayAtt.filter((r) => r.status !== "leave").length,
          late: todayAtt.filter((r) => r.status === "late").length,
          missing: active.length - todayAtt.length,
          excused: active.filter((e) => e.status === "leave").length,
        },
        leaves: {
          pending: leave_requests.filter((r) => r.status === "pending").length,
          approved_month: leave_requests.filter((r) => r.status === "approved" && r.start_date.slice(0, 7) === month).length,
          away_today: 0,
        },
        payroll: payroll_runs[0],
        recruitment: {
          open_offers: job_offers.filter((o) => o.status === "open").length,
          candidates: candidates.length,
          in_pipeline: candidates.filter((c) => ["new", "screening", "interview", "offer"].includes(c.stage)).length,
          hired: candidates.filter((c) => c.stage === "hired").length,
          pending_interviews: interviews.filter((i) => i.result === "pending").length,
        },
        by_department: departments.map((d) => ({
          department: d.name,
          n: active.filter((e) => e.department_id === d.id).length,
          salary_mass: active.filter((e) => e.department_id === d.id).reduce((s, e) => s + e.base_salary, 0),
        })),
        evolution,
        leave_monthly: [],
        upcoming_holidays: (() => {
          const out = [];
          holidays.forEach((h) => {
            const parts = h.date.split("-");
            let d = new Date(today.getFullYear(), Number(parts[0]) - 1, Number(parts[1]));
            if (d < today) d = new Date(today.getFullYear() + 1, Number(parts[0]) - 1, Number(parts[1]));
            const diff = Math.round((d - today) / 86400000);
            if (diff >= 0 && diff <= 60) out.push({ date: iso(d), name: h.name, in_days: diff });
          });
          return out.sort((a, b) => a.date.localeCompare(b.date));
        })(),
        documents_expiring: documents.filter((d) => d.expiry_date && new Date(d.expiry_date) <= addDays(today, 60)).slice(0, 6),
        activity,
        interviews: interviews.filter((i) => i.result === "pending"),
        birthdays: employees.filter((e) => e.birth_date && e.birth_date.slice(5, 7) === pad(today.getMonth() + 1)),
        anniversaries: active.filter((e) => e.hire_date.slice(5, 7) === pad(today.getMonth() + 1)).map((e) => ({ id: e.id, name: `${e.first_name} ${e.last_name}`, photo_color: e.photo_color, hire_date: e.hire_date, years: Math.max(1, Math.floor(e.seniority_years)) })),
      };
    },
    list_activity: () => activity,
    database_info: () => ({ employees: employees.length, departments: departments.length, leave_requests: leave_requests.length, attendance: attendance.length, payroll_runs: payroll_runs.length, payroll_lines: payroll_lines.length, job_offers: job_offers.length, candidates: candidates.length, evaluations: evaluations.length, documents: documents.length, users: users.length, first_activity: "2024-01-01 10:00:00" }),
    global_search: (a) => {
      const t = String(arg(a, "term") || "").toLowerCase();
      return {
        employees: employees.filter((e) => `${e.first_name} ${e.last_name} ${e.job_title} ${e.matricule}`.toLowerCase().includes(t)).slice(0, 6),
        offers: job_offers.filter((o) => o.title.toLowerCase().includes(t)).slice(0, 4),
        candidates: candidates.filter((c) => `${c.first_name} ${c.last_name}`.toLowerCase().includes(t)).slice(0, 4),
      };
    },
    list_users: () => users,
    save_user: (a) => {
      const d = arg(a, "data") || {};
      if (d.id) Object.assign(users.find((u) => u.id === d.id), d);
      else users.push(Object.assign({ id: users.length + 1, active: 1, last_login: null, created_at: `${iso(today)} 12:00:00` }, d));
      return { id: d.id || users.length };
    },
    delete_user: (a) => {
      const i = users.findIndex((u) => u.id === Number(arg(a, "id")));
      if (i >= 0) users.splice(i, 1);
      return { ok: true };
    },
    change_password: () => ({ ok: true }),
    export_csv: () => ({ path: `C:\\Users\\Public\\Documents\\export-gestion-rh-${iso(today)}.csv`, rows: employees.length }),
    backup_database: () => ({ path: `C:\\Users\\Public\\Documents\\sauvegarde-gestion-rh-${iso(today)}.sqlite3`, size: 262144 }),
    restore_database: () => ({ ok: true }),
    open_data_folder: () => ({ path: "C:\\Users\\Public\\AppData\\Roaming\\com.gestionrh.desktop" }),
    seed_demo: () => ({ employees: 18, offers: 4, candidates: 16 }),
    reset_data: () => ({ ok: true }),
  };

  function computeWorked(d) {
    if (!d.clock_in || !d.clock_out) return Number(d.worked_minutes) || 0;
    const [ih, im] = String(d.clock_in).split(":").map(Number);
    const [oh, om] = String(d.clock_out).split(":").map(Number);
    return Math.max(0, (oh * 60 + om) - (ih * 60 + im) - Number(d.break_minutes || 0));
  }

  window.__TAURI__ = {
    core: {
      invoke: (cmd, args) =>
        new Promise((resolve, reject) => {
          setTimeout(() => {
            try {
              const h = handlers[cmd];
              if (!h) {
                console.warn("[dev-mock] commande non simulée :", cmd, args);
                if (cmd.startsWith("list_")) return resolve([]);
                if (cmd.startsWith("get_")) return resolve({});
                return resolve({ ok: true });
              }
              resolve(h(args || {}));
            } catch (err) {
              console.error("[dev-mock] erreur dans", cmd, err);
              reject(String(err.message || err));
            }
          }, 90);
        }),
    },
  };

  console.info("%c[dev-mock] faux backend Tauri activé (dev.html)", "color:#4f46e5;font-weight:bold");
})();
