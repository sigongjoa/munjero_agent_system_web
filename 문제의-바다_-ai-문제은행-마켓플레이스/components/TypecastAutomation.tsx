import React, { useState } from 'react';

export default function TypecastAutomation() {
  const [textToConvert, setTextToConvert] = useState('');
  const [filename, setFilename] = useState('');
  const [taskId, setTaskId] = useState('');
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResponse(null);
    setError(null);

    if (!textToConvert || !filename || !taskId) {
      setError('Text, Filename, and Task ID are required.');
      return;
    }

    try {
      const res = await fetch('/api/trigger-typecast-tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text_to_convert: textToConvert, filename, task_id: taskId }),
      });

      const data = await res.json();

      if (res.ok) {
        setResponse(`Task queued: ${data.task_id}`);
      } else {
        setError(data.error || 'Failed to queue task.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Typecast TTS Generation Automation</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="textToConvert" className="block text-sm font-medium text-gray-700">Text to Convert:</label>
          <textarea
            id="textToConvert"
            rows={4}
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={textToConvert}
            onChange={(e) => setTextToConvert(e.target.value)}
            required
          />
        </div>
        <div>
          <label htmlFor="filename" className="block text-sm font-medium text-gray-700">Filename (e.g., my_audio.mp3):</label>
          <input
            type="text"
            id="filename"
            className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            required
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
        <button
          type="submit"
          className="inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          Generate TTS
        </button>
      </form>
      {response && <div className="mt-4 p-3 rounded-md bg-green-100 text-green-800">{response}</div>}
      {error && <div className="mt-4 p-3 rounded-md bg-red-100 text-red-800">Error: {error}</div>}
    </div>
  );
}
