// ============================================================
// main.js — 绩效管理系统前端组件
// ============================================================

// ===== 全局 CSS 补充 =====
const _style = document.createElement('style');
_style.textContent = `@keyframes slideIn{from{opacity:0;transform:translateX(20px)}}`;
document.head.appendChild(_style);

// ===== 公用：弹窗关闭快捷键 =====
document.addEventListener('keydown', e => { if(e.key==='Escape') document.dispatchEvent(new CustomEvent('closeModal')); });

// ============================================================
// Dashboard View
// ============================================================
const DashboardView = {
  props: ['user','isHr','isManager','activeCycle'],
  emits: ['navigate'],
  data() {
    return {
      summary: null, distribution: [], depts: [], myReviews: [],
      teamReviews: [], myGoals: [], upcomingOoos: [], loading: true, charts: {}
    };
  },
  computed: {
    myReview() { return this.myReviews[0] || null; },
    pendingTeam() { return this.teamReviews.filter(r => ['pending','self_submitted'].includes(r.status)); },
    goalAvgProgress() {
      if (!this.myGoals.length) return 0;
      return Math.round(this.myGoals.reduce((s,g)=>s+g.progress,0)/this.myGoals.length);
    },
  },
  methods: {
    async load() {
      this.loading = true;
      const cid = this.activeCycle?.id || 1;
      try {
        const promises = [
          $api.goals.list({ cycle_id: cid, type: 'mine' }),
          $api.reviews.list({ cycle_id: cid, type: 'my' }),
          $api.oneOnOne.list({ status: 'scheduled' }),
        ];
        if (this.isManager) {
          promises.push($api.reports.summary(), $api.reports.distribution(), $api.reports.departments(), $api.reviews.list({ cycle_id: cid }));
        }
        const results = await Promise.all(promises);
        this.myGoals = results[0] || [];
        this.myReviews = results[1] || [];
        this.upcomingOoos = (results[2] || []).slice(0,3);
        if (this.isManager) {
          this.summary = results[3];
          this.distribution = results[4] || [];
          this.depts = results[5] || [];
          this.teamReviews = results[6] || [];
        }
      } finally {
        this.loading = false;
        if (this.isManager) this.$nextTick(() => this.renderCharts());
      }
    },
    renderCharts() {
      // 等级分布饼图
      const dc = document.getElementById('distChart');
      if (dc && this.distribution.length) {
        if (this.charts.dist) this.charts.dist.destroy();
        const gradeColors = {S:'#D97706',A:'#16A34A',B:'#2563EB',C:'#EA580C',D:'#94A3B8'};
        this.charts.dist = new Chart(dc, {
          type: 'doughnut',
          data: {
            labels: this.distribution.map(d => d.grade + ' - ' + Utils.gradeLabel(d.grade)),
            datasets: [{ data: this.distribution.map(d=>d.count), backgroundColor: this.distribution.map(d=>gradeColors[d.grade]||'#94A3B8'), borderWidth: 0 }]
          },
          options: { cutout:'70%', plugins:{ legend:{ position:'right', labels:{font:{size:12},boxWidth:12,padding:8} } }, responsive:true, maintainAspectRatio:false }
        });
      }
      // 部门完成率柱状图
      const bc = document.getElementById('deptChart');
      if (bc && this.depts.length) {
        if (this.charts.dept) this.charts.dept.destroy();
        this.charts.dept = new Chart(bc, {
          type: 'bar',
          data: {
            labels: this.depts.map(d=>d.dept_name),
            datasets: [{
              label: '评估提交率%',
              data: this.depts.map(d => d.total ? Math.round(d.submitted/d.total*100) : 0),
              backgroundColor: this.depts.map(d=>d.color||'#4F46E5'), borderRadius: 6
            }]
          },
          options: { indexAxis:'y', plugins:{legend:{display:false}}, scales:{x:{max:100,ticks:{callback:v=>v+'%'}}}, responsive:true, maintainAspectRatio:false }
        });
      }
    },
  },
  mounted() { this.load(); },
  beforeUnmount() { Object.values(this.charts).forEach(c=>c?.destroy()); },
  template: `
<div v-if="loading" style="text-align:center;padding:60px;color:#94A3B8">
  <div style="width:32px;height:32px;border:2px solid #E2E8F0;border-top-color:#4F46E5;border-radius:50%;animation:spin .7s linear infinite;margin:0 auto 12px"></div>
  加载中...
</div>
<div v-else>

  <!-- ===== HR 视角 ===== -->
  <template v-if="isHr">
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">总员工数</span>
          <div class="kpi-icon" style="background:#EEF2FF"><i class="bi bi-people-fill" style="color:#4F46E5"></i></div>
        </div>
        <div class="kpi-value">{{summary?.total_employees||0}}</div>
        <div class="kpi-sub">在职员工</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">自评完成率</span>
          <div class="kpi-icon" style="background:#DCFCE7"><i class="bi bi-clipboard-check-fill" style="color:#16A34A"></i></div>
        </div>
        <div class="kpi-value" style="color:#16A34A">{{summary?.review_completion_rate||0}}%</div>
        <div class="kpi-sub">{{summary?.review_submitted||0}} / {{summary?.review_total||0}} 人已提交</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">目标完成率</span>
          <div class="kpi-icon" style="background:#FEF9C3"><i class="bi bi-bullseye" style="color:#D97706"></i></div>
        </div>
        <div class="kpi-value" style="color:#D97706">{{summary?.goals_completion_rate||0}}%</div>
        <div class="kpi-sub">{{summary?.goals_completed||0}} / {{summary?.goals_total||0}} 个目标</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">360反馈条数</span>
          <div class="kpi-icon" style="background:#EDE9FE"><i class="bi bi-chat-heart-fill" style="color:#7C3AED"></i></div>
        </div>
        <div class="kpi-value" style="color:#7C3AED">{{summary?.feedback_count||0}}</div>
        <div class="kpi-sub">本周期已收集</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header">绩效等级分布</div>
        <div class="card-body" style="height:220px">
          <canvas id="distChart"></canvas>
          <div v-if="!distribution.length" class="empty-state" style="padding:20px"><i class="bi bi-pie-chart"></i><p>暂无校准数据</p></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">各部门提交进度</div>
        <div class="card-body" style="height:220px"><canvas id="deptChart"></canvas></div>
      </div>
    </div>
  </template>

  <!-- ===== 经理视角 ===== -->
  <template v-else-if="isManager">
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">团队评估情况</span>
          <div class="kpi-icon" style="background:#EEF2FF"><i class="bi bi-people-fill" style="color:#4F46E5"></i></div>
        </div>
        <div class="kpi-value">{{teamReviews.length}}</div>
        <div class="kpi-sub">{{teamReviews.filter(r=>r.status!='pending').length}} 人已自评</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">待我评分</span>
          <div class="kpi-icon" style="background:#FEF9C3"><i class="bi bi-pen-fill" style="color:#D97706"></i></div>
        </div>
        <div class="kpi-value" style="color:#D97706">{{teamReviews.filter(r=>r.status=='self_submitted').length}}</div>
        <div class="kpi-sub">需要提交经理评分</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">即将1-on-1</span>
          <div class="kpi-icon" style="background:#DCFCE7"><i class="bi bi-calendar-check-fill" style="color:#16A34A"></i></div>
        </div>
        <div class="kpi-value" style="color:#16A34A">{{upcomingOoos.length}}</div>
        <div class="kpi-sub">已安排面谈</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header">团队评估状态</div>
        <div class="card-body" style="padding:0">
          <div v-if="!teamReviews.length" class="empty-state"><i class="bi bi-clipboard"></i><p>暂无团队评估数据</p></div>
          <div v-for="r in teamReviews.slice(0,6)" :key="r.id" style="display:flex;align-items:center;justify-content:space-between;padding:12px 20px;border-bottom:1px solid #F1F5F9">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="avatar avatar-sm" :style="{background:r.avatar_color}">{{r.reviewee_name?.[0]}}</div>
              <div>
                <div style="font-weight:600;font-size:.875rem">{{r.reviewee_name}}</div>
                <div style="font-size:.75rem;color:#94A3B8">{{r.reviewee_title}}</div>
              </div>
            </div>
            <span class="status-tag" :class="r.status">{{Utils.statusLabel(r.status)}}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">即将进行的1-on-1</div>
        <div class="card-body" style="padding:0">
          <div v-if="!upcomingOoos.length" class="empty-state"><i class="bi bi-calendar3"></i><p>暂无已安排的面谈</p></div>
          <div v-for="o in upcomingOoos" :key="o.id" style="padding:12px 20px;border-bottom:1px solid #F1F5F9;cursor:pointer" @click="$emit('navigate','oneOnOne')">
            <div style="display:flex;align-items:center;gap:10px">
              <div class="avatar avatar-sm" :style="{background:o.employee_color}">{{o.employee_name?.[0]}}</div>
              <div style="flex:1">
                <div style="font-weight:600;font-size:.875rem">与 {{o.employee_name}}</div>
                <div style="font-size:.75rem;color:#94A3B8"><i class="bi bi-clock me-1"></i>{{Utils.formatDateTime(o.scheduled_at)}}</div>
              </div>
              <i class="bi bi-arrow-right" style="color:#94A3B8"></i>
            </div>
          </div>
        </div>
      </div>
    </div>
  </template>

  <!-- ===== 员工视角 ===== -->
  <template v-else>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">目标平均进度</span>
          <div class="kpi-icon" style="background:#EEF2FF"><i class="bi bi-bullseye" style="color:#4F46E5"></i></div>
        </div>
        <div class="kpi-value" :style="{color:Utils.progressColor(goalAvgProgress)}">{{goalAvgProgress}}%</div>
        <div class="kpi-sub">{{myGoals.length}} 个目标进行中</div>
      </div>
      <div class="kpi-card" style="cursor:pointer" @click="$emit('navigate','reviews')">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">本期绩效</span>
          <div class="kpi-icon" :style="{background: myReview?.status=='pending'?'#FEF9C3':myReview?.status=='published'?'#FEF3C7':'#DCFCE7'}">
            <i class="bi" :class="myReview?.status=='pending'||myReview?.status=='published'?'bi-exclamation-circle-fill':'bi-check-circle-fill'"
               :style="{color:myReview?.status=='pending'?'#D97706':myReview?.status=='published'?'#D97706':'#16A34A'}"></i>
          </div>
        </div>
        <div class="kpi-value" :style="{color:myReview?.status=='pending'||myReview?.status=='published'?'#D97706':'#16A34A', fontSize:'1.1rem', marginTop:'4px'}">
          {{myReview ? Utils.statusLabel(myReview.status) : '未开始'}}
        </div>
        <div class="kpi-sub" style="color:#4F46E5" v-if="myReview?.status=='pending'">点击填写自评 →</div>
        <div class="kpi-sub" style="color:#D97706;font-weight:600" v-else-if="myReview?.status=='published'">结果已发布，请确认 →</div>
        <div class="kpi-sub" v-else-if="myReview">查看详情 →</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <span class="kpi-label">即将面谈</span>
          <div class="kpi-icon" style="background:#DCFCE7"><i class="bi bi-people-fill" style="color:#16A34A"></i></div>
        </div>
        <div class="kpi-value" style="color:#16A34A">{{upcomingOoos.length}}</div>
        <div class="kpi-sub">已安排1-on-1</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:2fr 1fr;gap:20px">
      <div class="card">
        <div class="card-header">我的目标进度</div>
        <div class="card-body" style="padding:0">
          <div v-if="!myGoals.length" class="empty-state"><i class="bi bi-bullseye"></i><p>暂无目标，<span style="color:#4F46E5;cursor:pointer" @click="$emit('navigate','goals')">去添加</span></p></div>
          <div v-for="g in myGoals.slice(0,5)" :key="g.id" style="padding:12px 20px;border-bottom:1px solid #F1F5F9">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
              <div style="font-weight:600;font-size:.875rem;flex:1;margin-right:12px">{{g.title}}</div>
              <span style="font-weight:700;font-size:.875rem" :style="{color:Utils.progressColor(g.progress)}">{{g.progress}}%</span>
            </div>
            <div class="progress-bar-wrap">
              <div class="progress-bar-fill" :style="{width:g.progress+'%',background:Utils.progressColor(g.progress)}"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">近期安排</div>
        <div class="card-body" style="padding:0">
          <div v-if="!upcomingOoos.length" class="empty-state" style="padding:24px"><i class="bi bi-calendar3"></i><p>暂无面谈安排</p></div>
          <div v-for="o in upcomingOoos" :key="o.id" style="padding:12px 20px;border-bottom:1px solid #F1F5F9">
            <div style="font-weight:600;font-size:.875rem">1-on-1 面谈</div>
            <div style="font-size:.75rem;color:#94A3B8;margin-top:2px"><i class="bi bi-clock me-1"></i>{{Utils.formatDateTime(o.scheduled_at)}}</div>
          </div>
        </div>
      </div>
    </div>
  </template>

</div>
  `
};
// END_DASHBOARD

