const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'performance.db');
let db;

function getDb() {
  if (!db) db = new DatabaseSync(DB_PATH);
  return db;
}

function initDb() {
  const db = getDb();
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;`);
  createTables(db);
  runMigrations(db);
  seedData(db);
  return db;
}

// 安全迁移：幂等，多次执行无副作用
function runMigrations(db) {
  const cols = db.prepare('PRAGMA table_info(reviews)').all().map(c => c.name);
  if (!cols.includes('employee_confirmed_at'))
    db.exec('ALTER TABLE reviews ADD COLUMN employee_confirmed_at TEXT');
  if (!cols.includes('employee_confirm_comment'))
    db.exec('ALTER TABLE reviews ADD COLUMN employee_confirm_comment TEXT');
  if (!cols.includes('self_goal_details'))
    db.exec('ALTER TABLE reviews ADD COLUMN self_goal_details TEXT');
}

function createTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#4F46E5',
      head_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      role TEXT DEFAULT 'employee',
      department_id INTEGER,
      title TEXT,
      level TEXT,
      avatar_color TEXT DEFAULT '#4F46E5',
      hire_date TEXT,
      status TEXT DEFAULT 'active',
      manager_id INTEGER,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (department_id) REFERENCES departments(id)
    );

    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'quarterly',
      start_date TEXT,
      end_date TEXT,
      self_review_end TEXT,
      manager_review_end TEXT,
      calibration_end TEXT,
      status TEXT DEFAULT 'draft',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      type TEXT DEFAULT 'okr',
      owner_id INTEGER,
      parent_id INTEGER,
      cycle_id INTEGER,
      target_value REAL,
      current_value REAL DEFAULT 0,
      unit TEXT,
      weight REAL DEFAULT 1,
      progress INTEGER DEFAULT 0,
      status TEXT DEFAULT 'on_track',
      visibility TEXT DEFAULT 'team',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (owner_id) REFERENCES employees(id),
      FOREIGN KEY (cycle_id) REFERENCES cycles(id)
    );

    CREATE TABLE IF NOT EXISTS key_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      target_value REAL,
      current_value REAL DEFAULT 0,
      unit TEXT,
      progress INTEGER DEFAULT 0,
      status TEXT DEFAULT 'on_track',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (goal_id) REFERENCES goals(id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER,
      reviewee_id INTEGER,
      reviewer_id INTEGER,
      self_goal_score REAL,
      self_ability_score REAL,
      self_comment TEXT,
      self_strengths TEXT,
      self_improvements TEXT,
      self_plan TEXT,
      self_submitted_at TEXT,
      manager_goal_score REAL,
      manager_ability_score REAL,
      manager_comment TEXT,
      manager_strengths TEXT,
      manager_improvements TEXT,
      manager_grade TEXT,
      manager_submitted_at TEXT,
      final_grade TEXT,
      final_score REAL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (cycle_id) REFERENCES cycles(id),
      FOREIGN KEY (reviewee_id) REFERENCES employees(id),
      FOREIGN KEY (reviewer_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER,
      from_id INTEGER,
      to_id INTEGER,
      relationship TEXT DEFAULT 'peer',
      score_quality REAL,
      score_efficiency REAL,
      score_teamwork REAL,
      score_innovation REAL,
      score_reliability REAL,
      overall_score REAL,
      comment TEXT,
      is_anonymous INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (cycle_id) REFERENCES cycles(id),
      FOREIGN KEY (from_id) REFERENCES employees(id),
      FOREIGN KEY (to_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS one_on_ones (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      cycle_id INTEGER,
      scheduled_at TEXT,
      completed_at TEXT,
      status TEXT DEFAULT 'scheduled',
      agenda TEXT DEFAULT '[]',
      notes TEXT DEFAULT '',
      action_items TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (manager_id) REFERENCES employees(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      type TEXT DEFAULT 'system',
      title TEXT,
      body TEXT,
      link TEXT,
      is_read INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (user_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS calibration (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id INTEGER,
      employee_id INTEGER,
      dept_id INTEGER,
      preliminary_grade TEXT,
      final_grade TEXT,
      rank_in_dept INTEGER,
      notes TEXT,
      calibrated_by INTEGER,
      calibrated_at TEXT,
      UNIQUE(cycle_id, employee_id)
    );
  `);
}

