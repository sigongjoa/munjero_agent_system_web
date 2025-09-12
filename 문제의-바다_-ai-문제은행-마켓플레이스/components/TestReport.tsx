
import React, { useMemo } from 'react';
import type { TestResult } from '../types';
import { 
    BarChartIcon, TargetIcon, TimerIcon, CheckCircleIcon, XCircleIcon, 
    LightbulbIcon, RefreshCwIcon
} from './icons';

interface TestReportProps {
  result: TestResult;
  onStartOver: () => void;
  onRetakeIncorrect: (result: TestResult) => void;
}

const renderWithBold = (text: string | undefined | null): React.ReactNode => {
    if (!text) return text;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return (
        <>
            {parts.map((part, index) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={index}>{part.slice(2, -2)}</strong>;
                }
                return part;
            })}
        </>
    );
};

const TestReport: React.FC<TestReportProps> = ({ result, onStartOver, onRetakeIncorrect }) => {

  const analysis = useMemo(() => {
    const { score, totalQuestions, questions, userAnswers } = result;
    const percentage = Math.round((score / totalQuestions) * 100);

    const weaknessesMap: { [key: string]: number } = {};
    questions.forEach((q, index) => {
      if (userAnswers[index] !== q.answer_index) {
        q.tags.forEach(tag => {
          weaknessesMap[tag] = (weaknessesMap[tag] || 0) + 1;
        });
      }
    });

    const weaknesses = Object.entries(weaknessesMap)
      .sort((a, b) => b[1] - a[1])
      .map(entry => entry[0])
      .slice(0, 3); // Top 3 weaknesses

    return { percentage, weaknesses };
  }, [result]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}분 ${secs}초`;
  };
  
  const hasIncorrectAnswers = result.score < result.totalQuestions;

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-1">시험 결과 분석 리포트</h2>
        <p className="text-slate-500">{result.config.examType} - {result.config.subject}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
        <div className="bg-primary-50 p-6 rounded-xl border-2 border-primary-200">
            <h3 className="text-lg font-bold text-primary-800 flex items-center justify-center gap-2"><BarChartIcon className="w-5 h-5"/>점수</h3>
            <p className="text-5xl font-extrabold text-primary-600 my-2">
                {result.score} / {result.totalQuestions}
            </p>
            <p className="text-primary-700 font-semibold">{analysis.percentage}점</p>
        </div>
        <div className="bg-indigo-50 p-6 rounded-xl border-2 border-indigo-200">
            <h3 className="text-lg font-bold text-indigo-800 flex items-center justify-center gap-2"><TimerIcon className="w-5 h-5"/>소요 시간</h3>
            <p className="text-4xl font-extrabold text-indigo-600 my-3.5">
                {formatTime(result.timeTaken)}
            </p>
        </div>
        <div className="bg-amber-50 p-6 rounded-xl border-2 border-amber-200">
            <h3 className="text-lg font-bold text-amber-800 flex items-center justify-center gap-2"><TargetIcon className="w-5 h-5"/>주요 약점</h3>
            {analysis.weaknesses.length > 0 ? (
                <div className="mt-3 space-y-1">
                    {analysis.weaknesses.map((weakness, index) => (
                        <span key={index} className="inline-block bg-amber-200 text-amber-800 text-sm font-semibold mr-2 px-3 py-1.5 rounded-full">
                            #{weakness}
                        </span>
                    ))}
                </div>
            ) : (
                <p className="mt-4 text-amber-700 font-semibold">축하합니다! 발견된 약점이 없습니다.</p>
            )}
        </div>
      </div>
      
      <div className="mt-12">
        <h3 className="text-xl font-bold text-slate-800 mb-4 text-center">전체 문항 다시보기 및 해설</h3>
        
        {!hasIncorrectAnswers && (
            <div className="text-center mb-6 text-green-700 font-semibold bg-green-100 p-4 rounded-lg">
                모든 문제를 맞혔습니다. 정말 대단해요!
            </div>
        )}

        <div className="space-y-8">
            {result.questions.map((q, qIndex) => {
                const userAnswer = result.userAnswers[qIndex];
                const isCorrect = userAnswer === q.answer_index;

                return (
                    <div key={q.question_id} className="border border-slate-200 p-6 rounded-xl">
                        <p className="font-bold text-lg text-slate-800 mb-4">
                            <span className={`${isCorrect ? 'text-green-600' : 'text-red-500'} font-black mr-2`}>Q{qIndex + 1}.</span> {renderWithBold(q.stem)}
                        </p>
                        <div className="space-y-3">
                            {q.choices.map((choice, cIndex) => {
                                const isSelected = userAnswer === cIndex;
                                const isAnswer = q.answer_index === cIndex;
                                
                                let optionClass = "border-slate-300";
                                if (isAnswer) {
                                    optionClass = "bg-green-100 border-green-500 text-green-800 font-semibold";
                                } else if (isSelected) {
                                    optionClass = "bg-red-100 border-red-500 text-red-800 font-semibold";
                                }

                                return (
                                    <div key={cIndex} className={`flex items-start p-4 border rounded-lg transition-all duration-200 ${optionClass}`}>
                                        <span className="flex-grow">{renderWithBold(choice)}</span>
                                        {isAnswer && <CheckCircleIcon className="w-6 h-6 text-green-600 ml-2 flex-shrink-0" />}
                                        {isSelected && !isAnswer && <XCircleIcon className="w-6 h-6 text-red-600 ml-2 flex-shrink-0" />}
                                    </div>
                                );
                            })}
                        </div>
                        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="font-bold flex items-center gap-2 text-amber-800"><LightbulbIcon className="w-5 h-5"/>해설</p>
                            <p className="text-amber-900 mt-1">{renderWithBold(q.explanation)}</p>
                            <div className="mt-2 space-x-2">
                                {q.tags.map(tag => (
                                    <span key={tag} className="text-xs text-amber-700 font-mono bg-amber-100 inline-block px-2 py-1 rounded">#{tag}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-slate-200 flex flex-col sm:flex-row gap-4">
        <button
            onClick={onStartOver}
            className="w-full bg-slate-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-700 transition"
        >
            새로운 시험 시작하기
        </button>
         {hasIncorrectAnswers && (
             <button
                onClick={() => onRetakeIncorrect(result)}
                className="w-full bg-orange-500 text-white font-bold py-3 px-4 rounded-lg hover:bg-orange-600 transition flex items-center justify-center gap-2"
                aria-label="Retake incorrect questions"
              >
                <RefreshCwIcon className="w-5 h-5" />
                <span>틀린 문제 다시 풀기</span>
            </button>
         )}
      </div>
    </div>
  );
};

export default TestReport;
