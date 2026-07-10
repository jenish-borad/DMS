/**
 * asyncHandler — wraps async route handlers so errors are passed to Express's
 * next() error-handling middleware instead of causing unhandled rejections.
 */
const asyncHandler = (requestHandler) => {
    return (req, res, next) => {
        Promise.resolve(requestHandler(req, res, next)).catch(next);
    };
};

export { asyncHandler };