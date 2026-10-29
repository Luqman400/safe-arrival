import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import QRCode from 'qrcode'
import type { Session } from '@supabase/supabase-js'
import { supabase, configMissing } from './supabase'
import type { DB, NewStudent, ScanResult, Student } from './store'
import { addClass, addStudent, classList, clearArrivals, emptyDB, fetchAll, fmtTime, recordArrival, removeClass, removeStudent, today } from './store'

type Tab = 'dashboard' | 'scan' | 'students' | 'messages' | 'settings'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  if (configMissing) return (
    <div className="wrap"><div className="card bad"><h3>Missing Supabase key</h3>
      <p>Open the <b>.env</b> file, paste your anon public key after VITE_SUPABASE_ANON_KEY=, save, then stop and restart <b>npm run dev</b>.</p></div></div>
  )
  if (session === undefined) return <div className="wrap">Loading…</div>
  if (!session) return <Login />
  return <Main email={session.user.email ?? ''} />
}

function Login() {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [err, setErr] = useState('')
  const submit = async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr(error.message)
  }
  return (
    <div className="wrap"><div className="card"><h2>Safe Arrival: staff login</h2>
      <form onSubmit={e => { e.preventDefault(); submit() }}>
        <input placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        <input placeholder="Password" type="password" value={password} onChange={e => setPassword(e.target.value)} />
        <button>Sign in</button>{err && <small>{err}</small>}
      </form></div></div>
  )
}

function Main({ email }: { email: string }) {
  const [db, setDb] = useState<DB>(emptyDB())
  const [tab, setTab] = useState<Tab>('dashboard')
  const [err, setErr] = useState('')
  const refresh = async () => {
    try { setDb(await fetchAll()); setErr('') } catch (e) { setErr((e as Error).message) }
  }
  useEffect(() => { refresh() }, [])
  const act = async (fn: () => Promise<unknown>): Promise<boolean> => {
    try { await fn(); await refresh(); return true } catch (e) { setErr((e as Error).message); return false }
  }
  const scan = async (qr: string): Promise<ScanResult> => {
    try { const r = await recordArrival(qr); await refresh(); return r }
    catch (e) { setErr((e as Error).message); return { status: 'invalid' } }
  }
  return (
    <div className="wrap">
      <nav>
        <strong className="brand">Safe Arrival</strong>
        {(['dashboard', 'scan', 'students', 'messages', 'settings'] as Tab[]).map(t => (
          <button key={t} className={tab === t ? 'on' : 'ghost'} onClick={() => setTab(t)}>{t}</button>
        ))}
        <button className="ghost" onClick={refresh}>Refresh</button>
        <button className="ghost" title={email} onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
      {err && <div className="card bad">Error: {err}</div>}
      {tab === 'dashboard' && <Dashboard db={db} />}
      {tab === 'scan' && <Scan db={db} onScan={scan} />}
      {tab === 'students' && <Students db={db} onAdd={s => act(() => addStudent(s))} onDelete={id => act(() => removeStudent(id))} />}
      {tab === 'messages' && <Messages db={db} />}
      {tab === 'settings' && <Settings db={db} onAdd={n => act(() => addClass(n))} onRemove={n => act(() => removeClass(n))} onClear={() => act(clearArrivals)} />}
    </div>
  )
}

