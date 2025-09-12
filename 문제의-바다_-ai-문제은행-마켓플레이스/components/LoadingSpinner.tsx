import React from 'react';

interface LoadingSpinnerProps {
    message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center my-10">
      <div className="w-16 h-16 border-4 border-primary-200 border-t-primary-600 rounded-full animate-spin"></div>
      <p className="mt-4 text-lg font-semibold text-slate-700">{message || 'AI가 작업 중입니다...'}</p>
      <p className="text-slate-500">잠시만 기다려 주세요.</p>
    </div>
  );
};

export default LoadingSpinner;