// ============================================================
// Goals View
// ============================================================
const GoalsView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() {
    return {
      goals: [], employees: [], cycles: [], loading: true, tab: 'mine',
      showCreate: false, showDetail: null, expandedKRs: {},
      currentCycleId: null,
      form: { title:'', description:'', type:'okr', cycle_id:'', parent_id:'', target_value:'', unit:'', visibility:'team' },
      newKR: { title:'', target_value:'', unit:'' },
      submitting: false,
    };
  },
  computed: {
    filteredGoals() {
      if (this.tab === 'company') return this.goals.filter(g=>g.visibility==='public');
      if (this.tab === 'team') return this.goals.filter(g=>g.owner_id!==this.user.id||g.visibility==='public');
      return this.goals.filter(g=>g.owner_id===this.user.id);
    },
    parentGoals() { return this.goals.filter(g=>g.visibility!=='private'&&g.id!==this.showDetail?.id); }
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const cid = this.currentCycleId || this.activeCycle?.id || 1;
        const type = this.tab;
        this.goals = await $api.goals.list({ cycle_id: cid, type }) || [];
        if (this.isManager||this.isHr) {
          this.employees = await $api.employees.list() || [];
        }
      } finally { this.loading = false; }
    },
    async changeTab(t) { this.tab = t; await this.load(); },
    async createGoal() {
      if (!this.form.title) { Utils.toast('请填写目标标题', 'error'); return; }
      if (!this.form.cycle_id) { Utils.toast('请选择关联周期', 'error'); return; }
      this.submitting = true;
      try {
        const d = { ...this.form };
        if (!d.parent_id) delete d.parent_id;
        if (!d.target_value) delete d.target_value;
        await $api.goals.create(d);
        Utils.toast('目标创建成功');
        this.showCreate = false;
        this.form = { title:'', description:'', type:'okr', cycle_id: this.currentCycleId || this.activeCycle?.id || 1, parent_id:'', target_value:'', unit:'', visibility:'team' };
        await this.load();
      } catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    async updateProgress(goal, progress) {
      try {
        await $api.goals.update(goal.id, { progress: parseInt(progress) });
        goal.progress = parseInt(progress);
        Utils.toast('进度已更新');
      } catch(e) { Utils.toast(e.message,'error'); }
    },
    async updateStatus(goal, status) {
      try { await $api.goals.update(goal.id, { status }); goal.status = status; Utils.toast('状态已更新'); }
      catch(e) { Utils.toast(e.message,'error'); }
    },
    async deleteGoal(goal) {
      if (!confirm(`确认删除目标「${goal.title}」？`)) return;
      try { await $api.goals.del(goal.id); Utils.toast('已删除'); await this.load(); }
      catch(e) { Utils.toast(e.message,'error'); }
    },
    async loadKRs(goal) {
      if (this.expandedKRs[goal.id] !== undefined) {
        this.$set ? this.$set(this.expandedKRs, goal.id, undefined) : (this.expandedKRs[goal.id] = undefined);
        return;
      }
      const krs = await $api.goals.krs(goal.id) || [];
      this.expandedKRs = { ...this.expandedKRs, [goal.id]: krs };
    },
    async addKR(goal) {
      if (!this.newKR.title) return;
      try {
        const kr = await $api.goals.addKR(goal.id, this.newKR);
        this.expandedKRs[goal.id] = [...(this.expandedKRs[goal.id]||[]), kr];
        this.newKR = { title:'', target_value:'', unit:'' };
        Utils.toast('关键结果已添加');
      } catch(e) { Utils.toast(e.message,'error'); }
    },
    async updateKRProgress(goalId, kr, val) {
      const progress = Math.max(0, Math.min(100, parseInt(val)||0));
      try {
        await $api.goals.updateKR(goalId, kr.id, { progress });
        kr.progress = progress;
        // 更新父目标进度
        const krs = this.expandedKRs[goalId];
        if (krs) {
          const avg = Math.round(krs.reduce((s,k)=>s+k.progress,0)/krs.length);
          const g = this.goals.find(g=>g.id===goalId);
          if (g) g.progress = avg;
        }
        Utils.toast('进度已更新');
      } catch(e) { Utils.toast(e.message,'error'); }
    },
    visLabel(v) { return {public:'公开',team:'团队',private:'仅自己'}[v]||v; },
  },
  async mounted() {
    try { this.cycles = await $api.cycles.list() || []; } catch(e) {}
    this.currentCycleId = this.activeCycle?.id || (this.cycles.find(c => c.status === 'active' || c.status === 'calibrating')?.id) || (this.cycles[0]?.id) || 1;
    this.form.cycle_id = this.currentCycleId;
    await this.load();
  },
  template: `
<div>
  <!-- 标题栏 -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div style="display:flex;gap:4px;background:#F1F5F9;padding:4px;border-radius:10px">
      <button v-for="t in (isManager||isHr?[{k:'mine',l:'我的目标'},{k:'team',l:'团队目标'},{k:'company',l:'全公司'}]:[{k:'mine',l:'我的目标'},{k:'company',l:'全公司'}])"
        :key="t.k" @click="changeTab(t.k)"
        :style="{padding:'6px 16px',borderRadius:'7px',border:'none',fontWeight:600,fontSize:'.8rem',cursor:'pointer',background:tab===t.k?'white':'transparent',color:tab===t.k?'#1E293B':'#64748B',boxShadow:tab===t.k?'0 1px 3px rgba(0,0,0,.1)':'none',transition:'all .2s'}">
        {{t.l}}
      </button>
    </div>
    <button class="btn btn-primary btn-sm" @click="showCreate=true"><i class="bi bi-plus-lg"></i> 新建目标</button>
  </div>

  <!-- 目标列表 -->
  <div v-if="loading" style="text-align:center;padding:48px;color:#94A3B8">加载中...</div>
  <div v-else-if="!filteredGoals.length" class="empty-state"><i class="bi bi-bullseye"></i><p>暂无目标，点击「新建目标」开始设定</p></div>
  <div v-else>
    <div v-for="g in filteredGoals" :key="g.id" class="goal-card" style="margin-bottom:12px">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span class="goal-type-tag" :class="g.type">{{g.type==='okr'?'OKR':'KPI'}}</span>
            <span style="font-size:.68rem;padding:2px 8px;border-radius:4px" :style="{background:g.visibility==='public'?'#DCFCE7':g.visibility==='team'?'#DBEAFE':'#F1F5F9',color:g.visibility==='public'?'#166534':g.visibility==='team'?'#1D4ED8':'#475569'}">{{visLabel(g.visibility)}}</span>
            <span v-if="g.parent_title" style="font-size:.72rem;color:#94A3B8"><i class="bi bi-arrow-up-right me-1"></i>{{g.parent_title}}</span>
          </div>
          <div style="font-weight:700;font-size:.95rem;margin-bottom:4px">{{g.title}}</div>
          <div v-if="g.description" style="font-size:.8rem;color:#64748B;margin-bottom:8px">{{g.description}}</div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <div class="avatar avatar-sm" :style="{background:g.owner_color||'#4F46E5'}">{{g.owner_name?.[0]}}</div>
            <span style="font-size:.78rem;color:#64748B">{{g.owner_name}}</span>
            <span v-if="g.dept_name" style="font-size:.72rem;color:#94A3B8">· {{g.dept_name}}</span>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div class="progress-bar-wrap" style="flex:1;max-width:200px">
              <div class="progress-bar-fill" :style="{width:g.progress+'%',background:Utils.progressColor(g.progress)}"></div>
            </div>
            <span style="font-size:.8rem;font-weight:700" :style="{color:Utils.progressColor(g.progress)}">{{g.progress}}%</span>
            <span class="status-tag" :class="g.status" style="font-size:.68rem">{{Utils.statusLabel(g.status)}}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
          <div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-sm btn-icon" @click="loadKRs(g)" title="查看关键结果"><i class="bi" :class="expandedKRs[g.id]!==undefined?'bi-chevron-up':'bi-list-ul'"></i></button>
            <button v-if="g.owner_id===user.id||isHr" class="btn btn-ghost btn-sm btn-icon" @click="updateStatus(g, g.status==='completed'?'on_track':'completed')" :title="g.status==='completed'?'标记为进行中':'标记完成'">
              <i class="bi" :class="g.status==='completed'?'bi-arrow-counterclockwise':'bi-check-lg'" :style="{color:g.status==='completed'?'#94A3B8':'#16A34A'}"></i>
            </button>
            <button v-if="g.owner_id===user.id||isHr" class="btn btn-ghost btn-sm btn-icon" @click="deleteGoal(g)" title="删除"><i class="bi bi-trash3" style="color:#EF4444"></i></button>
          </div>
          <!-- 进度快速更新 -->
          <div v-if="g.owner_id===user.id" style="display:flex;align-items:center;gap:6px">
            <span style="font-size:.72rem;color:#94A3B8">更新进度</span>
            <input type="range" min="0" max="100" :value="g.progress" @change="updateProgress(g,$event.target.value)" style="width:80px;accent-color:#4F46E5">
          </div>
        </div>
      </div>

      <!-- 展开的关键结果 -->
      <div v-if="expandedKRs[g.id]!==undefined" style="margin-top:12px;padding-top:12px;border-top:1px dashed #E2E8F0">
        <div style="font-size:.78rem;font-weight:700;color:#64748B;margin-bottom:8px">关键结果 ({{expandedKRs[g.id].length}})</div>
        <div v-if="!expandedKRs[g.id].length" style="font-size:.8rem;color:#94A3B8;text-align:center;padding:8px">暂无关键结果</div>
        <div v-for="kr in expandedKRs[g.id]" :key="kr.id" style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid #F8FAFC">
          <i class="bi bi-arrow-right-short" style="color:#94A3B8;font-size:1rem"></i>
          <div style="flex:1;min-width:0">
            <div style="font-size:.875rem;font-weight:600">{{kr.title}}</div>
            <div v-if="kr.target_value" style="font-size:.75rem;color:#64748B">目标：{{kr.current_value||0}} / {{kr.target_value}} {{kr.unit}}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <div class="progress-bar-wrap" style="width:80px">
              <div class="progress-bar-fill" :style="{width:kr.progress+'%',background:Utils.progressColor(kr.progress)}"></div>
            </div>
            <span style="font-size:.8rem;font-weight:700;min-width:2.5rem" :style="{color:Utils.progressColor(kr.progress)}">{{kr.progress}}%</span>
            <input v-if="g.owner_id===user.id" type="number" min="0" max="100" :value="kr.progress" @change="updateKRProgress(g.id,kr,$event.target.value)" style="width:60px;padding:3px 6px;border:1px solid #E2E8F0;border-radius:6px;font-size:.78rem;text-align:center">
          </div>
        </div>
        <!-- 添加KR -->
        <div v-if="g.owner_id===user.id" style="margin-top:8px;display:flex;gap:6px">
          <input v-model="newKR.title" class="form-control" style="flex:1;font-size:.8rem;padding:5px 10px" placeholder="添加关键结果...">
          <input v-model="newKR.target_value" type="number" class="form-control" style="width:70px;font-size:.8rem;padding:5px 8px" placeholder="目标值">
          <input v-model="newKR.unit" class="form-control" style="width:60px;font-size:.8rem;padding:5px 8px" placeholder="单位">
          <button class="btn btn-primary btn-sm" @click="addKR(g)"><i class="bi bi-plus-lg"></i></button>
        </div>
      </div>
    </div>
  </div>

  <!-- 新建目标弹窗 -->
  <div v-if="showCreate" class="modal-overlay" @click.self="showCreate=false">
    <div class="modal-box">
      <div class="modal-header">
        <h5>新建目标</h5>
        <button class="btn-close-custom" @click="showCreate=false">✕</button>
      </div>
      <div class="modal-body">
        <div style="margin-bottom:14px">
          <label class="form-label">目标类型 *</label>
          <div style="display:flex;gap:8px">
            <label v-for="t in [{v:'okr',l:'OKR（目标+关键结果）'},{v:'kpi',l:'KPI（量化指标）'}]" :key="t.v" style="display:flex;align-items:center;gap:6px;cursor:pointer;flex:1;padding:10px;border:1px solid #E2E8F0;border-radius:8px" :style="{borderColor:form.type===t.v?'#4F46E5':'#E2E8F0',background:form.type===t.v?'#EEF2FF':'white'}">
              <input type="radio" v-model="form.type" :value="t.v" style="accent-color:#4F46E5">
              <span style="font-size:.8rem;font-weight:600">{{t.l}}</span>
            </label>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">目标标题 *</label>
          <input v-model="form.title" class="form-control" placeholder="例：完成用户认证模块重构">
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">详细描述</label>
          <textarea v-model="form.description" class="form-control" rows="2" placeholder="描述目标的背景、意义和验收标准..."></textarea>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div>
            <label class="form-label">关联周期 *</label>
            <select v-model="form.cycle_id" class="form-select">
              <option value="">请选择周期</option>
              <option v-for="c in cycles" :key="c.id" :value="c.id">{{c.name}}</option>
            </select>
          </div>
          <div>
            <label class="form-label">关联父目标</label>
            <select v-model="form.parent_id" class="form-select">
              <option value="">不关联</option>
              <option v-for="pg in parentGoals" :key="pg.id" :value="pg.id">{{pg.title}}</option>
            </select>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
          <div>
            <label class="form-label">可见范围</label>
            <select v-model="form.visibility" class="form-select">
              <option value="public">全公司可见</option>
              <option value="team">团队可见</option>
              <option value="private">仅自己</option>
            </select>
          </div>
        </div>
        <div v-if="form.type==='kpi'" style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div>
            <label class="form-label">目标值</label>
            <input v-model="form.target_value" type="number" class="form-control" placeholder="例：100">
          </div>
          <div>
            <label class="form-label">单位</label>
            <input v-model="form.unit" class="form-control" placeholder="例：万元、%">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showCreate=false">取消</button>
        <button class="btn btn-primary" @click="createGoal" :disabled="submitting">{{submitting?'创建中...':'创建目标'}}</button>
      </div>
    </div>
  </div>
</div>
  `
};
// END_GOALS

