// LOCAL SIMULATION of the Supabase pieces the live-verification scripts talk to.
//
//   !! THIS IS NOT LIVE EVIDENCE. It never contacts Supabase and proves nothing about the hosted
//   !! Auth, Storage or Edge runtimes. It exists so the destructive/live scripts can be EXECUTED
//   !! end to end (real supabase-js clients, the real Edge Function source, the real migration SQL)
//   !! before an operator spends a staging window on them.
//
// What is real here:  the six SQL migrations (PGlite = real PostgreSQL, RLS, triggers, cascades), the
//                     UNMODIFIED supabase/functions/delete-account sources, and supabase-js 2.117.1.
// What is emulated:   GoTrue (sign-in, sessions, admin API, magic links), PostgREST (only the request
//                     shapes these scripts use), Storage (RLS-backed, folders-before-files listing) and
//                     the Edge gateway. Behaviour follows public documentation and is an approximation.
import http from 'node:http';
import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { register } from 'node:module';
import { PGlite } from '@electric-sql/pglite';

const JWT_SECRET = 'proofpilot-local-simulation-secret-not-a-real-key';
const b64 = value => Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');
export function signJwt(payload) {
  const head = b64({ alg: 'HS256', typ: 'JWT' }), body = b64(payload);
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}
export function verifyJwt(token) {
  const parts = String(token ?? '').split('.');
  if (parts.length !== 3) return null;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (expected !== parts[2]) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof claims.exp === 'number' && claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch { return null; }
}

const FAR = 4_102_444_800; // 2100-01-01, like a Supabase project key
export const SIM_KEYS = {
  anon: signJwt({ iss: 'supabase-sim', role: 'anon', iat: 1, exp: FAR }),
  // Real legacy service keys carry "role":"service_role". The operator key and the Edge Function's own key
  // are distinct tokens of the same role so the audit log can attribute each request to its caller.
  operator: signJwt({ iss: 'supabase-sim', role: 'service_role', jti: 'operator', iat: 1, exp: FAR }),
  edgeFunction: signJwt({ iss: 'supabase-sim', role: 'service_role', jti: 'edge-function', iat: 1, exp: FAR }),
};

const PG_STATUS = { '42501': 403, '23505': 409, '23503': 409, '42P01': 404, '42883': 404 };
const pgError = error => ({ code: error.code ?? 'PGRST000', details: error.detail ?? null, hint: error.hint ?? null, message: error.message });
const ident = value => { if (!/^[a-z_][a-z0-9_]*$/.test(value)) throw Object.assign(new Error(`unsupported identifier ${value}`), { http: 400 }); return value; };

const BOOTSTRAP = `
  create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create schema storage;
  create table auth.users(id uuid primary key default gen_random_uuid(), email text unique not null,
    email_confirmed_at timestamptz default now(), created_at timestamptz default now(), updated_at timestamptz default now(),
    raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid,
    created_at timestamptz default now(), updated_at timestamptz default now(), metadata jsonb);
  create unique index storage_objects_bucket_name on storage.objects(bucket_id, name);
  alter table storage.objects enable row level security;
  grant select,insert,update,delete on storage.objects to anon,authenticated;
  create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
    declare parts text[]; begin parts := string_to_array(name,'/'); return parts[1:array_length(parts,1)-1]; end $$;
  grant usage on schema public, auth, storage to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant execute on function storage.foldername(text) to anon, authenticated, service_role;
  grant all on all tables in schema storage to service_role; -- Supabase manages the storage schema grants for the service role
`;

