export function getAuthenticatedLandingPath(user) {
  // There is no separate admin dashboard route in this application yet; retain
  // the existing admin landing destination while sending customers home.
  const currentAdminLanding = '/'
  return user?.role === 'admin' ? currentAdminLanding : '/'
}
