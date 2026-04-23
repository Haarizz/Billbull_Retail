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
  if (
    path.startsWith("http://") ||
    path.startsWith("https://") ||
    path.startsWith("data:") ||
    path.startsWith("blob:")
  ) {
    return path;
  }

  if (path.startsWith("//")) {
    return `${window.location.protocol}${path}`;
  }

  const base = (import.meta.env.VITE_API_BASE_URL || window.location.origin).replace(/\/$/, "");
  const normalizedPath = String(path).trim();

  if (!normalizedPath) return "";

  return normalizedPath.startsWith("/")
    ? `${base}${normalizedPath}`
    : `${base}/${normalizedPath}`;
};
