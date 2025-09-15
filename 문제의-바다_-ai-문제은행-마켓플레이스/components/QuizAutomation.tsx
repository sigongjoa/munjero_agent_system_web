import React, { useState } from 'react';

export default function QuizAutomation() {
  const [generatedQuizData, setGeneratedQuizData] = useState('');
  const [userInput, setUserInput] = useState('');
  const [taskId, setTaskId] = useState('');
  const [frontendUrl, setFrontendUrl] = useState('http://localhost:3000'); // Default to common dev URL
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResponse(null);
    setError(null);

    if (!generatedQuizData || !userInput || !taskId || !frontendUrl) {
      setError('All fields are required.');
      return;
    }

    try {
      const parsedGeneratedQuizData = JSON.parse(generatedQuizData);
      const parsedUserInput = JSON.parse(userInput);

      const res = await fetch('/api/trigger-quiz-automation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          generatedQuizData: parsedGeneratedQuizData,
          userInput: parsedUserInput,
          task_id: taskId,
          frontend_url: frontendUrl,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResponse(`Task queued: ${data.task_id}`);
      } else {
        setError(data.error || 'Failed to queue task.');
      }
    } catch (err) {
      setError(err instanceof Error ? `Invalid JSON: ${err.message}` : 'An unknown error occurred.');
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Quiz Automation (PDF/JSON/Shorts)</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="generatedQuizData" className="block text-sm font-medium text-gray-700">Generated Quiz Data (JSON):</label>
          <textarea
            id="generatedQuizData"
            rows={8}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
            value={generatedQuizData}
            onChange={(e) => setGeneratedQuizData(e.target.value)}
            required
            placeholder="Paste generatedQuizData JSON here"
          />
        </div>
        <div>
          <label htmlFor="userInput" className="block text-sm font-medium text-gray-700">User Input (JSON):</label>
          <textarea
            id="userInput"
            rows={8}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm font-mono"
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            required
            placeholder="Paste userInput JSON here"
          />
        </div>
        <div>
          <label htmlFor="taskId" className="block text-sm font-medium text-gray-700">Task ID:</label>
          <input
            type="text"
            id="taskId"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="frontendUrl" className="block text-sm font-medium text-gray-700">Frontend URL:</label>
          <input
            type="url"
            id="frontendUrl"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={frontendUrl}
            onChange={(e) => setFrontendUrl(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Trigger Quiz Automation
        </button>
      </form>
      {response && <div className="mt-4 p-3 rounded-md bg-green-100 text-green-800">{response}</div>}
      {error && <div className="mt-4 p-3 rounded-md bg-red-100 text-red-800">Error: {error}</div>}
    </div>
  );
}
