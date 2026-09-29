import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { WebSocketServer, type WebSocket } from 'ws'
import { createServer } from 'node:http'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { z } from 'zod'

interface User { id: string; email: string; passwordHash: string; createdAt: string }
interface CloudNotebook { id: string; ownerId: string; title: string; document: unknown; updatedAt: string; versions: Version[]; shareToken?: string }
interface Version { id: string; createdAt: string; document: unknown }
interface Database { users: User[]; notebooks: CloudNotebook[] }

const PORT = Number(process.env.CALCULUS_PORT ?? 8787)
const DB_PATH = resolve(process.env.CALCULUS_DATA ?? 'server/data/calculus.json')
const JWT_SECRET = process.env.CALCULUS_SECRET ?? 'calculus-local-development-secret-change-before-deploying'
const credentials = z.object({ email: z.string().email().max(254).transform((value) => value.toLowerCase()), password: z.string().min(10).max(200) })
const notebookDocument = z.object({
  id: z.string().min(1).max(200),
  title: z.string().min(1).max(500),
  cells: z.array(z.object({ id: z.string().min(1), kind: z.enum(['code', 'markdown']) }).passthrough()).max(10_000),
}).passthrough()
let database: Database = { users: [], notebooks: [] }
let saveQueue = Promise.resolve()

async function loadDatabase() {
  try { database = JSON.parse(await readFile(DB_PATH, 'utf8')) as Database }
  catch { await persist() }
}

function persist() {
  saveQueue = saveQueue.then(async () => {
    await mkdir(dirname(DB_PATH), { recursive: true })
    const temporary = `${DB_PATH}.tmp`
    await writeFile(temporary, JSON.stringify(database, null, 2), 'utf8')
    await rename(temporary, DB_PATH)
  })
  return saveQueue
}

