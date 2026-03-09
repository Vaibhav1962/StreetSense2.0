import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { MapPin, Navigation2, Zap, Shield, Activity } from 'lucide-react';
import { login } from '../lib/api';

const features = [
  { icon: <Navigation2 size={18} />, title: 'Smart Navigation', desc: 'Real-time routes with 3D maps' },
  { icon: <Zap size={18} />, title: 'Instant Search', desc: '100+ Delhi landmarks at your fingertips' },
  { icon: <Shield size={18} />, title: 'Emergency Finder', desc: 'Nearest hospitals in seconds' },
  { icon: <Activity size={18} />, title: 'Jogging Routes', desc: 'Curated park trails for runners' },
];

export default function LoginPage() {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(u?: string, p?: string) {
    const uname = u ?? username;
    const pass = p ?? password;
    if (!uname || !pass) { toast.error('Enter credentials'); return; }
    setLoading(true);
    try {
      const data = await login(uname, pass);
      localStorage.setItem('ss_token', data.access_token);
      localStorage.setItem('ss_user', JSON.stringify(data.user));
      toast.success(`Welcome back, ${data.user.full_name || data.user.username}! 🗺️`);
      navigate('/map');
    } catch (error: any) {
      if (error.response?.status === 401) {
        toast.error('Invalid credentials. Try admin/admin123 or demo/demo123');
      } else {
        toast.error('Cannot connect to the server. Is the backend running?');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex overflow-hidden relative" style={{ background: '#070a12' }}>
      {/* Background gradient orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="orb absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #667eea, transparent 70%)' }} />
        <div className="orb absolute top-1/2 -right-48 w-[500px] h-[500px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #764ba2, transparent 70%)' }} />
        <div className="orb absolute -bottom-32 left-1/3 w-80 h-80 rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #f093fb, transparent 70%)' }} />
        {/* Grid pattern overlay */}
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(102,126,234,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(102,126,234,0.05) 1px, transparent 1px)',
          backgroundSize: '60px 60px'
        }} />
      </div>

      {/* LEFT PANEL — Branding */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7 }}
        className="hidden lg:flex flex-col justify-between w-1/2 p-12 relative"
      >
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
            <MapPin size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">StreetSense</h1>
            <p className="text-xs text-white/40 font-medium tracking-widest uppercase">Delhi NCR</p>
          </div>
        </div>

        <div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-5xl font-bold leading-tight text-white mb-4"
          >
            Navigate Delhi<br />
            <span style={{
              backgroundImage: 'linear-gradient(135deg, #667eea 0%, #f093fb 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>Like a Pro</span>
          </motion.h2>
          <p className="text-white/50 text-lg mb-10 leading-relaxed">
            Premium navigation for Delhi NCR with 3D maps,<br />
            real-time routing, and local intelligence.
          </p>

          <div className="grid grid-cols-2 gap-4">
            {features.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + i * 0.1 }}
                className="glass-panel p-4 rounded-2xl"
              >
                <div className="w-8 h-8 rounded-xl flex items-center justify-center mb-3 text-purple-300"
                  style={{ background: 'rgba(102,126,234,0.2)', border: '1px solid rgba(102,126,234,0.3)' }}>
                  {f.icon}
                </div>
                <p className="text-white font-semibold text-sm">{f.title}</p>
                <p className="text-white/40 text-xs mt-1">{f.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>

        <p className="text-white/20 text-sm">© 2026 StreetSense. Delhi NCR Edition.</p>
      </motion.div>

      {/* RIGHT PANEL — Login form */}
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7 }}
        className="flex-1 flex items-center justify-center p-8"
      >
        <div className="w-full max-w-md">
          <div className="glass-card p-8" style={{
            background: 'rgba(10, 14, 26, 0.7)',
            border: '1px solid rgba(255,255,255,0.1)',
          }}>
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <MapPin size={18} className="text-white" />
              </div>
              <h1 className="text-xl font-bold text-white">StreetSense</h1>
            </div>

            <h2 className="text-2xl font-bold text-white mb-1">Welcome back</h2>
            <p className="text-white/40 text-sm mb-8">Sign in to access your navigation dashboard</p>

            <form onSubmit={(e) => { e.preventDefault(); handleLogin(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">Username</label>
                <input
                  id="username"
                  type="text"
                  className="input-field"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-2">Password</label>
                <input
                  id="password"
                  type="password"
                  className="input-field"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
              </div>
              <motion.button
                id="login-btn"
                type="submit"
                disabled={loading}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full py-3.5 rounded-xl font-semibold text-white transition-all duration-200 disabled:opacity-50 mt-2"
                style={{
                  background: loading ? 'rgba(102,126,234,0.5)' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  boxShadow: '0 4px 25px rgba(102,126,234,0.4)',
                }}
              >
                {loading ? 'Signing in...' : 'Sign In →'}
              </motion.button>
            </form>

            <div className="mt-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-white/10" />
                <span className="text-white/30 text-xs">Quick Login</span>
                <div className="flex-1 h-px bg-white/10" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <motion.button
                  id="quick-admin"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleLogin('admin', 'admin123')}
                  disabled={loading}
                  className="py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 text-white/80 disabled:opacity-50"
                  style={{
                    background: 'rgba(102,126,234,0.15)',
                    border: '1px solid rgba(102,126,234,0.25)',
                  }}
                >
                  👑 Admin
                </motion.button>
                <motion.button
                  id="quick-demo"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => handleLogin('demo', 'demo123')}
                  disabled={loading}
                  className="py-2.5 px-4 rounded-xl text-sm font-medium transition-all duration-200 text-white/80 disabled:opacity-50"
                  style={{
                    background: 'rgba(240,147,251,0.12)',
                    border: '1px solid rgba(240,147,251,0.22)',
                  }}
                >
                  🎭 Demo
                </motion.button>
              </div>
            </div>
          </div>
          <p className="text-center text-white/25 text-xs mt-6">
            admin/admin123 · demo/demo123
          </p>
        </div>
      </motion.div>
    </div>
  );
}
