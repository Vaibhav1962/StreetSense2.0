import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import LoginPage from './pages/LoginPage';
import MapPage from './pages/MapPage';
import JoggingPage from './pages/JoggingPage';
import EmergencyPage from './pages/EmergencyPage';
import Layout from './components/Layout';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('ss_token');
  if (!token) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              background: 'rgba(26,31,46,0.95)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'white',
              backdropFilter: 'blur(20px)',
              borderRadius: '12px',
            },
          }}
          richColors
        />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/map" replace />} />
            <Route path="map" element={<MapPage />} />
            <Route path="jogging" element={<JoggingPage />} />
            <Route path="emergency" element={<EmergencyPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/map" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