// ============================================================
// Reviews View
// ============================================================
const ReviewsView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() {
    return {
      reviews: [], loading: true, tab: 'my',
      currentCycleId: null,
      showSelf: null, showManager: null, showConfirm: null,
      cycleGoals: [], goalScores: {}, goalsLoading: false,
      selfForm: { self_goal_score:4, self_ability_score:4, self_comment:'', self_strengths:'', self_improvements:'', self_plan:'' },
      mgrForm: { manager_goal_score:4, manager_ability_score:4, manager_comment:'', manager_strengths:'', manager_improvements:'', manager_grade:'A' },
      confirmComment: '',
      submitting: false,
    };
  },
  computed: {
    myReview() { return this.reviews.find(r=>r.reviewee_id===this.user.id); },
    teamPending() { return this.reviews.filter(r=>r.status==='self_submitted'); },
    goalAvgScore() {
      const vals = Object.values(this.goalScores).filter(s => s > 0);
      if (!vals.length) return this.selfForm.self_goal_score;
      return Math.round(vals.reduce((a,b)=>a+b,0)/vals.length * 10) / 10;
    },
  },
  methods: {
    async load() {
      this.loading = true;
      const cid = this.currentCycleId || this.activeCycle?.id || 1;
      try {
        if (this.isManager || this.isHr) {
          const [my, team] = await Promise.all([
            $api.reviews.list({ cycle_id: cid, type:'my' }),
            $api.reviews.list({ cycle_id: cid })
          ]);
          this.reviews = this.tab==='my' ? (my||[]) : (team||[]);
        } else {
          this.reviews = await $api.reviews.list({ cycle_id: cid, type:'my' }) || [];
        }
      } finally { this.loading = false; }
    },
    async changeTab(t) { this.tab = t; await this.load(); },
    async openSelf(r) {
      this.selfForm = { self_goal_score:r.self_goal_score||4, self_ability_score:r.self_ability_score||4, self_comment:r.self_comment||'', self_strengths:r.self_strengths||'', self_improvements:r.self_improvements||'', self_plan:r.self_plan||'' };
      this.goalScores = {};
      this.showSelf = r;
      // 加载该周期的目标
      this.goalsLoading = true;
      try {
        this.cycleGoals = await $api.goals.list({ cycle_id: r.cycle_id, type:'mine' }) || [];
        // 如果已有历史打分，恢复
        if (r.self_goal_details) {
          try {
            const prev = JSON.parse(r.self_goal_details);
            prev.forEach(g => { this.goalScores[g.id] = g.score; });
          } catch(e) {}
        } else {
          // 初始化默认分值
          this.cycleGoals.forEach(g => { this.goalScores[g.id] = 4; });
        }
      } catch(e) {}
      finally { this.goalsLoading = false; }
    },
    async submitSelf() {
      if (!this.selfForm.self_comment) { Utils.toast('请填写自评说明','error'); return; }
      this.submitting = true;
      try {
        // 构建目标评分明细
        const goalDetails = this.cycleGoals.map(g => ({
          id: g.id, title: g.title, progress: g.progress,
          score: this.goalScores[g.id] || 4
        }));
        const payload = {
          ...this.selfForm,
          self_goal_score: this.goalAvgScore,
          self_goal_details: goalDetails.length ? JSON.stringify(goalDetails) : null,
        };
        await $api.reviews.submitSelf(this.showSelf.id, payload);
        Utils.toast('自评已提交，等待经理评分');
        this.showSelf = null;
        await this.load();
      } catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    openManager(r) {
      this.mgrForm = { manager_goal_score:r.manager_goal_score||4, manager_ability_score:r.manager_ability_score||4, manager_comment:r.manager_comment||'', manager_strengths:r.manager_strengths||'', manager_improvements:r.manager_improvements||'', manager_grade:r.manager_grade||'A' };
      this.showManager = r;
    },
    async submitManager() {
      if (!this.mgrForm.manager_comment) { Utils.toast('请填写评语','error'); return; }
      this.submitting = true;
      try {
        await $api.reviews.submitManager(this.showManager.id, this.mgrForm);
        Utils.toast('评分已提交，等待HR校准');
        this.showManager = null;
        await this.load();
      } catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    async setGrade(r, grade) {
      try {
        await $api.reviews.setGrade(r.id, grade);
        r.final_grade = grade; r.status = 'published';
        Utils.toast(`已发布等级 ${grade}，员工将收到确认通知`);
      } catch(e) { Utils.toast(e.message,'error'); }
    },
    openConfirm(r) { this.confirmComment = ''; this.showConfirm = r; },
    async submitConfirm() {
      this.submitting = true;
      try {
        await $api.reviews.confirm(this.showConfirm.id, { comment: this.confirmComment });
        Utils.toast('已确认绩效结果');
        this.showConfirm = null;
        await this.load();
      } catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    scoreColor(s) { return s>=4.5?'#D97706':s>=4?'#16A34A':s>=3?'#2563EB':'#EA580C'; },
    stepIndex(status) {
      return {pending:0,self_submitted:1,manager_submitted:2,calibrated:2,published:3,completed:4}[status]??0;
    },
  },
  async mounted() {
    try {
      const active = await $api.cycles.active();
      this.currentCycleId = active?.id || this.activeCycle?.id || 1;
    } catch(e) { this.currentCycleId = this.activeCycle?.id || 1; }
    await this.load();
  },
  template: `
<div>
  <!-- Tab切换 -->
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div style="display:flex;gap:4px;background:#F1F5F9;padding:4px;border-radius:10px" v-if="isManager||isHr">
      <button v-for="t in [{k:'my',l:'我的评估'},{k:'team',l:isHr?'全员评估':'团队评估'}]" :key="t.k" @click="changeTab(t.k)"
        :style="{padding:'6px 16px',borderRadius:'7px',border:'none',fontWeight:600,fontSize:'.8rem',cursor:'pointer',background:tab===t.k?'white':'transparent',color:tab===t.k?'#1E293B':'#64748B',boxShadow:tab===t.k?'0 1px 3px rgba(0,0,0,.1)':'none'}">
        {{t.l}}
      </button>
    </div>
    <div v-else style="font-weight:700;color:#1E293B">{{activeCycle ? activeCycle.name : '绩效评估'}}</div>
    <!-- 团队待评数量提示 -->
    <div v-if="(isManager||isHr) && teamPending.length" style="font-size:.8rem;background:#FEF3C7;color:#D97706;padding:4px 12px;border-radius:20px;font-weight:600">
      <i class="bi bi-exclamation-circle me-1"></i>{{teamPending.length}} 人待评分
    </div>
  </div>

  <!-- 员工：流程进度条 -->
  <div v-if="!isManager && !isHr && myReview" class="card" style="margin-bottom:20px">
    <div class="card-body" style="padding:16px 20px">
      <div style="font-size:.78rem;font-weight:700;color:#64748B;margin-bottom:12px">本周期评估进度</div>
      <div style="display:flex;align-items:center;gap:0">
        <template v-for="(step,i) in [{l:'填写自评',s:'pending'},{l:'经理评分',s:'self_submitted'},{l:'HR校准',s:'manager_submitted'},{l:'员工确认',s:'published'},{l:'已完成',s:'completed'}]" :key="i">
          <div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1">
            <div :style="{width:'28px',height:'28px',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:700,fontSize:'.78rem',background:stepIndex(myReview.status)>i?'#4F46E5':stepIndex(myReview.status)===i?'#4F46E5':'#E2E8F0',color:stepIndex(myReview.status)>=i?'white':'#94A3B8',border:stepIndex(myReview.status)===i?'3px solid #C7D2FE':'none'}">
              <i v-if="stepIndex(myReview.status)>i" class="bi bi-check" style="font-size:.9rem"></i>
              <span v-else>{{i+1}}</span>
            </div>
            <div :style="{fontSize:'.68rem',fontWeight:stepIndex(myReview.status)===i?700:400,color:stepIndex(myReview.status)>=i?'#4F46E5':'#94A3B8',textAlign:'center',whiteSpace:'nowrap'}">{{step.l}}</div>
          </div>
          <div v-if="i<4" :style="{flex:2,height:'2px',background:stepIndex(myReview.status)>i?'#4F46E5':'#E2E8F0',marginBottom:'16px'}"></div>
        </template>
      </div>
      <!-- 当前步骤行动指引 -->
      <div v-if="myReview.status==='pending'" style="margin-top:12px;padding:10px 14px;background:#EEF2FF;border-radius:8px;font-size:.8rem;color:#4F46E5;display:flex;align-items:center;justify-content:space-between">
        <span><i class="bi bi-info-circle me-1"></i>请填写本周期的绩效自评，提交后等待经理评分</span>
        <button class="btn btn-primary btn-sm" @click="openSelf(myReview)"><i class="bi bi-pen-fill me-1"></i>立即自评</button>
      </div>
      <div v-else-if="myReview.status==='self_submitted'" style="margin-top:12px;padding:10px 14px;background:#FEF9C3;border-radius:8px;font-size:.8rem;color:#D97706">
        <i class="bi bi-clock me-1"></i>自评已提交，等待经理评分中...
      </div>
      <div v-else-if="myReview.status==='manager_submitted' || myReview.status==='calibrated'" style="margin-top:12px;padding:10px 14px;background:#FEF9C3;border-radius:8px;font-size:.8rem;color:#D97706">
        <i class="bi bi-clock me-1"></i>经理评分已完成，等待HR校准发布结果...
      </div>
      <div v-else-if="myReview.status==='published'" style="margin-top:12px;padding:10px 14px;background:#FEF3C7;border-radius:8px;font-size:.8rem;color:#D97706;display:flex;align-items:center;justify-content:space-between">
        <span><i class="bi bi-exclamation-circle me-1"></i>绩效结果已发布，请查看后确认</span>
        <button class="btn btn-primary btn-sm" @click="openConfirm(myReview)" style="background:#D97706;border:none"><i class="bi bi-check-circle me-1"></i>查看并确认</button>
      </div>
      <div v-else-if="myReview.status==='completed'" style="margin-top:12px;padding:10px 14px;background:#DCFCE7;border-radius:8px;font-size:.8rem;color:#16A34A">
        <i class="bi bi-check-circle-fill me-1"></i>本周期绩效评估已全部完成
      </div>
    </div>
  </div>

  <div v-if="loading" style="text-align:center;padding:48px;color:#94A3B8">加载中...</div>
  <div v-else-if="!reviews.length" class="empty-state"><i class="bi bi-clipboard-check"></i><p>暂无评估记录</p></div>
  <div v-else>
    <div v-for="r in reviews" :key="r.id" class="card" style="margin-bottom:12px">
      <div class="card-body" style="padding:16px 20px">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div style="display:flex;align-items:center;gap:12px;flex:1">
            <div class="avatar" :style="{background:r.avatar_color}">{{r.reviewee_name?.[0]}}</div>
            <div>
              <div style="font-weight:700;font-size:.95rem">{{r.reviewee_name}}</div>
              <div style="font-size:.78rem;color:#94A3B8">{{r.reviewee_title}} · {{r.dept_name}}</div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <!-- 分数展示 -->
            <div v-if="r.self_goal_score" style="text-align:center;padding:4px 10px;background:#F8FAFC;border-radius:8px">
              <div style="font-size:.62rem;color:#94A3B8">自评</div>
              <div style="font-weight:800;font-size:.95rem" :style="{color:scoreColor(r.self_goal_score)}">{{r.self_goal_score}}</div>
            </div>
            <div v-if="r.manager_goal_score" style="text-align:center;padding:4px 10px;background:#F8FAFC;border-radius:8px">
              <div style="font-size:.62rem;color:#94A3B8">经理</div>
              <div style="font-weight:800;font-size:.95rem" :style="{color:scoreColor(r.manager_goal_score)}">{{r.manager_goal_score}}</div>
            </div>
            <!-- 最终等级 -->
            <div v-if="r.final_grade" class="grade-badge" :class="r.final_grade" style="width:32px;height:32px;font-size:.9rem">{{r.final_grade}}</div>
            <span class="status-tag" :class="r.status">{{Utils.statusLabel(r.status)}}</span>
            <!-- 操作按钮 -->
            <button v-if="r.reviewee_id===user.id && r.status==='pending'" class="btn btn-primary btn-sm" @click="openSelf(r)">
              <i class="bi bi-pen-fill me-1"></i>填写自评
            </button>
            <button v-if="r.reviewee_id===user.id && r.status==='published'" class="btn btn-sm" @click="openConfirm(r)" style="background:#D97706;color:white;border:none;font-weight:600">
              <i class="bi bi-check-circle me-1"></i>确认结果
            </button>
            <button v-if="r.reviewee_id===user.id && !['pending','published'].includes(r.status)" class="btn btn-secondary btn-sm" @click="openSelf(r)">
              <i class="bi bi-eye me-1"></i>查看自评
            </button>
            <button v-if="(isManager||isHr) && r.status==='self_submitted'" class="btn btn-primary btn-sm" @click="openManager(r)">
              <i class="bi bi-pen-fill me-1"></i>评分
            </button>
            <button v-if="(isManager||isHr) && !['pending','self_submitted'].includes(r.status)" class="btn btn-secondary btn-sm" @click="openManager(r)">
              <i class="bi bi-eye me-1"></i>查看
            </button>
            <!-- HR设置最终等级 -->
            <div v-if="isHr && r.status==='manager_submitted'" style="display:flex;gap:4px;align-items:center">
              <span style="font-size:.72rem;color:#94A3B8;margin-right:2px">发布：</span>
              <button v-for="g in ['S','A','B','C','D']" :key="g" @click="setGrade(r,g)"
                class="grade-badge" :class="g" style="cursor:pointer;border:none;font-size:.7rem;width:26px;height:26px">{{g}}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 自评弹窗 -->
  <div v-if="showSelf" class="modal-overlay" @click.self="showSelf=null">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <h5>{{showSelf.status==='pending'?'填写绩效自评':'自评详情'}} — {{showSelf.reviewee_name}}</h5>
        <button class="btn-close-custom" @click="showSelf=null">✕</button>
      </div>
      <div class="modal-body">
        <!-- 本周期目标评分 -->
        <div style="margin-bottom:20px">
          <div style="font-size:.8rem;font-weight:700;color:#1E293B;margin-bottom:10px;display:flex;align-items:center;gap:8px">
            <i class="bi bi-bullseye" style="color:#4F46E5"></i>本周期目标评分
            <span v-if="cycleGoals.length" style="font-size:.72rem;font-weight:400;color:#64748B">（{{cycleGoals.length}} 个目标 · 综合得分自动计算）</span>
          </div>
          <div v-if="goalsLoading" style="text-align:center;padding:16px;color:#94A3B8;font-size:.8rem">加载目标中...</div>
          <div v-else-if="!cycleGoals.length" style="background:#F8FAFC;border:1px dashed #E2E8F0;border-radius:10px;padding:14px;text-align:center;font-size:.8rem;color:#94A3B8">
            <i class="bi bi-info-circle me-1"></i>本周期暂无关联目标，请先在目标管理中创建目标
          </div>
          <div v-else style="display:flex;flex-direction:column;gap:10px">
            <div v-for="g in cycleGoals" :key="g.id" style="background:#F8FAFC;border-radius:10px;padding:12px 14px;border:1px solid #E2E8F0">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="flex:1;min-width:0">
                  <div style="font-weight:600;font-size:.875rem;color:#1E293B">{{g.title}}</div>
                  <div style="display:flex;align-items:center;gap:8px;margin-top:4px">
                    <div class="progress-bar-wrap" style="flex:1;max-width:120px">
                      <div class="progress-bar-fill" :style="{width:g.progress+'%',background:Utils.progressColor(g.progress)}"></div>
                    </div>
                    <span style="font-size:.72rem;color:#64748B">进度 {{g.progress}}%</span>
                    <span class="goal-type-tag" :class="g.type">{{g.type.toUpperCase()}}</span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;margin-left:16px;flex-shrink:0">
                  <input type="range" min="1" max="5" step="0.1" :value="goalScores[g.id]||4"
                    @input="goalScores[g.id]=+$event.target.value"
                    style="width:100px;accent-color:#4F46E5" :disabled="showSelf.status!=='pending'">
                  <span style="font-weight:800;font-size:1.1rem;min-width:2rem;text-align:right" :style="{color:scoreColor(goalScores[g.id]||4)}">{{goalScores[g.id]||4}}</span>
                </div>
              </div>
            </div>
            <!-- 综合目标得分 -->
            <div style="background:#EEF2FF;border-radius:10px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between">
              <span style="font-size:.8rem;font-weight:700;color:#4F46E5"><i class="bi bi-calculator me-1"></i>目标达成综合得分（自动计算）</span>
              <span style="font-weight:800;font-size:1.3rem;color:#4F46E5">{{goalAvgScore}}</span>
            </div>
          </div>
        </div>
        <!-- 综合能力评分 -->
        <div style="margin-bottom:20px">
          <label class="form-label"><i class="bi bi-star me-1" style="color:#D97706"></i>综合能力评分 (1-5分)</label>
          <div style="display:flex;align-items:center;gap:10px">
            <input type="range" min="1" max="5" step="0.1" v-model.number="selfForm.self_ability_score" style="flex:1;accent-color:#4F46E5" :disabled="showSelf.status!=='pending'">
            <span style="font-weight:800;font-size:1.2rem;color:#4F46E5;min-width:2rem">{{selfForm.self_ability_score}}</span>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">工作亮点</label>
          <textarea v-model="selfForm.self_strengths" class="form-control" rows="2" placeholder="本季度值得肯定的工作成果..." :disabled="showSelf.status!=='pending'"></textarea>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">待改进的地方</label>
          <textarea v-model="selfForm.self_improvements" class="form-control" rows="2" placeholder="不足之处..." :disabled="showSelf.status!=='pending'"></textarea>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">自评总结 *</label>
          <textarea v-model="selfForm.self_comment" class="form-control" rows="3" placeholder="对本周期整体工作的总体描述..." :disabled="showSelf.status!=='pending'"></textarea>
        </div>
        <div>
          <label class="form-label">下阶段计划</label>
          <textarea v-model="selfForm.self_plan" class="form-control" rows="2" placeholder="下个季度的目标和计划..." :disabled="showSelf.status!=='pending'"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showSelf=null">{{showSelf.status!=='pending'?'关闭':'取消'}}</button>
        <button v-if="showSelf.status==='pending'" class="btn btn-primary" @click="submitSelf" :disabled="submitting">{{submitting?'提交中...':'提交自评'}}</button>
      </div>
    </div>
  </div>

  <!-- 经理评分弹窗 -->
  <div v-if="showManager" class="modal-overlay" @click.self="showManager=null">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <h5>{{showManager.status==='self_submitted'?'经理评分':'查看评分'}} — {{showManager.reviewee_name}}</h5>
        <button class="btn-close-custom" @click="showManager=null">✕</button>
      </div>
      <div class="modal-body">
        <!-- 员工自评内容 -->
        <div v-if="showManager.self_comment" style="background:#F8FAFC;border-radius:10px;padding:14px;margin-bottom:20px;border:1px solid #E2E8F0">
          <div style="font-size:.78rem;font-weight:700;color:#64748B;margin-bottom:8px">员工自评（目标评分：{{showManager.self_goal_score}} / 能力评分：{{showManager.self_ability_score}}）</div>
          <!-- 逐目标评分明细 -->
          <div v-if="showManager.self_goal_details" style="margin-bottom:10px">
            <div style="font-size:.72rem;color:#94A3B8;margin-bottom:6px">目标评分明细：</div>
            <div v-for="gd in JSON.parse(showManager.self_goal_details)" :key="gd.id"
              style="display:flex;align-items:center;justify-content:space-between;padding:4px 0;font-size:.8rem;border-bottom:1px solid #F1F5F9">
              <span style="color:#475569;flex:1;margin-right:8px">{{gd.title}}</span>
              <span style="font-weight:700" :style="{color:scoreColor(gd.score)}">{{gd.score}} 分</span>
            </div>
          </div>
          <p style="font-size:.875rem;color:#475569;margin:0 0 6px">{{showManager.self_comment}}</p>
          <p v-if="showManager.self_strengths" style="font-size:.8rem;color:#64748B;margin:0"><strong>亮点：</strong>{{showManager.self_strengths}}</p>
          <p v-if="showManager.self_improvements" style="font-size:.8rem;color:#64748B;margin:4px 0 0"><strong>改进：</strong>{{showManager.self_improvements}}</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
          <div>
            <label class="form-label">目标达成评分 (1-5分)</label>
            <div style="display:flex;align-items:center;gap:10px">
              <input type="range" min="1" max="5" step="0.1" v-model.number="mgrForm.manager_goal_score" style="flex:1;accent-color:#4F46E5" :disabled="showManager.status!=='self_submitted'">
              <span style="font-weight:800;font-size:1.2rem;color:#4F46E5;min-width:2rem">{{mgrForm.manager_goal_score}}</span>
            </div>
          </div>
          <div>
            <label class="form-label">综合能力评分 (1-5分)</label>
            <div style="display:flex;align-items:center;gap:10px">
              <input type="range" min="1" max="5" step="0.1" v-model.number="mgrForm.manager_ability_score" style="flex:1;accent-color:#4F46E5" :disabled="showManager.status!=='self_submitted'">
              <span style="font-weight:800;font-size:1.2rem;color:#4F46E5;min-width:2rem">{{mgrForm.manager_ability_score}}</span>
            </div>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">员工优势</label>
          <textarea v-model="mgrForm.manager_strengths" class="form-control" rows="2" :disabled="showManager.status!=='self_submitted'"></textarea>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">改进建议</label>
          <textarea v-model="mgrForm.manager_improvements" class="form-control" rows="2" :disabled="showManager.status!=='self_submitted'"></textarea>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">综合评语 *</label>
          <textarea v-model="mgrForm.manager_comment" class="form-control" rows="3" :disabled="showManager.status!=='self_submitted'"></textarea>
        </div>
        <div>
          <label class="form-label">建议等级</label>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label v-for="g in [{v:'S',l:'S 超越期望'},{v:'A',l:'A 优秀'},{v:'B',l:'B 达标'},{v:'C',l:'C 待提升'},{v:'D',l:'D 不达标'}]" :key="g.v"
              :style="{display:'flex',alignItems:'center',gap:'4px',cursor:showManager.status==='self_submitted'?'pointer':'default',padding:'6px 12px',borderRadius:'8px',border:'1px solid',borderColor:mgrForm.manager_grade===g.v?Utils.gradeColor(g.v):'#E2E8F0',background:mgrForm.manager_grade===g.v?Utils.gradeColor(g.v)+'15':'white'}">
              <input type="radio" v-model="mgrForm.manager_grade" :value="g.v" style="accent-color:#4F46E5" :disabled="showManager.status!=='self_submitted'">
              <span style="font-size:.78rem;font-weight:700" :style="{color:mgrForm.manager_grade===g.v?Utils.gradeColor(g.v):'#64748B'}">{{g.l}}</span>
            </label>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showManager=null">{{showManager.status!=='self_submitted'?'关闭':'取消'}}</button>
        <button v-if="showManager.status==='self_submitted'" class="btn btn-primary" @click="submitManager" :disabled="submitting">{{submitting?'提交中...':'提交评分'}}</button>
      </div>
    </div>
  </div>

  <!-- 员工确认结果弹窗 -->
  <div v-if="showConfirm" class="modal-overlay" @click.self="showConfirm=null">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <h5><i class="bi bi-clipboard-check-fill me-2" style="color:#D97706"></i>绩效结果确认 — {{showConfirm.cycle_id ? '2024 Q4' : '本周期'}}</h5>
        <button class="btn-close-custom" @click="showConfirm=null">✕</button>
      </div>
      <div class="modal-body">
        <!-- 最终等级 大卡片 -->
        <div style="text-align:center;padding:24px;background:linear-gradient(135deg,#EEF2FF,#F5F3FF);border-radius:12px;margin-bottom:20px;border:1px solid #C7D2FE">
          <div style="font-size:.8rem;color:#64748B;margin-bottom:8px">HR 校准最终等级</div>
          <div class="grade-badge" :class="showConfirm.final_grade" style="width:56px;height:56px;font-size:1.5rem;margin:0 auto 8px">{{showConfirm.final_grade}}</div>
          <div style="font-size:1rem;font-weight:700" :style="{color:Utils.gradeColor(showConfirm.final_grade)}">{{Utils.gradeLabel(showConfirm.final_grade)}}</div>
        </div>
        <!-- 分数对比 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px">
          <div style="background:#F8FAFC;border-radius:10px;padding:14px;border:1px solid #E2E8F0">
            <div style="font-size:.75rem;font-weight:700;color:#64748B;margin-bottom:8px">我的自评</div>
            <div style="display:flex;justify-content:space-between;font-size:.875rem">
              <span>目标达成</span><span style="font-weight:700" :style="{color:scoreColor(showConfirm.self_goal_score)}">{{showConfirm.self_goal_score || '-'}}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:.875rem;margin-top:4px">
              <span>综合能力</span><span style="font-weight:700" :style="{color:scoreColor(showConfirm.self_ability_score)}">{{showConfirm.self_ability_score || '-'}}</span>
            </div>
          </div>
          <div style="background:#F8FAFC;border-radius:10px;padding:14px;border:1px solid #E2E8F0">
            <div style="font-size:.75rem;font-weight:700;color:#64748B;margin-bottom:8px">经理评分</div>
            <div style="display:flex;justify-content:space-between;font-size:.875rem">
              <span>目标达成</span><span style="font-weight:700" :style="{color:scoreColor(showConfirm.manager_goal_score)}">{{showConfirm.manager_goal_score || '-'}}</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:.875rem;margin-top:4px">
              <span>综合能力</span><span style="font-weight:700" :style="{color:scoreColor(showConfirm.manager_ability_score)}">{{showConfirm.manager_ability_score || '-'}}</span>
            </div>
          </div>
        </div>
        <!-- 经理评语 -->
        <div v-if="showConfirm.manager_comment" style="background:#F8FAFC;border-radius:10px;padding:14px;margin-bottom:16px;border:1px solid #E2E8F0">
          <div style="font-size:.75rem;font-weight:700;color:#64748B;margin-bottom:6px">经理评语</div>
          <p style="font-size:.875rem;color:#475569;margin:0">{{showConfirm.manager_comment}}</p>
          <div style="margin-top:8px;display:flex;gap:16px">
            <div v-if="showConfirm.manager_strengths" style="font-size:.78rem;color:#16A34A"><strong>优势：</strong>{{showConfirm.manager_strengths}}</div>
            <div v-if="showConfirm.manager_improvements" style="font-size:.78rem;color:#EA580C"><strong>改进：</strong>{{showConfirm.manager_improvements}}</div>
          </div>
        </div>
        <!-- 员工确认留言 -->
        <div>
          <label class="form-label">确认留言（选填）</label>
          <textarea v-model="confirmComment" class="form-control" rows="2" placeholder="对本次评估结果有何想法或感谢..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showConfirm=null">稍后再看</button>
        <button class="btn btn-primary" @click="submitConfirm" :disabled="submitting" style="background:#D97706;border:none">
          {{submitting?'确认中...':'确认并完成'}}
        </button>
      </div>
    </div>
  </div>
</div>
  `
};
// END_REVIEWS

// ============================================================
// Feedback View
// ============================================================
const FeedbackView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() {
    return {
      received: [], sent: [], employees: [], loading: true,
      tab: 'received', showSend: false,
      form: { to_id:'', relationship:'peer', score_quality:4, score_efficiency:4, score_teamwork:4, score_innovation:4, score_reliability:4, comment:'', is_anonymous:true },
      submitting: false, charts: {}
    };
  },
  computed: {
    avgScores() {
      if (!this.received.length) return null;
      const avg = (k) => (this.received.reduce((s,r)=>s+(r[k]||0),0)/this.received.length).toFixed(1);
      return {
        quality: avg('score_quality'), efficiency: avg('score_efficiency'),
        teamwork: avg('score_teamwork'), innovation: avg('score_innovation'),
        reliability: avg('score_reliability'),
        overall: (this.received.reduce((s,r)=>s+(r.overall_score||0),0)/this.received.length).toFixed(1)
      };
    },
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const [recv, sent, emps] = await Promise.all([
          $api.feedback.list({ direction:'received', cycle_id:1 }),
          $api.feedback.list({ direction:'sent', cycle_id:1 }),
          $api.employees.list()
        ]);
        this.received = recv || [];
        this.sent = sent || [];
        this.employees = (emps||[]).filter(e=>e.id!==this.user.id);
      } finally {
        this.loading = false;
        if (this.tab==='received') this.$nextTick(()=>this.renderRadar());
      }
    },
    renderRadar() {
      const el = document.getElementById('feedbackRadar');
      if (!el || !this.avgScores) return;
      if (this.charts.radar) this.charts.radar.destroy();
      this.charts.radar = new Chart(el, {
        type: 'radar',
        data: {
          labels: ['工作质量','工作效率','团队协作','创新思维','责任心'],
          datasets: [{
            data: [this.avgScores.quality, this.avgScores.efficiency, this.avgScores.teamwork, this.avgScores.innovation, this.avgScores.reliability],
            backgroundColor: 'rgba(79,70,229,.15)', borderColor: '#4F46E5', borderWidth: 2, pointBackgroundColor: '#4F46E5', pointRadius: 4
          }]
        },
        options: { scales:{ r:{ min:0, max:5, ticks:{display:false}, grid:{color:'#E2E8F0'} } }, plugins:{legend:{display:false}}, responsive:true, maintainAspectRatio:false }
      });
    },
    async submitFeedback() {
      if (!this.form.to_id) { Utils.toast('请选择反馈对象','error'); return; }
      if (!this.form.comment) { Utils.toast('请填写评价内容','error'); return; }
      this.submitting = true;
      try {
        await $api.feedback.submit({ ...this.form, cycle_id:1 });
        Utils.toast('反馈已提交');
        this.showSend = false;
        this.form = { to_id:'', relationship:'peer', score_quality:4, score_efficiency:4, score_teamwork:4, score_innovation:4, score_reliability:4, comment:'', is_anonymous:true };
        await this.load();
      } catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    async changeTab(t) {
      this.tab = t;
      if (t==='received') this.$nextTick(()=>this.renderRadar());
    },
    dimLabel(k) { return {score_quality:'工作质量',score_efficiency:'工作效率',score_teamwork:'团队协作',score_innovation:'创新思维',score_reliability:'责任心'}[k]||k; },
    relLabel(r) { return {superior:'上级',peer:'同级',subordinate:'下属',cross_dept:'跨部门'}[r]||r; },
    scoreBarColor(s) { return s>=4.5?'#D97706':s>=4?'#16A34A':s>=3?'#2563EB':'#EA580C'; },
  },
  mounted() { this.load(); },
  beforeUnmount() { Object.values(this.charts).forEach(c=>c?.destroy()); },
  template: `
<div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div style="display:flex;gap:4px;background:#F1F5F9;padding:4px;border-radius:10px">
      <button v-for="t in [{k:'received',l:'收到的反馈'},{k:'sent',l:'发出的反馈'}]" :key="t.k" @click="changeTab(t.k)"
        :style="{padding:'6px 16px',borderRadius:'7px',border:'none',fontWeight:600,fontSize:'.8rem',cursor:'pointer',background:tab===t.k?'white':'transparent',color:tab===t.k?'#1E293B':'#64748B',boxShadow:tab===t.k?'0 1px 3px rgba(0,0,0,.1)':'none'}">
        {{t.l}} <span v-if="t.k==='received'" style="font-size:.68rem;color:#94A3B8">({{received.length}})</span>
        <span v-else style="font-size:.68rem;color:#94A3B8">({{sent.length}})</span>
      </button>
    </div>
    <button class="btn btn-primary btn-sm" @click="showSend=true"><i class="bi bi-plus-lg me-1"></i>发送反馈</button>
  </div>

  <div v-if="loading" style="text-align:center;padding:48px;color:#94A3B8">加载中...</div>

  <!-- 收到的反馈 -->
  <div v-else-if="tab==='received'">
    <div v-if="!received.length" class="empty-state"><i class="bi bi-chat-heart"></i><p>本周期暂无收到的反馈</p></div>
    <div v-else style="display:grid;grid-template-columns:300px 1fr;gap:20px">
      <!-- 雷达图 -->
      <div class="card">
        <div class="card-header">综合评分</div>
        <div class="card-body">
          <div style="height:200px"><canvas id="feedbackRadar"></canvas></div>
          <div style="margin-top:16px">
            <div v-for="k in ['score_quality','score_efficiency','score_teamwork','score_innovation','score_reliability']" :key="k" style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <span style="font-size:.75rem;color:#64748B;width:70px;flex-shrink:0">{{dimLabel(k)}}</span>
              <div class="progress-bar-wrap" style="flex:1">
                <div class="progress-bar-fill" :style="{width:avgScores[k.replace('score_','')]*20+'%',background:scoreBarColor(+avgScores[k.replace('score_','')])}"></div>
              </div>
              <span style="font-size:.8rem;font-weight:700;min-width:1.5rem">{{avgScores[k.replace('score_','')]}}</span>
            </div>
          </div>
          <div style="text-align:center;margin-top:12px;padding-top:12px;border-top:1px solid #F1F5F9">
            <div style="font-size:.72rem;color:#94A3B8">综合评分</div>
            <div style="font-size:2rem;font-weight:800" :style="{color:scoreBarColor(+avgScores.overall)}">{{avgScores.overall}}</div>
            <div style="font-size:.75rem;color:#94A3B8">来自 {{received.length}} 条反馈</div>
          </div>
        </div>
      </div>
      <!-- 反馈列表 -->
      <div class="card">
        <div class="card-header">反馈详情</div>
        <div style="overflow-y:auto;max-height:480px">
          <div v-for="fb in received" :key="fb.id" style="padding:16px 20px;border-bottom:1px solid #F1F5F9">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
              <div class="avatar avatar-sm" :style="{background:fb.from_color||'#94A3B8'}">{{fb.from_name?.[0]||'?'}}</div>
              <div style="flex:1">
                <span style="font-weight:600;font-size:.875rem">{{fb.from_name}}</span>
                <span style="font-size:.72rem;color:#94A3B8;margin-left:6px">{{relLabel(fb.relationship)}}</span>
              </div>
              <div style="font-weight:800;font-size:1rem" :style="{color:scoreBarColor(+fb.overall_score)}">{{fb.overall_score}}</div>
              <span style="font-size:.72rem;color:#94A3B8">{{Utils.timeAgo(fb.created_at)}}</span>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">
              <div v-for="k in ['score_quality','score_efficiency','score_teamwork','score_innovation','score_reliability']" :key="k" style="text-align:center">
                <div style="font-size:.6rem;color:#94A3B8">{{dimLabel(k).substring(0,4)}}</div>
                <div style="font-weight:700;font-size:.875rem" :style="{color:scoreBarColor(+fb[k])}">{{fb[k]}}</div>
              </div>
            </div>
            <p v-if="fb.comment" style="font-size:.875rem;color:#475569;margin:0;font-style:italic">"{{fb.comment}}"</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 发出的反馈 -->
  <div v-else-if="tab==='sent'">
    <div v-if="!sent.length" class="empty-state"><i class="bi bi-chat-square-heart"></i><p>本周期暂未发出反馈</p></div>
    <div v-else class="card">
      <table class="data-table">
        <thead><tr><th>反馈对象</th><th>关系</th><th>综合评分</th><th>评价</th><th>时间</th></tr></thead>
        <tbody>
          <tr v-for="fb in sent" :key="fb.id">
            <td>
              <div style="display:flex;align-items:center;gap:8px">
                <div class="avatar avatar-sm" :style="{background:fb.to_color}">{{fb.to_name?.[0]}}</div>
                <div>
                  <div style="font-weight:600">{{fb.to_name}}</div>
                  <div style="font-size:.72rem;color:#94A3B8">{{fb.to_title}}</div>
                </div>
              </div>
            </td>
            <td><span style="font-size:.78rem">{{relLabel(fb.relationship)}}</span></td>
            <td><span style="font-weight:700" :style="{color:scoreBarColor(+fb.overall_score)}">{{fb.overall_score}}</span></td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8rem;color:#64748B">{{fb.comment||'-'}}</td>
            <td style="font-size:.78rem;color:#94A3B8">{{Utils.timeAgo(fb.created_at)}}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- 发送反馈弹窗 -->
  <div v-if="showSend" class="modal-overlay" @click.self="showSend=false">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <h5>发送 360° 反馈</h5>
        <button class="btn-close-custom" @click="showSend=false">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
          <div>
            <label class="form-label">反馈对象 *</label>
            <select v-model="form.to_id" class="form-select">
              <option value="">请选择</option>
              <option v-for="e in employees" :key="e.id" :value="e.id">{{e.name}} ({{e.dept_name}})</option>
            </select>
          </div>
          <div>
            <label class="form-label">关系</label>
            <select v-model="form.relationship" class="form-select">
              <option value="peer">同级同事</option>
              <option value="subordinate">下属</option>
              <option value="superior">上级</option>
              <option value="cross_dept">跨部门</option>
            </select>
          </div>
        </div>
        <div style="margin-bottom:16px">
          <label class="form-label" style="margin-bottom:10px">各维度评分 (1-5分)</label>
          <div v-for="item in [{k:'score_quality',l:'工作质量与专业能力'},{k:'score_efficiency',l:'工作效率与执行力'},{k:'score_teamwork',l:'团队协作与沟通'},{k:'score_innovation',l:'创新思维与解决问题'},{k:'score_reliability',l:'责任心与可靠性'}]" :key="item.k" style="display:flex;align-items:center;gap:12px;margin-bottom:10px;padding:8px;background:#F8FAFC;border-radius:8px">
            <span style="font-size:.8rem;font-weight:600;width:140px;flex-shrink:0">{{item.l}}</span>
            <input type="range" min="1" max="5" step="0.5" v-model.number="form[item.k]" style="flex:1;accent-color:#4F46E5">
            <span style="font-weight:800;color:#4F46E5;min-width:2rem;text-align:right">{{form[item.k]}}</span>
          </div>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">评价内容 *</label>
          <textarea v-model="form.comment" class="form-control" rows="3" placeholder="请对该同事的工作表现给出具体、有建设性的评价..."></textarea>
        </div>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
          <input type="checkbox" v-model="form.is_anonymous" style="accent-color:#4F46E5;width:16px;height:16px">
          <span style="font-size:.875rem">匿名提交（被反馈者将看不到你的身份）</span>
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showSend=false">取消</button>
        <button class="btn btn-primary" @click="submitFeedback" :disabled="submitting">{{submitting?'提交中...':'提交反馈'}}</button>
      </div>
    </div>
  </div>
</div>
  `
};
// END_FEEDBACK

