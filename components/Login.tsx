import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/auth';

interface LoginProps {
    onLoginSuccess: () => void;
    onCancel: () => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onCancel }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false); // Toggle state

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            if (isRegistering) {
                await registerUser(email, password);
                // Auto login after register is usually handled by firebase, but we can call onLoginSuccess
                onLoginSuccess();
            } else {
                await loginUser(email, password);
                onLoginSuccess();
            }
        } catch (err: any) {
            console.error("Auth failed:", err);
            setError(err.message || "Authentication failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="bg-dark-900 border border-gold-500/30 p-8 rounded-xl w-full max-w-md shadow-2xl animate-fade-in-up">
                <h2 className="text-2xl font-display font-bold text-white mb-6 text-center">
                    {isRegistering ? 'Create Admin Account' : 'Authorized Access Only'}
                </h2>

                {error && (
                    <div className="bg-red-500/10 border border-red-500 text-red-500 p-3 rounded mb-4 text-center text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-gray-400 text-sm mb-1">Email</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-dark-800 border border-gray-700 rounded p-3 text-white focus:border-gold-500 outline-none transition"
                            placeholder="admin@bladebourbon.com"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-gray-400 text-sm mb-1">Password</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-dark-800 border border-gray-700 rounded p-3 text-white focus:border-gold-500 outline-none transition"
                            placeholder="••••••••"
                            required
                        />
                    </div>

                    <div className="flex gap-4 pt-4">
                        <button
                            type="button"
                            onClick={onCancel}
                            className="flex-1 py-3 rounded text-gray-400 hover:text-white transition"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 bg-gold-500 text-black font-bold py-3 rounded hover:bg-gold-400 transition disabled:opacity-50"
                        >
                            {loading ? 'Processing...' : (isRegistering ? 'Register' : 'Login')}
                        </button>
                    </div>

                    <div className="text-center pt-2">
                        <button
                            type="button"
                            onClick={() => setIsRegistering(!isRegistering)}
                            className="text-xs text-gold-500 hover:text-gold-400 underline"
                        >
                            {isRegistering ? 'Back to Login' : 'Register new Admin'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};
