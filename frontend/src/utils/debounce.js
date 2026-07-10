/**
 * A standard, simple debounce function to limit how often a function is executed.
 * When the returned function is called, it schedules the execution of the original
 * function after `delay` milliseconds. If called again before the delay expires,
 * the previous timer is cancelled and restarted.
 */
export function debounce(func, delay) {
  let timeoutId;
  
  return function (...args) {
    // Clear any pending execution
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    
    // Schedule new execution
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}
