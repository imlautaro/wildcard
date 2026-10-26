import { createAuth } from './auth';

export async function readBearerSession(env: Env, headers: Headers) {
  const authorization = headers.get('Authorization');
  if (!authorization || !/^Bearer \S+$/i.test(authorization)) return null;
  // Ignore cookies: a bearer-only endpoint must validate the supplied token.
  return createAuth(env).api.getSession({ headers: new Headers({ Authorization: authorization }) });
}
