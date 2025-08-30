import { useEffect } from 'react';
import { useAppStore } from './store';
import Register from './pages/Register';
import Chat from './pages/Chat';
import './index.css';

export default function App() {
  const { me, accessToken, loadUsers } = useAppStore();
  useEffect(() => {
    if (accessToken) loadUsers();
  }, [accessToken]);
  if (!accessToken || !me) return <Register />;
  return <Chat />;
}