function tokenFor(user: User) { return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' }) }
function userIdFrom(token?: string) {
  if (!token) return null
  try { return String((jwt.verify(token, JWT_SECRET) as jwt.JwtPayload).sub) } catch { return null }
}

const app = express()
app.use(cors({ origin: true }))
app.use(express.json({ limit: '8mb' }))
app.get('/health', (_request, response) => response.json({ ok: true, service: 'calculus-sync' }))

app.post('/auth/register', async (request, response) => {
  const parsed = credentials.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Use a valid email and a password of at least 10 characters.' })
  if (database.users.some((user) => user.email === parsed.data.email)) return response.status(409).json({ error: 'An account already uses that email.' })
  const user: User = { id: randomUUID(), email: parsed.data.email, passwordHash: await bcrypt.hash(parsed.data.password, 12), createdAt: new Date().toISOString() }
  database.users.push(user); await persist()
  return response.status(201).json({ token: tokenFor(user), user: { id: user.id, email: user.email } })
})

app.post('/auth/login', async (request, response) => {
  const parsed = credentials.safeParse(request.body)
  if (!parsed.success) return response.status(400).json({ error: 'Enter your email and password.' })
  const user = database.users.find((candidate) => candidate.email === parsed.data.email)
  if (!user || !await bcrypt.compare(parsed.data.password, user.passwordHash)) return response.status(401).json({ error: 'Email or password is incorrect.' })
  return response.json({ token: tokenFor(user), user: { id: user.id, email: user.email } })
})

app.use('/api', (request, response, next) => {
  const token = request.headers.authorization?.replace(/^Bearer\s+/i, '')
  const userId = userIdFrom(token)
  if (!userId) return response.status(401).json({ error: 'Sign in to use cloud sync.' })
  response.locals.userId = userId; next()
})

app.get('/api/notebooks', (_request, response) => {
  const items = database.notebooks.filter((notebook) => notebook.ownerId === response.locals.userId).map(({ id, title, updatedAt }) => ({ id, title, updatedAt }))
  response.json(items)
})

app.put('/api/notebooks/:id', async (request, response) => {
  const userId = String(response.locals.userId); const id = request.params.id
  const parsed = notebookDocument.safeParse(request.body)
  if (!parsed.success || parsed.data.id !== id) return response.status(400).json({ error: 'Notebook document is invalid.' })
  const document = parsed.data
  let notebook = database.notebooks.find((item) => item.id === id && item.ownerId === userId)
  const now = new Date().toISOString()
  if (!notebook) {
    notebook = { id, ownerId: userId, title: document.title, document, updatedAt: now, versions: [] }
    database.notebooks.push(notebook)
  } else {
    const latest = notebook.versions.at(-1)
    if (!latest || JSON.stringify(latest.document) !== JSON.stringify(notebook.document)) notebook.versions.push({ id: randomUUID(), createdAt: notebook.updatedAt, document: notebook.document })
    notebook.versions = notebook.versions.slice(-50); notebook.document = document; notebook.title = document.title; notebook.updatedAt = now
  }
  await persist(); broadcast(id, { type: 'update', document: notebook.document, updatedAt: now })
  response.json({ id, updatedAt: now, versions: notebook.versions.length })
})

app.get('/api/notebooks/:id/versions', (request, response) => {
  const notebook = database.notebooks.find((item) => item.id === request.params.id && item.ownerId === response.locals.userId)
  if (!notebook) return response.status(404).json({ error: 'Notebook not found.' })
  response.json(notebook.versions.map(({ id, createdAt }) => ({ id, createdAt })).reverse())
})

app.post('/api/notebooks/:id/versions/:versionId/restore', async (request, response) => {
  const notebook = database.notebooks.find((item) => item.id === request.params.id && item.ownerId === response.locals.userId)
  const version = notebook?.versions.find((item) => item.id === request.params.versionId)
  if (!notebook || !version) return response.status(404).json({ error: 'Version not found.' })
  notebook.versions.push({ id: randomUUID(), createdAt: notebook.updatedAt, document: notebook.document }); notebook.document = version.document; notebook.updatedAt = new Date().toISOString()
  await persist(); broadcast(notebook.id, { type: 'update', document: notebook.document, updatedAt: notebook.updatedAt })
  response.json(notebook.document)
})

app.post('/api/notebooks/:id/share', async (request, response) => {
  const notebook = database.notebooks.find((item) => item.id === request.params.id && item.ownerId === response.locals.userId)
  if (!notebook) return response.status(404).json({ error: 'Notebook not found.' })
  notebook.shareToken ??= randomBytes(18).toString('base64url'); await persist()
  response.json({ token: notebook.shareToken, url: `${request.protocol}://${request.get('host')}/shared/${notebook.shareToken}` })
})

app.get('/shared/:token', (request, response) => {
  const notebook = database.notebooks.find((item) => item.shareToken === request.params.token)
  if (!notebook) return response.status(404).json({ error: 'Shared notebook not found.' })
  response.setHeader('Cache-Control', 'no-store'); response.json({ title: notebook.title, document: notebook.document, updatedAt: notebook.updatedAt })
})

const server = createServer(app)
const sockets = new WebSocketServer({ noServer: true })
const rooms = new Map<string, Set<WebSocket>>()
function broadcast(id: string, message: unknown, except?: WebSocket) {
  const payload = JSON.stringify(message)
  for (const socket of rooms.get(id) ?? []) if (socket !== except && socket.readyState === socket.OPEN) socket.send(payload)
}
server.on('upgrade', (request, socket, head) => {
  const url = new URL(request.url ?? '/', `http://${request.headers.host}`)
  const userId = userIdFrom(url.searchParams.get('token') ?? undefined); const notebookId = url.searchParams.get('notebook')
  if (url.pathname !== '/live' || !userId || !notebookId || !database.notebooks.some((item) => item.id === notebookId && item.ownerId === userId)) return socket.destroy()
  sockets.handleUpgrade(request, socket, head, (websocket) => {
    const room = rooms.get(notebookId) ?? new Set<WebSocket>(); room.add(websocket); rooms.set(notebookId, room)
    websocket.on('message', (data) => {
      try { broadcast(notebookId, JSON.parse(String(data)), websocket) } catch { websocket.send(JSON.stringify({ type: 'error', error: 'Invalid JSON message.' })) }
    })
    websocket.on('close', () => { room.delete(websocket); if (!room.size) rooms.delete(notebookId) })
  })
})

await loadDatabase()
server.listen(PORT, '127.0.0.1', () => console.log(`Calculus sync server listening on http://127.0.0.1:${PORT}`))