// ============================================================
// 1-on-1 View
// ============================================================
const OneOnOneView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() {
    return {
      meetings: [], employees: [], loading: true, tab: 'upcoming',
      showCreate: false, showDetail: null,
      form: { employee_id:'', scheduled_at:'', agenda:['工作进展','困难与挑战','职业发展','其他'] },
      newAction: { text:'', owner:'', due_date:'' },
      submitting: false,
    };
  },
  computed: {
    filtered() {
      if (this.tab==='upcoming') return this.meetings.filter(m=>m.status==='scheduled');
      if (this.tab==='done') return this.meetings.filter(m=>m.status==='completed');
      return this.meetings;
    },
    detailActions() {
      if (!this.showDetail?.action_items) return [];
      try { return JSON.parse(this.showDetail.action_items); } catch(e) { return []; }
    },
    detailAgenda() {
      if (!this.showDetail?.agenda) return [];
      try { return JSON.parse(this.showDetail.agenda); } catch(e) { return []; }
    },
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const [meetings, emps] = await Promise.all([
          $api.oneOnOne.list(),
          this.isManager ? $api.employees.list() : Promise.resolve([])
        ]);
        this.meetings = meetings || [];
        this.employees = (emps||[]).filter(e=>e.id!==this.user.id&&e.role!=='hr');
      } finally { this.loading = false; }
    },
    async createMeeting() {
      if (!this.form.employee_id||!this.form.scheduled_at) { Utils.toast('请填写员工和面谈时间','error'); return; }
      this.submitting = true;
      try {
        await $api.oneOnOne.create({ ...this.form, cycle_id:1 });
        Utils.toast('面谈已安排');
        this.showCreate = false;
        this.form = { employee_id:'', scheduled_at:'', agenda:['工作进展','困难与挑战','职业发展','其他'] };
        await this.load();
      } catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    openDetail(m) {
      this.showDetail = { ...m };
      this.newAction = { text:'', owner:'', due_date:'' };
    },
    async updateNotes() {
      try {
        await $api.oneOnOne.update(this.showDetail.id, { notes: this.showDetail.notes });
        Utils.toast('笔记已保存');
        const idx = this.meetings.findIndex(m=>m.id===this.showDetail.id);
        if (idx>=0) this.meetings[idx].notes = this.showDetail.notes;
      } catch(e) { Utils.toast(e.message,'error'); }
    },
    async completeMeeting() {
      try {
        await $api.oneOnOne.update(this.showDetail.id, { status:'completed', notes:this.showDetail.notes });
        Utils.toast('面谈已标记完成');
        this.showDetail.status = 'completed';
        const idx = this.meetings.findIndex(m=>m.id===this.showDetail.id);
        if (idx>=0) this.meetings[idx].status = 'completed';
      } catch(e) { Utils.toast(e.message,'error'); }
    },
    async addAction() {
      if (!this.newAction.text) return;
      const actions = [...this.detailActions, { id:Date.now(), ...this.newAction, done:false }];
      try {
        await $api.oneOnOne.update(this.showDetail.id, { action_items: actions });
        this.showDetail.action_items = JSON.stringify(actions);
        this.newAction = { text:'', owner:'', due_date:'' };
        Utils.toast('行动项已添加');
      } catch(e) { Utils.toast(e.message,'error'); }
    },
    async toggleAction(action) {
      const actions = this.detailActions.map(a=>a.id===action.id?{...a,done:!a.done}:a);
      try {
        await $api.oneOnOne.update(this.showDetail.id, { action_items: actions });
        this.showDetail.action_items = JSON.stringify(actions);
      } catch(e) { Utils.toast(e.message,'error'); }
    },
  },
  mounted() { this.load(); },
  template: `
<div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div style="display:flex;gap:4px;background:#F1F5F9;padding:4px;border-radius:10px">
      <button v-for="t in [{k:'upcoming',l:'即将进行'},{k:'done',l:'已完成'},{k:'all',l:'全部'}]" :key="t.k" @click="tab=t.k"
        :style="{padding:'6px 16px',borderRadius:'7px',border:'none',fontWeight:600,fontSize:'.8rem',cursor:'pointer',background:tab===t.k?'white':'transparent',color:tab===t.k?'#1E293B':'#64748B',boxShadow:tab===t.k?'0 1px 3px rgba(0,0,0,.1)':'none'}">
        {{t.l}}
      </button>
    </div>
    <button v-if="isManager" class="btn btn-primary btn-sm" @click="showCreate=true"><i class="bi bi-plus-lg me-1"></i>安排面谈</button>
  </div>

  <div v-if="loading" style="text-align:center;padding:48px;color:#94A3B8">加载中...</div>
  <div v-else-if="!filtered.length" class="empty-state"><i class="bi bi-people"></i><p>{{tab==='upcoming'?'暂无即将进行的面谈':tab==='done'?'暂无已完成的面谈':'暂无面谈记录'}}</p></div>
  <div v-else style="display:grid;gap:12px">
    <div v-for="m in filtered" :key="m.id" class="card" style="cursor:pointer" @click="openDetail(m)">
      <div class="card-body" style="padding:16px 20px">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="background:#EEF2FF;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center">
              <i class="bi bi-people-fill" style="color:#4F46E5;font-size:1.2rem"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:.95rem">
                {{isManager ? '与 ' + m.employee_name : '与 ' + m.manager_name}} 的 1-on-1
              </div>
              <div style="font-size:.78rem;color:#94A3B8;margin-top:2px">
                <i class="bi bi-clock me-1"></i>{{Utils.formatDateTime(m.scheduled_at)}}
                <span v-if="m.status==='completed'&&m.completed_at"> · 完成于 {{Utils.formatDate(m.completed_at)}}</span>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <div v-if="detailActions.length" style="display:flex;align-items:center;gap:4px;font-size:.78rem;color:#64748B">
              <i class="bi bi-check-square"></i>
              {{JSON.parse(m.action_items||'[]').filter(a=>a.done).length}}/{{JSON.parse(m.action_items||'[]').length}} 行动项
            </div>
            <span class="status-tag" :class="m.status">{{Utils.statusLabel(m.status)}}</span>
            <i class="bi bi-chevron-right" style="color:#94A3B8"></i>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 新建面谈弹窗 -->
  <div v-if="showCreate" class="modal-overlay" @click.self="showCreate=false">
    <div class="modal-box">
      <div class="modal-header"><h5>安排1-on-1面谈</h5><button class="btn-close-custom" @click="showCreate=false">✕</button></div>
      <div class="modal-body">
        <div style="margin-bottom:14px">
          <label class="form-label">选择员工 *</label>
          <select v-model="form.employee_id" class="form-select">
            <option value="">请选择</option>
            <option v-for="e in employees" :key="e.id" :value="e.id">{{e.name}} ({{e.dept_name}})</option>
          </select>
        </div>
        <div style="margin-bottom:14px">
          <label class="form-label">面谈时间 *</label>
          <input type="datetime-local" v-model="form.scheduled_at" class="form-control">
        </div>
        <div>
          <label class="form-label">议题（点击编辑）</label>
          <div style="display:flex;flex-direction:column;gap:4px">
            <div v-for="(item,i) in form.agenda" :key="i" style="display:flex;align-items:center;gap:6px">
              <i class="bi bi-dot" style="color:#4F46E5;font-size:1.2rem;flex-shrink:0"></i>
              <input v-model="form.agenda[i]" class="form-control" style="flex:1;padding:5px 10px;font-size:.875rem">
              <button class="btn btn-ghost btn-sm btn-icon" @click="form.agenda.splice(i,1)" v-if="form.agenda.length>1"><i class="bi bi-x" style="color:#EF4444"></i></button>
            </div>
            <button class="btn btn-ghost btn-sm" @click="form.agenda.push('')" style="align-self:flex-start;margin-top:4px"><i class="bi bi-plus-lg me-1"></i>添加议题</button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showCreate=false">取消</button>
        <button class="btn btn-primary" @click="createMeeting" :disabled="submitting">{{submitting?'创建中...':'创建面谈'}}</button>
      </div>
    </div>
  </div>

  <!-- 面谈详情弹窗 -->
  <div v-if="showDetail" class="modal-overlay" @click.self="showDetail=null">
    <div class="modal-box modal-lg">
      <div class="modal-header">
        <div>
          <h5>1-on-1 面谈详情</h5>
          <div style="font-size:.78rem;color:#94A3B8;margin-top:2px">{{Utils.formatDateTime(showDetail.scheduled_at)}} · 状态：<span class="status-tag" :class="showDetail.status" style="font-size:.68rem">{{Utils.statusLabel(showDetail.status)}}</span></div>
        </div>
        <button class="btn-close-custom" @click="showDetail=null">✕</button>
      </div>
      <div class="modal-body">
        <!-- 议题 -->
        <div style="margin-bottom:20px">
          <div style="font-weight:700;font-size:.875rem;margin-bottom:8px"><i class="bi bi-list-check me-2" style="color:#4F46E5"></i>面谈议题</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            <span v-for="(a,i) in detailAgenda" :key="i" style="background:#F1F5F9;padding:4px 12px;border-radius:20px;font-size:.8rem">{{a}}</span>
          </div>
        </div>
        <!-- 笔记 -->
        <div style="margin-bottom:20px">
          <div style="font-weight:700;font-size:.875rem;margin-bottom:8px"><i class="bi bi-journal-text me-2" style="color:#4F46E5"></i>面谈笔记</div>
          <textarea v-model="showDetail.notes" class="form-control" rows="4" placeholder="记录面谈要点、决定事项..." @blur="updateNotes" :disabled="showDetail.status==='completed'&&!isManager"></textarea>
          <div style="font-size:.72rem;color:#94A3B8;margin-top:4px">离开文本框时自动保存</div>
        </div>
        <!-- 行动项 -->
        <div>
          <div style="font-weight:700;font-size:.875rem;margin-bottom:10px"><i class="bi bi-check-square me-2" style="color:#4F46E5"></i>行动项 ({{detailActions.filter(a=>a.done).length}}/{{detailActions.length}} 完成)</div>
          <div v-if="!detailActions.length" style="font-size:.8rem;color:#94A3B8;padding:8px 0">暂无行动项</div>
          <div v-for="action in detailActions" :key="action.id" style="display:flex;align-items:flex-start;gap:8px;padding:8px 0;border-bottom:1px solid #F8FAFC">
            <input type="checkbox" :checked="action.done" @change="toggleAction(action)" style="margin-top:2px;accent-color:#4F46E5;width:16px;height:16px;flex-shrink:0">
            <div style="flex:1">
              <div :style="{textDecoration:action.done?'line-through':'none',color:action.done?'#94A3B8':'#1E293B',fontSize:'.875rem',fontWeight:600}">{{action.text}}</div>
              <div style="font-size:.72rem;color:#94A3B8;margin-top:2px">
                <span v-if="action.owner"><i class="bi bi-person me-1"></i>{{action.owner}}</span>
                <span v-if="action.due_date" :style="{marginLeft:action.owner?'12px':'0',color:new Date(action.due_date)<new Date()&&!action.done?'#EF4444':'#94A3B8'}"><i class="bi bi-calendar-event me-1"></i>{{action.due_date}}</span>
              </div>
            </div>
          </div>
          <!-- 添加行动项 -->
          <div style="display:flex;gap:6px;margin-top:10px">
            <input v-model="newAction.text" class="form-control" style="flex:1.5;font-size:.8rem;padding:5px 10px" placeholder="行动项内容...">
            <input v-model="newAction.owner" class="form-control" style="flex:1;font-size:.8rem;padding:5px 8px" placeholder="负责人">
            <input type="date" v-model="newAction.due_date" class="form-control" style="flex:1;font-size:.8rem;padding:5px 8px">
            <button class="btn btn-primary btn-sm" @click="addAction"><i class="bi bi-plus-lg"></i></button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showDetail=null">关闭</button>
        <button v-if="showDetail.status==='scheduled'&&isManager" class="btn btn-success" @click="completeMeeting"><i class="bi bi-check-lg me-1"></i>标记完成</button>
      </div>
    </div>
  </div>
</div>
  `
};
// END_1ON1

