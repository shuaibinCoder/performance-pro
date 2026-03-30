const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb, initDb } = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
// 禁止浏览器缓存 JS/CSS 文件，确保每次都拿到最新版本
app.use('/js', express.static(path.join(__dirname, 'public/js'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-store')
}));
// 重要：{ index: false } 防止express.static将/映射到index.html
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

const db = initDb();

// ============ Session 管理 ============
const sessions = new Map();
let _cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (now - s.createdAt > 24 * 60 * 60 * 1000) sessions.delete(token);
  }
}, 60 * 60 * 1000);

function createSession(user) {
  const token = uuidv4();
  sessions.set(token, { ...user, createdAt: Date.now() });
  return token;
}

// ============ 中间件 ============
function auth(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  if (!token || !sessions.has(token)) return res.status(401).json({ error: '未登录' });
  req.user = sessions.get(token);
  next();
}
function requireHR(req, res, next) {
  if (req.user.role !== 'hr') return res.status(403).json({ error: '权限不足' });
  next();
}
function requireManager(req, res, next) {
  if (!['hr', 'manager'].includes(req.user.role)) return res.status(403).json({ error: '权限不足' });
  next();
}

// ============ 工具函数 ============
function getEmployee(id) {
  return db.prepare(`
    SELECT e.*, d.name as dept_name, d.color as dept_color
    FROM employees e LEFT JOIN departments d ON e.department_id = d.id
    WHERE e.id = ?
  `).get(id);
}

// ============ 认证 ============
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: '请填写邮箱和密码' });
  const user = getEmployee(db.prepare('SELECT id FROM employees WHERE email = ?').get(email)?.id);
  if (!user || !bcrypt.compareSync(password, user.password_hash || '')) {
    return res.status(401).json({ error: '邮箱或密码错误' });
  }
  const { password_hash, ...safeUser } = user;
  const token = createSession(safeUser);
  res.json({ token, user: safeUser });
});

app.post('/api/auth/logout', auth, (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  sessions.delete(token);
  res.json({ ok: true });
});

