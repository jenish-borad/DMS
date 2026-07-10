import { useState } from 'react';
import { api } from '../api';

export default function Auth({ onAuthSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form Fields
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');

  const resetForm = () => {
    setUsername('');
    setEmail('');
    setFullName('');
    setPassword('');
    setError('');
    setSuccess('');
  };

  const handleToggleMode = () => {
    setIsLogin(!isLogin);
    resetForm();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setSuccess('');

    // Input Validation
    if (isLogin) {
      if (!username) {
        setError('Username or Email is required');
        setLoading(false);
        return;
      }
      if (!password) {
        setError('Password is required');
        setLoading(false);
        return;
      }
    } else {
      if (!username.trim() || !email.trim() || !fullName.trim() || !password) {
        setError('All fields are required');
        setLoading(false);
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters long');
        setLoading(false);
        return;
      }
      if (!email.includes('@')) {
        setError('Please enter a valid email address');
        setLoading(false);
        return;
      }
    }

    try {
      if (isLogin) {
        // username field is used as usernameOrEmail in api helper
        const response = await api.auth.login(username, password);
        setSuccess('Logged in successfully!');
        // Small delay to let user see success before redirect/update
        setTimeout(() => {
          onAuthSuccess(response.data.user);
        }, 600);
      } else {
        await api.auth.register(
          username.trim(),
          email.trim(),
          fullName.trim(),
          password
        );
        setSuccess('Registration successful! Please login.');
        // Auto switch to login mode after registration
        setTimeout(() => {
          setIsLogin(true);
          setPassword('');
          setError('');
          setSuccess('');
        }, 1500);
      }
    } catch (err) {
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#fafafa] px-4">
      <div className="w-full max-w-md bg-white border border-black p-8 shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] animate-fade-in">
        
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tighter uppercase border-b-2 border-black pb-2 inline-block">
            DMS // Search
          </h1>
          <p className="text-xs text-zinc-500 mt-2 font-mono uppercase tracking-widest">
            {isLogin ? 'Document Vault Authorization' : 'Create New Account'}
          </p>
        </div>

        {/* Status Messages (No native alert window used) */}
        {error && (
          <div className="mb-6 p-3 bg-black text-white text-sm font-mono border border-black flex items-start">
            <span className="font-bold mr-2">/!/</span>
            <div>{error}</div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-3 bg-zinc-100 text-black text-sm font-mono border border-black flex items-start">
            <span className="font-bold mr-2">&gt;&gt;</span>
            <div>{success}</div>
          </div>
        )}

        {/* Auth Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {!isLogin && (
            <>
              <div>
                <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
                  Full Name
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="w-full border border-black p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome"
                  required
                />
              </div>

              <div>
                <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jane@example.com"
                  className="w-full border border-black p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome"
                  required
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
              {isLogin ? 'Username or Email' : 'Username'}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={isLogin ? "Enter username or email" : "jane_doe"}
              className="w-full border border-black p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome"
              required
            />
          </div>

          <div>
            <label className="block text-xs uppercase font-mono tracking-wider mb-1 text-zinc-700">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full border border-black p-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-black focus-ring-monochrome"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white hover:bg-zinc-800 p-3 text-sm font-mono uppercase tracking-wider transition-monochrome border border-black active:translate-x-[2px] active:translate-y-[2px]"
          >
            {loading ? 'Processing...' : isLogin ? 'Authenticate' : 'Register Account'}
          </button>
        </form>

        {/* Toggle Mode */}
        <div className="mt-6 text-center">
          <button
            onClick={handleToggleMode}
            className="text-xs uppercase font-mono tracking-wider text-zinc-600 hover:text-black underline cursor-pointer"
          >
            {isLogin ? "Need an account? Register" : "Have an account? Login"}
          </button>
        </div>
      </div>
    </div>
  );
}
