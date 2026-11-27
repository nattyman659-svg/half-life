import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'

type Cat = { id: string; name: string; description: string | null; is_open: boolean }
type Cand = { id: string; category_id: string; full_name: string; bio: string | null; photo_url: string | null; instagram: string | null; telegram: string | null }
type Prof = { id: string; full_name: string | null; role: 'voter' | 'admin' }
type Res = { category_id: string; candidate_id: string; full_name: string; votes: number }
type Page = 'home' | 'vote' | 'profile' | 'about' | 'contact' | 'admin'

const fade = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -16 } }
const errText: Record<string, string> = { already_voted: 'You already voted in this category.', voting_closed: 'Voting is closed for this category.' }
const igUser = (v: string | null) => (v ?? '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?#].*$/, '').replace(/^@/, '')
const igHandle = (v: string) => { const u = igUser(v); return u ? '@' + u : null }
const msg = (e: { message?: string }) => Object.entries(errText).find(([k]) => e.message?.includes(k))?.[1] ?? e.message ?? 'Something went wrong'

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [prof, setProf] = useState<Prof | null>(null)
  const [page, setPageRaw] = useState<Page>('home')
  const [verified, setVerified] = useState(() => new URLSearchParams(location.search).get('verified') === '1')
  const go = useCallback((p: Page) => { history.pushState({ page: p }, '', '#' + p); setPageRaw(p) }, [])
  const [toast, setToast] = useState('')
  const [menu, setMenu] = useState(false)
  const [ready, setReady] = useState(false)
  const say = useCallback((t: string) => { setToast(t); setTimeout(() => setToast(''), 3500) }, [])

  useEffect(() => {
    history.replaceState({ page: 'home' }, '')
    const f = (e: PopStateEvent) => setPageRaw((e.state?.page as Page) ?? 'home')
    window.addEventListener('popstate', f)
    return () => window.removeEventListener('popstate', f)
  }, [])
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => {
    if (!session) return setProf(null)
    supabase.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => {
      setProf(data as Prof); if (data?.role === 'admin') { history.replaceState({ page: 'admin' }, '', '#admin'); setPageRaw('admin') } })
  }, [session])

  if (verified) return <Verified onContinue={() => { history.replaceState({ page: 'home' }, '', '/'); setVerified(false) }} />
  if (!ready) return <div className="min-h-screen grid place-items-center"><div className="h-10 w-10 rounded-full border-4 border-neon border-t-transparent animate-spin" /></div>
  if (!session) return <Auth say={say} toast={toast} />
  const links: Page[] = ['home', 'vote', 'profile', 'about', 'contact', ...(prof?.role === 'admin' ? ['admin' as Page] : [])]
  return (
    <div className="glow min-h-screen">
      <nav className="sticky top-0 z-20 backdrop-blur bg-ink/70 border-b border-white/10 flex items-center justify-between px-4 py-3">
        <b className="font-display text-xl tracking-widest text-neon">HALF LIFE</b>
        <button className="md:hidden btn bg-white/10" aria-label="Menu" onClick={() => setMenu(!menu)}>☰</button>
        <div className={`${menu ? 'flex' : 'hidden'} md:flex absolute md:static top-full left-0 right-0 flex-col md:flex-row gap-1 bg-ink md:bg-transparent p-3 md:p-0`}>
          {links.map(l => <button key={l} onClick={() => { go(l); setMenu(false) }}
            className={`btn capitalize ${page === l ? 'bg-neon text-ink' : 'hover:bg-white/10'}`}>{l}</button>)}
          <button className="btn hover:bg-white/10" onClick={() => supabase.auth.signOut()}>Logout</button>
        </div>
      </nav>
      <main className="max-w-6xl mx-auto p-4 md:p-8">
        <AnimatePresence mode="wait"><motion.div key={page} {...fade}>
          {page === 'home' && <Home go={go} />}
          {page === 'vote' && <Vote uid={session.user.id} say={say} />}
          {page === 'profile' && prof && <Profile prof={prof} email={session.user.email ?? ''} say={say} />}
          {page === 'about' && <About />}
          {page === 'contact' && <Contact />}
          {page === 'admin' && prof?.role === 'admin' && <Admin say={say} />}
        </motion.div></AnimatePresence>
      </main>
      <Toast t={toast} />
    </div>
  )
}