// ============================================================
// Profile View
// ============================================================
const ProfileView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() { return { profile: null, loading: true, charts: {}, showPwdModal: false, pwdForm: { old_password:'', new_password:'', confirm:'' }, pwdSubmitting: false }; },
  computed: {
    emp() { return this.profile?.employee; },
    history() { return this.profile?.history||[]; },
    goalStats() { return this.profile?.goalStats||[]; },
    feedbackStats() { return this.profile?.feedbackStats; },
    actionItems() { return this.profile?.actionItems||[]; },
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        this.profile = await $api.profile(this.user.id);
      } finally {
        this.loading = false;
        this.$nextTick(()=>this.renderCharts());
      }
    },
    renderCharts() {
      // 历史绩效折线图
      const hc = document.getElementById('historyChart');
      if (hc && this.history.length) {
        if (this.charts.history) this.charts.history.destroy();
        const gradeMap = {S:4.8,A:4.2,B:3.5,C:2.5,D:1.5};
        this.charts.history = new Chart(hc, {
          type: 'line',
          data: {
            labels: [...this.history].reverse().map(h=>h.cycle_name),
            datasets: [{
              label: '绩效分数', data: [...this.history].reverse().map(h=>h.final_score||gradeMap[h.final_grade]||null),
              borderColor:'#4F46E5', backgroundColor:'rgba(79,70,229,.08)',
              tension:.3, fill:true, pointRadius:5, pointBackgroundColor:'#4F46E5'
            }]
          },
          options: { scales:{ y:{ min:1, max:5, ticks:{ callback:v=>({1:'D',1.5:'D',2.5:'C',3.5:'B',4.2:'A',4.8:'S'}[v]||'')} } }, plugins:{legend:{display:false}}, responsive:true, maintainAspectRatio:false }
        });
      }
      // 目标完成率柱状图
      const gc = document.getElementById('goalChart');
      if (gc && this.goalStats.length) {
        if (this.charts.goal) this.charts.goal.destroy();
        this.charts.goal = new Chart(gc, {
          type:'bar',
          data: {
            labels: [...this.goalStats].reverse().map(g=>g.cycle_name),
            datasets: [{
              label:'平均完成率%', data: [...this.goalStats].reverse().map(g=>g.avg_progress||0),
              backgroundColor:'#4F46E5', borderRadius:6
            }]
          },
          options: { scales:{y:{max:100,ticks:{callback:v=>v+'%'}}}, plugins:{legend:{display:false}}, responsive:true, maintainAspectRatio:false }
        });
      }
      // 360雷达图
      const rc = document.getElementById('profileRadar');
      if (rc && this.feedbackStats?.count) {
        if (this.charts.radar) this.charts.radar.destroy();
        const s = this.feedbackStats;
        this.charts.radar = new Chart(rc, {
          type:'radar',
          data: {
            labels:['工作质量','工作效率','团队协作','创新思维','责任心'],
            datasets:[{
              data:[s.avg_quality,s.avg_efficiency,s.avg_teamwork,s.avg_innovation,s.avg_reliability],
              backgroundColor:'rgba(79,70,229,.15)', borderColor:'#4F46E5', borderWidth:2, pointBackgroundColor:'#4F46E5', pointRadius:4
            }]
          },
          options:{scales:{r:{min:0,max:5,ticks:{display:false},grid:{color:'#E2E8F0'}}},plugins:{legend:{display:false}},responsive:true,maintainAspectRatio:false}
        });
      }
    },
    roleLabel(r) { return {hr:'HR管理员',manager:'部门经理',employee:'员工'}[r]||r; },
    async changePwd() {
      const { old_password, new_password, confirm } = this.pwdForm;
      if (!old_password || !new_password) { Utils.toast('请填写完整', 'error'); return; }
      if (new_password.length < 6) { Utils.toast('新密码至少 6 位', 'error'); return; }
      if (new_password !== confirm) { Utils.toast('两次密码不一致', 'error'); return; }
      this.pwdSubmitting = true;
      try {
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: this.user.email, old_password, new_password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '修改失败');
        Utils.toast('密码修改成功，请重新登录');
        this.showPwdModal = false;
        setTimeout(() => {
          localStorage.clear();
          window.location.href = '/?logout=1';
        }, 1500);
      } catch(e) { Utils.toast(e.message, 'error'); }
      finally { this.pwdSubmitting = false; }
    },
  },
  mounted() { this.load(); },
  beforeUnmount() { Object.values(this.charts).forEach(c=>c?.destroy()); },
  template: `
<div v-if="loading" style="text-align:center;padding:60px;color:#94A3B8">加载中...</div>
<div v-else-if="!emp" class="empty-state"><i class="bi bi-person-x"></i><p>档案加载失败</p></div>
<div v-else>
  <!-- 个人信息卡 -->
  <div class="card" style="margin-bottom:20px">
    <div class="card-body" style="padding:24px">
      <div style="display:flex;align-items:center;gap:20px">
        <div class="avatar avatar-xl" :style="{background:emp.avatar_color}">{{emp.name[0]}}</div>
        <div style="flex:1">
          <div style="font-size:1.4rem;font-weight:800;margin-bottom:4px">{{emp.name}}</div>
          <div style="font-size:.9rem;color:#64748B;margin-bottom:8px">{{emp.title}} · {{emp.dept_name}}</div>
          <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
            <span style="font-size:.78rem;background:#EEF2FF;color:#4F46E5;padding:3px 10px;border-radius:20px">{{roleLabel(emp.role)}}</span>
            <span style="font-size:.78rem;color:#64748B"><i class="bi bi-briefcase me-1"></i>{{emp.level}}</span>
            <span style="font-size:.78rem;color:#64748B"><i class="bi bi-calendar me-1"></i>入职 {{Utils.formatDate(emp.hire_date)}}</span>
            <button @click="showPwdModal=true;pwdForm={old_password:'',new_password:'',confirm:''}" class="btn btn-secondary btn-sm" style="font-size:.72rem;padding:3px 10px;margin-left:auto">
              <i class="bi bi-key me-1"></i>修改密码
            </button>
          </div>
        </div>
        <!-- 最新绩效等级 -->
        <div v-if="history[0]?.final_grade" style="text-align:center;padding:16px 24px;background:#F8FAFC;border-radius:12px;border:1px solid #E2E8F0">
          <div style="font-size:.72rem;color:#94A3B8;margin-bottom:4px">最新等级</div>
          <div class="grade-badge" :class="history[0].final_grade" style="width:48px;height:48px;font-size:1.3rem">{{history[0].final_grade}}</div>
          <div style="font-size:.72rem;color:#94A3B8;margin-top:4px">{{Utils.gradeLabel(history[0].final_grade)}}</div>
        </div>
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
    <!-- 历史绩效趋势 -->
    <div class="card">
      <div class="card-header">历史绩效趋势</div>
      <div class="card-body">
        <div v-if="!history.length" class="empty-state" style="padding:24px"><i class="bi bi-graph-up"></i><p>暂无历史数据</p></div>
        <div v-else style="height:160px"><canvas id="historyChart"></canvas></div>
        <div v-if="history.length" style="margin-top:12px;display:flex;flex-wrap:wrap;gap:8px">
          <div v-for="h in history" :key="h.cycle_name" style="text-align:center;padding:6px 12px;background:#F8FAFC;border-radius:8px;border:1px solid #E2E8F0">
            <div style="font-size:.68rem;color:#94A3B8">{{h.cycle_name}}</div>
            <div class="grade-badge" :class="h.final_grade" style="width:24px;height:24px;font-size:.72rem;margin:3px auto 0" v-if="h.final_grade">{{h.final_grade}}</div>
            <div style="font-size:.65rem;color:#94A3B8" v-else>{{Utils.statusLabel(h.status)}}</div>
          </div>
        </div>
      </div>
    </div>
    <!-- 360反馈雷达图 -->
    <div class="card">
      <div class="card-header">最新360反馈</div>
      <div class="card-body">
        <div v-if="!feedbackStats?.count" class="empty-state" style="padding:24px"><i class="bi bi-radar"></i><p>暂无360反馈数据</p></div>
        <div v-else>
          <div style="height:160px"><canvas id="profileRadar"></canvas></div>
          <div style="text-align:center;margin-top:8px">
            <span style="font-size:1.5rem;font-weight:800;color:#4F46E5">{{feedbackStats.avg_overall}}</span>
            <span style="font-size:.78rem;color:#94A3B8"> / 5 · {{feedbackStats.count}}条反馈</span>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
    <!-- 目标完成率 -->
    <div class="card">
      <div class="card-header">历史目标完成率</div>
      <div class="card-body">
        <div v-if="!goalStats.length" class="empty-state" style="padding:24px"><i class="bi bi-bullseye"></i><p>暂无目标数据</p></div>
        <div v-else style="height:140px"><canvas id="goalChart"></canvas></div>
      </div>
    </div>
    <!-- 行动项 -->
    <div class="card">
      <div class="card-header">近期行动项</div>
      <div class="card-body" style="padding:0">
        <div v-if="!actionItems.length" class="empty-state"><i class="bi bi-check-square"></i><p>暂无行动项</p></div>
        <div v-for="a in actionItems" :key="a.id" style="display:flex;align-items:flex-start;gap:8px;padding:10px 16px;border-bottom:1px solid #F8FAFC">
          <i class="bi" :class="a.done?'bi-check-circle-fill':'bi-circle'" :style="{color:a.done?'#16A34A':'#94A3B8',fontSize:'1rem',flexShrink:0,marginTop:'2px'}"></i>
          <div style="flex:1">
            <div :style="{textDecoration:a.done?'line-through':'none',color:a.done?'#94A3B8':'#1E293B',fontSize:'.875rem'}">{{a.text}}</div>
            <div style="font-size:.72rem;color:#94A3B8;margin-top:2px" v-if="a.due_date"><i class="bi bi-calendar-event me-1"></i>{{a.due_date}}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<!-- 修改密码弹窗 -->
<div v-if="showPwdModal" class="modal-overlay" @click.self="showPwdModal=false">
  <div class="modal-box" style="max-width:400px">
    <div class="modal-header"><h5><i class="bi bi-key me-2" style="color:#4F46E5"></i>修改密码</h5><button class="btn-close-custom" @click="showPwdModal=false">✕</button></div>
    <div class="modal-body">
      <div style="margin-bottom:12px">
        <label class="form-label">当前密码</label>
        <input type="password" v-model="pwdForm.old_password" class="form-control" placeholder="请输入当前密码" autocomplete="current-password">
      </div>
      <div style="margin-bottom:12px">
        <label class="form-label">新密码</label>
        <input type="password" v-model="pwdForm.new_password" class="form-control" placeholder="至少 6 位" autocomplete="new-password">
      </div>
      <div style="margin-bottom:4px">
        <label class="form-label">确认新密码</label>
        <input type="password" v-model="pwdForm.confirm" class="form-control" placeholder="再次输入新密码" autocomplete="new-password">
      </div>
      <p style="font-size:.75rem;color:#94A3B8;margin-top:8px"><i class="bi bi-info-circle me-1"></i>密码修改成功后将自动退出登录</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" @click="showPwdModal=false">取消</button>
      <button class="btn btn-primary" @click="changePwd" :disabled="pwdSubmitting">{{pwdSubmitting?'修改中...':'确认修改'}}</button>
    </div>
  </div>
</div>
  `
};
// END_PROFILE

