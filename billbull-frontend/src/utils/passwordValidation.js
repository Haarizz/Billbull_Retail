/**
 * Utility for validating password complexity.
 * This MUST mirror the backend rules in UserService.java (validatePasswordComplexity).
 * 
 * Rules:
 * - Minimum 8 characters
 * - At least one uppercase letter (.*[A-Z].*)
 * - At least one digit (.*[0-9].*)
 * - At least one special character (.*[^a-zA-Z0-9].*)
 */

export const validatePassword = (password) => {
  const pwd = password || '';
  
  const rules = {
    length: pwd.length >= 8,
    uppercase: /.*[A-Z].*/.test(pwd),
    digit: /.*[0-9].*/.test(pwd),
    specialChar: /.*[^a-zA-Z0-9].*/.test(pwd),
  };

  const isValid = Object.values(rules).every((isRuleMet) => isRuleMet);

  const errors = [];
  if (!rules.length) errors.push('Must be at least 8 characters.');
  if (!rules.uppercase) errors.push('Must contain at least one uppercase letter.');
  if (!rules.digit) errors.push('Must contain at least one digit.');
  if (!rules.specialChar) errors.push('Must contain at least one special character.');

  return {
    isValid,
    rules,
    errors,
  };
};
