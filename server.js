import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { nanoid } from "nanoid";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_PATH = join(__dirname, "data", "db.json");
const PORT = Number(process.env.PORT || 4280);
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const INVITE_CODE = process.env.INVITE_CODE || "VICEJEFATURA2026";
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(join(__dirname, "public")));

async function readDb() {
  const raw = await readFile(DATA_PATH, "utf8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  await mkdir(dirname(DATA_PATH), { recursive: true });
  await writeFile(DATA_PATH, JSON.stringify(db, null, 2), "utf8");
}

const DEFAULT_SETTINGS = {
  rules: "📌 Cargá tus apuestas hasta 1 hora antes del partido.\n📌 Resultado exacto: 5 puntos.\n📌 Acertar ganador o empate: 3 puntos.\n📌 Acertar la diferencia de goles: +1 punto extra.\n📌 No se permiten cambios después del cierre.",
  prizes: "🥇 1° puesto: Premio mayor.\n🥈 2° puesto: Premio intermedio.\n🥉 3° puesto: Premio simbólico.\n🎯 Más resultados exactos: Premio sorpresa.",
  announcement: ""
};

async function ensureSettings(db) {
  if (!db.settings) db.settings = { ...DEFAULT_SETTINGS };
  else db.settings = { ...DEFAULT_SETTINGS, ...db.settings };
  return db.settings;
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    isAdmin: Boolean(user.isAdmin)
  };
}

function signToken(user) {
  return jwt.sign(publicUser(user), JWT_SECRET, { expiresIn: "7d" });
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado" });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Sesión inválida o expirada" });
  }
}

function adminRequired(req, res, next) {
  if (!req.user?.isAdmin) return res.status(403).json({ error: "Solo administradores" });
  next();
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function requireScore(value) {
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 30;
}

function isLocked(match) {
  return new Date(match.kickoff).getTime() <= Date.now() || match.status !== "scheduled";
}

function outcome(homeScore, awayScore) {
  if (homeScore > awayScore) return "H";
  if (homeScore < awayScore) return "A";
  return "D";
}

function scorePrediction(prediction, match) {
  if (match.homeScore === null || match.awayScore === null || match.status !== "finished") return 0;
  const exact = prediction.homeScore === match.homeScore && prediction.awayScore === match.awayScore;
  if (exact) return 5;

  let points = 0;
  if (outcome(prediction.homeScore, prediction.awayScore) === outcome(match.homeScore, match.awayScore)) points += 3;
  const predictedDiff = prediction.homeScore - prediction.awayScore;
  const realDiff = match.homeScore - match.awayScore;
  if (predictedDiff === realDiff) points += 1;
  return points;
}

function buildRanking(db) {
  return db.users
    .filter(user => !user.isAdmin)
    .map(user => {
      const userPredictions = db.predictions.filter(prediction => prediction.userId === user.id);
      const total = userPredictions.reduce((sum, prediction) => {
        const match = db.matches.find(item => item.id === prediction.matchId);
        return sum + (match ? scorePrediction(prediction, match) : 0);
      }, 0);
      const exacts = userPredictions.filter(prediction => {
        const match = db.matches.find(item => item.id === prediction.matchId);
        return match?.status === "finished" && prediction.homeScore === match.homeScore && prediction.awayScore === match.awayScore;
      }).length;
      return {
        userId: user.id,
        name: user.name,
        username: user.username,
        points: total,
        exacts,
        predictions: userPredictions.length
      };
    })
    .sort((a, b) => b.points - a.points || b.exacts - a.exacts || a.name.localeCompare(b.name))
    .map((entry, index) => ({ position: index + 1, ...entry }));
}

async function ensureAdmin() {
  const db = await readDb();
  const username = normalizeUsername(ADMIN_USER);
  if (!db.users.some(user => user.username === username)) {
    db.users.push({
      id: nanoid(),
      name: "Admin",
      username,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12),
      isAdmin: true,
      createdAt: new Date().toISOString()
    });
    await writeDb(db);
  }
}

