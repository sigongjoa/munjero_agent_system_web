import React, { useState } from 'react';
import { ExamType, Subject, TestConfig } from '../types';
import { BookOpenIcon, ListOrderedIcon, CheckSquareIcon } from './icons';

interface ExamSelectionProps {
  onStartTest: (config: TestConfig) => void;
  isLoading: boolean;
}

const subjectOptions: { [key in ExamType]: Subject[] } = {
  [ExamType.SUNEUNG]: [Subject.KOREAN, Subject.ENGLISH],
  [ExamType.PSAT]: [Subject.LOGIC, Subject.SITUATION],
  [ExamType.NCS]: [Subject.COMMUNICATION, Subject.MATH_SKILLS],
  [ExamType.COMMUNITY]: [],
};

const ExamSelection: React.FC<ExamSelectionProps> = ({ onStartTest, isLoading }) => {
  const [examType, setExamType] = useState<ExamType>(ExamType.SUNEUNG);
  const [subject, setSubject] = useState<Subject>(subjectOptions[ExamType.SUNEUNG][0]);
  const [numQuestions, setNumQuestions] = useState<number>(5);

  const handleExamTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newExamType = e.target.value as ExamType;
    setExamType(newExamType);
    setSubject(subjectOptions[newExamType][0]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const config: TestConfig = { examType, subject, numQuestions };
    onStartTest(config);
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">AI 모의시험 설정</h2>
        <p className="text-slate-500 mt-1">응시할 시험과 과목을 선택하여 맞춤형 시험을 시작하세요.</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="examType" className="block text-sm font-medium text-slate-700 mb-2">1. 시험 종류 선택</label>
          <div className="relative">
            <BookOpenIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              id="examType"
              value={examType}
              onChange={handleExamTypeChange}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition appearance-none"
            >
              {Object.values(ExamType)
                .filter(type => type !== ExamType.COMMUNITY)
                .map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="subject" className="block text-sm font-medium text-slate-700 mb-2">2. 과목 선택</label>
          <div className="relative">
            <CheckSquareIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <select
              id="subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value as Subject)}
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition appearance-none"
            >
              {subjectOptions[examType].map(subj => (
                <option key={subj} value={subj}>{subj}</option>
              ))}
            </select>
          </div>
        </div>
        
        <div>
          <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-700 mb-2">3. 문항 수 선택</label>
           <div className="relative">
            <ListOrderedIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="number"
              id="numQuestions"
              value={numQuestions}
              onChange={(e) => setNumQuestions(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))}
              min="1"
              max="10"
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
            />
           </div>
           <p className="text-xs text-slate-500 mt-1.5 ml-1">최대 10문제까지 생성 가능합니다.</p>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full flex items-center justify-center gap-3 bg-primary-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed"
        >
          {isLoading ? 'AI가 출제 중...' : '모의시험 시작하기'}
        </button>
      </form>
    </div>
  );
};

export default ExamSelection;