// ============================================================
// Reports View
// ============================================================
const ReportsView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() { return { summary:null, distribution:[], depts:[], empRanking:[], loading:true, filterDept:'', departments:[], charts:{} }; },
  methods: {
    async load() {
      this.loading = true;
      try {
        const [sum, dist, depts, emps, allDepts] = await Promise.all([
          $api.reports.summary(), $api.reports.distribution(), $api.reports.departments(),
          $api.reports.employees(1, this.filterDept||undefined), $api.departments.list()
        ]);
        this.summary = sum; this.distribution = dist||[]; this.depts = depts||[];
        this.empRanking = emps||[]; this.departments = allDepts||[];
      } finally { this.loading = false; this.$nextTick(()=>this.renderCharts()); }
    },
    renderCharts() {
      const gc = document.getElementById('gradeDistChart');
      if (gc && this.distribution.length) {
        if (this.charts.grade) this.charts.grade.destroy();
        const colors = {S:'#D97706',A:'#16A34A',B:'#2563EB',C:'#EA580C',D:'#94A3B8'};
        this.charts.grade = new Chart(gc, {
          type:'doughnut',
          data:{ labels:this.distribution.map(d=>d.grade+' '+Utils.gradeLabel(d.grade)), datasets:[{data:this.distribution.map(d=>d.count),backgroundColor:this.distribution.map(d=>colors[d.grade]),borderWidth:0}] },
          options:{cutout:'65%',plugins:{legend:{position:'right',labels:{font:{size:12},boxWidth:12}}},responsive:true,maintainAspectRatio:false}
        });
      }
      const dc = document.getElementById('deptCompChart');
      if (dc && this.depts.length) {
        if (this.charts.dept) this.charts.dept.destroy();
        this.charts.dept = new Chart(dc, {
          type:'bar',
          data:{
            labels:this.depts.map(d=>d.dept_name),
            datasets:[
              {label:'提交率%', data:this.depts.map(d=>d.total?Math.round(d.submitted/d.total*100):0), backgroundColor:'#4F46E5', borderRadius:4, yAxisID:'y'},
              {label:'平均分', data:this.depts.map(d=>d.avg_score||0), backgroundColor:'#16A34A', borderRadius:4, yAxisID:'y1'}
            ]
          },
          options:{plugins:{legend:{display:true}},scales:{y:{max:100,ticks:{callback:v=>v+'%'}},y1:{position:'right',min:0,max:5}},responsive:true,maintainAspectRatio:false}
        });
      }
    },
    gradeColor(g) { return {S:'#D97706',A:'#16A34A',B:'#2563EB',C:'#EA580C',D:'#94A3B8'}[g]||'#94A3B8'; },
  },
  mounted() { this.load(); },
  beforeUnmount() { Object.values(this.charts).forEach(c=>c?.destroy()); },
  template: `
<div>
  <div v-if="loading" style="text-align:center;padding:60px;color:#94A3B8">加载中...</div>
  <div v-else>
    <!-- KPI卡片 -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
      <div class="kpi-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <span class="kpi-label">总人数</span><div class="kpi-icon" style="background:#EEF2FF"><i class="bi bi-people-fill" style="color:#4F46E5"></i></div>
        </div>
        <div class="kpi-value">{{summary?.total_employees||0}}</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <span class="kpi-label">评估完成率</span><div class="kpi-icon" style="background:#DCFCE7"><i class="bi bi-check-circle-fill" style="color:#16A34A"></i></div>
        </div>
        <div class="kpi-value" style="color:#16A34A">{{summary?.review_completion_rate||0}}%</div>
        <div class="kpi-sub">{{summary?.review_submitted}}/{{summary?.review_total}} 人</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <span class="kpi-label">目标完成率</span><div class="kpi-icon" style="background:#FEF9C3"><i class="bi bi-bullseye" style="color:#D97706"></i></div>
        </div>
        <div class="kpi-value" style="color:#D97706">{{summary?.goals_completion_rate||0}}%</div>
      </div>
      <div class="kpi-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px">
          <span class="kpi-label">360反馈总数</span><div class="kpi-icon" style="background:#EDE9FE"><i class="bi bi-chat-heart-fill" style="color:#7C3AED"></i></div>
        </div>
        <div class="kpi-value" style="color:#7C3AED">{{summary?.feedback_count||0}}</div>
      </div>
    </div>
    <!-- 图表 -->
    <div style="display:grid;grid-template-columns:1fr 1.5fr;gap:20px;margin-bottom:24px">
      <div class="card">
        <div class="card-header">绩效等级分布</div>
        <div class="card-body" style="height:220px">
          <canvas id="gradeDistChart"></canvas>
          <div v-if="!distribution.length" class="empty-state" style="padding:20px"><i class="bi bi-pie-chart"></i><p>暂无校准数据</p></div>
        </div>
      </div>
      <div class="card">
        <div class="card-header">部门绩效对比</div>
        <div class="card-body" style="height:220px"><canvas id="deptCompChart"></canvas></div>
      </div>
    </div>
    <!-- 员工排名 -->
    <div class="card">
      <div class="card-header">
        员工绩效排名
        <select v-model="filterDept" @change="load" class="form-select" style="width:160px;font-size:.8rem;padding:5px 10px">
          <option value="">全部部门</option>
          <option v-for="d in departments" :key="d.id" :value="d.id">{{d.name}}</option>
        </select>
      </div>
      <div class="card-body" style="padding:0">
        <table class="data-table">
          <thead><tr><th>排名</th><th>员工</th><th>部门</th><th>最终等级</th><th>自评分</th><th>经理评分</th><th>360均分</th><th>目标完成</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="(e,i) in empRanking" :key="e.id">
              <td style="font-weight:700;color:#64748B">{{i+1}}</td>
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="avatar avatar-sm" :style="{background:e.avatar_color}">{{e.name[0]}}</div>
                  <div><div style="font-weight:600">{{e.name}}</div><div style="font-size:.72rem;color:#94A3B8">{{e.title}}</div></div>
                </div>
              </td>
              <td><span style="font-size:.78rem;padding:2px 8px;border-radius:4px" :style="{background:e.dept_color+'20',color:e.dept_color}">{{e.dept_name}}</span></td>
              <td><span v-if="e.final_grade" class="grade-badge" :class="e.final_grade">{{e.final_grade}}</span><span v-else style="color:#94A3B8;font-size:.8rem">-</span></td>
              <td style="font-weight:600">{{e.self_goal_score||'-'}}</td>
              <td style="font-weight:600">{{e.manager_goal_score||'-'}}</td>
              <td style="font-weight:600" :style="{color:e.avg_feedback_score?Utils.progressColor(e.avg_feedback_score*20):null}">{{e.avg_feedback_score?parseFloat(e.avg_feedback_score).toFixed(1):'-'}}</td>
              <td>
                <div v-if="e.avg_goal_progress!=null" style="display:flex;align-items:center;gap:6px">
                  <div class="progress-bar-wrap" style="width:60px"><div class="progress-bar-fill" :style="{width:e.avg_goal_progress+'%',background:Utils.progressColor(e.avg_goal_progress)}"></div></div>
                  <span style="font-size:.78rem;font-weight:600">{{Math.round(e.avg_goal_progress)}}%</span>
                </div>
                <span v-else style="color:#94A3B8;font-size:.8rem">-</span>
              </td>
              <td><span class="status-tag" :class="e.review_status||'pending'" style="font-size:.68rem">{{Utils.statusLabel(e.review_status||'pending')}}</span></td>
            </tr>
          </tbody>
        </table>
        <div v-if="!empRanking.length" class="empty-state"><i class="bi bi-table"></i><p>暂无数据</p></div>
      </div>
    </div>
  </div>
</div>
  `
};
// END_REPORTS