const Toast = ({ t }: { t: string }) => <AnimatePresence>{t && <motion.div {...fade} role="status"
  className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 card bg-ink/90 border-neon/40">{t}</motion.div>}</AnimatePresence>

function Auth({ say, toast }: { say: (t: string) => void; toast: string }) {
  const [mode, setMode] = useState<'in' | 'up' | 'reset'>('in')
  const [sid, setSid] = useState(''); const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [name, setName] = useState(''); const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true)
    if (!/^\S+@\S+\.\S+$/.test(email)) { say('Enter a valid email'); return setBusy(false) }
    if (mode === 'up') { const c = await supabase.rpc('check_student_id', { p: sid }); if (c.data !== 'ok') { say(c.data === 'taken' ? 'This Student ID is already registered' : 'Student ID not found in the class list'); return setBusy(false) } }
    const r = mode === 'in' ? await supabase.auth.signInWithPassword({ email, password: pw })
      : mode === 'up' ? await supabase.auth.signUp({ email, password: pw, options: { data: { full_name: name, student_id: sid.trim() } } })
      : await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin })
    say(r.error ? r.error.message : mode === 'in' ? 'Welcome back' : mode === 'up' ? 'Account created. Welcome!' : 'Check your email to continue'); setBusy(false)
  }
  return (
    <div className="glow min-h-screen grid place-items-center p-4">
      <motion.form {...fade} onSubmit={submit} className="card w-full max-w-md space-y-3">
        <h1 className="font-display text-4xl font-extrabold text-neon">HALF LIFE</h1>
        <p className="text-white/60">2026 Software Engineering Class Awards</p>
        {mode === 'up' && <><input required minLength={2} placeholder="Full name" value={name} onChange={e => setName(e.target.value)} /><input required placeholder="Student ID (e.g. NSR/0124/16)" value={sid} onChange={e => setSid(e.target.value)} /></>}
        <input type="email" required placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} />
        {mode !== 'reset' && <input type="password" required minLength={8} placeholder="Password (8+ chars)" value={pw} onChange={e => setPw(e.target.value)} />}
        <button disabled={busy} className="btn w-full bg-neon text-ink">{mode === 'in' ? 'Log in' : mode === 'up' ? 'Create account' : 'Send reset link'}</button>
        <div className="flex justify-between text-sm text-white/60">
          <button type="button" onClick={() => setMode(mode === 'in' ? 'up' : 'in')}>{mode === 'in' ? 'Create account' : 'Have an account? Log in'}</button>
          <button type="button" onClick={() => setMode('reset')}>Forgot password?</button></div>
      </motion.form><Toast t={toast} />
    </div>)
}

