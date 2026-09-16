/** Same-origin absolute paths keep public assets correct inside export workers. */
export function deploymentBase(value: string | undefined): string {
  const path = value?.trim() || '/';
  if (/^\/+$/u.test(path)) return '/';
  if (/^[a-z][a-z\d+.-]*:/iu.test(path) || path.startsWith('//') || /[?#\\\s]/u.test(path)) {
    throw new Error('VITE_BASE_PATH must be a site path such as / or /my-repo/, not a URL.');
  }
  const segments = path.split('/').filter(Boolean);
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    throw new Error('VITE_BASE_PATH must be an absolute site path without . or .. segments.');
  }
  return `/${segments.join('/')}/`;
}