app.post('/api/auth/change-password', (req, res) => {
  const { email, old_password, new_password } = req.body;
  if (!email || !old_password || !new_password) return res.status(400).json({ error: '请填写完整信息' });
  if (new_password.length < 6) return res.status(400).json({ error: '新密码至少 6 位' });
  const user = db.prepare('SELECT id, password_hash FROM employees WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(old_password, user.password_hash || '')) {
    return res.status(401).json({ error: '当前密码不正确' });
  }
  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE employees SET password_hash = ? WHERE id = ?').run(newHash, user.id);
  // 注销该用户所有 session
  for (const [token, s] of sessions) {
    if (s.id === user.id) sessions.delete(token);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = getEmployee(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  const { password_hash, ...safeUser } = user;
  res.json(safeUser);
});

app.get('/api/auth/demo-login', (req, res) => {
  const roleMap = { hr: 'admin@company.com', manager: 'zhang.wei@company.com', employee: 'li.ming@company.com' };
  const email = roleMap[req.query.role] || roleMap.hr;
  const row = db.prepare('SELECT id FROM employees WHERE email = ?').get(email);
  if (!row) return res.status(404).json({ error: '演示用户不存在' });
  const user = getEmployee(row.id);
  const { password_hash, ...safeUser } = user;
  const token = createSession(safeUser);
  res.json({ token, user: safeUser });
});

// ============ 部门 ============
app.get('/api/departments', auth, (req, res) => {
  const rows = db.prepare(`
    SELECT d.*, e.name as head_name,
      (SELECT COUNT(*) FROM employees WHERE department_id = d.id AND status = 'active') as emp_count
    FROM departments d LEFT JOIN employees e ON d.head_id = e.id
    ORDER BY d.id
  `).all();
  res.json(rows);
});

// ============ 员工 ============
app.get('/api/employees', auth, (req, res) => {
  const { dept, role, search, status = 'active' } = req.query;
  let sql = `
    SELECT e.id, e.name, e.email, e.role, e.department_id, e.title, e.level,
           e.avatar_color, e.hire_date, e.status, e.manager_id,
           d.name as dept_name, d.color as dept_color,
           m.name as manager_name
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN employees m ON e.manager_id = m.id
    WHERE 1=1
  `;
  const params = [];
  if (status) { sql += ' AND e.status = ?'; params.push(status); }
  if (dept) { sql += ' AND e.department_id = ?'; params.push(dept); }
  if (role) { sql += ' AND e.role = ?'; params.push(role); }
  if (search) { sql += ' AND (e.name LIKE ? OR e.email LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY e.department_id, e.id';
  res.json(db.prepare(sql).all(...params));
});

app.get('/api/employees/:id', auth, (req, res) => {
  const user = getEmployee(req.params.id);
  if (!user) return res.status(404).json({ error: '员工不存在' });
  const { password_hash, ...safeUser } = user;
  res.json(safeUser);
});

app.post('/api/employees', auth, requireHR, (req, res) => {
  const { name, email, role = 'employee', department_id, title, level, hire_date, manager_id } = req.body;
  if (!name || !email) return res.status(400).json({ error: '姓名和邮箱不能为空' });
  const colors = ['#4F46E5','#0891B2','#16A34A','#D97706','#DC2626','#7C3AED','#DB2777','#0D9488'];
  const avatar_color = colors[Math.floor(Math.random() * colors.length)];
  const password_hash = bcrypt.hashSync('123456', 10);
  try {
    const r = db.prepare(`
      INSERT INTO employees (name, email, password_hash, role, department_id, title, level, avatar_color, hire_date, manager_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email, password_hash, role, department_id || null, title || null, level || null, avatar_color, hire_date || null, manager_id || null);
    res.json(getEmployee(r.lastInsertRowid));
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: '该邮箱已存在' });
    throw e;
  }
});

app.put('/api/employees/:id', auth, requireHR, (req, res) => {
  const { name, role, department_id, title, level, hire_date, manager_id, status } = req.body;
  const emp = db.prepare('SELECT id FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  db.prepare(`
    UPDATE employees SET name=COALESCE(?,name), role=COALESCE(?,role),
    department_id=COALESCE(?,department_id), title=COALESCE(?,title),
    level=COALESCE(?,level), hire_date=COALESCE(?,hire_date),
    manager_id=COALESCE(?,manager_id), status=COALESCE(?,status)
    WHERE id=?
  `).run(
    name || null, role || null,
    department_id ? +department_id : null, title || null,
    level || null, hire_date || null,
    manager_id ? +manager_id : null, status || null,
    req.params.id
  );
  res.json(getEmployee(req.params.id));
});

// ============ 绩效周期 ============
app.get('/api/cycles', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM cycles ORDER BY id DESC').all());
});

app.get('/api/cycles/active', auth, (req, res) => {
  const cycle = db.prepare(`SELECT * FROM cycles WHERE status IN ('active','calibrating') ORDER BY id DESC LIMIT 1`).get();
  res.json(cycle || null);
});

app.get('/api/cycles/:id', auth, (req, res) => {
  const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(req.params.id);
  if (!cycle) return res.status(404).json({ error: '周期不存在' });
  // 统计完成情况
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status != 'pending' THEN 1 ELSE 0 END) as self_done,
      SUM(CASE WHEN status IN ('manager_submitted','calibrated','published','completed') THEN 1 ELSE 0 END) as manager_done,
      SUM(CASE WHEN status IN ('completed','published') THEN 1 ELSE 0 END) as published,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as confirmed
    FROM reviews WHERE cycle_id = ?
  `).get(req.params.id);
  res.json({ ...cycle, stats });
});

app.post('/api/cycles', auth, requireHR, (req, res) => {
  const { name, type, start_date, end_date, self_review_end, manager_review_end, calibration_end } = req.body;
  if (!name) return res.status(400).json({ error: '周期名称不能为空' });
  const r = db.prepare(`
    INSERT INTO cycles (name, type, start_date, end_date, self_review_end, manager_review_end, calibration_end, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
  `).run(name, type || 'quarterly', start_date || null, end_date || null, self_review_end || null, manager_review_end || null, calibration_end || null);
  res.json(db.prepare('SELECT * FROM cycles WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/cycles/:id/status', auth, requireHR, (req, res) => {
  const { status } = req.body;
  const valid = ['draft','active','calibrating','completed'];
  if (!valid.includes(status)) return res.status(400).json({ error: '无效状态' });
  // 标记完成前检查所有员工是否已确认
  if (status === 'completed') {
    const unconfirmed = db.prepare(`SELECT COUNT(*) as cnt FROM reviews WHERE cycle_id=? AND status != 'completed'`).get(req.params.id);
    if (unconfirmed.cnt > 0) {
      return res.status(400).json({ error: `还有 ${unconfirmed.cnt} 位员工未确认绩效结果，无法标记为完成` });
    }
  }
  db.prepare('UPDATE cycles SET status = ? WHERE id = ?').run(status, req.params.id);
  // 激活时为所有活跃员工创建评估记录并发通知
  if (status === 'active') {
    const cycle = db.prepare('SELECT * FROM cycles WHERE id = ?').get(req.params.id);
    const employees = db.prepare(`
      SELECT e.id, e.manager_id FROM employees e WHERE e.status = 'active' AND e.role != 'hr'
    `).all();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO reviews (cycle_id, reviewee_id, reviewer_id, status)
      VALUES (?, ?, ?, 'pending')
    `);
    const insertNotif = db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'reminder', ?, ?, 'reviews')`);
    for (const e of employees) {
      if (e.manager_id) insert.run(req.params.id, e.id, e.manager_id);
      insertNotif.run(e.id,
        `${cycle.name} 绩效评估已开始`,
        `本周期绩效评估已启动，请先完善您的目标，然后填写绩效自评。截止日期：${cycle.self_review_end || '待定'}`
      );
    }
  }
  res.json(db.prepare('SELECT * FROM cycles WHERE id = ?').get(req.params.id));
});

// ============ 目标 ============
app.get('/api/goals', auth, (req, res) => {
  const { cycle_id = 1, type, owner_id, visibility } = req.query;
  let sql = `
    SELECT g.*,
      e.name as owner_name, e.avatar_color as owner_color, d.name as dept_name,
      pg.title as parent_title,
      (SELECT COUNT(*) FROM key_results WHERE goal_id = g.id) as kr_count,
      (SELECT AVG(progress) FROM key_results WHERE goal_id = g.id) as kr_avg_progress
    FROM goals g
    LEFT JOIN employees e ON g.owner_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN goals pg ON g.parent_id = pg.id
    WHERE g.cycle_id = ?
  `;
  const params = [cycle_id];

  if (type === 'public') {
    sql += ` AND g.visibility = 'public'`;
  } else if (type === 'mine') {
    sql += ` AND g.owner_id = ?`;
    params.push(req.user.id);
  } else if (type === 'team' && req.user.role !== 'hr') {
    // 经理看团队目标，员工看自己+所在部门的
    if (req.user.role === 'manager') {
      const teamIds = db.prepare('SELECT id FROM employees WHERE manager_id = ?').all(req.user.id).map(e => e.id);
      teamIds.push(req.user.id);
      sql += ` AND g.owner_id IN (${teamIds.join(',')})`;
    } else {
      sql += ` AND (g.owner_id = ? OR g.visibility = 'public')`;
      params.push(req.user.id);
    }
  }
  if (owner_id) { sql += ' AND g.owner_id = ?'; params.push(owner_id); }
  sql += ' ORDER BY g.visibility DESC, g.created_at ASC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/goals', auth, (req, res) => {
  const { title, description, type, parent_id, cycle_id, target_value, unit, weight, visibility } = req.body;
  if (!title) return res.status(400).json({ error: '目标标题不能为空' });
  const r = db.prepare(`
    INSERT INTO goals (title, description, type, owner_id, parent_id, cycle_id, target_value, unit, weight, visibility)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, description || null, type || 'okr', req.user.id, parent_id || null, cycle_id || 1, target_value || null, unit || null, weight || 1, visibility || 'team');
  res.json(db.prepare('SELECT g.*, e.name as owner_name FROM goals g LEFT JOIN employees e ON g.owner_id = e.id WHERE g.id = ?').get(r.lastInsertRowid));
});

app.put('/api/goals/:id', auth, (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!goal) return res.status(404).json({ error: '目标不存在' });
  if (goal.owner_id !== req.user.id && req.user.role === 'employee') return res.status(403).json({ error: '无权修改' });
  const { title, description, progress, status, current_value, target_value } = req.body;
  db.prepare(`
    UPDATE goals SET
      title=COALESCE(?,title), description=COALESCE(?,description),
      progress=COALESCE(?,progress), status=COALESCE(?,status),
      current_value=COALESCE(?,current_value), target_value=COALESCE(?,target_value)
    WHERE id=?
  `).run(title || null, description || null, progress ?? null, status || null, current_value ?? null, target_value ?? null, req.params.id);
  res.json(db.prepare('SELECT g.*, e.name as owner_name FROM goals g LEFT JOIN employees e ON g.owner_id = e.id WHERE g.id = ?').get(req.params.id));
});

app.delete('/api/goals/:id', auth, (req, res) => {
  const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(req.params.id);
  if (!goal) return res.status(404).json({ error: '目标不存在' });
  if (goal.owner_id !== req.user.id && req.user.role !== 'hr') return res.status(403).json({ error: '无权删除' });
  db.prepare('DELETE FROM key_results WHERE goal_id = ?').run(req.params.id);
  db.prepare('DELETE FROM goals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// 关键结果
app.get('/api/goals/:id/krs', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM key_results WHERE goal_id = ? ORDER BY id').all(req.params.id));
});

app.post('/api/goals/:id/krs', auth, (req, res) => {
  const { title, target_value, unit } = req.body;
  if (!title) return res.status(400).json({ error: 'KR标题不能为空' });
  const r = db.prepare('INSERT INTO key_results (goal_id, title, target_value, unit) VALUES (?, ?, ?, ?)').run(req.params.id, title, target_value || null, unit || null);
  res.json(db.prepare('SELECT * FROM key_results WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/goals/:goalId/krs/:krId', auth, (req, res) => {
  const { current_value, progress, status } = req.body;
  db.prepare('UPDATE key_results SET current_value=COALESCE(?,current_value), progress=COALESCE(?,progress), status=COALESCE(?,status) WHERE id=? AND goal_id=?')
    .run(current_value ?? null, progress ?? null, status || null, req.params.krId, req.params.goalId);
  // 更新目标整体进度
  const krs = db.prepare('SELECT progress FROM key_results WHERE goal_id = ?').all(req.params.goalId);
  if (krs.length > 0) {
    const avg = Math.round(krs.reduce((s, k) => s + k.progress, 0) / krs.length);
    db.prepare('UPDATE goals SET progress = ? WHERE id = ?').run(avg, req.params.goalId);
  }
  res.json(db.prepare('SELECT * FROM key_results WHERE id = ?').get(req.params.krId));
});

// ============ 绩效评估 ============
app.get('/api/reviews', auth, (req, res) => {
  const { cycle_id, type } = req.query;
  let sql = `
    SELECT r.*,
      e.name as reviewee_name, e.title as reviewee_title,
      e.avatar_color, e.department_id,
      d.name as dept_name,
      m.name as reviewer_name
    FROM reviews r
    LEFT JOIN employees e ON r.reviewee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN employees m ON r.reviewer_id = m.id
    WHERE 1=1
  `;
  const params = [];
  if (cycle_id) { sql += ' AND r.cycle_id = ?'; params.push(cycle_id); }
  if (type === 'my') {
    sql += ' AND r.reviewee_id = ?'; params.push(req.user.id);
  } else if (type === 'team' && req.user.role !== 'hr') {
    sql += ' AND r.reviewer_id = ?'; params.push(req.user.id);
  }
  sql += ' ORDER BY r.id';
  res.json(db.prepare(sql).all(...params));
});

app.put('/api/reviews/:id/self', auth, (req, res) => {
  const { self_goal_score, self_ability_score, self_comment, self_strengths, self_improvements, self_plan, self_goal_details } = req.body;
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: '评估记录不存在' });
  if (review.reviewee_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  if (review.status !== 'pending') return res.status(400).json({ error: '已提交，不可重复提交' });
  db.prepare(`
    UPDATE reviews SET
      self_goal_score=?, self_ability_score=?, self_comment=?,
      self_strengths=?, self_improvements=?, self_plan=?,
      self_goal_details=?,
      self_submitted_at=datetime('now','localtime'), status='self_submitted'
    WHERE id=?
  `).run(self_goal_score ?? null, self_ability_score ?? null, self_comment || null, self_strengths || null, self_improvements || null, self_plan || null, self_goal_details || null, req.params.id);
  // 发通知给经理
  if (review.reviewer_id) {
    const reviewee = db.prepare('SELECT name FROM employees WHERE id = ?').get(review.reviewee_id);
    db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'reminder', ?, ?, 'reviews')`)
      .run(review.reviewer_id, `待评分提醒：${reviewee?.name}`, `${reviewee?.name}已完成绩效自评，请尽快完成经理评分。`);
  }
  res.json(db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id));
});

app.put('/api/reviews/:id/manager', auth, requireManager, (req, res) => {
  const { manager_goal_score, manager_ability_score, manager_comment, manager_strengths, manager_improvements, manager_grade } = req.body;
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: '评估记录不存在' });
  if (review.reviewer_id !== req.user.id && req.user.role !== 'hr') return res.status(403).json({ error: '无权操作' });
  db.prepare(`
    UPDATE reviews SET
      manager_goal_score=?, manager_ability_score=?, manager_comment=?,
      manager_strengths=?, manager_improvements=?, manager_grade=?,
      manager_submitted_at=datetime('now','localtime'), status='manager_submitted'
    WHERE id=?
  `).run(manager_goal_score ?? null, manager_ability_score ?? null, manager_comment || null, manager_strengths || null, manager_improvements || null, manager_grade || null, req.params.id);
  // 更新校准记录
  const emp = db.prepare('SELECT department_id FROM employees WHERE id = ?').get(review.reviewee_id);
  db.prepare(`
    INSERT INTO calibration (cycle_id, employee_id, dept_id, preliminary_grade) VALUES (?, ?, ?, ?)
    ON CONFLICT(cycle_id, employee_id) DO UPDATE SET preliminary_grade = excluded.preliminary_grade
  `).run(review.cycle_id, review.reviewee_id, emp?.department_id, manager_grade);
  // 通知员工：经理已评分
  const reviewer = db.prepare('SELECT name FROM employees WHERE id = ?').get(review.reviewer_id || req.user.id);
  db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'review', ?, ?, 'reviews')`)
    .run(review.reviewee_id, '经理已完成绩效评分', `${reviewer?.name || '你的经理'}已完成对你本周期的绩效评分，等待HR发布最终结果。`);
  res.json(db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id));
});

app.put('/api/reviews/:id/grade', auth, requireHR, (req, res) => {
  const { final_grade } = req.body;
  const gradeScore = { S:5, A:4, B:3, C:2, D:1 };
  if (!gradeScore[final_grade]) return res.status(400).json({ error: '无效等级' });
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: '评估记录不存在' });
  db.prepare(`UPDATE reviews SET final_grade=?, final_score=?, status='published' WHERE id=?`)
    .run(final_grade, gradeScore[final_grade], req.params.id);
  // 通知员工
  db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'review', '绩效结果待确认', '您的绩效评估结果已发布，请查看并确认。', 'reviews')`)
    .run(review.reviewee_id);
  res.json(db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id));
});

