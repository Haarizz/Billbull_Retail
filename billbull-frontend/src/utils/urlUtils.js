/**
 * Returns a fully-qualified URL for a backend-served asset path.
 *
 * Dev  (REACT_APP_API_BASE_URL=http://localhost:8080): prepends the Spring Boot origin.
 * Prod (REACT_APP_API_BASE_URL empty):                 prepends window.location.origin so
 *                                                       nginx reverse-proxy routes the path
 *                                                       to the backend on the same domain.
 */
export const getImageUrl = (path) => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  const base = import.meta.env.VITE_API_BASE_URL || window.location.origin;
  return `${base}${path}`;
};
