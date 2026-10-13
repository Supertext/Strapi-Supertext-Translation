/**
 * Public route: GET /api/supertext/ping?challenge=… (no login, no session, no CSRF), the
 * Commando Center's reachability check. Answers only the challenge; 404 while version reports are off.
 */
export default () => ({
  type: 'content-api',
  routes: [{ method: 'GET', path: '/ping', handler: 'translate.ping', config: { auth: false, policies: [] } }],
});