app.put('/api/reviews/:id/confirm', auth, (req, res) => {
  const { comment } = req.body;
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id);
  if (!review) return res.status(404).json({ error: '评估记录不存在' });
  if (review.reviewee_id !== req.user.id) return res.status(403).json({ error: '只能确认自己的评估结果' });
  if (review.status !== 'published') return res.status(400).json({ error: '评估结果尚未发布' });
  db.prepare(`UPDATE reviews SET status='completed', employee_confirmed_at=datetime('now','localtime'), employee_confirm_comment=? WHERE id=?`)
    .run(comment || null, req.params.id);
  // 通知经理
  if (review.reviewer_id) {
    const reviewee = db.prepare('SELECT name FROM employees WHERE id = ?').get(review.reviewee_id);
    db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'system', ?, ?, 'reviews')`)
      .run(review.reviewer_id, `${reviewee?.name} 已确认绩效结果`, `${reviewee?.name} 已查看并确认了本周期的绩效评估结果。`);
  }
  // 检查本周期是否所有员工已确认，若是则通知HR
  const unconfirmed = db.prepare(`SELECT COUNT(*) as cnt FROM reviews WHERE cycle_id=? AND status != 'completed'`).get(review.cycle_id);
  if (unconfirmed.cnt === 0) {
    const hrUsers = db.prepare(`SELECT id FROM employees WHERE role='hr' AND status='active'`).all();
    const cycle = db.prepare('SELECT name FROM cycles WHERE id = ?').get(review.cycle_id);
    for (const hr of hrUsers) {
      db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'system', ?, ?, 'cycles')`)
        .run(hr.id, `${cycle?.name} 所有员工已确认绩效结果`, `本周期所有员工已完成绩效确认，可以将绩效周期标记为完成。`);
    }
  }
  res.json(db.prepare('SELECT * FROM reviews WHERE id = ?').get(req.params.id));
});

