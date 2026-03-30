// API 客户端
let _redirecting = false;

const API = {
  async request(method, path, data) {
    const token = localStorage.getItem('token');
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    };
    if (data !== undefined) opts.body = JSON.stringify(data);
    let res;
    try {
      res = await fetch(path, opts);
    } catch(e) {
      throw new Error('网络错误，请检查服务器');
    }
    if (res.status === 401) {
      if (!_redirecting) {
        _redirecting = true;
        localStorage.clear();
        window.location.href = '/';
      }
      return null;
    }
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || '请求失败');
    return json;
  },
  get: (path) => API.request('GET', path),
  post: (path, data) => API.request('POST', path, data),
  put: (path, data) => API.request('PUT', path, data),
  del: (path) => API.request('DELETE', path),
};

// 接口封装
const $api = {
  auth: {
    me: () => API.get('/api/auth/me'),
    logout: () => API.post('/api/auth/logout'),
    demo: (role) => API.get('/api/auth/demo-login?role=' + role),
  },
  employees: {
    list: (p={}) => API.get('/api/employees?' + new URLSearchParams(p)),
    get: (id) => API.get(`/api/employees/${id}`),
    create: (d) => API.post('/api/employees', d),
    update: (id, d) => API.put(`/api/employees/${id}`, d),
  },
  departments: {
    list: () => API.get('/api/departments'),
  },
  cycles: {
    list: () => API.get('/api/cycles'),
    active: () => API.get('/api/cycles/active'),
    get: (id) => API.get(`/api/cycles/${id}`),
    create: (d) => API.post('/api/cycles', d),
    setStatus: (id, status) => API.put(`/api/cycles/${id}/status`, { status }),
  },
  goals: {
    list: (p={}) => API.get('/api/goals?' + new URLSearchParams(p)),
    create: (d) => API.post('/api/goals', d),
    update: (id, d) => API.put(`/api/goals/${id}`, d),
    del: (id) => API.del(`/api/goals/${id}`),
    krs: (id) => API.get(`/api/goals/${id}/krs`),
    addKR: (id, d) => API.post(`/api/goals/${id}/krs`, d),
    updateKR: (gId, krId, d) => API.put(`/api/goals/${gId}/krs/${krId}`, d),
  },
  reviews: {
    list: (p={}) => API.get('/api/reviews?' + new URLSearchParams(p)),
    submitSelf: (id, d) => API.put(`/api/reviews/${id}/self`, d),
    submitManager: (id, d) => API.put(`/api/reviews/${id}/manager`, d),
    setGrade: (id, grade) => API.put(`/api/reviews/${id}/grade`, { final_grade: grade }),
    confirm: (id, d) => API.put(`/api/reviews/${id}/confirm`, d),
  },
  feedback: {
    list: (p={}) => API.get('/api/feedback?' + new URLSearchParams(p)),
    submit: (d) => API.post('/api/feedback', d),
    del: (id) => API.del(`/api/feedback/${id}`),
  },
  oneOnOne: {
    list: (p={}) => API.get('/api/oneononos?' + new URLSearchParams(p)),
    create: (d) => API.post('/api/oneononos', d),
    update: (id, d) => API.put(`/api/oneononos/${id}`, d),
  },
  notifications: {
    list: () => API.get('/api/notifications'),
    readAll: () => API.put('/api/notifications/read-all'),
    read: (id) => API.put(`/api/notifications/${id}/read`),
  },
  calibration: {
    list: (p={}) => API.get('/api/calibration?' + new URLSearchParams(p)),
    update: (empId, d) => API.put(`/api/calibration/${empId}`, d),
  },
  reports: {
    summary: (cId=1) => API.get(`/api/reports/summary?cycle_id=${cId}`),
    distribution: (cId=1) => API.get(`/api/reports/distribution?cycle_id=${cId}`),
    departments: (cId=1) => API.get(`/api/reports/departments?cycle_id=${cId}`),
    employees: (cId=1, dId) => API.get(`/api/reports/employees?cycle_id=${cId}${dId?'&dept_id='+dId:''}`),
  },
  profile: (id) => API.get(`/api/profile/${id}`),
};

// 工具函数
const Utils = {
  gradeColor: (g) => ({S:'#D97706',A:'#16A34A',B:'#2563EB',C:'#EA580C',D:'#64748B'}[g]||'#94A3B8'),
  gradeLabel: (g) => ({S:'超越期望',A:'优秀',B:'达标',C:'待提升',D:'不达标'}[g]||'待定'),
  statusLabel: (s) => ({
    pending:'待自评', self_submitted:'待经理评', manager_submitted:'待校准',
    calibrated:'已校准', published:'待确认', completed:'已完成',
    on_track:'正常', at_risk:'风险', paused:'暂停',
    scheduled:'已安排', cancelled:'已取消',
    active:'进行中', draft:'草稿', calibrating:'校准中',
  }[s]||s),
  progressColor: (p) => p>=80?'#16A34A':p>=60?'#2563EB':p>=30?'#D97706':'#DC2626',
  formatDate: (d) => d ? d.substring(0,10) : '-',
  formatDateTime: (d) => d ? d.substring(0,16).replace('T',' ') : '-',
  timeAgo: (d) => {
    if (!d) return '';
    const diff = Date.now() - new Date(d).getTime();
    const m = Math.floor(diff/60000);
    if (m < 1) return '刚刚';
    if (m < 60) return `${m}分钟前`;
    if (m < 1440) return `${Math.floor(m/60)}小时前`;
    return `${Math.floor(m/1440)}天前`;
  },
  toast(msg, type='success') {
    const el = document.createElement('div');
    const icons = { success:'bi-check-circle-fill', error:'bi-exclamation-circle-fill', info:'bi-info-circle-fill' };
    const colors = { success:'#F0FDF4,#BBF7D0,#15803D', error:'#FFF1F2,#FECDD3,#BE123C', info:'#EFF6FF,#BFDBFE,#1D4ED8' };
    const [bg,border,color] = colors[type].split(',');
    el.style.cssText = `display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:10px;min-width:260px;font-size:.875rem;font-weight:500;box-shadow:0 4px 16px rgba(0,0,0,.1);background:${bg};border:1px solid ${border};color:${color};animation:slideIn .25s ease;pointer-events:auto`;
    el.innerHTML = `<i class="bi ${icons[type]}"></i><span>${msg}</span>`;
    const container = document.getElementById('toast-container');
    if (container) {
      container.appendChild(el);
      setTimeout(() => { el.style.opacity='0'; el.style.transition='opacity .3s'; setTimeout(()=>el.remove(), 300); }, 3000);
    }
  }
};