/** Serialises every database use: PGlite is a single connection. */
class Database {
  constructor(pg) { this.pg = pg; this.chain = Promise.resolve(); }
  exclusive(work) { const next = this.chain.then(() => work(this.pg)); this.chain = next.catch(() => {}); return next; }
  admin(sql, params = []) { return this.exclusive(pg => pg.query(sql, params)); }
  /** Runs `work` inside one transaction with PostgREST-style role + JWT-claim settings. */
  as(identity, work) {
    return this.exclusive(pg => pg.transaction(async tx => {
      await tx.exec(`set local role ${ident(identity.role)}`);
      await tx.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claims',$2,true)", [identity.sub ?? '', JSON.stringify(identity.claims ?? {})]);
      return work(tx);
    }));
  }
}

export async function startSupabaseSim(options = {}) {
  const {
    repoRoot = new URL('../../', import.meta.url).pathname,
    skipMigrations = [],
    functionsDir = join(repoRoot, 'supabase/functions'),
    publicHost = 'sim00000000000000000.supabase.co',
    clockAdvance = false,
    postMigrationSql = '', // fault injection for negative controls only
    // Models Supabase's 2026 change: no default grants on new public tables, so ONLY the migrations' explicit grants exist.
    strictGrants = false,
  } = options;

  // --- optional accelerated clock, shared with the script child through /__sim/advance-clock -------
  const realNow = Date.now.bind(Date);
  let clockOffset = 0;
  if (clockAdvance) Date.now = () => realNow() + clockOffset;
  const nowSeconds = () => Math.floor(Date.now() / 1000);

  // --- database: real migrations on real PostgreSQL semantics ----------------------------------------
  const pg = new PGlite();
  const db = new Database(pg);
  await pg.exec(BOOTSTRAP);
  const applied = [];
  for (const file of (await readdir(join(repoRoot, 'supabase/migrations'))).sort()) {
    if (skipMigrations.includes(file)) continue;
    const sql = (await readFile(join(repoRoot, 'supabase/migrations', file), 'utf8')).replace('create extension if not exists pgcrypto;', '');
    await pg.exec(sql);
    applied.push(file);
  }
  if (postMigrationSql) await pg.exec(postMigrationSql);
  if (!strictGrants) await pg.exec('grant all on all tables in schema public to service_role; grant all on all sequences in schema public to service_role; grant execute on all functions in schema public to service_role;');

  // --- state ----------------------------------------------------------------------------------------
  const passwords = new Map();     // user id -> password
  const refreshTokens = new Map(); // refresh token -> user id
  const magicTokens = new Map();   // one-time link token -> { userId }
  const objects = new Map();       // `${bucket}/${name}` -> Buffer
  const events = [];               // ordered audit log of every request
  const adminDeletes = [];         // user ids deleted through the admin API
  const protectedIds = new Set();  // accounts that must never be deleted (QA A and B)
  let origin = '';                 // http://127.0.0.1:PORT (set once listening)
  const als = new AsyncLocalStorage();

  const userJson = row => ({ id: row.id, aud: 'authenticated', role: 'authenticated', email: row.email,
    email_confirmed_at: row.email_confirmed_at, confirmed_at: row.email_confirmed_at, phone: '',
    app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: row.raw_user_meta_data ?? {}, identities: [],
    created_at: row.created_at, updated_at: row.updated_at, is_anonymous: false });
  const findUser = async id => (await db.admin('select * from auth.users where id=$1', [id])).rows[0] ?? null;
  const findByEmail = async email => (await db.admin('select * from auth.users where lower(email)=lower($1)', [email])).rows[0] ?? null;

  async function createUser(email, password, metadata = {}) {
    const row = (await db.admin('insert into auth.users(email, raw_user_meta_data) values($1, $2::jsonb) returning *', [email.toLowerCase(), JSON.stringify(metadata)])).rows[0];
    passwords.set(row.id, password);
    return row;
  }
  function issueSession(user, method) {
    const now = nowSeconds();
    const access = signJwt({ aud: 'authenticated', exp: now + 3600, iat: now, iss: 'supabase-sim/auth/v1', sub: user.id, email: user.email,
      role: 'authenticated', aal: 'aal1', amr: [{ method, timestamp: now }], session_id: crypto.randomUUID(), is_anonymous: false });
    const refresh = crypto.randomBytes(9).toString('base64url');
    refreshTokens.set(refresh, user.id);
    return { access_token: access, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: refresh, user: userJson(user) };
  }

  // --- http plumbing --------------------------------------------------------------------------------
  const readBody = req => new Promise((resolve, reject) => { const chunks = []; req.on('data', c => chunks.push(c)); req.on('end', () => resolve(Buffer.concat(chunks))); req.on('error', reject); });
  const send = (res, status, body, headers = {}) => {
    const payload = body === undefined ? '' : typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
    res.writeHead(status, { ...(typeof body === 'object' && !Buffer.isBuffer(body) && body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers });
    res.end(payload);
  };
  const bearer = req => { const h = req.headers.authorization ?? ''; return h.startsWith('Bearer ') ? h.slice(7) : null; };
  /** Resolves the caller the way the gateway would: a verified JWT, or anon via the apikey header. */
  function caller(req) {
    const token = bearer(req) ?? req.headers.apikey ?? null;
    if (!token) return { role: 'anon', actor: 'client', claims: {} };
    const claims = verifyJwt(token);
    if (!claims) return { invalid: true };
    const actor = claims.role === 'service_role' ? (claims.jti === 'edge-function' ? 'function' : 'operator') : 'client';
    return { role: claims.role, sub: claims.sub ?? null, claims, actor, token };
  }
  const requireAdmin = (who, res) => {
    if (who.invalid) { send(res, 401, { code: 401, error_code: 'bad_jwt', msg: 'invalid JWT' }); return false; }
    if (who.role !== 'service_role') { send(res, 403, { code: 403, error_code: 'not_admin', msg: 'User not allowed' }); return false; }
    return true;
  };

  // ============================== GoTrue (Auth) ======================================================
  async function auth(req, res, url, who) {
    const path = url.pathname.replace('/auth/v1', '');
    const body = req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE' ? (() => { try { return JSON.parse(req.rawBody.toString() || '{}'); } catch { return {}; } })() : {};
    const invalid = (status, code, msg) => send(res, status, { code: status, error_code: code, msg });

    if (path === '/token' && req.method === 'POST') {
      const grant = url.searchParams.get('grant_type');
      if (grant === 'password') {
        const user = body.email ? await findByEmail(body.email) : null;
        if (!user || passwords.get(user.id) !== body.password) return invalid(400, 'invalid_credentials', 'Invalid login credentials');
        return send(res, 200, issueSession(user, 'password'));
      }
      if (grant === 'refresh_token') {
        const userId = refreshTokens.get(body.refresh_token);
        const user = userId ? await findUser(userId) : null;
        if (!user) return invalid(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
        return send(res, 200, issueSession(user, 'token_refresh'));
      }
      return invalid(400, 'validation_failed', 'unsupported grant_type');
    }
    if (path === '/logout' && req.method === 'POST') {
      const claims = verifyJwt(bearer(req));
      return claims ? send(res, 204) : invalid(401, 'bad_jwt', 'invalid JWT');
    }
    if (path === '/user' && req.method === 'GET') {
      const claims = verifyJwt(bearer(req));
      if (!claims) return invalid(401, 'bad_jwt', 'invalid JWT: unable to parse or verify signature');
      const user = claims.sub ? await findUser(claims.sub) : null;
      // The real Auth service answers 403 for a still-valid JWT whose user row no longer exists.
      if (!user) return invalid(403, 'user_not_found', 'User from sub claim in JWT does not exist');
      return send(res, 200, userJson(user));
    }
    if (path === '/verify' && req.method === 'GET') {
      const link = magicTokens.get(url.searchParams.get('token'));
      const user = link ? await findUser(link.userId) : null;
      if (!user) return send(res, 303, '', { location: `http://localhost:3000#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired` });
      magicTokens.delete(url.searchParams.get('token')); // single use
      const s = issueSession(user, 'otp');
      const fragment = new URLSearchParams({ access_token: s.access_token, expires_at: String(s.expires_at), expires_in: '3600', refresh_token: s.refresh_token, token_type: 'bearer', type: 'magiclink' });
      return send(res, 303, '', { location: `${url.searchParams.get('redirect_to') || 'http://localhost:3000'}#${fragment}` });
    }
    // -------- admin API (service role only) --------
    if (path.startsWith('/admin/')) {
      if (!requireAdmin(who, res)) return;
      if (path === '/admin/users' && req.method === 'POST') {
        if (!body.email || !body.password) return invalid(422, 'validation_failed', 'email and password required');
        if (await findByEmail(body.email)) return invalid(422, 'email_exists', 'A user with this email address has already been registered');
        return send(res, 200, userJson(await createUser(body.email, body.password, body.user_metadata ?? {})));
      }
      if (path === '/admin/users' && req.method === 'GET') {
        const page = Math.max(1, Number(url.searchParams.get('page') || 1)), perPage = Math.max(1, Math.min(1000, Number(url.searchParams.get('per_page') || 50)));
        const all = (await db.admin('select * from auth.users order by created_at, id')).rows;
        const slice = all.slice((page - 1) * perPage, page * perPage);
        const last = Math.max(1, Math.ceil(all.length / perPage));
        const links = []; if (page < last) links.push(`<${origin}/auth/v1/admin/users?page=${page + 1}&per_page=${perPage}>; rel="next"`);
        links.push(`<${origin}/auth/v1/admin/users?page=${last}&per_page=${perPage}>; rel="last"`);
        return send(res, 200, { users: slice.map(userJson), aud: 'authenticated' }, { 'x-total-count': String(all.length), link: links.join(',') });
      }
      const one = /^\/admin\/users\/([0-9a-f-]{36})$/.exec(path);
      if (one && req.method === 'GET') { const row = await findUser(one[1]); return row ? send(res, 200, userJson(row)) : invalid(404, 'user_not_found', 'User not found'); }
      if (one && req.method === 'DELETE') {
        const row = await findUser(one[1]);
        if (!row) return invalid(404, 'user_not_found', 'User not found');
        adminDeletes.push({ id: row.id, email: row.email, actor: who.actor, at: Date.now() });
        await db.admin('delete from auth.users where id=$1', [row.id]);
        passwords.delete(row.id);
        for (const [token, userId] of refreshTokens) if (userId === row.id) refreshTokens.delete(token);
        return send(res, 200, {});
      }
      if (path === '/admin/generate_link' && req.method === 'POST') {
        const user = body.email ? await findByEmail(body.email) : null;
        if (!user) return invalid(404, 'user_not_found', 'User not found');
        const token = crypto.randomBytes(12).toString('hex');
        magicTokens.set(token, { userId: user.id });
        const redirectTo = 'http://localhost:3000';
        return send(res, 200, { ...userJson(user), action_link: `https://${publicHost}/auth/v1/verify?token=${token}&type=${body.type}&redirect_to=${encodeURIComponent(redirectTo)}`,
          email_otp: '123456', hashed_token: crypto.createHash('sha256').update(token).digest('hex'), redirect_to: redirectTo, verification_type: body.type });
      }
    }
    return invalid(404, 'not_found', `unsupported auth route ${req.method} ${path}`);
  }

  // ============================== PostgREST (Data API) ==============================================
  const pkCache = new Map();
  async function primaryKey(tx, table) {
    if (!pkCache.has(table)) {
      const r = await tx.query(`select a.attname from pg_index i join pg_attribute a on a.attrelid=i.indrelid and a.attnum=any(i.indkey) where i.indrelid=$1::regclass and i.indisprimary`, [`public.${table}`]);
      pkCache.set(table, r.rows.map(x => x.attname).join(','));
    }
    return pkCache.get(table);
  }
  const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  const columnExpr = key => {
    const json = /^([a-z_][a-z0-9_]*)->>([A-Za-z0-9_]+)$/.exec(key);
    return json ? `(${ident(json[1])}->>'${json[2]}')` : ident(key);
  };
  function filters(url, params = []) {
    const conds = [];
    for (const [key, value] of url.searchParams) {
      if (RESERVED.has(key)) continue;
      const m = /^eq\.(.*)$/s.exec(value);
      if (!m) throw Object.assign(new Error(`unsupported filter on ${key}`), { http: 400 });
      params.push(m[1]); conds.push(`${columnExpr(key)} = $${params.length}`);
    }
    return { where: conds.length ? ` where ${conds.join(' and ')}` : '', params };
  }
  const selectList = url => { const s = url.searchParams.get('select'); return !s || s === '*' ? '*' : s.split(',').map(c => ident(c.trim())).join(','); };
  const encodeValue = v => (v !== null && typeof v === 'object' ? JSON.stringify(v) : v);
  const RPC_TYPES = { save_purchase_record: { record: 'jsonb' }, delete_purchase_record: { record_id: 'text' } };

  async function rest(req, res, url, who) {
    if (who.invalid) return send(res, 401, { code: 'PGRST301', details: null, hint: null, message: 'JWSError JWSInvalidSignature' });
    const target = url.pathname.replace('/rest/v1/', '');
    const prefer = String(req.headers.prefer ?? '');
    const wantRows = /return=representation/.test(prefer);
    const single = /vnd\.pgrst\.object\+json/.test(String(req.headers.accept ?? ''));
    let body = {}; try { body = JSON.parse(req.rawBody.toString() || '{}'); } catch { /* keep {} */ }
    const reply = (rows, status) => {
      if (single) return rows.length === 1 ? send(res, 200, rows[0])
        : send(res, 406, { code: 'PGRST116', details: `The result contains ${rows.length} rows`, hint: null, message: 'JSON object requested, multiple (or no) rows returned' });
      return send(res, status, rows);
    };
    try {
      if (target.startsWith('rpc/') && req.method === 'POST') {
        const fn = ident(target.slice(4));
        const out = await db.as(who, async tx => {
          const keys = Object.keys(body), types = RPC_TYPES[fn] ?? {};
          const args = keys.map((k, i) => `${ident(k)} => $${i + 1}${types[k] ? `::${types[k]}` : ''}`).join(', ');
          const returnType = (await tx.query('select prorettype::regtype::text as t from pg_proc where proname=$1 and pronamespace=$2::regnamespace', [fn, 'public'])).rows[0]?.t;
          const r = await tx.query(`select public.${fn}(${args}) as result`, keys.map(k => encodeValue(body[k])));
          return { rows: r.rows, returnType };
        });
        if (out.returnType === 'void') return send(res, 204);
        return send(res, 200, JSON.stringify(out.rows[0]?.result ?? null), { 'content-type': 'application/json' });
      }
      const table = ident(target);
      if (req.method === 'GET') {
        const { where, params } = filters(url);
        const rows = (await db.as(who, tx => tx.query(`select ${selectList(url)} from public.${table}${where}${url.searchParams.get('limit') ? ` limit ${Number(url.searchParams.get('limit'))}` : ''}`, params))).rows;
        return reply(rows, 200);
      }
      if (req.method === 'POST') {
        const list = Array.isArray(body) ? body : [body];
        const rows = (await db.as(who, async tx => {
          const cols = [...new Set(list.flatMap(r => Object.keys(r)))].map(ident);
          const params = [];
          const tuples = list.map(r => `(${cols.map(c => { params.push(encodeValue(r[c])); return `$${params.length}`; }).join(',')})`);
          let sql = `insert into public.${table} (${cols.join(',')}) values ${tuples.join(',')}`;
          const resolution = /resolution=(merge|ignore)-duplicates/.exec(prefer)?.[1];
          if (resolution) {
            const conflict = url.searchParams.get('on_conflict') ?? await primaryKey(tx, table);
            const set = cols.filter(c => c !== conflict).map(c => `${c}=excluded.${c}`).join(', ');
            sql += ` on conflict (${conflict}) ${resolution === 'ignore' ? 'do nothing' : `do update set ${set || `${conflict}=excluded.${conflict}`}`}`;
          }
          if (wantRows) sql += ` returning ${selectList(url)}`;
          return (await tx.query(sql, params)).rows;
        }));
        return wantRows ? reply(rows, 201) : send(res, 201);
      }
      if (req.method === 'PATCH') {
        const cols = Object.keys(body).map(ident);
        const params = cols.map(c => encodeValue(body[c]));
        const { where } = filters(url, params);
        const rows = (await db.as(who, tx => tx.query(`update public.${table} set ${cols.map((c, i) => `${c}=$${i + 1}`).join(', ')}${where}${wantRows ? ` returning ${selectList(url)}` : ''}`, params))).rows;
        return wantRows ? reply(rows, 200) : send(res, 204);
      }
      return send(res, 405, { message: `unsupported method ${req.method}` });
    } catch (error) {
      if (error.http) return send(res, error.http, { code: 'PGRST100', details: null, hint: null, message: error.message });
      return send(res, PG_STATUS[error.code] ?? 400, pgError(error));
    }
  }

  // ============================== Storage ===========================================================
  const storageError = (res, status, error, message) => send(res, status, { statusCode: String(status), error, message });
  const splitPath = (url, prefix) => url.pathname.slice(prefix.length).split('/').map(decodeURIComponent);
  async function storage(req, res, url, who) {
    if (who.invalid) return storageError(res, 401, 'Unauthorized', 'invalid JWT');
    const route = url.pathname.replace('/storage/v1', '');
    let body = {}; if (req.headers['content-type']?.includes('json')) { try { body = JSON.parse(req.rawBody.toString() || '{}'); } catch { /* keep {} */ } }
    try {
      if (route.startsWith('/object/list/') && req.method === 'POST') {
        const bucket = route.slice('/object/list/'.length);
        const prefix = String(body.prefix ?? '').replace(/^\/+|\/+$/g, '');
        const base = prefix ? `${prefix}/` : '';
        const like = `${base.replace(/[\\%_]/g, m => `\\${m}`)}%`;
        const rows = (await db.as(who, tx => tx.query('select id, name, created_at, updated_at from storage.objects where bucket_id=$1 and name like $2', [bucket, like]))).rows;
        const folders = new Map(), files = [];
        for (const row of rows) {
          const rest = row.name.slice(base.length), first = rest.split('/')[0];
          if (rest.includes('/')) folders.set(first, { name: first, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null });
          else files.push({ name: first, id: row.id, updated_at: row.updated_at, created_at: row.created_at, last_accessed_at: row.updated_at, metadata: { size: objects.get(`${bucket}/${row.name}`)?.length ?? 0 } });
        }
        const desc = body.sortBy?.order === 'desc';
        const cmp = (a, b) => (desc ? -1 : 1) * a.name.localeCompare(b.name, 'en', { numeric: false });
        // Mirrors storage.search(): folders first, then files, each ordered by name; then offset/limit.
        const ordered = [...[...folders.values()].sort(cmp), ...files.sort(cmp)];
        const offset = Number(body.offset ?? 0), limit = Number(body.limit ?? 100);
        return send(res, 200, ordered.slice(offset, offset + limit));
      }
      if (route.startsWith('/object/sign/') && req.method === 'POST') {
        const [bucket, ...rest] = splitPath(url, '/storage/v1/object/sign/'), name = rest.join('/');
        const found = (await db.as(who, tx => tx.query('select id from storage.objects where bucket_id=$1 and name=$2', [bucket, name]))).rows;
        if (!found.length) return storageError(res, 400, 'not_found', 'Object not found');
        return send(res, 200, { signedURL: `/object/sign/${bucket}/${name}?token=${crypto.randomBytes(8).toString('hex')}` });
      }
      // storage-js download(): GET /object/<bucket>/<path>  (also accepted: /object/authenticated/<bucket>/<path>)
      if (req.method === 'GET' && /^\/object\/(?!list\/|sign\/)[^/]+\/.+/.test(route)) {
        const prefix = route.startsWith('/object/authenticated/') ? '/storage/v1/object/authenticated/' : '/storage/v1/object/';
        const [bucket, ...rest] = splitPath(url, prefix), name = rest.join('/');
        const found = (await db.as(who, tx => tx.query('select id from storage.objects where bucket_id=$1 and name=$2', [bucket, name]))).rows;
        if (!found.length) return storageError(res, 400, 'not_found', 'Object not found');
        return send(res, 200, objects.get(`${bucket}/${name}`) ?? Buffer.alloc(0), { 'content-type': 'application/octet-stream' });
      }
      const objectMatch = /^\/object\/([^/]+)(?:\/(.+))?$/.exec(route);
      if (objectMatch && req.method === 'DELETE' && !objectMatch[2]) {
        const bucket = objectMatch[1];
        const prefixes = Array.isArray(body.prefixes) ? body.prefixes : body.prefixes === undefined ? null : [body.prefixes]; // Fastify coerces a scalar to [scalar]
        if (!prefixes) return storageError(res, 400, 'invalid_request', 'prefixes required');
        const deleted = (await db.as(who, tx => tx.query('delete from storage.objects where bucket_id=$1 and name = any($2::text[]) returning id, name, bucket_id', [bucket, prefixes]))).rows;
        for (const row of deleted) objects.delete(`${bucket}/${row.name}`);
        // Real Storage answers 200 with only the rows RLS allowed to be deleted (possibly none).
        return send(res, 200, deleted);
      }
      if (objectMatch && objectMatch[2] && (req.method === 'POST' || req.method === 'PUT')) {
        const [bucket, ...rest] = splitPath(url, '/storage/v1/object/'), name = rest.join('/');
        const info = (await db.admin('select file_size_limit, allowed_mime_types from storage.buckets where id=$1', [bucket])).rows[0];
        if (!info) return storageError(res, 404, 'Bucket not found', 'Bucket not found');
        const bytes = req.rawBody, mime = String(req.headers['content-type'] ?? '').split(';')[0].trim();
        if (info.file_size_limit && bytes.length > Number(info.file_size_limit)) return storageError(res, 413, 'Payload too large', 'The object exceeded the maximum allowed size');
        if (info.allowed_mime_types && !info.allowed_mime_types.includes(mime)) return storageError(res, 415, 'invalid_mime_type', `mime type ${mime} is not supported`);
        const upsert = String(req.headers['x-upsert']) === 'true', update = req.method === 'PUT';
        const done = await db.as(who, async tx => {
          const existing = (await tx.query('select id from storage.objects where bucket_id=$1 and name=$2', [bucket, name])).rows.length > 0;
          if (update || (existing && upsert)) {
            const r = await tx.query('update storage.objects set updated_at=now() where bucket_id=$1 and name=$2 returning id', [bucket, name]);
            if (!r.rows.length) { const e = new Error('new row violates row-level security policy'); e.code = '42501'; throw e; }
            return 'updated';
          }
          await tx.query('insert into storage.objects(bucket_id, name, owner) values ($1,$2,$3)', [bucket, name, who.sub ?? null]);
          return 'created';
        });
        objects.set(`${bucket}/${name}`, bytes);
        return send(res, 200, { Id: crypto.randomUUID(), Key: `${bucket}/${name}`, done });
      }
    } catch (error) {
      if (error.code === '42501') return storageError(res, 403, 'Unauthorized', 'new row violates row-level security policy');
      if (error.code === '23505') return storageError(res, 409, 'Duplicate', 'The resource already exists');
      return storageError(res, 400, 'DatabaseError', error.message);
    }
    return storageError(res, 404, 'not_found', `unsupported storage route ${req.method} ${route}`);
  }

  // ============================== Edge Functions gateway ============================================
  const functions = new Map();
  async function gateway(req, res, url) {
    const name = url.pathname.replace('/functions/v1/', '').split('/')[0];
    const handler = functions.get(name);
    if (!handler) return send(res, 404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
    const headers = new Headers(); for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v);
    const request = new Request(`https://${publicHost}${url.pathname}${url.search}`, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.rawBody });
    // Invocations are sequential in these scripts, so start/end markers delimit the function's own requests.
    events.push({ seq: events.length, actor: 'gateway', phase: 'start', method: req.method, path: url.pathname, status: null });
    const response = await handler(request);
    events.push({ seq: events.length, actor: 'gateway', phase: 'end', method: req.method, path: url.pathname, status: response.status });
    const out = {}; response.headers.forEach((v, k) => { out[k] = v; });
    return send(res, response.status, Buffer.from(await response.arrayBuffer()), out);
  }

  // ============================== server ============================================================
  const server = http.createServer(async (req, res) => {
    try {
      req.rawBody = await readBody(req);
      const url = new URL(req.url, origin || 'http://127.0.0.1');
      if (url.pathname === '/__sim/advance-clock' && req.method === 'POST') { clockOffset += Number(JSON.parse(req.rawBody.toString()).ms) || 0; return send(res, 200, { offset: clockOffset }); }
      const who = caller(req);
      const started = events.length;
      events.push({ seq: started, actor: who.actor ?? 'invalid', sub: who.sub ?? null, method: req.method, path: `${url.pathname}${url.search}`, status: null });
      const finish = status => { events[started].status = status; };
      const origWrite = res.writeHead.bind(res); res.writeHead = (status, ...rest) => { finish(status); return origWrite(status, ...rest); };
      await als.run({}, async () => {
        if (url.pathname.startsWith('/auth/v1/')) return auth(req, res, url, who);
        if (url.pathname.startsWith('/rest/v1/')) return rest(req, res, url, who);
        if (url.pathname.startsWith('/storage/v1/')) return storage(req, res, url, who);
        if (url.pathname.startsWith('/functions/v1/')) return gateway(req, res, url);
        return send(res, 404, { message: 'not found' });
      });
    } catch (error) {
      if (!res.headersSent) send(res, 500, { message: `simulator error: ${error.message}` });
      console.error('[sim] internal error:', error);
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;

  // --- host the REAL Edge Function sources (unmodified) under Node ----------------------------------
  async function hostFunction(name = 'delete-account') {
    register(new URL('./npm-specifier-hook.mjs', import.meta.url));
    const env = { SUPABASE_URL: origin, SUPABASE_SERVICE_ROLE_KEY: SIM_KEYS.edgeFunction, ALLOWED_ORIGINS: '' };
    let captured = null;
    globalThis.Deno = { env: { get: key => env[key] }, serve: handler => { captured = handler; return { shutdown() {} }; } };
    await import(pathToFileURL(join(functionsDir, name, 'index.ts')).href);
    if (!captured) throw new Error(`${name}/index.ts did not register a handler`);
    functions.set(name, captured);
  }
  await hostFunction('delete-account');

  return {
    origin, publicHost, keys: SIM_KEYS, events, adminDeletes, protectedIds, applied, objects, db, passwords,
    createUser, findByEmail, protect: id => protectedIds.add(id),
    clockOffset: () => clockOffset,
    async stop() { await new Promise(resolve => server.close(resolve)); server.closeAllConnections?.(); await pg.close(); },
  };
}