function Home({ go }: { go: (p: Page) => void }) {
  const [cats, setCats] = useState<Cat[]>([])
  useEffect(() => { supabase.from('categories').select('*').order('sort').then(({ data }) => setCats((data as Cat[]) ?? [])) }, [])
  return (<>
    <section className="py-16 md:py-28 text-center">
      <motion.h1 initial={{ scale: .9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: .8 }}
        className="font-display font-extrabold text-6xl md:text-9xl tracking-tight bg-gradient-to-r from-neon to-ember bg-clip-text text-transparent">HALF LIFE</motion.h1>
      <p className="mt-4 text-lg md:text-2xl text-white/70">The 2026 Third Year Software Engineering Awards. Your class. Your votes.</p>
      <button className="btn mt-8 bg-neon text-ink text-lg hover:scale-105" onClick={() => go('vote')}>Start Voting</button>
    </section>
    <h2 className="font-display text-2xl mb-4">Categories</h2>
    {!cats.length && <p className="text-white/50">No categories yet.</p>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{cats.map((c, i) => (
      <motion.button key={c.id} whileHover={{ y: -6 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * .04 }}
        onClick={() => go('vote')} className="card text-left">
        <span className={`text-xs px-2 py-1 rounded-full ${c.is_open ? 'bg-neon text-ink' : 'bg-white/10'}`}>{c.is_open ? 'Open' : 'Closed'}</span>
        <div className="font-display text-xl mt-3">{c.name}</div></motion.button>))}</div>
    <footer className="mt-16 pt-6 border-t border-white/10 flex gap-4 text-white/50">
      {(['vote', 'about', 'contact'] as Page[]).map(p => <button key={p} className="capitalize" onClick={() => go(p)}>{p}</button>)}</footer>
  </>)
}

function Vote({ uid, say }: { uid: string; say: (t: string) => void }) {
  const [cats, setCats] = useState<Cat[]>([]); const [cands, setCands] = useState<Cand[]>([])
  const [done, setDone] = useState<Set<string>>(new Set()); const [cat, setCat] = useState<Cat | null>(null)
  const [pick, setPick] = useState<Cand | null>(null); const [ok, setOk] = useState(false); const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const [a, b, c] = await Promise.all([supabase.from('categories').select('*').order('sort'), supabase.from('candidates').select('*'),
      supabase.from('votes').select('category_id').eq('voter_id', uid)])
    setCats((a.data as Cat[]) ?? []); setCands((b.data as Cand[]) ?? []); setDone(new Set((c.data ?? []).map(v => v.category_id)))
  }, [uid])
  useEffect(() => { load() }, [load])
  useEffect(() => { const f = (e: PopStateEvent) => { if (!e.state?.cat) setCat(null) }; window.addEventListener('popstate', f); return () => window.removeEventListener('popstate', f) }, [])
  const confirm = async () => {
    if (!pick || !cat || busy) return; setBusy(true)
    const { error } = await supabase.rpc('cast_vote', { p_category: cat.id, p_candidate: pick.id })
    setBusy(false); setPick(null)
    if (error) say(msg(error)); else { setOk(true); setTimeout(() => setOk(false), 2200); load() }
  }
  const total = cats.length
  if (!cat) return (<>
    <h2 className="font-display text-3xl">Your ballot</h2>
    <div className="h-2 bg-white/10 rounded-full my-4"><motion.div className="h-2 bg-neon rounded-full" animate={{ width: `${total ? done.size / total * 100 : 0}%` }} /></div>
    <p className="text-white/60 mb-4">{done.size} of {total} categories voted</p>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{cats.map(c => (
      <button key={c.id} onClick={() => { history.pushState({ page: 'vote', cat: c.id }, '', '#vote'); setCat(c) }} className="card text-left hover:border-neon/50">
        <div className="font-display text-xl">{c.name}</div>
        <div className="text-sm mt-2 text-white/60">{done.has(c.id) ? '✓ Voted' : c.is_open ? 'Open for voting' : 'Closed'}</div></button>))}</div></>)
  const list = cands.filter(k => k.category_id === cat.id)
  return (<>
    <button className="text-white/60 mb-3" onClick={() => history.back()}>← All categories</button>
    <h2 className="font-display text-3xl mb-2">{cat.name}</h2>
    {cat.description && <p className="text-white/70 mb-6 max-w-2xl">{cat.description}</p>}
    {!list.length && <p className="text-white/50">No candidates yet.</p>}
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{list.map(k => (
      <motion.div key={k.id} whileHover={{ y: -6 }} className="card overflow-hidden">
        {k.photo_url ? <img src={k.photo_url} alt={k.full_name} loading="lazy" className="w-full aspect-square object-cover rounded-xl" />
          : <div className="aspect-square rounded-xl bg-white/10 grid place-items-center text-5xl">{k.full_name[0]}</div>}
        <div className="font-display text-xl mt-3">{k.full_name}</div><p className="text-sm text-white/60">{k.bio}</p>
        <div className="flex gap-3 text-sm my-2">{igUser(k.instagram) && <a className="underline" href={`https://instagram.com/${igUser(k.instagram)}`} target="_blank" rel="noreferrer">Instagram: @{igUser(k.instagram)}</a>}
          {k.telegram && <a className="underline" href={`https://t.me/${k.telegram.replace('@', '')}`} target="_blank" rel="noreferrer">Telegram</a>}</div>
        <button disabled={done.has(cat.id) || !cat.is_open} onClick={() => setPick(k)}
          className="btn w-full bg-neon text-ink disabled:opacity-40">{done.has(cat.id) ? 'Already voted' : cat.is_open ? 'Vote' : 'Closed'}</button>
      </motion.div>))}</div>
    <AnimatePresence>{pick && <motion.div {...fade} className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4" role="dialog" aria-modal>
      <div className="card bg-ink max-w-sm w-full text-center space-y-4"><p>Vote for <b>{pick.full_name}</b> as <b>{cat.name}</b>? This cannot be changed.</p>
        <div className="flex gap-2"><button className="btn flex-1 bg-white/10" onClick={() => setPick(null)}>Cancel</button>
          <button disabled={busy} className="btn flex-1 bg-neon text-ink" onClick={confirm}>{busy ? '...' : 'Confirm'}</button></div></div></motion.div>}
      {ok && <motion.div {...fade} className="fixed inset-0 z-50 grid place-items-center bg-ink/90"><motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }}
        className="text-center"><div className="text-8xl text-neon">✓</div><p className="font-display text-2xl">Vote recorded</p></motion.div></motion.div>}</AnimatePresence>
  </>)
}