function Dashboard({ db }: { db: DB }) {
  const [q, setQ] = useState('')
  const [cls, setCls] = useState('all')
  const [status, setStatus] = useState<'all' | 'arrived' | 'pending'>('all')
  const d = today()
  const arrivalOf = (id: string) => db.arrivals.find(a => a.student_id === id && a.arrival_date === d)
  const total = db.students.length
  const arrivedCount = db.students.filter(s => arrivalOf(s.id)).length
  const rate = total ? Math.round((arrivedCount / total) * 100) : 0
  const classes = classList(db)
  const rows = db.students
    .filter(s => (cls === 'all' || s.class === cls) &&
      (status === 'all' || (status === 'arrived') === !!arrivalOf(s.id)) &&
      (`${s.full_name} ${s.admission_no} ${s.parent_name}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => a.full_name.localeCompare(b.full_name))
  const niceDate = new Date().toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <>
      <div className="head"><div><h1>Dashboard</h1><p className="muted">{niceDate}</p></div></div>

      <div className="kpis">
        <div className="kpi"><span>Total students</span><b>{total}</b></div>
        <div className="kpi green"><span>Arrived today</span><b>{arrivedCount}</b></div>
        <div className="kpi amber"><span>Not yet recorded</span><b>{total - arrivedCount}</b></div>
        <div className="kpi blue"><span>Arrival rate</span><b>{rate}%</b>
          <div className="bar"><div className="fill" style={{ width: `${rate}%` }} /></div></div>
      </div>

      {classes.length > 0 && (
        <>
          <h3 className="sec">By class</h3>
          <div className="classgrid">
            {classes.map(c => {
              const list = db.students.filter(s => s.class === c)
              const a = list.filter(s => arrivalOf(s.id)).length
              const pct = list.length ? Math.round((a / list.length) * 100) : 0
              return (
                <button key={c} className={`classcard ${cls === c ? 'sel' : ''}`} onClick={() => setCls(cls === c ? 'all' : c)}>
                  <div className="row"><b>{c}</b><span className="muted">{a}/{list.length}</span></div>
                  <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="panel">
        <div className="filters">
          <input placeholder="Search name, admission no, parent…" value={q} onChange={e => setQ(e.target.value)} />
          <select value={cls} onChange={e => setCls(e.target.value)}>
            <option value="all">All classes</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={status} onChange={e => setStatus(e.target.value as typeof status)}>
            <option value="all">All statuses</option>
            <option value="arrived">Arrived</option>
            <option value="pending">Not yet arrived</option>
          </select>
        </div>
        <div className="scroll">
          <table className="tbl">
            <thead><tr><th>Adm. No</th><th>Student name</th><th>Class</th><th>Parent</th><th>Status</th><th>Arrived at</th></tr></thead>
            <tbody>
              {rows.map(s => {
                const a = arrivalOf(s.id)
                return (
                  <tr key={s.id}>
                    <td>{s.admission_no}</td><td><b>{s.full_name}</b></td><td>{s.class}</td><td>{s.parent_name}</td>
                    <td><span className={`badge ${a ? 'g' : 'a'}`}>{a ? 'Arrived' : 'Not yet'}</span></td>
                    <td>{a ? fmtTime(a.arrived_at) : '—'}</td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="empty">{total === 0 ? 'No students yet. Create classes in Settings, then register students.' : 'No students match your filters.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

function Settings({ db, onAdd, onRemove, onClear }: { db: DB; onAdd: (n: string) => Promise<boolean>; onRemove: (n: string) => Promise<boolean>; onClear: () => Promise<boolean> }) {
  const [name, setName] = useState('')
  return (
    <>
      <div className="head"><div><h1>Settings</h1><p className="muted">Create the classes you will assign students to.</p></div></div>
      <div className="panel"><h3>Classes</h3>
        <form className="inline" onSubmit={async e => { e.preventDefault(); if (await onAdd(name)) setName('') }}>
          <input placeholder="e.g. Form 1 East" value={name} onChange={e => setName(e.target.value)} />
          <button>Add class</button>
        </form>
        <table className="tbl"><thead><tr><th>Class</th><th>Students</th><th></th></tr></thead>
          <tbody>
            {classList(db).map(c => {
              const n = db.students.filter(s => s.class === c).length
              return <tr key={c}><td><b>{c}</b></td><td>{n}</td>
                <td><button className="ghost" disabled={n > 0} title={n > 0 ? 'Remove its students first' : ''} onClick={() => onRemove(c)}>Delete</button></td></tr>
            })}
            {classList(db).length === 0 && <tr><td colSpan={3} className="empty">No classes yet.</td></tr>}
          </tbody></table>
      </div>
      <div className="panel"><h3>Testing tools</h3>
        <button className="ghost" onClick={() => { if (confirm("Delete today's arrival records and their messages?")) onClear() }}>Clear all arrivals and messages</button>
      </div>
    </>
  )
}

function Scan({ db, onScan }: { db: DB; onScan: (qr: string) => Promise<ScanResult> }) {
  const [result, setResult] = useState<ScanResult | null>(null)
  const [camErr, setCamErr] = useState('')
  const [pick, setPick] = useState('')
  const [typed, setTyped] = useState('')
  const handler = useRef<(qr: string) => void>(() => {})
  handler.current = (qr) => { onScan(qr).then(setResult) }
  const busy = useRef(false)

  useEffect(() => {
    let scanner: Html5Qrcode | null = null
    let cancelled = false
    const t = setTimeout(() => {
      if (cancelled) return
      scanner = new Html5Qrcode('reader')
      scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, (text) => {
        if (busy.current) return
        busy.current = true
        handler.current(text)
        setTimeout(() => { busy.current = false }, 2500)
      }, () => {}).catch(() => setCamErr('Camera not available. Use the simulate box below instead.'))
    }, 150)
    return () => {
      cancelled = true; clearTimeout(t)
      if (scanner && scanner.isScanning) scanner.stop().then(() => scanner!.clear()).catch(() => {})
    }
  }, [])

  const cls = result?.status === 'recorded' ? 'ok' : result?.status === 'duplicate' ? 'warn' : result ? 'bad' : ''
  return (
    <>
      <div className="card"><div id="reader" style={{ width: '100%' }} />{camErr && <p>{camErr}</p>}</div>
      <div className="card"><h3>Simulate a scan (no camera needed)</h3>
        <form onSubmit={e => { e.preventDefault(); const s = db.students.find(x => x.id === pick); if (s) handler.current(s.qr_id) }}>
          <select value={pick} onChange={e => setPick(e.target.value)}>
            <option value="">Choose a student…</option>
            {db.students.map(s => <option key={s.id} value={s.id}>{s.full_name} ({s.admission_no})</option>)}
          </select>
          <button disabled={!pick}>Simulate scan</button>
        </form>
        <form onSubmit={e => { e.preventDefault(); if (typed) handler.current(typed) }} style={{ marginTop: 8 }}>
          <input placeholder="Or type an admission number" value={typed} onChange={e => setTyped(e.target.value)} />
          <button>Scan</button>
        </form>
      </div>
      {result && (
        <div className={`card ${cls}`}>
          {result.student && <h3>{result.student.full_name} — {result.student.class}</h3>}
          {result.status === 'recorded' && <p>Arrival recorded at {result.time}. A mock SMS was added to the messages tab.</p>}
          {result.status === 'duplicate' && <p>Already recorded today. No new message sent.</p>}
          {result.status === 'invalid' && <p>Unknown QR code or admission number.</p>}
        </div>
      )}
    </>
  )
}

function Students({ db, onAdd, onDelete }: { db: DB; onAdd: (s: NewStudent) => Promise<boolean>; onDelete: (id: string) => Promise<boolean> }) {
  const blank = { admission_no: '', full_name: '', class: '', parent_name: '', phone: '' }
  const [f, setF] = useState(blank)
  const [msg, setMsg] = useState('')
  const classes = classList(db)
  const add = async () => {
    if (db.students.some(s => s.admission_no.toLowerCase() === f.admission_no.trim().toLowerCase()))
      return setMsg('That admission number already exists.')
    if (await onAdd({ ...f })) { setF({ ...blank, class: f.class }); setMsg('Student saved.') }
  }
  return (
    <>
      <div className="card"><h3>Register a student</h3>
        {classes.length === 0 && <p>Create at least one class in the <b>settings</b> tab first.</p>}
        <form onSubmit={e => { e.preventDefault(); add() }}>
          <input required placeholder="Admission number" value={f.admission_no} onChange={e => setF({ ...f, admission_no: e.target.value })} />
          <input required placeholder="Student name" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
          <select required value={f.class} onChange={e => setF({ ...f, class: e.target.value })}>
            <option value="">Choose class…</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input required placeholder="Parent name" value={f.parent_name} onChange={e => setF({ ...f, parent_name: e.target.value })} />
          <input required placeholder="Parent phone (+2547…)" value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} />
          <button>Add student</button>{msg && <small>{msg}</small>}
        </form></div>
      <div className="card"><button className="noprint" onClick={() => window.print()}>Print QR cards</button>
        <div>{db.students.map(s => <QrCard key={s.id} s={s} onDelete={() => onDelete(s.id)} />)}</div></div>
    </>
  )
}

function QrCard({ s, onDelete }: { s: Student; onDelete: () => void }) {
  const [src, setSrc] = useState('')
  useEffect(() => { QRCode.toDataURL(s.qr_id, { width: 160, margin: 1 }).then(setSrc) }, [s.qr_id])
  return (
    <div className="qr"><img src={src} alt="" /><div>{s.full_name}<br />{s.admission_no} · {s.class}</div>
      <button className="ghost noprint" onClick={onDelete}>Delete</button></div>
  )
}

function Messages({ db }: { db: DB }) {
  return (
    <div className="card"><h3>Mock SMS log</h3>
      {db.messages.length === 0 && <p>No messages yet. Record an arrival on the scan tab.</p>}
      {db.messages.map(m => (
        <p key={m.id}><b>To {m.to}</b> at {fmtTime(m.created_at)}<br />{m.body}</p>
      ))}
    </div>
  )
}