app.post("/api/auth/register", async (req, res) => {
  const name = String(req.body.name || "").trim();
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");
  const inviteCode = String(req.body.inviteCode || "").trim();

  if (inviteCode !== INVITE_CODE) return res.status(403).json({ error: "Código de invitación inválido" });
  if (name.length < 2) return res.status(400).json({ error: "Ingresá un nombre" });
  if (!/^[a-z0-9._-]{3,24}$/.test(username)) return res.status(400).json({ error: "Usuario inválido. Usá 3 a 24 caracteres: letras, números, punto, guion o guion bajo." });
  if (password.length < 6) return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres" });

  const db = await readDb();
  if (db.users.some(user => user.username === username)) return res.status(409).json({ error: "Ese usuario ya existe" });

  const user = {
    id: nanoid(),
    name,
    username,
    passwordHash: await bcrypt.hash(password, 12),
    isAdmin: false,
    createdAt: new Date().toISOString()
  };
  db.users.push(user);
  await writeDb(db);
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const username = normalizeUsername(req.body.username);
  const password = String(req.body.password || "");
  const db = await readDb();
  const user = db.users.find(item => item.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos" });
  }
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get("/api/me", authRequired, async (req, res) => {
  res.json({ user: req.user });
});

app.get("/api/state", authRequired, async (req, res) => {
  const db = await readDb();
  const settings = await ensureSettings(db);
  if (!Array.isArray(db.pledges)) db.pledges = [];
  const predictions = db.predictions.filter(prediction => prediction.userId === req.user.id);
  const userMap = new Map(db.users.map(u => [u.id, u]));
  const pledges = db.pledges
    .map(p => ({
      id: p.id,
      userId: p.userId,
      userName: userMap.get(p.userId)?.name || "—",
      condition: p.condition,
      promise: p.promise,
      createdAt: p.createdAt
    }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  res.json({
    matches: db.matches.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff)),
    predictions,
    ranking: buildRanking(db),
    settings,
    pledges,
    user: req.user
  });
});

app.post("/api/pledges", authRequired, async (req, res) => {
  const condition = String(req.body.condition || "").trim().slice(0, 200);
  const promise = String(req.body.promise || "").trim().slice(0, 280);
  if (!condition || !promise) return res.status(400).json({ error: "Completá condición y promesa" });
  const db = await readDb();
  if (!Array.isArray(db.pledges)) db.pledges = [];
  db.pledges.push({
    id: nanoid(),
    userId: req.user.id,
    condition,
    promise,
    createdAt: new Date().toISOString()
  });
  await writeDb(db);
  res.json({ ok: true });
});

app.delete("/api/pledges/:id", authRequired, async (req, res) => {
  const db = await readDb();
  if (!Array.isArray(db.pledges)) db.pledges = [];
  const idx = db.pledges.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Promesa no encontrada" });
  const pledge = db.pledges[idx];
  if (pledge.userId !== req.user.id && !req.user.isAdmin) {
    return res.status(403).json({ error: "Solo el autor o un admin pueden borrar" });
  }
  db.pledges.splice(idx, 1);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/settings", authRequired, adminRequired, async (req, res) => {
  const db = await readDb();
  await ensureSettings(db);
  const fields = ["rules", "prizes", "announcement"];
  fields.forEach(key => {
    if (typeof req.body[key] === "string") db.settings[key] = req.body[key].slice(0, 4000);
  });
  await writeDb(db);
  res.json({ ok: true, settings: db.settings });
});

app.get("/api/admin/predictions", authRequired, adminRequired, async (_req, res) => {
  const db = await readDb();
  const userMap = new Map(db.users.map(u => [u.id, u]));
  const matchMap = new Map(db.matches.map(m => [m.id, m]));
  const items = db.predictions.map(p => {
    const user = userMap.get(p.userId);
    const match = matchMap.get(p.matchId);
    return {
      id: p.id,
      userId: p.userId,
      userName: user?.name || "—",
      username: user?.username || "—",
      matchId: p.matchId,
      matchLabel: match ? `${match.stage}${match.group ? ` G${match.group}` : ""}: ${match.homeTeam} vs ${match.awayTeam}` : "—",
      kickoff: match?.kickoff || null,
      homeScore: p.homeScore,
      awayScore: p.awayScore,
      officialHome: match?.homeScore ?? null,
      officialAway: match?.awayScore ?? null,
      status: match?.status || "scheduled",
      points: match ? scorePrediction(p, match) : 0,
      updatedAt: p.updatedAt || p.createdAt
    };
  }).sort((a, b) => (a.kickoff || "").localeCompare(b.kickoff || ""));
  res.json({ predictions: items });
});

app.delete("/api/admin/predictions/:id", authRequired, adminRequired, async (req, res) => {
  const db = await readDb();
  const idx = db.predictions.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Apuesta no encontrada" });
  db.predictions.splice(idx, 1);
  await writeDb(db);
  res.json({ ok: true });
});

app.get("/api/admin/users", authRequired, adminRequired, async (_req, res) => {
  const db = await readDb();
  const users = db.users.map(u => ({
    id: u.id,
    name: u.name,
    username: u.username,
    isAdmin: Boolean(u.isAdmin),
    createdAt: u.createdAt,
    predictionsCount: db.predictions.filter(p => p.userId === u.id).length
  })).sort((a, b) => a.name.localeCompare(b.name));
  res.json({ users });
});

app.delete("/api/admin/users/:id", authRequired, adminRequired, async (req, res) => {
  const db = await readDb();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: "Usuario no encontrado" });
  if (db.users[idx].id === req.user.id) return res.status(400).json({ error: "No te puedes eliminar a ti mismo" });
  db.users.splice(idx, 1);
  db.predictions = db.predictions.filter(p => p.userId !== req.params.id);
  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/users/:id/toggle-admin", authRequired, adminRequired, async (req, res) => {
  const db = await readDb();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  if (user.id === req.user.id) return res.status(400).json({ error: "No te puedes quitar admin a ti mismo" });
  user.isAdmin = !user.isAdmin;
  await writeDb(db);
  res.json({ ok: true, isAdmin: user.isAdmin });
});