function Profile({ prof, email, say }: { prof: Prof; email: string; say: (t: string) => void }) {
  const [name, setName] = useState(prof.full_name ?? ''); const [mine, setMine] = useState(0); const [total, setTotal] = useState(0)
  useEffect(() => { supabase.from('votes').select('id', { count: 'exact', head: true }).then(r => setMine(r.count ?? 0))
    supabase.from('categories').select('id', { count: 'exact', head: true }).then(r => setTotal(r.count ?? 0)) }, [])
  const save = async () => { if (name.trim().length < 2) return say('Name too short')
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', prof.id); say(error ? error.message : 'Profile updated') }
  return (<div className="card max-w-lg space-y-3"><div className="h-20 w-20 rounded-full bg-neon text-ink grid place-items-center text-4xl font-display">{(name || email)[0]?.toUpperCase()}</div>
    <input value={name} onChange={e => setName(e.target.value)} aria-label="Full name" /><p className="text-white/60">{email} · {prof.role}</p>
    <p>Voted in {mine} / {total} categories ({total - mine} remaining)</p><button className="btn bg-neon text-ink" onClick={save}>Save</button></div>)
}

const About = () => (<div className="max-w-2xl space-y-5"><h2 className="font-display text-4xl">About HALF LIFE</h2>
  <p className="text-lg text-white/80">HALF LIFE is a class voting platform developed for the 2026 Third Year Software Engineering students. This website was created for entertainment purposes, to celebrate the unique talents, personalities, achievements, and friendships within our class.</p>
  <p className="text-white/70">Our goal is to bring classmates closer together, encourage participation, create unforgettable memories, and strengthen unity among the students.</p>
  <p className="text-neon font-display text-xl">It's not just about winning. It's about celebrating each other and making our class experience more memorable.</p>
  <div className="grid sm:grid-cols-4 gap-3">{['Sign up', 'Browse', 'Vote once per category', 'Results revealed by admin'].map((s, i) =>
    <motion.div key={s} className="card" initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ delay: i * .1 }}><b className="text-neon text-2xl">{i + 1}</b><p>{s}</p></motion.div>)}</div></div>)

const Contact = () => (<div className="max-w-xl space-y-3"><h2 className="font-display text-4xl">Contact the developer</h2>
  {[['Telegram', '@Alexander_345', 'https://t.me/Alexander_345'], ['Instagram', 'natnael__abera', 'https://www.instagram.com/natnael__abera/'],
    ['LinkedIn', 'natty-undefined', 'https://www.linkedin.com/in/natty-undefined-540294450'], ['GitHub', 'nattyman659-svg', 'https://github.com/nattyman659-svg'],
    ['Gmail', 'nattyman659@gmail.com', 'mailto:nattyman659@gmail.com']].map(([n, v, h]) =>
    <a key={n} href={h} target="_blank" rel="noreferrer" className="card block hover:border-neon/50"><b>{n}</b> <span className="text-white/60">{v}</span></a>)}</div>)

