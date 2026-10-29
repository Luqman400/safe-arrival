// Data layer: Supabase. (Was a browser mock before.)
import { supabase } from './supabase'

export type Student = { id: string; admission_no: string; full_name: string; class: string; qr_id: string; parent_name: string; phone: string }
export type Arrival = { id: string; student_id: string; arrival_date: string; arrived_at: string }
export type Message = { id: string; to: string; body: string; created_at: string }
export type DB = { classes: string[]; students: Student[]; arrivals: Arrival[]; messages: Message[] }
export type ScanResult = { status: 'recorded' | 'duplicate' | 'invalid'; student?: Student; time?: string }
export type NewStudent = Omit<Student, 'id' | 'qr_id'>

export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' })
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: 'numeric', minute: '2-digit' })
export const emptyDB = (): DB => ({ classes: [], students: [], arrivals: [], messages: [] })
export const classList = (db: DB) => Array.from(new Set([...db.classes, ...db.students.map(s => s.class)])).sort()

export async function fetchAll(): Promise<DB> {
  const [c, s, a, m] = await Promise.all([
    supabase.from('classes').select('name').order('name'),
    supabase.from('students').select('*').order('full_name'),
    supabase.from('arrival_records').select('*').eq('arrival_date', today()),
    supabase.from('notification_logs').select('*').order('created_at', { ascending: false }).limit(100),
  ])
  for (const r of [c, s, a, m]) if (r.error) throw r.error
  return {
    classes: (c.data ?? []).map(x => x.name as string),
    students: (s.data ?? []) as Student[],
    arrivals: (a.data ?? []) as Arrival[],
    messages: (m.data ?? []).map(x => ({ id: x.id, to: x.to_phone, body: x.body, created_at: x.created_at })),
  }
}

export async function addClass(name: string) {
  const n = name.trim(); if (!n) return
  const { error } = await supabase.from('classes').insert({ name: n })
  if (error && error.code !== '23505') throw error
}
export async function removeClass(name: string) {
  const { error } = await supabase.from('classes').delete().eq('name', name); if (error) throw error
}
export async function addStudent(s: NewStudent) {
  const { error } = await supabase.from('students').insert(s); if (error) throw error
}
export async function removeStudent(id: string) {
  const { error } = await supabase.from('students').delete().eq('id', id); if (error) throw error
}
export async function clearArrivals() {
  const { error } = await supabase.from('arrival_records').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export async function recordArrival(qr: string): Promise<ScanResult> {
  const code = qr.trim()
  const q = supabase.from('students').select('*')
  const { data, error } = await (UUID.test(code) ? q.eq('qr_id', code) : q.ilike('admission_no', code)).maybeSingle()
  if (error) throw error
  if (!data) return { status: 'invalid' }
  const student = data as Student
  const { data: arrival, error: e2 } = await supabase.from('arrival_records')
    .insert({ student_id: student.id, arrival_date: today() }).select().single()
  if (e2) {
    if (e2.code === '23505') return { status: 'duplicate', student }
    throw e2
  }
  const time = fmtTime(arrival.arrived_at)
  // SMS/WhatsApp not connected yet: log the message as 'mock'. The Edge Function will send it later.
  await supabase.from('notification_logs').insert({
    arrival_id: arrival.id, to_phone: student.phone, status: 'mock',
    body: `Your child ${student.full_name} has arrived safely at school today at ${time}.`,
  })
  return { status: 'recorded', student, time }
}