app.post("/api/admin/users/:id/reset-password", authRequired, adminRequired, async (req, res) => {
  const db = await readDb();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "Usuario no encontrado" });
  const tempPassword = nanoid(10);
  user.passwordHash = await bcrypt.hash(tempPassword, 12);
  await writeDb(db);
  res.json({ ok: true, tempPassword });
});

app.post("/api/predictions", authRequired, async (req, res) => {
  const matchId = String(req.body.matchId || "");
  if (!requireScore(req.body.homeScore) || !requireScore(req.body.awayScore)) {
    return res.status(400).json({ error: "Resultado inválido" });
  }

  const db = await readDb();
  const match = db.matches.find(item => item.id === matchId);
  if (!match) return res.status(404).json({ error: "Partido no encontrado" });
  if (isLocked(match)) return res.status(409).json({ error: "Este partido ya está cerrado para apuestas" });

  const existing = db.predictions.find(item => item.userId === req.user.id && item.matchId === matchId);
  const payload = {
    userId: req.user.id,
    matchId,
    homeScore: Number(req.body.homeScore),
    awayScore: Number(req.body.awayScore),
    updatedAt: new Date().toISOString()
  };

  if (existing) Object.assign(existing, payload);
  else db.predictions.push({ id: nanoid(), createdAt: new Date().toISOString(), ...payload });

  await writeDb(db);
  res.json({ ok: true });
});

app.post("/api/admin/matches", authRequired, adminRequired, async (req, res) => {
  const db = await readDb();
  const match = {
    id: req.body.id ? String(req.body.id) : nanoid(),
    stage: String(req.body.stage || "Grupo").trim(),
    group: String(req.body.group || "").trim(),
    homeTeam: String(req.body.homeTeam || "").trim(),
    awayTeam: String(req.body.awayTeam || "").trim(),
    kickoff: new Date(req.body.kickoff).toISOString(),
    status: req.body.status || "scheduled",
    homeScore: req.body.homeScore ?? null,
    awayScore: req.body.awayScore ?? null
  };

  if (!match.homeTeam || !match.awayTeam || Number.isNaN(new Date(match.kickoff).getTime())) {
    return res.status(400).json({ error: "Partido inválido" });
  }

  const existing = db.matches.find(item => item.id === match.id);
  if (existing) Object.assign(existing, match);
  else db.matches.push(match);
  await writeDb(db);
  res.json({ ok: true, match });
});

app.post("/api/admin/results", authRequired, adminRequired, async (req, res) => {
  const db = await readDb();
  const match = db.matches.find(item => item.id === String(req.body.matchId || ""));
  if (!match) return res.status(404).json({ error: "Partido no encontrado" });
  if (!requireScore(req.body.homeScore) || !requireScore(req.body.awayScore)) {
    return res.status(400).json({ error: "Resultado inválido" });
  }
  match.homeScore = Number(req.body.homeScore);
  match.awayScore = Number(req.body.awayScore);
  match.status = "finished";
  match.updatedAt = new Date().toISOString();
  await writeDb(db);
  res.json({ ok: true, ranking: buildRanking(db) });
});

app.post("/api/admin/sync-placeholder", authRequired, adminRequired, async (_req, res) => {
  const db = await readDb();
  await ensureSettings(db);
  db.settings.lastSync = new Date().toISOString();
  await writeDb(db);
  res.json({
    ok: true,
    lastSync: db.settings.lastSync,
    message: "Acá se conectará la API deportiva. Recomendación: Timer Trigger cada 1 hora y guardado en Cosmos DB/Table Storage."
  });
});

await ensureAdmin();
app.listen(PORT, () => {
  console.log(`Fixture VJGCBA listo en http://localhost:${PORT}`);
});