function Admin({ say }: { say: (t: string) => void }) {
  const [stats, setStats] = useState<Record<string, number>>({}); const [res, setRes] = useState<Res[]>([])
  const [cats, setCats] = useState<Cat[]>([]); const [pub, setPub] = useState(false)
  const [cands, setCands] = useState<Cand[]>([]); const [ed, setEd] = useState<Cand | null>(null)
  const [cn, setCn] = useState(''); const [cd, setCd] = useState(''); const [k, setK] = useState({ full_name: '', category_id: '', bio: '', instagram: '', telegram: '' }); const [file, setFile] = useState<File | null>(null)
  const load = useCallback(async () => {
    const [s, r, c, st, kk] = await Promise.all([supabase.rpc('admin_stats'), supabase.rpc('admin_results'), supabase.from('categories').select('*').order('sort'), supabase.from('settings').select('*').single(), supabase.from('candidates').select('*').order('full_name')])
    setStats(s.data ?? {}); setRes((r.data as Res[]) ?? []); setCats((c.data as Cat[]) ?? []); setPub(!!st.data?.results_published); setCands((kk.data as Cand[]) ?? [])
  }, [])
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t) }, [load])
  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => { const { error } = await p; say(error ? error.message : ok); load() }
  const addCand = async () => {
    if (k.full_name.trim().length < 2 || !k.category_id) return say('Name and category required')
    let photo_url: string | null = null
    if (file) { if (!file.type.startsWith('image/') || file.size > 2e6) return say('Image under 2MB only')
      const path = `${crypto.randomUUID()}.${file.name.split('.').pop()}`; const up = await supabase.storage.from('photos').upload(path, file)
      if (up.error) return say(up.error.message); photo_url = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl }
    await run(supabase.from('candidates').insert({ ...k, instagram: igHandle(k.instagram), photo_url }), 'Candidate added')
  }
  return (<div className="space-y-8"><h2 className="font-display text-3xl">Admin dashboard</h2>
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{Object.entries(stats).map(([n, v]) => <div key={n} className="card"><motion.b key={v} initial={{ scale: 1.4 }} animate={{ scale: 1 }} className="text-3xl text-neon">{v}</motion.b><p className="capitalize text-white/60">{n}</p></div>)}</div>
    <div className="flex gap-2 items-center"><button className="btn bg-ember" onClick={() => run(supabase.from('settings').update({ results_published: !pub }).eq('id', 1), pub ? 'Results hidden' : 'Results published')}>{pub ? 'Unpublish results' : 'Publish results'}</button></div>
    <section className="space-y-3"><h3 className="font-display text-xl">Categories</h3>
      <div className="flex flex-col sm:flex-row gap-2"><input placeholder="New category" value={cn} onChange={e => setCn(e.target.value)} /><input placeholder="Description (shown to voters)" value={cd} onChange={e => setCd(e.target.value)} />
        <button className="btn bg-neon text-ink" onClick={() => cn.trim() && run(supabase.from('categories').insert({ name: cn.trim(), description: cd.trim() || null }), 'Category added').then(() => { setCn(''); setCd('') })}>Add</button></div>
      {cats.map(c => <div key={c.id} className="card space-y-3"><div className="flex flex-wrap items-center gap-2 justify-between"><b>{c.name}</b><span className="flex gap-2">
        <button className="btn bg-white/10" onClick={() => run(supabase.from('categories').update({ is_open: !c.is_open }).eq('id', c.id), c.is_open ? 'Closed' : 'Opened')}>{c.is_open ? 'Close' : 'Open'}</button>
        <button className="btn bg-white/10" onClick={() => { const d = window.prompt('Description for ' + c.name, c.description ?? ''); if (d !== null) run(supabase.from('categories').update({ description: d.trim() || null }).eq('id', c.id), 'Description saved') }}>Description</button>
        <button className="btn bg-white/10" onClick={() => confirmDel(c.name) && run(supabase.from('categories').delete().eq('id', c.id), 'Deleted')}>Delete</button></span></div>
        {cands.filter(x => x.category_id === c.id).map(x => (<div key={x.id} className="flex items-center justify-between gap-2 border-t border-white/10 pt-2"><span className="truncate">{x.full_name}</span><span className="flex gap-2 shrink-0"><button className="btn bg-white/10" onClick={() => setEd(x)}>Edit</button><button className="btn bg-ember" onClick={() => confirmDelCand(x.full_name) && run(supabase.from('candidates').delete().eq('id', x.id), 'Candidate deleted')}>Delete</button></span></div>))}</div>)}</section>
    <section className="space-y-3"><h3 className="font-display text-xl">Add candidate (admins may be candidates too)</h3>
      <input placeholder="Full name" value={k.full_name} onChange={e => setK({ ...k, full_name: e.target.value })} />
      <select className="w-full rounded-xl bg-ink border border-white/10 p-3" value={k.category_id} onChange={e => setK({ ...k, category_id: e.target.value })}><option value="">Category…</option>{cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
      <textarea placeholder="Short bio" value={k.bio} onChange={e => setK({ ...k, bio: e.target.value })} />
      <input placeholder="Instagram @username" value={k.instagram} onChange={e => setK({ ...k, instagram: e.target.value })} />
      <input placeholder="Telegram @handle" value={k.telegram} onChange={e => setK({ ...k, telegram: e.target.value })} />
      <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} /><button className="btn bg-neon text-ink" onClick={addCand}>Add candidate</button></section>
    <section className="space-y-4"><h3 className="font-display text-xl">Live results (refreshes every 5s)</h3>{cats.map(c => { const rows = res.filter(r => r.category_id === c.id); const sum = rows.reduce((a, r) => a + Number(r.votes), 0)
      return <div key={c.id} className="card"><b>{c.name}</b>{rows.map(r => <div key={r.candidate_id} className="mt-2"><div className="flex justify-between text-sm"><span>{r.full_name}</span><span>{r.votes} ({sum ? Math.round(Number(r.votes) / sum * 100) : 0}%)</span></div>
        <div className="h-2 bg-white/10 rounded-full"><motion.div className="h-2 bg-neon rounded-full" animate={{ width: `${sum ? Number(r.votes) / sum * 100 : 0}%` }} /></div></div>)}</div> })}</section>
    {ed && <EditCand c={ed} say={say} onClose={() => { setEd(null); load() }} />}</div>)
}
const confirmDelCand = (n: string) => window.confirm(`Delete candidate "${n}"? Their votes will also be deleted.`)
const confirmDel = (n: string) => window.confirm(`Delete "${n}"? This removes its candidates and votes.`)