function seedData(db) {
  const deptCount = db.prepare('SELECT COUNT(*) as c FROM departments').get().c;
  if (deptCount > 0) return; // 已有数据，跳过

  const hash = bcrypt.hashSync('123456', 10);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // ===== 部门 =====
  db.exec(`
    INSERT INTO departments (name, color) VALUES
    ('研发部', '#4F46E5'),
    ('产品部', '#0891B2'),
    ('销售部', '#16A34A'),
    ('市场部', '#D97706'),
    ('职能部', '#DC2626');
  `);

  // ===== 员工 =====
  const insertEmp = db.prepare(`
    INSERT INTO employees (name, email, password_hash, role, department_id, title, level, avatar_color, hire_date, manager_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 职能部（HR）
  const hr = insertEmp.run('陈晓燕', 'admin@company.com', hash, 'hr', 5, 'HR总监', 'M2', '#DC2626', '2021-03-01', null);
  const hrId = hr.lastInsertRowid;

  // 研发部经理
  const mgr = insertEmp.run('张伟', 'zhang.wei@company.com', hash, 'manager', 1, '研发经理', 'M1', '#4F46E5', '2020-06-15', hrId);
  const mgrId = mgr.lastInsertRowid;

  // 研发部员工
  const emp1 = insertEmp.run('李明', 'li.ming@company.com', hash, 'employee', 1, '高级工程师', 'P6', '#6366F1', '2021-09-01', mgrId);
  const emp1Id = emp1.lastInsertRowid;
  const emp2 = insertEmp.run('王芳', 'wang.fang@company.com', hash, 'employee', 1, '工程师', 'P5', '#818CF8', '2022-03-01', mgrId);
  const emp2Id = emp2.lastInsertRowid;
  const emp3 = insertEmp.run('陈博', 'chen.bo@company.com', hash, 'employee', 1, '高级工程师', 'P6', '#7C3AED', '2020-11-01', mgrId);
  const emp3Id = emp3.lastInsertRowid;
  const emp4 = insertEmp.run('刘杰', 'liu.jie@company.com', hash, 'employee', 1, '工程师', 'P4', '#8B5CF6', '2023-04-01', mgrId);
  const emp4Id = emp4.lastInsertRowid;

  // 产品部经理
  const pMgr = insertEmp.run('赵强', 'zhao.qiang@company.com', hash, 'manager', 2, '产品总监', 'M1', '#0891B2', '2020-08-01', hrId);
  const pMgrId = pMgr.lastInsertRowid;
  const emp5 = insertEmp.run('杨敏', 'yang.min@company.com', hash, 'employee', 2, '高级产品经理', 'P6', '#06B6D4', '2021-05-01', pMgrId);
  const emp5Id = emp5.lastInsertRowid;
  const emp6 = insertEmp.run('吴彤', 'wu.tong@company.com', hash, 'employee', 2, '产品经理', 'P5', '#0EA5E9', '2022-08-01', pMgrId);
  const emp6Id = emp6.lastInsertRowid;

  // 销售部经理
  const sMgr = insertEmp.run('孙丽', 'sun.li@company.com', hash, 'manager', 3, '销售总监', 'M1', '#16A34A', '2020-04-01', hrId);
  const sMgrId = sMgr.lastInsertRowid;
  const emp7 = insertEmp.run('周华', 'zhou.hua@company.com', hash, 'employee', 3, '销售经理', 'P5', '#22C55E', '2021-07-01', sMgrId);
  const emp7Id = emp7.lastInsertRowid;

  // 市场部
  const emp8 = insertEmp.run('林晨', 'lin.chen@company.com', hash, 'employee', 4, '市场专员', 'P4', '#D97706', '2022-11-01', hrId);
  const emp8Id = emp8.lastInsertRowid;

  // 更新部门负责人
  db.prepare('UPDATE departments SET head_id = ? WHERE id = 1').run(mgrId);
  db.prepare('UPDATE departments SET head_id = ? WHERE id = 2').run(pMgrId);
  db.prepare('UPDATE departments SET head_id = ? WHERE id = 3').run(sMgrId);
  db.prepare('UPDATE departments SET head_id = ? WHERE id = 5').run(hrId);

  // ===== 绩效周期 =====
  db.exec(`
    INSERT INTO cycles (name, type, start_date, end_date, self_review_end, manager_review_end, calibration_end, status) VALUES
    ('2024 Q4 绩效评估', 'quarterly', '2024-10-01', '2024-12-31', '2024-12-15', '2024-12-22', '2024-12-28', 'active'),
    ('2024 Q3 绩效评估', 'quarterly', '2024-07-01', '2024-09-30', '2024-09-20', '2024-09-25', '2024-09-28', 'completed'),
    ('2024 上半年绩效评估', 'biannual', '2024-01-01', '2024-06-30', '2024-06-20', '2024-06-25', '2024-06-28', 'completed');
  `);

  // ===== 目标（OKR/KPI）=====
  const insertGoal = db.prepare(`
    INSERT INTO goals (title, description, type, owner_id, parent_id, cycle_id, target_value, current_value, unit, weight, progress, status, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 公司级目标（Q4，周期1）
  const g1 = insertGoal.run('提升平台整体稳定性与用户体验', '核心系统可用率达99.9%，用户满意度NPS提升到65分', 'okr', hrId, null, 1, null, null, null, 1, 72, 'on_track', 'public');
  const g1Id = g1.lastInsertRowid;
  const g2 = insertGoal.run('2024 Q4 营收目标达成', '季度营收突破1500万，环比增长25%', 'kpi', hrId, null, 1, 1500, 1120, '万元', 1, 75, 'on_track', 'public');
  const g2Id = g2.lastInsertRowid;
  const g3 = insertGoal.run('新产品功能上线', '完成用户权限系统V2、数据导出功能、移动端优化三大功能上线', 'okr', hrId, null, 1, null, null, null, 1, 60, 'at_risk', 'public');
  const g3Id = g3.lastInsertRowid;

  // 研发部级目标（Q4，周期1）
  const g4 = insertGoal.run('核心系统技术升级完成', '完成微服务改造，API响应时间降低40%，代码覆盖率提升到80%', 'okr', mgrId, g1Id, 1, null, null, null, 1, 68, 'on_track', 'team');
  const g4Id = g4.lastInsertRowid;
  const g5 = insertGoal.run('研发团队效能提升', '迭代周期缩短至2周，线上Bug数量降低50%', 'okr', mgrId, g1Id, 1, null, null, null, 1, 55, 'at_risk', 'team');
  const g5Id = g5.lastInsertRowid;

  // 个人目标（李明，Q4）
  const g6 = insertGoal.run('完成用户认证模块重构', '将旧JWT系统迁移至OAuth 2.0，支持多端登录，通过安全审计', 'okr', emp1Id, g4Id, 1, null, null, null, 1, 80, 'on_track', 'team');
  const g6Id = g6.lastInsertRowid;
  const g7 = insertGoal.run('技术影响力建设', '发布3篇技术博客，在公司内部分享2次技术方案', 'okr', emp1Id, null, 1, null, null, null, 1, 67, 'on_track', 'team');
  const g7Id = g7.lastInsertRowid;

  // 个人目标（王芳，Q4）
  const g8 = insertGoal.run('完成移动端性能优化', '首屏加载时间 < 2s，帧率稳定60fps，内存占用降低30%', 'okr', emp2Id, g3Id, 1, null, null, null, 1, 45, 'at_risk', 'team');
  const g8Id = g8.lastInsertRowid;

  // 产品部目标（Q4）
  const g9 = insertGoal.run('提升产品核心功能使用率', '新功能30日留存率提升到60%，用户反馈评分≥4.2', 'okr', pMgrId, g1Id, 1, null, null, null, 1, 62, 'on_track', 'team');
  const g9Id = g9.lastInsertRowid;

  // 销售目标（Q4，KPI型）
  const g10 = insertGoal.run('Q4销售额目标', '季度销售额完成1500万', 'kpi', sMgrId, g2Id, 1, 1500, 1120, '万元', 1, 75, 'on_track', 'team');

  // 历史周期（Q3）目标
  const gq3_1 = insertGoal.run('Q3 平台稳定性提升', '可用率从99.5%提升到99.8%', 'okr', mgrId, null, 2, null, null, null, 1, 100, 'completed', 'team');
  const gq3_2 = insertGoal.run('Q3 个人目标-完成API网关升级', '完成3个核心服务的网关迁移', 'okr', emp1Id, null, 2, 3, 3, '个', 1, 100, 'completed', 'team');

  // ===== 关键结果 =====
  const insertKR = db.prepare(`
    INSERT INTO key_results (goal_id, title, target_value, current_value, unit, progress, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertKR.run(g6Id, '完成OAuth 2.0核心模块开发', 1, 1, '个', 100, 'completed');
  insertKR.run(g6Id, '多端登录兼容测试通过率', 100, 95, '%', 95, 'on_track');
  insertKR.run(g6Id, '通过安全审计', 1, 0, '个', 0, 'at_risk');

  insertKR.run(g7Id, '发布技术博客', 3, 2, '篇', 67, 'on_track');
  insertKR.run(g7Id, '内部技术分享', 2, 1, '次', 50, 'on_track');

  insertKR.run(g4Id, 'API平均响应时间降低', 40, 28, '%', 70, 'on_track');
  insertKR.run(g4Id, '单元测试覆盖率提升至', 80, 72, '%', 90, 'on_track');
  insertKR.run(g4Id, '完成2个核心服务微服务改造', 2, 1, '个', 50, 'on_track');

  insertKR.run(g8Id, '首屏加载时间优化至', 2, 2.8, 's', 30, 'at_risk');
  insertKR.run(g8Id, '帧率稳定性达标', 60, 58, 'fps', 70, 'on_track');

  // ===== 绩效评估（Q4 周期1）=====
  const insertReview = db.prepare(`
    INSERT INTO reviews (cycle_id, reviewee_id, reviewer_id, self_goal_score, self_ability_score, self_comment, self_strengths, self_improvements, self_plan, self_submitted_at, manager_goal_score, manager_ability_score, manager_comment, manager_strengths, manager_improvements, manager_grade, manager_submitted_at, final_grade, final_score, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 李明：自评+经理评 已完成，等待校准
  insertReview.run(1, emp1Id, mgrId,
    4.2, 4.0,
    '本季度完成了用户认证模块的核心开发，OAuth迁移进度达80%，同时输出了2篇技术文章。',
    '技术攻关能力强，能快速定位并解决复杂问题，主动分享技术经验。',
    '在项目时间管理和跨团队沟通上还有提升空间，偶尔文档更新不及时。',
    '下季度完成剩余安全审计工作，加强与产品团队的沟通频率。',
    '2024-12-14 10:00:00',
    4.3, 4.2,
    '李明这季度的产出质量很高，OAuth迁移工作推进顺利，技术方案设计成熟。主动分享技术知识对团队有很大价值。',
    '技术深度扎实，乐于助人，有技术领导力潜质。',
    '建议加强业务理解，在技术方案设计时更多考虑产品侧的诉求。',
    'A', '2024-12-18 14:00:00',
    null, null, 'manager_submitted'
  );

  // 王芳：自评已提交，等待经理评分
  insertReview.run(1, emp2Id, mgrId,
    3.5, 3.8,
    '本季度专注移动端性能优化，首屏加载从4.2s优化到2.8s，但距目标2s还有差距。',
    '执行力强，测试覆盖面全，代码质量稳定。',
    '技术方案的前瞻性不足，需要加强在架构设计层面的思考。',
    '下季度继续优化加载性能，同时学习更多移动端架构知识。',
    '2024-12-13 16:00:00',
    null, null, null, null, null, null, null, null, null, 'self_submitted'
  );

  // 陈博：自评+经理评 完成
  insertReview.run(1, emp3Id, mgrId,
    4.5, 4.3,
    '本季度主导完成了微服务架构改造的第一个核心服务，质量超预期。',
    '技术能力全面，独当一面，对系统架构有深刻理解。',
    '有时候过于追求完美导致进度偏慢，需要在质量和效率之间更好地平衡。',
    '下季度完成第二个核心服务改造，探索服务网格技术。',
    '2024-12-12 11:00:00',
    4.6, 4.5,
    '陈博是本季度团队最强的产出者，微服务改造工作质量和效率都很高，是团队的技术标杆。',
    '技术全面，主动性强，能带动团队技术氛围。',
    '建议在大项目中承担更多项目管理职责，提升影响力边界。',
    'S', '2024-12-17 09:00:00',
    null, null, 'manager_submitted'
  );

  // 刘杰：待自评
  insertReview.run(1, emp4Id, mgrId, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 'pending');

  // 产品部员工
  insertReview.run(1, emp5Id, pMgrId,
    4.0, 4.1,
    '本季度完成了用户画像分析系统的需求设计，推动了两个重要功能的上线。',
    '需求分析能力强，用户洞察准确，与研发协作顺畅。',
    '需要加强数据分析能力，在量化产品指标上还需提升。',
    '下季度加强数据分析工具的使用，尝试主导一个功能的完整产品生命周期。',
    '2024-12-11 14:00:00',
    4.1, 4.2,
    '杨敏的产品思维清晰，需求质量高，与研发的协作效率很好。',
    '用户同理心强，逻辑严密，工作主动积极。',
    '建议加强数据驱动的产品决策能力，多用数据说话。',
    'A', '2024-12-16 10:00:00',
    null, null, 'manager_submitted'
  );

  // ===== Q3 历史评估（已完成）=====
  insertReview.run(2, emp1Id, mgrId,
    4.0, 4.0, 'Q3完成了API网关升级的核心工作，三个服务全部迁移完成。', '', '', '', '2024-09-19',
    4.1, 4.0, 'Q3表现优秀，API网关升级按时高质量完成。', '', '', 'A', '2024-09-24',
    'A', 4.05, 'completed'
  );

  insertReview.run(2, emp3Id, mgrId,
    4.8, 4.6, 'Q3主导设计了新的CI/CD流水线，部署效率提升60%。', '', '', '', '2024-09-18',
    4.8, 4.7, 'Q3产出突出，CI/CD改造是团队本季度最大亮点。', '', '', 'S', '2024-09-23',
    'S', 4.75, 'completed'
  );

  // ===== 360 反馈 =====
  const insertFeedback = db.prepare(`
    INSERT INTO feedback (cycle_id, from_id, to_id, relationship, score_quality, score_efficiency, score_teamwork, score_innovation, score_reliability, overall_score, comment, is_anonymous)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 李明收到的反馈（Q4）
  insertFeedback.run(1, emp3Id, emp1Id, 'peer', 4.5, 4.2, 4.8, 4.3, 4.7, 4.5, '李明的技术能力很强，在OAuth迁移项目上给了我很多帮助。协作意愿高，遇到问题能快速响应。', 1);
  insertFeedback.run(1, emp2Id, emp1Id, 'peer', 4.0, 4.3, 4.6, 4.0, 4.5, 4.3, '和李明合作非常愉快，他的技术文档写得很清晰，帮助我快速理解了认证模块的实现。', 1);
  insertFeedback.run(1, emp5Id, emp1Id, 'cross_dept', 4.3, 4.0, 4.5, 4.1, 4.4, 4.3, '跨部门协作中，李明对产品侧的需求理解很到位，给出的技术方案切实可行。', 1);
  insertFeedback.run(1, mgrId, emp1Id, 'superior', 4.4, 4.2, 4.7, 4.3, 4.6, 4.4, '李明在团队中是重要的技术支柱，技术分享对团队成长贡献显著。', 0);

  // 陈博收到的反馈（Q4）
  insertFeedback.run(1, emp1Id, emp3Id, 'peer', 4.8, 4.6, 4.5, 4.9, 4.8, 4.7, '陈博的架构思维超强，微服务改造方案设计非常清晰，是我学习的标杆。', 1);
  insertFeedback.run(1, emp2Id, emp3Id, 'peer', 4.7, 4.5, 4.3, 4.8, 4.6, 4.6, '技术能力一流，愿意帮助团队解决难题，但有时沟通风格可以更柔和一些。', 1);

  // 张伟（经理）收到的反馈（Q4）
  insertFeedback.run(1, emp1Id, mgrId, 'subordinate', 4.2, 4.0, 4.5, 4.0, 4.3, 4.2, '张经理对技术方向的把控很准确，给团队设定了清晰的目标。希望能有更多一对一的成长指导。', 1);
  insertFeedback.run(1, emp2Id, mgrId, 'subordinate', 4.0, 4.2, 4.6, 3.8, 4.4, 4.2, '团队协调做得很好，对我们的工作很支持。期待在职业发展规划上给予更多引导。', 1);
  insertFeedback.run(1, emp3Id, mgrId, 'subordinate', 4.3, 4.1, 4.7, 4.2, 4.5, 4.4, '张经理给了我很大的自主空间来做技术决策，非常信任和支持，是个好领导。', 1);

  // 王芳收到的反馈（Q4）
  insertFeedback.run(1, emp1Id, emp2Id, 'peer', 3.8, 4.0, 4.5, 3.7, 4.2, 4.0, '王芳做事认真负责，测试很仔细。期待她在技术深度上继续精进。', 1);

  // Q3历史反馈
  insertFeedback.run(2, emp3Id, emp1Id, 'peer', 4.3, 4.1, 4.6, 4.2, 4.5, 4.3, 'Q3表现很好，API网关项目完成质量高。', 1);
  insertFeedback.run(2, emp2Id, emp1Id, 'peer', 4.0, 4.2, 4.4, 3.9, 4.3, 4.2, '合作顺畅，沟通及时，可靠的队友。', 1);

  // ===== 1-on-1 面谈 =====
  const insertOoo = db.prepare(`
    INSERT INTO one_on_ones (manager_id, employee_id, cycle_id, scheduled_at, completed_at, status, agenda, notes, action_items)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // 张伟-李明
  insertOoo.run(mgrId, emp1Id, 1, '2024-12-20 14:00:00', null, 'scheduled',
    JSON.stringify(['Q4目标达成情况回顾', 'OAuth安全审计进展', '下季度规划沟通', '职业发展规划']),
    '', JSON.stringify([]));

  insertOoo.run(mgrId, emp1Id, 1, '2024-12-06 14:00:00', '2024-12-06 15:10:00', 'completed',
    JSON.stringify(['OAuth迁移进度review', '技术分享计划', '团队协作问题反馈']),
    'OAuth核心模块开发已完成，安全审计文档正在准备中。李明计划在年底前完成第三篇技术博客。团队内有一些跨部门沟通不畅的问题，需要建立更规范的沟通机制。',
    JSON.stringify([
      {id: 1, text: '整理OAuth安全审计文档', owner: '李明', due_date: '2024-12-18', done: true},
      {id: 2, text: '发送第三篇技术博客草稿给经理review', owner: '李明', due_date: '2024-12-20', done: false},
      {id: 3, text: '与产品部约定每周一次需求对齐会', owner: '张伟', due_date: '2024-12-10', done: true}
    ])
  );

  insertOoo.run(mgrId, emp1Id, 2, '2024-09-12 14:00:00', '2024-09-12 15:00:00', 'completed',
    JSON.stringify(['Q3 API网关项目总结', 'Q4目标制定讨论']),
    'Q3 API网关项目圆满完成，整体质量高。讨论了Q4要启动的OAuth认证升级项目，李明对技术方案已有初步想法。',
    JSON.stringify([
      {id: 1, text: '整理Q3项目总结文档', owner: '李明', due_date: '2024-09-20', done: true},
      {id: 2, text: '提交OAuth升级技术预研报告', owner: '李明', due_date: '2024-09-30', done: true}
    ])
  );

  // 张伟-王芳
  insertOoo.run(mgrId, emp2Id, 1, '2024-12-19 10:00:00', null, 'scheduled',
    JSON.stringify(['移动端性能优化进度review', '技术方案讨论', '下季度计划']),
    '', JSON.stringify([]));

  insertOoo.run(mgrId, emp2Id, 1, '2024-12-05 10:00:00', '2024-12-05 10:50:00', 'completed',
    JSON.stringify(['性能优化方案评审', '遇到的技术难点']),
    '当前首屏加载时间在2.8s，距离2s目标还有差距。主要瓶颈在于图片懒加载和JS bundle size问题。讨论了几个优化方向：WebP图片格式、代码分割、prefetch策略。',
    JSON.stringify([
      {id: 1, text: '实现图片WebP格式转换', owner: '王芳', due_date: '2024-12-12', done: true},
      {id: 2, text: '完成JS代码分割改造', owner: '王芳', due_date: '2024-12-18', done: false},
      {id: 3, text: '整理性能优化方案文档', owner: '王芳', due_date: '2024-12-15', done: true}
    ])
  );

  // 张伟-陈博
  insertOoo.run(mgrId, emp3Id, 1, '2024-12-18 16:00:00', null, 'scheduled',
    JSON.stringify(['微服务改造进展', '年终绩效自评review', '明年技术规划']),
    '', JSON.stringify([]));

  // 赵强-杨敏
  insertOoo.run(pMgrId, emp5Id, 1, '2024-12-17 15:00:00', '2024-12-17 16:00:00', 'completed',
    JSON.stringify(['用户画像系统进展', '数据分析能力提升计划']),
    '用户画像系统第一期已上线，初期数据反馈良好。讨论了杨敏的数据分析能力提升计划，建议学习SQL高级用法和基础的机器学习概念。',
    JSON.stringify([
      {id: 1, text: '完成SQL进阶学习（完成DataCamp课程）', owner: '杨敏', due_date: '2025-01-31', done: false},
      {id: 2, text: '输出用户画像系统一期数据分析报告', owner: '杨敏', due_date: '2024-12-25', done: false}
    ])
  );

  // ===== 通知 =====
  const insertNotif = db.prepare(`
    INSERT INTO notifications (user_id, type, title, body, link, is_read)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  // 李明的通知
  insertNotif.run(emp1Id, 'reminder', '绩效自评已提交', '您的Q4绩效自评已成功提交，请等待经理完成评分。', 'reviews', 1);
  insertNotif.run(emp1Id, 'feedback', '收到新的360反馈', '陈博刚刚为您提交了一条反馈，快去查看吧。', 'feedback', 0);
  insertNotif.run(emp1Id, 'reminder', '行动项到期提醒', '「发送第三篇技术博客草稿」即将在12月20日到期，请及时完成。', 'oneOnOne', 0);
  insertNotif.run(emp1Id, 'system', '1-on-1面谈已安排', '与张伟的1-on-1面谈已安排在12月20日14:00，请提前准备议题。', 'oneOnOne', 0);

  // 张伟（经理）的通知
  insertNotif.run(mgrId, 'reminder', '待评分提醒：王芳', '王芳已完成绩效自评，请尽快完成经理评分（截止12月22日）。', 'reviews', 0);
  insertNotif.run(mgrId, 'reminder', '待评分提醒：刘杰', '刘杰尚未完成绩效自评，请提醒其尽快提交（截止12月15日）。', 'reviews', 0);
  insertNotif.run(mgrId, 'feedback', '收到新的360反馈', '有团队成员为您提交了反馈，查看最新360反馈结果。', 'feedback', 0);
  insertNotif.run(mgrId, 'system', '绩效周期进入经理评分阶段', 'Q4绩效评估已进入经理评分阶段，请在12月22日前完成所有团队成员的评分。', 'reviews', 1);
  insertNotif.run(mgrId, 'system', '1-on-1已完成', '与王芳的1-on-1面谈已标记为完成，行动项已更新。', 'oneOnOne', 1);

  // HR的通知
  insertNotif.run(hrId, 'system', 'Q4绩效评估进展', '研发部已有3/4人完成自评，产品部已有1/2人完成自评，销售部和市场部进展滞后，请关注。', 'reviews', 0);
  insertNotif.run(hrId, 'reminder', '校准会议提醒', 'Q4绩效校准会议将在12月28日举行，请提前确认各部门经理参与。', 'calibration', 0);
  insertNotif.run(hrId, 'system', '新员工入职提醒', '下周有1名新员工入职（研发部），请做好入职准备。', 'employees', 1);

  // 其他员工
  insertNotif.run(emp2Id, 'reminder', '绩效自评已提交', '您的Q4绩效自评已成功提交，请等待经理完成评分。', 'reviews', 1);
  insertNotif.run(emp2Id, 'feedback', '收到新的360反馈', '李明刚刚为您提交了一条反馈。', 'feedback', 0);
  insertNotif.run(emp3Id, 'system', '绩效评分进入校准阶段', '您的Q4绩效已提交经理评分（建议S级），目前等待HR校准确认。', 'reviews', 0);
  insertNotif.run(emp5Id, 'system', '1-on-1面谈已完成', '与赵强的1-on-1面谈已标记为完成，请查看行动项详情。', 'oneOnOne', 0);

  // ===== 校准数据（基于已有manager_submitted的评估）=====
  const insertCalib = db.prepare(`
    INSERT INTO calibration (cycle_id, employee_id, dept_id, preliminary_grade, final_grade, rank_in_dept, notes, calibrated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Q4 校准（部分完成）
  insertCalib.run(1, emp3Id, 1, 'S', 'S', 1, '产出突出，微服务改造质量超预期，校准后维持S级', hrId);
  insertCalib.run(1, emp1Id, 1, 'A', null, 2, '待HR校准确认', null);
  insertCalib.run(1, emp5Id, 2, 'A', null, 1, '待HR校准确认', null);

  // Q3 校准（已完成）
  insertCalib.run(2, emp3Id, 1, 'S', 'S', 1, 'Q3表现最佳', hrId);
  insertCalib.run(2, emp1Id, 1, 'A', 'A', 2, 'Q3稳定优秀', hrId);

  console.log('✅ 数据库初始化完成');
}

module.exports = { getDb, initDb };