// ============ 360 反馈 ============
app.get('/api/feedback', auth, (req, res) => {
  const { direction, cycle_id = 1 } = req.query;
  let sql = `
    SELECT f.*,
      fe.name as from_name, fe.avatar_color as from_color, fe.title as from_title,
      te.name as to_name, te.avatar_color as to_color, te.title as to_title
    FROM feedback f
    LEFT JOIN employees fe ON f.from_id = fe.id
    LEFT JOIN employees te ON f.to_id = te.id
    WHERE f.cycle_id = ?
  `;
  const params = [cycle_id];
  if (direction === 'sent') { sql += ' AND f.from_id = ?'; params.push(req.user.id); }
  else if (direction === 'received') { sql += ' AND f.to_id = ?'; params.push(req.user.id); }
  sql += ' ORDER BY f.created_at DESC';
  const rows = db.prepare(sql).all(...params);
  // 匿名处理：接收者不看到发送者信息（匿名反馈）
  if (direction === 'received') {
    return res.json(rows.map(r => r.is_anonymous ? { ...r, from_id: null, from_name: '匿名', from_color: '#94A3B8' } : r));
  }
  res.json(rows);
});

app.post('/api/feedback', auth, (req, res) => {
  const { cycle_id = 1, to_id, relationship, score_quality, score_efficiency, score_teamwork, score_innovation, score_reliability, comment, is_anonymous = 1 } = req.body;
  if (to_id === req.user.id) return res.status(400).json({ error: '不能给自己反馈' });
  if (!to_id) return res.status(400).json({ error: '请选择反馈对象' });
  const overall = ((+score_quality + +score_efficiency + +score_teamwork + +score_innovation + +score_reliability) / 5).toFixed(2);
  const r = db.prepare(`
    INSERT INTO feedback (cycle_id, from_id, to_id, relationship, score_quality, score_efficiency, score_teamwork, score_innovation, score_reliability, overall_score, comment, is_anonymous)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(cycle_id, req.user.id, to_id, relationship || 'peer', score_quality, score_efficiency, score_teamwork, score_innovation, score_reliability, overall, comment, is_anonymous ? 1 : 0);
  // 通知被反馈者
  db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'feedback', '收到新的360反馈', '有人为您提交了一条反馈，快去查看吧。', 'feedback')`)
    .run(to_id);
  res.json(db.prepare('SELECT * FROM feedback WHERE id = ?').get(r.lastInsertRowid));
});

