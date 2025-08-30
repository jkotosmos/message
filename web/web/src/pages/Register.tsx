import type { FormEvent } from 'react';
import { useState } from 'react';
import { useAppStore } from '../store';

export default function Register() {
  const { registerOrLogin } = useAppStore();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await registerOrLogin(phone, name);
      location.href = '/';
    } catch (err: any) {
      setError(err.message || 'Ошибка регистрации');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#05060f] flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-black/40 backdrop-blur-xl rounded-2xl p-8 border border-fuchsia-500/20 shadow-[0_0_120px_-20px_rgba(255,0,255,0.5)]">
        <h1 className="text-3xl font-bold text-white mb-2">NeonTalk</h1>
        <p className="text-fuchsia-300/80 mb-6">Приватный мессенджер</p>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-fuchsia-200 mb-1">Телефон</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+7 900 000-00-00"
              className="w-full rounded-xl bg-[#0b0f1a] text-white px-4 py-3 outline-none border border-fuchsia-500/30 focus:border-fuchsia-400 focus:shadow-[0_0_20px_rgba(255,0,255,0.3)]"
            />
          </div>
          <div>
            <label className="block text-fuchsia-200 mb-1">Имя</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ваше имя"
              className="w-full rounded-xl bg-[#0b0f1a] text-white px-4 py-3 outline-none border border-cyan-500/30 focus:border-cyan-400 focus:shadow-[0_0_20px_rgba(0,255,255,0.3)]"
            />
          </div>
          {error && <div className="text-red-400 text-sm">{error}</div>}
          <button
            disabled={loading}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-fuchsia-600 to-cyan-500 text-white font-semibold hover:from-fuchsia-500 hover:to-cyan-400 transition shadow-[0_0_40px_rgba(255,0,255,0.3)] disabled:opacity-60"
          >
            {loading ? 'Загрузка…' : 'Продолжить'}
          </button>
        </form>
      </div>
    </div>
  );
}

