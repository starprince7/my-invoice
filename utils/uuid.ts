/**
 * Simple utility to generate UUID strings for unique identifiers
 */
export const generateUUID = (): string => {
  // Simple implementation using Math.random()
  // Note: This is not cryptographically secure but sufficient for our needs
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
