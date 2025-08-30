import { useEffect } from 'react';
import { useAppStore } from './store';
import Register from './pages/Register';
import Chat from './pages/Chat';
import './index.css';

export default function App() {
  const { me, token, loadUsers } = useAppStore();
  useEffect(() => {
    if (token) loadUsers();
  }, [token]);
  if (!token || !me) return <Register />;
  return <Chat />;
}
