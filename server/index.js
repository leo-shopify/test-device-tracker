const Fs = require('fs');
const Koa = require('koa');
const Path = require('path');
const Qs = require('querystring');
const Router = require('koa-router');
const Url = require('url');
const fetch = require('node-fetch');
const createStaticCache = require('koa-static-cache');


// /////////////////////////////////////////////////////////////////////////////
// environment defined variables

const environment = process.env;

const CLIENT_ID = environment.CLIENT_ID;
const CLIENT_SECRET = environment.CLIENT_SECRET;
const CLIENT_CALLBACK = environment.CLIENT_CALLBACK;

const parsedUrl = Url.parse(CLIENT_CALLBACK);
const CALLBACK_PATH = parsedUrl.pathname;
const PROTOCOL = parsedUrl.protocol;
const HOST = parsedUrl.hostname;
const PORT = parsedUrl.port;


// /////////////////////////////////////////////////////////////////////////////
// static files

const staticDir = Path.join(__dirname, '../dist');
const staticFiles = {};
const staticCache = createStaticCache(staticDir, { buffer: true }, staticFiles);

const noAuthPaths = (new Set(Object.keys(staticFiles))).add(CALLBACK_PATH);


// /////////////////////////////////////////////////////////////////////////////
// app constants

const GOOGLE_API = 'https://www.googleapis.com/oauth2/v3/';
const COOKIE_KEY = 'user';
const COOKIE_OPTS = {sameSite: 'lax', overwrite: true};


// /////////////////////////////////////////////////////////////////////////////
// authentication middle-ware

function excludesAuth({path}) { return noAuthPaths.has(path); }

async function isAuthenticated(ctx) {
  const cookie = ctx.cookies.get(COOKIE_KEY, COOKIE_OPTS);
  if (!cookie) return false;

  const user = JSON.parse(cookie);
  if(!user) return false;

  // TODO(leo): validate structure of user
  const accessToken = user.access_token;
  if(!accessToken) return false;

  // TODO(leo): check based on expiration, not every request
  const res = await fetch(`${GOOGLE_API}tokeninfo?access_token=${accessToken}`);
  const json = await res.json();
  const expiration = parseInt(json.expires_in || '0', 10);
  if (expiration <= 0) return false;

  // TODO(leo): define state
  ctx.state.xxx = json;
  return true;
}

function startAuth(ctx) {
  const base = 'https://accounts.google.com/o/oauth2/v2/auth';
  const query = Qs.stringify({
    // see https://developers.google.com/identity/protocols/googlescopes#oauth2v2
    scope: [
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' '),
    // prompt: 'consent', // make google prompt on every request
    state: ctx.path,
    response_type: 'code',
    redirect_uri: CLIENT_CALLBACK,
    client_id: CLIENT_ID,
  });
  return ctx.redirect(`${base}?${query}`);
}


async function auth(ctx, next) {
  if (excludesAuth(ctx)) { return next(); }

  return await isAuthenticated(ctx) ? next() : startAuth(ctx);
}


// /////////////////////////////////////////////////////////////////////////////
// routes

const router = new Router();

router.get('/', ctx => {
  ctx.path = '/index.html';
  staticCache(ctx);
});

router.get(CALLBACK_PATH, async ctx => {
  if (ctx.query && ctx.query.error) {
    throw new Error('Failed to authenticate');
  }

  // get access token
  const body = Qs.stringify({
    code: ctx.query.code,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: CLIENT_CALLBACK,
    grant_type: 'authorization_code'
  });

  try {
    const res = await fetch(`${GOOGLE_API}token`, {
      body,
      method: 'post',
      headers: {'content-type': 'application/x-www-form-urlencoded'}
    });
    const json = await res.json();
    const access_token = json.access_token;
    if (!access_token) { ctx.throw(401); }
    const destination = ctx.query.state;
    ctx.cookies.set(COOKIE_KEY, JSON.stringify(json), COOKIE_OPTS);
    return ctx.redirect(destination);
  } catch (e) {
    throw new Error(e);
  }
});


// /////////////////////////////////////////////////////////////////////////////
// app

const app = new Koa();
app.use(staticCache);
app.use(auth);
app.use(router.routes());
app.listen(PORT, HOST, () => {
  console.info(`Server listening to ${PROTOCOL}//${HOST}:${PORT}`);
});