// ============================================================
// Calibration View
// ============================================================
const CalibrationView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() { return { items:[], departments:[], loading:true, filterDept:'', editItem:null, editGrade:'', editNotes:'', submitting:false }; },
  computed: {
    grouped() {
      const g = {};
      this.items.forEach(i => { const k=i.dept_name||'未分配'; if(!g[k]) g[k]=[]; g[k].push(i); });
      return Object.entries(g);
    },
    gradeStats() {
      const s = {S:0,A:0,B:0,C:0,D:0};
      this.items.forEach(i=>{ const g=i.final_grade||i.preliminary_grade; if(g&&s[g]!==undefined) s[g]++; });
      return s;
    }
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const [items, depts] = await Promise.all([
          $api.calibration.list({ cycle_id:1, dept_id:this.filterDept||undefined }),
          $api.departments.list()
        ]);
        this.items = items||[]; this.departments = depts||[];
      } finally { this.loading = false; }
    },
    async saveGrade() {
      if (!this.editGrade) return;
      this.submitting = true;
      try {
        await $api.calibration.update(this.editItem.employee_id, { cycle_id:1, final_grade:this.editGrade, notes:this.editNotes });
        this.editItem.final_grade = this.editGrade; this.editItem.notes = this.editNotes;
        Utils.toast('等级已更新'); this.editItem = null;
      } catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    gradeCount(g) { return this.items.filter(i=>(i.final_grade||i.preliminary_grade)===g).length; },
  },
  mounted() { this.load(); },
  template: `
<div>
  <!-- 等级分布统计 -->
  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <div v-for="g in ['S','A','B','C','D']" :key="g" style="flex:1;min-width:80px;padding:12px 16px;border-radius:10px;text-align:center;border:1px solid" :style="{borderColor:Utils.gradeColor(g)+'40',background:Utils.gradeColor(g)+'10'}">
      <div class="grade-badge" :class="g" style="margin:0 auto 6px">{{g}}</div>
      <div style="font-size:1.4rem;font-weight:800" :style="{color:Utils.gradeColor(g)}">{{gradeCount(g)}}</div>
      <div style="font-size:.68rem;color:#94A3B8">{{Utils.gradeLabel(g)}}</div>
    </div>
    <div style="flex:0 0 auto;display:flex;align-items:center">
      <select v-model="filterDept" @change="load" class="form-select" style="width:140px;font-size:.8rem">
        <option value="">全部部门</option>
        <option v-for="d in departments" :key="d.id" :value="d.id">{{d.name}}</option>
      </select>
    </div>
  </div>

  <div v-if="loading" style="text-align:center;padding:48px;color:#94A3B8">加载中...</div>
  <div v-else-if="!items.length" class="empty-state"><i class="bi bi-sliders"></i><p>暂无校准数据</p></div>
  <div v-else>
    <div v-for="[deptName, deptItems] in grouped" :key="deptName" class="card" style="margin-bottom:16px">
      <div class="card-header">{{deptName}} <span style="font-size:.78rem;color:#94A3B8;font-weight:400">({{deptItems.length}}人)</span></div>
      <div class="card-body" style="padding:0">
        <table class="data-table">
          <thead><tr><th>员工</th><th>自评分</th><th>经理分</th><th>建议等级</th><th>最终等级</th><th>备注</th><th>操作</th></tr></thead>
          <tbody>
            <tr v-for="item in deptItems" :key="item.employee_id">
              <td>
                <div style="display:flex;align-items:center;gap:8px">
                  <div class="avatar avatar-sm" :style="{background:item.avatar_color}">{{item.name?.[0]}}</div>
                  <div><div style="font-weight:600">{{item.name}}</div><div style="font-size:.72rem;color:#94A3B8">{{item.title}}</div></div>
                </div>
              </td>
              <td style="font-weight:600">{{item.self_goal_score||'-'}}</td>
              <td style="font-weight:600">{{item.manager_goal_score||'-'}}</td>
              <td><span v-if="item.preliminary_grade" class="grade-badge" :class="item.preliminary_grade" style="opacity:.7">{{item.preliminary_grade}}</span><span v-else style="color:#94A3B8">-</span></td>
              <td>
                <span v-if="item.final_grade" class="grade-badge" :class="item.final_grade">{{item.final_grade}}</span>
                <span v-else style="color:#94A3B8;font-size:.8rem">待校准</span>
              </td>
              <td style="font-size:.78rem;color:#64748B;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{item.notes||'-'}}</td>
              <td>
                <button class="btn btn-secondary btn-sm" @click="editItem=item;editGrade=item.final_grade||item.preliminary_grade||'B';editNotes=item.notes||''">
                  <i class="bi bi-pen-fill me-1"></i>{{item.final_grade?'修改':'设置等级'}}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- 编辑等级弹窗 -->
  <div v-if="editItem" class="modal-overlay" @click.self="editItem=null">
    <div class="modal-box">
      <div class="modal-header"><h5>设置最终等级 — {{editItem.name}}</h5><button class="btn-close-custom" @click="editItem=null">✕</button></div>
      <div class="modal-body">
        <div style="margin-bottom:16px">
          <label class="form-label">最终绩效等级</label>
          <div style="display:flex;gap:10px;margin-top:8px">
            <label v-for="g in [{v:'S',l:'超越期望'},{v:'A',l:'优秀'},{v:'B',l:'达标'},{v:'C',l:'待提升'},{v:'D',l:'不达标'}]" :key="g.v"
              :style="{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'4px',cursor:'pointer',padding:'10px 6px',borderRadius:'10px',border:'2px solid',borderColor:editGrade===g.v?Utils.gradeColor(g.v):'#E2E8F0',background:editGrade===g.v?Utils.gradeColor(g.v)+'15':'white'}">
              <input type="radio" v-model="editGrade" :value="g.v" style="display:none">
              <div class="grade-badge" :class="g.v" :style="{opacity:editGrade===g.v?1:.4}">{{g.v}}</div>
              <span style="font-size:.68rem;font-weight:600" :style="{color:editGrade===g.v?Utils.gradeColor(g.v):'#94A3B8'}">{{g.l}}</span>
            </label>
          </div>
        </div>
        <div>
          <label class="form-label">校准备注</label>
          <textarea v-model="editNotes" class="form-control" rows="2" placeholder="说明等级调整的原因或依据..."></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="editItem=null">取消</button>
        <button class="btn btn-primary" @click="saveGrade" :disabled="submitting">{{submitting?'保存中...':'确认等级'}}</button>
      </div>
    </div>
  </div>
</div>
  `
};
// END_CALIBRATION

// ============================================================
// Employees View
// ============================================================
const EmployeesView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() { return { employees:[], departments:[], loading:true, search:'', filterDept:'', showModal:false, editEmp:null, form:{name:'',email:'',role:'employee',department_id:'',title:'',level:'',hire_date:'',manager_id:''}, submitting:false }; },
  computed: {
    filtered() {
      return this.employees.filter(e => {
        if (this.search && !e.name.includes(this.search) && !e.email.includes(this.search)) return false;
        if (this.filterDept && e.department_id != this.filterDept) return false;
        return true;
      });
    },
    managers() { return this.employees.filter(e=>['manager','hr'].includes(e.role)); }
  },
  methods: {
    async load() {
      this.loading = true;
      try {
        const [emps, depts] = await Promise.all([$api.employees.list(), $api.departments.list()]);
        this.employees = emps||[]; this.departments = depts||[];
      } finally { this.loading = false; }
    },
    openCreate() { this.editEmp=null; this.form={name:'',email:'',role:'employee',department_id:'',title:'',level:'',hire_date:'',manager_id:''}; this.showModal=true; },
    openEdit(e) { this.editEmp=e; this.form={name:e.name,email:e.email,role:e.role,department_id:e.department_id,title:e.title||'',level:e.level||'',hire_date:e.hire_date||'',manager_id:e.manager_id||''}; this.showModal=true; },
    async save() {
      if (!this.form.name||!this.form.email) { Utils.toast('请填写姓名和邮箱','error'); return; }
      this.submitting = true;
      try {
        if (this.editEmp) { await $api.employees.update(this.editEmp.id, this.form); Utils.toast('员工信息已更新'); }
        else { await $api.employees.create(this.form); Utils.toast('员工已添加'); }
        this.showModal = false; await this.load();
      } catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    roleLabel(r) { return {hr:'HR管理员',manager:'部门经理',employee:'员工'}[r]||r; },
    roleColor(r) { return {hr:'#FEE2E2,#DC2626',manager:'#EEF2FF,#4F46E5',employee:'#DCFCE7,#16A34A'}[r]||'#F1F5F9,#64748B'; },
  },
  mounted() { this.load(); },
  template: `
<div>
  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap">
    <div class="search-box" style="flex:1;min-width:200px">
      <i class="bi bi-search search-icon"></i>
      <input v-model="search" class="form-control" placeholder="搜索姓名或邮箱...">
    </div>
    <select v-model="filterDept" class="form-select" style="width:160px">
      <option value="">全部部门</option>
      <option v-for="d in departments" :key="d.id" :value="d.id">{{d.name}}</option>
    </select>
    <button class="btn btn-primary btn-sm" @click="openCreate"><i class="bi bi-person-plus-fill me-1"></i>添加员工</button>
  </div>
  <div class="card">
    <div class="card-header">员工列表 <span style="font-weight:400;color:#94A3B8;font-size:.8rem">({{filtered.length}}人)</span></div>
    <div class="card-body" style="padding:0">
      <div v-if="loading" style="text-align:center;padding:48px;color:#94A3B8">加载中...</div>
      <div v-else-if="!filtered.length" class="empty-state"><i class="bi bi-people"></i><p>没有找到匹配的员工</p></div>
      <table v-else class="data-table">
        <thead><tr><th>员工</th><th>部门</th><th>职级</th><th>角色</th><th>入职时间</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="e in filtered" :key="e.id">
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div class="avatar avatar-sm" :style="{background:e.avatar_color}">{{e.name[0]}}</div>
                <div><div style="font-weight:600">{{e.name}}</div><div style="font-size:.72rem;color:#94A3B8">{{e.email}}</div></div>
              </div>
            </td>
            <td><span style="font-size:.8rem;padding:2px 8px;border-radius:4px" :style="{background:e.dept_color+'20',color:e.dept_color}">{{e.dept_name||'-'}}</span></td>
            <td style="font-size:.8rem;color:#64748B">{{e.title||'-'}} <span v-if="e.level" style="font-size:.72rem;color:#94A3B8">· {{e.level}}</span></td>
            <td><span style="font-size:.72rem;font-weight:700;padding:2px 8px;border-radius:4px" :style="{background:roleColor(e.role).split(',')[0],color:roleColor(e.role).split(',')[1]}">{{roleLabel(e.role)}}</span></td>
            <td style="font-size:.8rem;color:#64748B">{{Utils.formatDate(e.hire_date)}}</td>
            <td><button class="btn btn-ghost btn-sm" @click="openEdit(e)"><i class="bi bi-pen-fill me-1"></i>编辑</button></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <!-- 新增/编辑弹窗 -->
  <div v-if="showModal" class="modal-overlay" @click.self="showModal=false">
    <div class="modal-box">
      <div class="modal-header"><h5>{{editEmp?'编辑员工':'添加员工'}}</h5><button class="btn-close-custom" @click="showModal=false">✕</button></div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div style="margin-bottom:12px"><label class="form-label">姓名 *</label><input v-model="form.name" class="form-control" placeholder="张三"></div>
          <div style="margin-bottom:12px"><label class="form-label">邮箱 *</label><input v-model="form.email" type="email" class="form-control" placeholder="zhang@company.com" :disabled="!!editEmp"></div>
          <div style="margin-bottom:12px"><label class="form-label">部门</label><select v-model="form.department_id" class="form-select"><option value="">请选择</option><option v-for="d in departments" :key="d.id" :value="d.id">{{d.name}}</option></select></div>
          <div style="margin-bottom:12px"><label class="form-label">角色</label><select v-model="form.role" class="form-select"><option value="employee">员工</option><option value="manager">部门经理</option><option value="hr">HR管理员</option></select></div>
          <div style="margin-bottom:12px"><label class="form-label">职位</label><input v-model="form.title" class="form-control" placeholder="工程师"></div>
          <div style="margin-bottom:12px"><label class="form-label">级别</label><input v-model="form.level" class="form-control" placeholder="P5"></div>
          <div style="margin-bottom:12px"><label class="form-label">入职日期</label><input type="date" v-model="form.hire_date" class="form-control"></div>
          <div style="margin-bottom:12px"><label class="form-label">直属上级</label><select v-model="form.manager_id" class="form-select"><option value="">无</option><option v-for="m in managers" :key="m.id" :value="m.id">{{m.name}}</option></select></div>
        </div>
        <div style="background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:10px 12px;font-size:.78rem;color:#9A3412" v-if="!editEmp">
          <i class="bi bi-info-circle me-1"></i>新员工默认密码为 <strong>123456</strong>，请提醒其登录后修改。
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showModal=false">取消</button>
        <button class="btn btn-primary" @click="save" :disabled="submitting">{{submitting?'保存中...':editEmp?'保存修改':'添加员工'}}</button>
      </div>
    </div>
  </div>
</div>
  `
};
// END_EMPLOYEES

