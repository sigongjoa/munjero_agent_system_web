import React, { useState } from 'react';

export default function BrowserLogin() {
  const [profileName, setProfileName] = useState('default');
  const [status, setStatus] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setIsLoading(true);
    setStatus('브라우저 로그인 시작 중...');
    try {
      const response = await fetch('/api/browser_login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profile_name: profileName }),
      });

      const data = await response.json();

      if (response.ok) {
        setStatus(`로그인 시작됨: ${data.message}. 브라우저 창에서 수동으로 로그인해주세요.`);
      } else {
        setStatus(`로그인 시작 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      setStatus(`네트워크 오류: ${error instanceof Error ? error.message : '알 수 없는 오류'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-lg shadow-md">
      <h2 className="text-2xl font-bold mb-4">브라우저 로그인</h2>
      <p className="text-gray-600 mb-6">
        ChatGPT 및 Typecast 자동 로그인을 위해 브라우저에 로그인합니다.
        로그인 후에는 해당 서비스에 자동으로 로그인됩니다.
      </p>

      <div className="mb-4">
        <label htmlFor="profileName" className="block text-gray-700 text-sm font-bold mb-2">
          프로필 이름:
        </label>
        <input
          type="text"
          id="profileName"
          className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          placeholder="default"
          disabled={isLoading}
        />
        <p className="text-xs text-gray-500 mt-1">
          로그인 세션을 구분하기 위한 이름입니다. (예: default, user1)
        </p>
      </div>

      <button
        onClick={handleLogin}
        disabled={isLoading}
        className={`bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${
          isLoading ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        {isLoading ? '로그인 시작 중...' : '브라우저 로그인 시작'}
      </button>

      {status && (
        <p className={`mt-4 p-3 rounded-md ${
          status.includes('실패') || status.includes('오류') ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
        }`}>
          {status}
        </p>
      )}
    </div>
  );
}