app.delete('/api/feedback/:id', auth, (req, res) => {
  const fb = db.prepare('SELECT * FROM feedback WHERE id = ?').get(req.params.id);
  if (!fb) return res.status(404).json({ error: '反馈不存在' });
  if (fb.from_id !== req.user.id) return res.status(403).json({ error: '无权删除' });
  db.prepare('DELETE FROM feedback WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ============ 1-on-1 ============
app.get('/api/oneononos', auth, (req, res) => {
  const { status, employee_id } = req.query;
  let sql = `
    SELECT o.*,
      m.name as manager_name, m.avatar_color as manager_color,
      e.name as employee_name, e.avatar_color as employee_color,
      e.title as employee_title, e.department_id
    FROM one_on_ones o
    LEFT JOIN employees m ON o.manager_id = m.id
    LEFT JOIN employees e ON o.employee_id = e.id
    WHERE (o.manager_id = ? OR o.employee_id = ?)
  `;
  const params = [req.user.id, req.user.id];
  if (status) { sql += ' AND o.status = ?'; params.push(status); }
  if (employee_id) { sql += ' AND o.employee_id = ?'; params.push(employee_id); }
  sql += ' ORDER BY o.scheduled_at DESC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/oneononos', auth, requireManager, (req, res) => {
  const { employee_id, cycle_id, scheduled_at, agenda } = req.body;
  if (!employee_id || !scheduled_at) return res.status(400).json({ error: '请填写员工和面谈时间' });
  const r = db.prepare(`
    INSERT INTO one_on_ones (manager_id, employee_id, cycle_id, scheduled_at, agenda)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.user.id, employee_id, cycle_id || 1, scheduled_at, JSON.stringify(agenda || []));
  // 通知员工
  const mgr = db.prepare('SELECT name FROM employees WHERE id = ?').get(req.user.id);
  db.prepare(`INSERT INTO notifications (user_id, type, title, body, link) VALUES (?, 'system', '1-on-1面谈已安排', ?, 'oneOnOne')`)
    .run(employee_id, `${mgr?.name}为您安排了一次1-on-1面谈，时间：${scheduled_at}`);
  res.json(db.prepare('SELECT * FROM one_on_ones WHERE id = ?').get(r.lastInsertRowid));
});

app.put('/api/oneononos/:id', auth, (req, res) => {
  const { status, notes, action_items, agenda } = req.body;
  const ooo = db.prepare('SELECT * FROM one_on_ones WHERE id = ?').get(req.params.id);
  if (!ooo) return res.status(404).json({ error: '面谈记录不存在' });
  if (ooo.manager_id !== req.user.id && ooo.employee_id !== req.user.id) return res.status(403).json({ error: '无权操作' });
  const completed_at = status === 'completed' ? new Date().toISOString().slice(0,19).replace('T',' ') : ooo.completed_at;
  db.prepare(`
    UPDATE one_on_ones SET
      status=COALESCE(?,status), notes=COALESCE(?,notes),
      action_items=COALESCE(?,action_items), agenda=COALESCE(?,agenda),
      completed_at=?
    WHERE id=?
  `).run(status || null, notes || null, action_items ? JSON.stringify(action_items) : null, agenda ? JSON.stringify(agenda) : null, completed_at, req.params.id);
  res.json(db.prepare('SELECT * FROM one_on_ones WHERE id = ?').get(req.params.id));
});

// ============ 通知 ============
app.get('/api/notifications', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id));
});

app.put('/api/notifications/read-all', auth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ ok: true });
});

app.put('/api/notifications/:id/read', auth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  res.json({ ok: true });
});

// ============ 绩效校准 ============
app.get('/api/calibration', auth, requireManager, (req, res) => {
  const { cycle_id = 1, dept_id } = req.query;
  let sql = `
    SELECT c.*, e.name, e.title, e.avatar_color, e.department_id,
           d.name as dept_name, d.color as dept_color,
           r.self_goal_score, r.self_ability_score,
           r.manager_goal_score, r.manager_ability_score,
           r.manager_grade, r.manager_comment, r.status as review_status
    FROM calibration c
    JOIN employees e ON c.employee_id = e.id
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN reviews r ON r.reviewee_id = c.employee_id AND r.cycle_id = c.cycle_id
    WHERE c.cycle_id = ?
  `;
  const params = [cycle_id];
  if (dept_id) { sql += ' AND e.department_id = ?'; params.push(dept_id); }
  if (req.user.role === 'manager') { sql += ' AND e.department_id = (SELECT department_id FROM employees WHERE id = ?)'; params.push(req.user.id); }
  sql += ' ORDER BY c.preliminary_grade, e.name';
  res.json(db.prepare(sql).all(...params));
});

app.put('/api/calibration/:empId', auth, requireManager, (req, res) => {
  const { cycle_id = 1, final_grade, notes } = req.body;
  db.prepare(`
    UPDATE calibration SET final_grade=?, notes=?, calibrated_by=?, calibrated_at=datetime('now','localtime')
    WHERE cycle_id=? AND employee_id=?
  `).run(final_grade, notes, req.user.id, cycle_id, req.params.empId);
  res.json({ ok: true });
});

// ============ 数据报表 ============
app.get('/api/reports/summary', auth, requireManager, (req, res) => {
  const { cycle_id = 1 } = req.query;
  const total = db.prepare('SELECT COUNT(*) as c FROM employees WHERE status = \'active\'').get().c;
  const reviews = db.prepare('SELECT COUNT(*) as total, SUM(CASE WHEN status != \'pending\' THEN 1 ELSE 0 END) as submitted FROM reviews WHERE cycle_id = ?').get(cycle_id);
  const avgScore = db.prepare('SELECT AVG(final_score) as avg FROM reviews WHERE cycle_id = ? AND final_score IS NOT NULL').get(cycle_id);
  const goalsTotal = db.prepare('SELECT COUNT(*) as c FROM goals WHERE cycle_id = ?').get(cycle_id).c;
  const goalsCompleted = db.prepare('SELECT COUNT(*) as c FROM goals WHERE cycle_id = ? AND status = \'completed\'').get(cycle_id).c;
  const feedbackCount = db.prepare('SELECT COUNT(*) as c FROM feedback WHERE cycle_id = ?').get(cycle_id).c;
  res.json({
    total_employees: total,
    review_total: reviews.total,
    review_submitted: reviews.submitted,
    review_completion_rate: reviews.total ? Math.round(reviews.submitted / reviews.total * 100) : 0,
    avg_score: avgScore.avg ? +avgScore.avg.toFixed(2) : null,
    goals_total: goalsTotal,
    goals_completed: goalsCompleted,
    goals_completion_rate: goalsTotal ? Math.round(goalsCompleted / goalsTotal * 100) : 0,
    feedback_count: feedbackCount,
  });
});

app.get('/api/reports/distribution', auth, requireManager, (req, res) => {
  const { cycle_id = 1 } = req.query;
  const rows = db.prepare(`
    SELECT final_grade as grade, COUNT(*) as count
    FROM reviews WHERE cycle_id = ? AND final_grade IS NOT NULL
    GROUP BY final_grade ORDER BY final_grade
  `).all(cycle_id);
  res.json(rows);
});

app.get('/api/reports/departments', auth, requireManager, (req, res) => {
  const { cycle_id = 1 } = req.query;
  const rows = db.prepare(`
    SELECT d.name as dept_name, d.color,
      COUNT(r.id) as total,
      SUM(CASE WHEN r.status != 'pending' THEN 1 ELSE 0 END) as submitted,
      AVG(r.final_score) as avg_score,
      SUM(CASE WHEN r.final_grade = 'S' THEN 1 ELSE 0 END) as s_count,
      SUM(CASE WHEN r.final_grade = 'A' THEN 1 ELSE 0 END) as a_count,
      SUM(CASE WHEN r.final_grade = 'B' THEN 1 ELSE 0 END) as b_count
    FROM departments d
    LEFT JOIN employees e ON e.department_id = d.id AND e.status = 'active'
    LEFT JOIN reviews r ON r.reviewee_id = e.id AND r.cycle_id = ?
    GROUP BY d.id ORDER BY d.id
  `).all(cycle_id);
  res.json(rows.map(r => ({ ...r, avg_score: r.avg_score ? +r.avg_score.toFixed(2) : null })));
});

app.get('/api/reports/employees', auth, requireManager, (req, res) => {
  const { cycle_id = 1, dept_id } = req.query;
  let sql = `
    SELECT e.id, e.name, e.title, e.avatar_color, d.name as dept_name, d.color as dept_color,
      r.final_grade, r.final_score, r.self_goal_score, r.manager_goal_score, r.status as review_status,
      (SELECT AVG(overall_score) FROM feedback WHERE to_id = e.id AND cycle_id = ?) as avg_feedback_score,
      (SELECT AVG(progress) FROM goals WHERE owner_id = e.id AND cycle_id = ?) as avg_goal_progress
    FROM employees e
    LEFT JOIN departments d ON e.department_id = d.id
    LEFT JOIN reviews r ON r.reviewee_id = e.id AND r.cycle_id = ?
    WHERE e.status = 'active'
  `;
  const params = [cycle_id, cycle_id, cycle_id];
  if (dept_id) { sql += ' AND e.department_id = ?'; params.push(dept_id); }
  if (req.user.role === 'manager') { sql += ' AND e.department_id = (SELECT department_id FROM employees WHERE id = ?)'; params.push(req.user.id); }
  sql += ' ORDER BY r.final_score DESC NULLS LAST, e.name';
  res.json(db.prepare(sql).all(...params));
});

// ============ 个人档案 ============
app.get('/api/profile/:empId', auth, (req, res) => {
  const empId = req.params.empId === 'me' ? req.user.id : +req.params.empId;
  if (empId !== req.user.id && req.user.role === 'employee') return res.status(403).json({ error: '无权查看他人档案' });

  const emp = getEmployee(empId);
  if (!emp) return res.status(404).json({ error: '员工不存在' });
  const { password_hash, ...safeEmp } = emp;

  // 历史绩效
  const history = db.prepare(`
    SELECT c.name as cycle_name, c.type, r.final_grade, r.final_score,
      r.self_goal_score, r.manager_goal_score, r.status
    FROM reviews r JOIN cycles c ON r.cycle_id = c.id
    WHERE r.reviewee_id = ? ORDER BY c.start_date DESC LIMIT 6
  `).all(empId);

  // 目标完成率（按周期）
  const goalStats = db.prepare(`
    SELECT c.name as cycle_name,
      COUNT(g.id) as total,
      SUM(CASE WHEN g.status = 'completed' THEN 1 ELSE 0 END) as completed,
      ROUND(AVG(g.progress)) as avg_progress
    FROM goals g JOIN cycles c ON g.cycle_id = c.id
    WHERE g.owner_id = ? GROUP BY g.cycle_id ORDER BY c.start_date DESC LIMIT 4
  `).all(empId);

  // 最新360反馈汇总
  const feedbackStats = db.prepare(`
    SELECT
      ROUND(AVG(score_quality),1) as avg_quality,
      ROUND(AVG(score_efficiency),1) as avg_efficiency,
      ROUND(AVG(score_teamwork),1) as avg_teamwork,
      ROUND(AVG(score_innovation),1) as avg_innovation,
      ROUND(AVG(score_reliability),1) as avg_reliability,
      ROUND(AVG(overall_score),1) as avg_overall,
      COUNT(*) as count
    FROM feedback WHERE to_id = ? AND cycle_id = (SELECT MAX(cycle_id) FROM feedback WHERE to_id = ?)
  `).get(empId, empId);

  // 近期行动项
  const actionItems = [];
  const ooos = db.prepare('SELECT action_items, scheduled_at FROM one_on_ones WHERE employee_id = ? AND action_items != \'[]\' ORDER BY scheduled_at DESC LIMIT 5').all(empId);
  for (const ooo of ooos) {
    try {
      const items = JSON.parse(ooo.action_items || '[]');
      items.forEach(i => actionItems.push({ ...i, meeting_date: ooo.scheduled_at }));
    } catch(e) {}
  }

  res.json({ employee: safeEmp, history, goalStats, feedbackStats, actionItems: actionItems.slice(0, 8) });
});

// ============ 页面路由 ============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/app', (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 绩效管理系统已启动: http://localhost:${PORT}`);
  console.log(`   演示账号（密码均为 123456）:`);
  console.log(`   HR管理员：admin@company.com`);
  console.log(`   研发经理：zhang.wei@company.com`);
  console.log(`   普通员工：li.ming@company.com\n`);
});