function Verified({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="glow min-h-screen grid place-items-center p-4">
      <motion.div {...fade} className="card w-full max-w-md text-center space-y-4">
        <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} className="text-7xl text-neon">✓</motion.div>
        <h1 className="font-display text-4xl font-extrabold text-neon">HALF LIFE</h1>
        <h2 className="font-display text-2xl">Thank you for verifying your email!</h2>
        <p className="text-white/70">Your account is confirmed. You can now join the 2026 Software Engineering class awards and cast your votes.</p>
        <button className="btn w-full bg-neon text-ink" onClick={onContinue}>Go to HALF LIFE</button>
      </motion.div>
    </div>)
}

function EditCand({ c, say, onClose }: { c: Cand; say: (t: string) => void; onClose: () => void }) {
  const [f, setF] = useState({ full_name: c.full_name, bio: c.bio ?? '', instagram: igHandle(c.instagram ?? '') ?? '', telegram: c.telegram ?? '' })
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false)
  const save = async () => {
    if (f.full_name.trim().length < 2) return say('Name too short')
    setBusy(true); let photo_url = c.photo_url
    if (file) {
      if (!file.type.startsWith('image/') || file.size > 2e6) { setBusy(false); return say('Image under 2MB only') }
      const path = `${crypto.randomUUID()}.${file.name.split('.').pop()}`
      const up = await supabase.storage.from('photos').upload(path, file)
      if (up.error) { setBusy(false); return say(up.error.message) }
      photo_url = supabase.storage.from('photos').getPublicUrl(path).data.publicUrl
    }
    const { error } = await supabase.from('candidates').update({ full_name: f.full_name.trim(), bio: f.bio.trim() || null, instagram: igHandle(f.instagram), telegram: f.telegram.trim() || null, photo_url }).eq('id', c.id)
    setBusy(false); say(error ? error.message : 'Candidate updated'); if (!error) onClose()
  }
  return (
    <div className="fixed inset-0 z-40 bg-black/70 grid place-items-center p-4 overflow-y-auto" role="dialog" aria-modal>
      <div className="card bg-ink w-full max-w-md space-y-3 my-8">
        <h3 className="font-display text-xl">Edit candidate</h3>
        {c.photo_url && <img src={c.photo_url} alt={c.full_name} className="h-24 w-24 rounded-xl object-cover" />}
        <input placeholder="Full name" value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} />
        <textarea placeholder="Short bio" value={f.bio} onChange={e => setF({ ...f, bio: e.target.value })} />
        <input placeholder="Instagram @username" value={f.instagram} onChange={e => setF({ ...f, instagram: e.target.value })} />
        <input placeholder="Telegram @handle" value={f.telegram} onChange={e => setF({ ...f, telegram: e.target.value })} />
        <label className="text-sm text-white/60">Replace photo (optional)</label>
        <input type="file" accept="image/*" onChange={e => setFile(e.target.files?.[0] ?? null)} />
        <div className="flex gap-2"><button className="btn flex-1 bg-white/10" onClick={onClose}>Cancel</button>
          <button disabled={busy} className="btn flex-1 bg-neon text-ink" onClick={save}>{busy ? '...' : 'Save'}</button></div>
      </div>
    </div>)
}