// ============================================================
// Cycles View
// ============================================================
const CyclesView = {
  props: ['user','isHr','isManager','activeCycle'],
  data() { return { cycles:[], loading:true, showCreate:false, form:{name:'',type:'quarterly',start_date:'',end_date:'',self_review_end:'',manager_review_end:'',calibration_end:''}, submitting:false }; },
  methods: {
    async load() {
      this.loading = true;
      try {
        this.cycles = await $api.cycles.list() || [];
        // 为进行中的周期加载详细统计
        for (const c of this.cycles) {
          if (['active','calibrating'].includes(c.status)) {
            try {
              const detail = await $api.cycles.get(c.id);
              c.stats = detail.stats;
            } catch(e) {}
          }
        }
      }
      finally { this.loading = false; }
    },
    async create() {
      if (!this.form.name) { Utils.toast('请填写周期名称','error'); return; }
      this.submitting = true;
      try { await $api.cycles.create(this.form); Utils.toast('绩效周期已创建'); this.showCreate=false; await this.load(); }
      catch(e) { Utils.toast(e.message,'error'); }
      finally { this.submitting = false; }
    },
    async setStatus(c, status) {
      if (status === 'completed') {
        // 需要加载详情确认所有员工已确认
        try {
          const detail = await $api.cycles.get(c.id);
          const { total, confirmed } = detail.stats || {};
          if (confirmed < total) {
            Utils.toast(`还有 ${total - confirmed} 位员工未确认绩效结果，无法标记为完成`, 'error');
            return;
          }
        } catch(e) {}
      }
      const labels = { active:'激活周期（将为所有员工创建评估记录并发送通知）', calibrating:'进入校准阶段', completed:'标记为已完成' };
      if (!confirm(labels[status]+'？')) return;
      try { await $api.cycles.setStatus(c.id, status); c.status=status; Utils.toast('状态已更新'); await this.load(); }
      catch(e) { Utils.toast(e.message,'error'); }
    },
    typeLabel(t) { return {quarterly:'季度',biannual:'半年度',annual:'年度'}[t]||t; },
    nextStatus(s) { return {draft:'active',active:'calibrating',calibrating:'completed'}[s]; },
    nextLabel(s) { return {draft:'激活',active:'进入校准',calibrating:'完成'}[s]; },
  },
  mounted() { this.load(); },
  template: `
<div>
  <div style="display:flex;justify-content:flex-end;margin-bottom:20px">
    <button class="btn btn-primary btn-sm" @click="showCreate=true"><i class="bi bi-plus-lg me-1"></i>创建周期</button>
  </div>
  <div v-if="loading" style="text-align:center;padding:48px;color:#94A3B8">加载中...</div>
  <div v-else-if="!cycles.length" class="empty-state"><i class="bi bi-calendar-range"></i><p>暂无绩效周期</p></div>
  <div v-else style="display:grid;gap:12px">
    <div v-for="c in cycles" :key="c.id" class="card">
      <div class="card-body" style="padding:18px 20px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
          <div style="display:flex;align-items:center;gap:12px">
            <div style="background:#EEF2FF;width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center">
              <i class="bi bi-calendar-range-fill" style="color:#4F46E5;font-size:1.2rem"></i>
            </div>
            <div>
              <div style="font-weight:700;font-size:1rem">{{c.name}}</div>
              <div style="font-size:.78rem;color:#94A3B8;margin-top:2px">
                {{typeLabel(c.type)}} · {{Utils.formatDate(c.start_date)}} 至 {{Utils.formatDate(c.end_date)}}
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:10px">
            <span class="status-tag" :class="c.status">{{Utils.statusLabel(c.status)}}</span>
            <button v-if="nextStatus(c.status)" class="btn btn-primary btn-sm" @click="setStatus(c,nextStatus(c.status))">
              <i class="bi bi-arrow-right-circle me-1"></i>{{nextLabel(c.status)}}
            </button>
          </div>
        </div>
        <div v-if="c.self_review_end" style="display:flex;gap:16px;margin-top:12px;padding-top:12px;border-top:1px solid #F1F5F9;flex-wrap:wrap;align-items:center">
          <div style="font-size:.75rem;color:#64748B"><i class="bi bi-pen me-1" style="color:#4F46E5"></i>自评截止：{{Utils.formatDate(c.self_review_end)}}</div>
          <div style="font-size:.75rem;color:#64748B"><i class="bi bi-person-check me-1" style="color:#16A34A"></i>经理评截止：{{Utils.formatDate(c.manager_review_end)}}</div>
          <div style="font-size:.75rem;color:#64748B"><i class="bi bi-sliders me-1" style="color:#D97706"></i>校准截止：{{Utils.formatDate(c.calibration_end)}}</div>
        </div>
        <!-- 进度统计（仅active/calibrating显示） -->
        <div v-if="['active','calibrating'].includes(c.status)" style="margin-top:12px;padding:10px 14px;background:#F8FAFC;border-radius:8px;display:flex;gap:20px;align-items:center;flex-wrap:wrap">
          <div v-if="c.stats" style="display:flex;gap:20px;font-size:.78rem;flex-wrap:wrap">
            <span><i class="bi bi-pen-fill me-1" style="color:#4F46E5"></i>自评 {{c.stats.self_done}}/{{c.stats.total}}</span>
            <span><i class="bi bi-person-check-fill me-1" style="color:#16A34A"></i>经理评 {{c.stats.manager_done}}/{{c.stats.total}}</span>
            <span><i class="bi bi-check-circle-fill me-1" style="color:#D97706"></i>已确认 {{c.stats.confirmed||0}}/{{c.stats.total}}</span>
          </div>
          <div v-if="c.status==='calibrating'" style="margin-left:auto;font-size:.75rem" :style="{color:(c.stats?.confirmed||0)>=c.stats?.total?'#16A34A':'#94A3B8'}">
            <i class="bi" :class="(c.stats?.confirmed||0)>=c.stats?.total?'bi-check-circle-fill':'bi-hourglass-split'" class="me-1"></i>
            {{(c.stats?.confirmed||0)>=(c.stats?.total||0) ? '所有员工已确认，可标记完成' : ('还有 ' + ((c.stats?.total||0)-(c.stats?.confirmed||0)) + ' 人待确认')}}
          </div>
        </div>
      </div>
    </div>
  </div>
  <!-- 创建弹窗 -->
  <div v-if="showCreate" class="modal-overlay" @click.self="showCreate=false">
    <div class="modal-box">
      <div class="modal-header"><h5>创建绩效周期</h5><button class="btn-close-custom" @click="showCreate=false">✕</button></div>
      <div class="modal-body">
        <div style="margin-bottom:12px"><label class="form-label">周期名称 *</label><input v-model="form.name" class="form-control" placeholder="例：2025 Q1 绩效评估"></div>
        <div style="margin-bottom:12px"><label class="form-label">周期类型</label><select v-model="form.type" class="form-select"><option value="quarterly">季度（每季度）</option><option value="biannual">半年度（每半年）</option><option value="annual">年度（每年）</option></select></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
          <div><label class="form-label">开始日期</label><input type="date" v-model="form.start_date" class="form-control"></div>
          <div><label class="form-label">结束日期</label><input type="date" v-model="form.end_date" class="form-control"></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px">
          <div><label class="form-label">自评截止</label><input type="date" v-model="form.self_review_end" class="form-control"></div>
          <div><label class="form-label">经理评截止</label><input type="date" v-model="form.manager_review_end" class="form-control"></div>
          <div><label class="form-label">校准截止</label><input type="date" v-model="form.calibration_end" class="form-control"></div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" @click="showCreate=false">取消</button>
        <button class="btn btn-primary" @click="create" :disabled="submitting">{{submitting?'创建中...':'创建周期'}}</button>
      </div>
    </div>
  </div>
</div>
  `
};
// END_CYCLES

// ============================================================
// Notifications View
// ============================================================
const NotificationsView = {
  props: ['user','isHr','isManager','activeCycle'],
  emits: ['navigate'],
  data() { return { notifs:[], loading:true }; },
  computed: { unread() { return this.notifs.filter(n=>!n.is_read); } },
  methods: {
    async load() {
      this.loading = true;
      try { this.notifs = await $api.notifications.list()||[]; }
      finally { this.loading = false; }
    },
    async readAll() {
      await $api.notifications.readAll();
      this.notifs.forEach(n=>n.is_read=1);
      Utils.toast('全部已读');
    },
    async readOne(n) {
      if (!n.is_read) { await $api.notifications.read(n.id); n.is_read=1; }
      if (n.link) this.$emit('navigate', n.link);
    },
    typeIcon(t) { return {reminder:'bi-bell-fill',system:'bi-gear-fill',feedback:'bi-chat-heart-fill',review:'bi-clipboard-check-fill'}[t]||'bi-dot'; },
    typeColor(t) { return {reminder:'#D97706',system:'#4F46E5',feedback:'#DB2777',review:'#16A34A'}[t]||'#64748B'; },
  },
  mounted() { this.load(); },
  template: `
<div>
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
    <div style="font-size:.875rem;color:#64748B">{{unread.length}} 条未读</div>
    <button v-if="unread.length" class="btn btn-secondary btn-sm" @click="readAll"><i class="bi bi-check-all me-1"></i>全部已读</button>
  </div>
  <div v-if="loading" style="text-align:center;padding:48px;color:#94A3B8">加载中...</div>
  <div v-else-if="!notifs.length" class="empty-state"><i class="bi bi-bell-slash"></i><p>暂无通知</p></div>
  <div v-else class="card">
    <div v-for="n in notifs" :key="n.id" @click="readOne(n)"
      style="display:flex;align-items:flex-start;gap:12px;padding:14px 20px;border-bottom:1px solid #F1F5F9;cursor:pointer;transition:background .15s"
      :style="{background:n.is_read?'white':'#F8FAFF'}"
      @mouseenter="$event.currentTarget.style.background='#F8FAFC'"
      @mouseleave="$event.currentTarget.style.background=n.is_read?'white':'#F8FAFF'">
      <div style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0" :style="{background:typeColor(n.type)+'20'}">
        <i class="bi" :class="typeIcon(n.type)" :style="{color:typeColor(n.type)}"></i>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">
          <span style="font-weight:700;font-size:.875rem" :style="{color:n.is_read?'#1E293B':'#1E293B'}">{{n.title}}</span>
          <span v-if="!n.is_read" style="width:7px;height:7px;border-radius:50%;background:#4F46E5;flex-shrink:0"></span>
        </div>
        <p style="font-size:.8rem;color:#64748B;margin:0 0 4px">{{n.body}}</p>
        <span style="font-size:.72rem;color:#94A3B8">{{Utils.timeAgo(n.created_at)}}</span>
      </div>
      <i v-if="n.link" class="bi bi-arrow-right" style="color:#94A3B8;flex-shrink:0;margin-top:8px"></i>
    </div>
  </div>
</div>
  `
};
// END_NOTIFICATIONS

// ============================================================
// Main App
// ============================================================
const { createApp } = Vue;

// 未登录直接跳转
if (!localStorage.getItem('token')) {
  window.location.href = '/';
} else {
  const app = createApp({
    data() {
      return {
        user: JSON.parse(localStorage.getItem('user') || 'null'),
        view: 'dashboard',
        unreadCount: 0,
        pendingCount: 0,
        activeCycle: null,
      };
    },
    computed: {
      isHR() { return this.user?.role === 'hr'; },
      isManagerOrHR() { return this.user && ['hr','manager'].includes(this.user.role); },
      roleLabel() { return {hr:'HR管理员',manager:'部门经理',employee:'员工'}[this.user?.role]||'员工'; },
      viewTitle() {
        return {dashboard:'首页概览',goals:'目标管理',reviews:'绩效评估',feedback:'360反馈',
          oneOnOne:'1-on-1 面谈',profile:'个人成长档案',reports:'数据报表',
          calibration:'绩效校准',employees:'员工管理',cycles:'周期管理',notifications:'通知中心'}[this.view]||'首页';
      },
      viewIcon() {
        return {dashboard:'bi bi-grid-1x2-fill',goals:'bi bi-bullseye',reviews:'bi bi-clipboard-check-fill',
          feedback:'bi bi-chat-heart-fill',oneOnOne:'bi bi-people-fill',profile:'bi bi-person-badge-fill',
          reports:'bi bi-graph-up-arrow',calibration:'bi bi-sliders',employees:'bi bi-people',
          cycles:'bi bi-calendar-range-fill',notifications:'bi bi-bell-fill'}[this.view]||'bi bi-grid-1x2-fill';
      },
      currentView() {
        return {dashboard:'dashboard-view',goals:'goals-view',reviews:'reviews-view',
          feedback:'feedback-view',oneOnOne:'one-on-one-view',profile:'profile-view',
          reports:'reports-view',calibration:'calibration-view',employees:'employees-view',
          cycles:'cycles-view',notifications:'notifications-view'}[this.view]||'dashboard-view';
      }
    },
    methods: {
      async logout() {
        await $api.auth.logout().catch(()=>{});
        localStorage.clear();
        window.location.href = '/?logout=1';
      }
    },
    watch: {
      async view() {
        try { this.activeCycle = await $api.cycles.active(); } catch(e) {}
      }
    },
    async mounted() {
      // 若 user 数据缺失，从服务器补回
      if (!this.user) {
        try {
          const me = await $api.auth.me();
          if (me) { this.user = me; localStorage.setItem('user', JSON.stringify(me)); }
          else { window.location.href = '/'; return; }
        } catch(e) { window.location.href = '/'; return; }
      }
      // 加载活跃周期
      try {
        this.activeCycle = await $api.cycles.active();
      } catch(e) {}
      const cid = this.activeCycle?.id || 1;
      // 加载通知数
      try {
        const notifs = await $api.notifications.list();
        if (notifs) this.unreadCount = notifs.filter(n=>!n.is_read).length;
      } catch(e) {}
      // 经理/HR加载待处理评分数；员工加载待自评+待确认数
      if (this.isManagerOrHR) {
        try {
          const reviews = await $api.reviews.list({ cycle_id: cid });
          if (reviews) this.pendingCount = reviews.filter(r=>r.status==='self_submitted').length;
        } catch(e) {}
      } else {
        try {
          const reviews = await $api.reviews.list({ cycle_id: cid, type:'my' });
          if (reviews) this.pendingCount = reviews.filter(r=>['pending','published'].includes(r.status)).length;
        } catch(e) {}
      }
      // 移除 loading 遮罩
      const cover = document.getElementById('page-cover');
      if (cover) { cover.style.opacity = '0'; setTimeout(()=>cover.remove(), 260); }
    }
  });

  // 将工具函数注入所有组件模板（Vue 3 模板不自动访问全局变量）
  app.config.globalProperties.Utils = Utils;

  app.component('dashboard-view', DashboardView);
  app.component('goals-view', GoalsView);
  app.component('reviews-view', ReviewsView);
  app.component('feedback-view', FeedbackView);
  app.component('one-on-one-view', OneOnOneView);
  app.component('profile-view', ProfileView);
  app.component('reports-view', ReportsView);
  app.component('calibration-view', CalibrationView);
  app.component('employees-view', EmployeesView);
  app.component('cycles-view', CyclesView);
  app.component('notifications-view', NotificationsView);

  app.mount('#app');
}

