import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { Navigation2, AlertTriangle, Activity, LogOut, MapPin, GitFork } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';

interface NavItem {
  to: string;
  icon: React.ReactNode;
  label: string;
}

const navItems: NavItem[] = [
  { to: '/map', icon: <Navigation2 size={20} />, label: 'Navigate' },
  { to: '/emergency', icon: <AlertTriangle size={20} />, label: 'Emergency' },
  { to: '/jogging', icon: <Activity size={20} />, label: 'Jogging' },
  { to: '/graph', icon: <GitFork size={20} />, label: 'Graph' },
];

export default function Layout() {
  const navigate = useNavigate();
  const userRaw = localStorage.getItem('ss_user');
  const user = userRaw ? JSON.parse(userRaw) : null;

  function handleLogout() {
    localStorage.removeItem('ss_token');
    localStorage.removeItem('ss_user');
    toast.success('Signed out successfully');
    navigate('/login');
  }

  return (
    <div className="flex h-screen bg-netflix-black overflow-hidden">
      {/* Sidebar */}
      <aside
        className="w-20 flex flex-col items-center py-6 gap-3 z-20 relative"
        style={{
          background: 'linear-gradient(180deg, #0f1117 0%, #1a1f2e 100%)',
          borderRight: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        {/* Logo */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 20 }}
          className="mb-4 flex flex-col items-center"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center text-white shadow-lg"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            <MapPin size={22} />
          </div>
        </motion.div>

        {/* Nav Links */}
        <nav className="flex flex-col gap-2 flex-1 w-full px-2">
          {navItems.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} end>
              {({ isActive }) => (
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="relative flex flex-col items-center gap-1 py-3 px-2 rounded-2xl cursor-pointer transition-all duration-200"
                  style={{
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(102,126,234,0.3) 0%, rgba(118,75,162,0.3) 100%)'
                      : 'transparent',
                    boxShadow: isActive ? '0 0 20px rgba(102,126,234,0.25)' : 'none',
                    border: isActive ? '1px solid rgba(102,126,234,0.3)' : '1px solid transparent',
                  }}
                >
                  <span
                    style={{
                      color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.4)',
                      transition: 'color 0.2s',
                    }}
                  >
                    {icon}
                  </span>
                  <span
                    className="text-[10px] font-medium"
                    style={{ color: isActive ? '#a78bfa' : 'rgba(255,255,255,0.35)' }}
                  >
                    {label}
                  </span>
                </motion.div>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="flex flex-col items-center gap-2 mt-auto">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm"
            style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}
          >
            {user?.username?.[0]?.toUpperCase() ?? 'U'}
          </div>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleLogout}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200"
            style={{
              background: 'rgba(239,68,68,0.15)',
              border: '1px solid rgba(239,68,68,0.25)',
              color: '#f87171',
            }}
            title="Sign Out"
          >
            <LogOut size={16} />
          </motion.button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
