import React, { useState } from 'react';
import { BrainCircuitIcon, UserCircleIcon, KeyIcon } from './icons';

interface LoginPageProps {
    onLogin: (username: string) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (username.trim()) {
            onLogin(username.trim());
        }
    };

    return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 space-y-8 animate-fade-in">
                <div className="text-center">
                    <div className="flex items-center justify-center gap-3 mb-2">
                         <BrainCircuitIcon className="h-10 w-10 text-primary-600" />
                         <h1 className="text-3xl font-bold text-slate-800 tracking-tight">
                          문제의 바다
                        </h1>
                    </div>
                    <p className="text-slate-500">AI 문제은행 마켓플레이스에 오신 것을 환영합니다.</p>
                </div>
                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-2">
                            사용자 이름
                        </label>
                        <div className="relative">
                            <UserCircleIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input
                                id="username"
                                name="username"
                                type="text"
                                autoComplete="username"
                                required
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                                placeholder="사용자 이름을 입력하세요"
                            />
                        </div>
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-2">
                            비밀번호
                        </label>
                        <div className="relative">
                             <KeyIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                autoComplete="current-password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                                placeholder="아무거나 입력하세요"
                            />
                        </div>
                    </div>
                    <div>
                        <button
                            type="submit"
                            disabled={!username.trim()}
                            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-bold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:bg-slate-400"
                        >
                            로그인
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default LoginPage;
