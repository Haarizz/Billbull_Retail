export const formatUserDisplayName = (value) => {
  const text = String(value || '').trim();
  if (!text) return '';

  return text
    .split(/\s+/)
    .map(part => part ? `${part.charAt(0).toUpperCase()}${part.slice(1)}` : part)
    .join(' ');
};
