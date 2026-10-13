import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertCircle, ArrowUpRight, Boxes, Check,
  ChevronDown, CircleHelp, Clock3, Command, Gauge, Layers3, Menu,
  PackageCheck, Plus, RefreshCw, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, Timer, Truck, X, Zap,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const EMPTY_DASHBOARD = {
  orders_processed: 0, active_tasks: 0, queued_tasks: 0, total_tasks: 0,
  workers_online: 0, resource_utilization: 0, resources_in_use: 0,
  total_resources: 12, priority_promotions: 0, avg_wait_seconds: 0,
  avg_run_seconds: 0, priority_breakdown: { HIGH: 0, MEDIUM: 0, LOW: 0 }, activity: [],
};

const formatTime = (value) => value
  ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  : '—';

function App() {
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD);
  const [tasks, setTasks] = useState([]);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [form, setForm] = useState({
    order_id: '', task_type: 'Pick & pack', priority: 'MEDIUM',
    weight: 6, resource_units: 3, execution_seconds: 6,
  });

  const refresh = useCallback(async () => {
    try {
      const [dashboardResponse, taskResponse] = await Promise.all([
        fetch(`${API}/api/dashboard`), fetch(`${API}/api/tasks`),
      ]);
      if (!dashboardResponse.ok || !taskResponse.ok) throw new Error('API request failed');
      const [dashboardData, taskData] = await Promise.all([
        dashboardResponse.json(), taskResponse.json(),
      ]);
      setDashboard(dashboardData);
      setTasks(taskData);
      setOnline(true);
      setError('');
    } catch {
      setOnline(false);
      setError('Could not connect to the scheduler API. Start the backend to see live operations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 2500);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const visibleTasks = useMemo(() => tasks.filter((task) => {
    const matchesFilter = filter === 'ALL' || task.status === filter;
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [task.order_id, task.task_type, task.priority]
      .some((value) => value?.toLowerCase().includes(query));
    return matchesFilter && matchesSearch;
  }), [tasks, filter, search]);

  async function createTask(event) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const response = await fetch(`${API}/api/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          order_id: form.order_id.trim() || null,
          weight: Number(form.weight),
          resource_units: Number(form.resource_units),
          execution_seconds: Number(form.execution_seconds),
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Unable to create task');
      }
      setModalOpen(false);
      setForm({ order_id: '', task_type: 'Pick & pack', priority: 'MEDIUM', weight: 6, resource_units: 3, execution_seconds: 6 });
      setToast('Fulfillment task added to the queue');
      await refresh();
    } catch (requestError) {
      setToast(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function loadDemo() {
    try {
      const response = await fetch(`${API}/api/demo/seed`, { method: 'POST' });
      if (!response.ok) throw new Error('Could not load demo orders');
      const result = await response.json();
      setToast(`${result.created} fulfillment tasks added`);
      refresh();
    } catch {
      setToast('Could not reach the scheduler API');
    }
  }

  const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#overview" aria-label="Fulfill home">
          <span className="brand-mark"><Boxes size={20} strokeWidth={2.4} /></span>
          <span>fulfill<span className="brand-dot">.</span></span>
        </a>
        <div className="workspace-picker">
          <span className="workspace-avatar">N</span>
          <span className="workspace-copy"><strong>Northstar Store</strong><small>Operations team</small></span>
          <ChevronDown size={15} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav className="side-nav">
          <a className="nav-item active" href="#overview" onClick={() => setMobileNav(false)}><Gauge size={17} /> Overview <span className="nav-active-dot" /></a>
          <a className="nav-item" href="#tasks" onClick={() => { setFilter('ALL'); setMobileNav(false); }}><Layers3 size={17} /> Fulfillment queue <span className="nav-count">{dashboard.queued_tasks}</span></a>
          <a className="nav-item" href="#activity" onClick={() => setMobileNav(false)}><Activity size={17} /> Activity log</a>
        </nav>
        <div className="nav-label nav-label-spaced">MANAGE</div>
        <nav className="side-nav">
          <button className="nav-item" onClick={() => { setFilter('RUNNING'); document.getElementById('tasks')?.scrollIntoView({ behavior: 'smooth' }); }}><Zap size={17} /> In progress <span className="nav-count live-count">{dashboard.active_tasks}</span></button>
          <button className="nav-item" onClick={() => { setFilter('COMPLETED'); document.getElementById('tasks')?.scrollIntoView({ behavior: 'smooth' }); }}><PackageCheck size={17} /> Completed</button>
          <button className="nav-item" onClick={() => setToast('Settings are managed from configuration.py')}><SlidersHorizontal size={17} /> Settings</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="plan-card">
          <div className="plan-card-icon"><Sparkles size={16} /></div>
          <strong>Keep orders moving</strong>
          <p>Priority scheduling keeps urgent orders at the front of the line.</p>
          <a href="#tasks">Explore the queue <ArrowUpRight size={13} /></a>
        </div>
        <div className="profile-row">
          <div className="profile-avatar">AM</div>
          <div className="profile-copy"><strong>Alex Morgan</strong><small>Store admin</small></div>
          <button aria-label="Profile options" className="icon-button tiny"><ChevronDown size={15} /></button>
        </div>
      </aside>

      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}

      <main className="main-content" id="overview">
        <header className="topbar">
          <div className="mobile-brand"><button className="icon-button menu-button" onClick={() => setMobileNav(!mobileNav)} aria-label="Toggle navigation"><Menu size={19} /></button><span className="brand-mark"><Boxes size={18} /></span><strong>fulfill<span className="brand-dot">.</span></strong></div>
          <div className="breadcrumbs"><span>Workspace</span><span className="crumb-slash">/</span><strong>Overview</strong></div>
          <div className="topbar-actions">
            <div className={`api-status ${online ? 'online' : 'offline'}`}><span />{online ? 'System operational' : 'API disconnected'}</div>
            <button className="icon-button refresh-button" onClick={refresh} aria-label="Refresh dashboard"><RefreshCw size={16} /></button>
            <button className="help-button" aria-label="Help"><CircleHelp size={17} /></button>
            <div className="topbar-divider" />
            <div className="topbar-date"><span>Today</span><strong>{today}</strong></div>
          </div>
        </header>

        <div className="page-wrap">
          {error && <div className="connection-banner"><AlertCircle size={17} /><span>{error}</span><button onClick={refresh}>Retry <RefreshCw size={13} /></button></div>}
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" />FULFILLMENT OVERVIEW</div><h1>Good morning, Alex <span className="wave">✳</span></h1><p>Here’s what’s happening with your orders today.</p></div>
            <div className="welcome-actions"><button className="secondary-button" onClick={loadDemo}><Sparkles size={15} /> Load demo orders</button><button className="primary-button" onClick={() => setModalOpen(true)}><Plus size={17} /> Create task</button></div>
          </section>

          <section className="metrics-grid" aria-label="Fulfillment metrics">
            <MetricCard icon={PackageCheck} iconClass="violet" label="Orders processed" value={dashboard.orders_processed} note="Completed fulfillment tasks" trend="Live" trendUp />
            <MetricCard icon={Zap} iconClass="orange" label="Active tasks" value={dashboard.active_tasks} note={`${dashboard.workers_online} workers online`} trend="In progress" />
            <MetricCard icon={Clock3} iconClass="blue" label="Waiting in queue" value={dashboard.queued_tasks} note="Prioritized by urgency & weight" trend={`${dashboard.priority_promotions} escalated`} />
            <MetricCard icon={Gauge} iconClass="green" label="Resource utilization" value={`${dashboard.resource_utilization}%`} note={`${dashboard.resources_in_use} of ${dashboard.total_resources} units in use`} progress={dashboard.resource_utilization} />
          </section>

          <section className="insights-grid">
            <article className="panel priority-panel">
              <div className="panel-heading"><div><div className="section-kicker">QUEUE HEALTH</div><h2>Priority distribution</h2></div><button className="more-button" aria-label="More queue options"><span /><span /><span /></button></div>
              <p className="panel-subtitle">Tasks currently waiting or being processed</p>
              <div className="priority-chart">
                <div className="donut-wrap"><svg className="donut" viewBox="0 0 120 120" role="img" aria-label="Current task priority distribution"><circle className="donut-track" cx="60" cy="60" r="47" /><circle className="donut-high" cx="60" cy="60" r="47" strokeDasharray={donutDash(dashboard.priority_breakdown?.HIGH, dashboard)} strokeDashoffset="0" /><circle className="donut-medium" cx="60" cy="60" r="47" strokeDasharray={donutDash(dashboard.priority_breakdown?.MEDIUM, dashboard)} strokeDashoffset={-donutLength(dashboard.priority_breakdown?.HIGH, dashboard)} /><circle className="donut-low" cx="60" cy="60" r="47" strokeDasharray={donutDash(dashboard.priority_breakdown?.LOW, dashboard)} strokeDashoffset={-donutLength((dashboard.priority_breakdown?.HIGH || 0) + (dashboard.priority_breakdown?.MEDIUM || 0), dashboard)} /></svg><div className="donut-center"><strong>{dashboard.queued_tasks + dashboard.active_tasks}</strong><span>open tasks</span></div></div>
                <div className="priority-legend"><PriorityRow name="High priority" color="high" count={dashboard.priority_breakdown?.HIGH || 0} total={dashboard.queued_tasks + dashboard.active_tasks} /><PriorityRow name="Medium priority" color="medium" count={dashboard.priority_breakdown?.MEDIUM || 0} total={dashboard.queued_tasks + dashboard.active_tasks} /><PriorityRow name="Low priority" color="low" count={dashboard.priority_breakdown?.LOW || 0} total={dashboard.queued_tasks + dashboard.active_tasks} /></div>
              </div>
              <div className="panel-footer"><span><span className="footer-live-dot" /> Auto-refreshing every 2.5 sec</span><span>Priority aging enabled</span></div>
            </article>

            <article className="panel performance-panel">
              <div className="panel-heading"><div><div className="section-kicker">TEAM PERFORMANCE</div><h2>Processing snapshot</h2></div><div className="period-pill"><span className="period-dot" /> Live <ChevronDown size={13} /></div></div>
              <p className="panel-subtitle">Real-time fulfillment throughput</p>
              <div className="performance-highlight"><div><span>Average wait time</span><strong>{dashboard.avg_wait_seconds}<small> sec</small></strong></div><div className="performance-icon"><Timer size={19} /></div></div>
              <div className="performance-list"><div className="performance-row"><span><span className="perf-dot purple-dot" />Average execution</span><strong>{dashboard.avg_run_seconds}s</strong></div><div className="performance-row"><span><span className="perf-dot green-dot" />Workers available</span><strong>{dashboard.workers_online} <small>/ 3</small></strong></div><div className="performance-row"><span><span className="perf-dot blue-dot" />Resource pool</span><strong>{dashboard.total_resources - dashboard.resources_in_use} <small>units free</small></strong></div></div>
              <div className="capacity-bar"><span style={{ width: `${Math.min(100, dashboard.resource_utilization)}%` }} /></div>
              <div className="capacity-label"><span>Capacity used</span><strong>{dashboard.resource_utilization}%</strong></div>
            </article>
          </section>

          <section className="bottom-grid">
            <article className="panel tasks-panel" id="tasks">
              <div className="panel-heading tasks-heading"><div><div className="section-kicker">ORDER OPERATIONS</div><h2>Fulfillment queue <span className="heading-count">{visibleTasks.length}</span></h2></div><button className="text-button" onClick={() => { setFilter('ALL'); setSearch(''); }}>View all <ArrowUpRight size={14} /></button></div>
              <div className="table-toolbar"><div className="filter-tabs">{['ALL', 'QUEUED', 'RUNNING', 'COMPLETED'].map((item) => <button key={item} className={filter === item ? 'filter-tab selected' : 'filter-tab'} onClick={() => setFilter(item)}>{item === 'ALL' ? 'All tasks' : titleCase(item)}</button>)}</div><label className="search-field"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders" /></label></div>
              <div className="table-scroll"><table><thead><tr><th>ORDER / TASK</th><th>PRIORITY</th><th>WEIGHT</th><th>STATUS</th><th>WORKER</th><th>CREATED</th></tr></thead><tbody>
                {visibleTasks.slice(0, 8).map((task) => <tr key={task.id}><td><div className="order-cell"><span className={`task-type-icon ${taskIconClass(task.task_type)}`}>{taskIcon(task.task_type)}</span><span><strong>{task.order_id}</strong><small>{task.task_type}</small></span></div></td><td><PriorityBadge priority={task.priority} /></td><td><span className="weight-label"><Zap size={12} />{task.weight}</span></td><td><StatusBadge status={task.status} /></td><td><span className="worker-label">{task.worker || '—'}</span></td><td className="created-cell">{formatTime(task.created_at)}</td></tr>)}
                {!visibleTasks.length && <tr><td colSpan="6"><div className="empty-state">{loading ? 'Connecting to live queue…' : 'No tasks match this view.'}<button onClick={() => setModalOpen(true)}>Create a task <Plus size={13} /></button></div></td></tr>}
              </tbody></table></div>
              <div className="table-bottom"><span>Showing <strong>{Math.min(visibleTasks.length, 8)}</strong> of <strong>{visibleTasks.length}</strong> tasks</span><span className="table-updated"><span className="footer-live-dot" />Live updates</span></div>
            </article>

            <article className="panel activity-panel" id="activity">
              <div className="panel-heading"><div><div className="section-kicker">RIGHT NOW</div><h2>Live activity</h2></div><span className="live-pill"><span />LIVE</span></div>
              <div className="activity-list">{dashboard.activity?.slice(-6).reverse().map((event, index) => <div className="activity-item" key={event.id}><div className={`activity-icon activity-${activityClass(event.message)}`}>{activityIcon(event.message)}</div><div className="activity-copy"><p>{event.message}</p><span>{event.source} <i>·</i> {formatTime(event.at)}</span></div><span className="activity-line" /></div>)}{!dashboard.activity?.length && <div className="activity-empty">Scheduler activity will appear here.</div>}</div>
              <button className="activity-link" onClick={() => setToast('Showing the latest scheduler events')}>View activity log <ArrowUpRight size={14} /></button>
            </article>
          </section>
          <footer className="page-footer"><span><Command size={13} /> Fulfill operations</span><span>Built for orders that keep moving <span className="footer-heart">♥</span></span><button onClick={() => setToast('Scheduler API · FastAPI · Live thread workers')}>API status <span className={`tiny-status ${online ? 'status-on' : ''}`} /></button></footer>
        </div>
      </main>

      {modalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setModalOpen(false); }}><section className="task-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><div className="section-kicker">NEW WORK ITEM</div><h2 id="modal-title">Create fulfillment task</h2><p>Add an order task to the live priority queue.</p></div><button className="icon-button" onClick={() => setModalOpen(false)} aria-label="Close dialog"><X size={18} /></button></div><form onSubmit={createTask}><label className="form-label">Order ID <span>Optional — generated automatically</span><input value={form.order_id} onChange={(event) => setForm({ ...form, order_id: event.target.value })} placeholder="e.g. ORD-2409" maxLength="32" /></label><label className="form-label">Fulfillment task<select value={form.task_type} onChange={(event) => setForm({ ...form, task_type: event.target.value })}>{['Payment verification', 'Inventory reservation', 'Pick & pack', 'Fraud review', 'Shipping label', 'Carrier booking'].map((type) => <option key={type}>{type}</option>)}</select></label><div className="form-two-col"><label className="form-label">Priority<select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })}><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label><label className="form-label">Weight <span>1–10</span><input type="number" min="1" max="10" value={form.weight} onChange={(event) => setForm({ ...form, weight: event.target.value })} /></label></div><div className="form-two-col"><label className="form-label">Resource units <span>1–8</span><input type="number" min="1" max="8" value={form.resource_units} onChange={(event) => setForm({ ...form, resource_units: event.target.value })} /></label><label className="form-label">Est. duration <span>seconds</span><input type="number" min="1" max="30" value={form.execution_seconds} onChange={(event) => setForm({ ...form, execution_seconds: event.target.value })} /></label></div><div className="modal-note"><ShieldCheck size={16} /><span>Urgent tasks are dispatched first. Waiting tasks automatically age into higher priority.</span></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>Cancel</button><button type="submit" className="primary-button" disabled={submitting || !online}>{submitting ? <><RefreshCw className="spin" size={15} /> Adding…</> : <><Plus size={16} /> Add to queue</>}</button></div></form></section></div>}
      {toast && <div className="toast"><span><Check size={14} /></span>{toast}</div>}
    </div>
  );
}

function MetricCard({ icon: Icon, iconClass, label, value, note, trend, trendUp, progress }) {
  return <article className="metric-card"><div className="metric-top"><span className={`metric-icon ${iconClass}`}><Icon size={18} /></span><span className={`metric-trend ${trendUp ? 'trend-up' : ''}`}>{trendUp && <ArrowUpRight size={12} />}{trend}</span></div><div className="metric-value">{value}</div><div className="metric-label">{label}</div><div className="metric-note">{note}</div>{progress !== undefined && <div className="metric-progress"><span style={{ width: `${progress}%` }} /></div>}</article>;
}

function PriorityRow({ name, color, count, total }) {
  const percent = total ? Math.round(count / total * 100) : 0;
  return <div className="priority-row"><div className="priority-row-top"><span><i className={`legend-dot ${color}`} />{name}</span><strong>{count}<small> · {percent}%</small></strong></div><div className="priority-track"><span className={color} style={{ width: `${percent}%` }} /></div></div>;
}

function PriorityBadge({ priority }) { return <span className={`priority-badge ${priority?.toLowerCase()}`}><i />{titleCase(priority || '')}</span>; }
function StatusBadge({ status }) { return <span className={`status-badge ${status?.toLowerCase()}`}><i />{titleCase(status || '')}</span>; }
function titleCase(value) { return value ? value.charAt(0) + value.slice(1).toLowerCase() : ''; }
function donutLength(count, data) { const total = data.queued_tasks + data.active_tasks; return total ? (count / total) * 295.3 : 0; }
function donutDash(count, data) { const total = data.queued_tasks + data.active_tasks; return `${total ? (count / total) * 295.3 : 0} 295.3`; }
function taskIconClass(type) { return type?.includes('Payment') || type?.includes('Fraud') ? 'icon-purple' : type?.includes('Inventory') || type?.includes('Pick') ? 'icon-blue' : 'icon-green'; }
function taskIcon(type) { return type?.includes('Shipping') || type?.includes('Carrier') ? <Truck size={15} /> : type?.includes('Fraud') ? <ShieldCheck size={15} /> : <PackageCheck size={15} />; }
function activityClass(message) { return message?.includes('completed') ? 'done' : message?.includes('started') ? 'start' : message?.includes('raised') ? 'raised' : 'queued'; }
function activityIcon(message) { return message?.includes('completed') ? <Check size={14} /> : message?.includes('started') ? <Zap size={14} /> : message?.includes('raised') ? <ArrowUpRight size={14} /> : <Plus size={14} />; }

export default App;