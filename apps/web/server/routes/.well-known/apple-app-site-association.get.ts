// Replace the Team ID and bundle ID when reproducing the iOS installation.
// This route is public metadata and must remain accessible without a session.
export default defineEventHandler((event) => {
  setHeader(event, 'Content-Type', 'application/json');
  setHeader(event, 'Cache-Control', 'public, max-age=3600');
  return { applinks: { details: [{ appIDs: ['9CHLS2987W.com.imlautaro.Wildcard'], components: [{ '/': '/native/contact' }] }] } };
});
