import React, { useState, useEffect } from 'react';
import type { ExamQuestion, UserAnswers, TestConfig } from '../types';
import { TimerIcon } from './icons';

interface ExamModeProps {
  questions: ExamQuestion[];
  config: TestConfig;
  onFinishTest: (answers: UserAnswers, timeTaken: number) => void;
}

const ProgressBar: React.FC<{
    total: number;
    current: number;
    answered: Set<number>;
    onJumpTo: (index: number) => void;
}> = ({ total, current, answered, onJumpTo }) => (
    <div className="flex justify-center gap-2 mb-6">
        {Array.from({ length: total }).map((_, index) => (
            <button
                key={index}
                onClick={() => onJumpTo(index)}
                className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-200
                    ${index === current 
                        ? 'bg-primary-600 text-white ring-2 ring-primary-300' 
                        : answered.has(index) 
                            ? 'bg-green-200 text-green-800 hover:bg-green-300'
                            : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                    }`}
                aria-label={`Go to question ${index + 1}`}
                aria-current={index === current ? 'step' : undefined}
            >
                {index + 1}
            </button>
        ))}
    </div>
);

const ExamMode: React.FC<ExamModeProps> = ({ questions, config, onFinishTest }) => {
  const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
  const [time, setTime] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(prevTime => prevTime + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  const handleAnswerChange = (choiceIndex: number) => {
    setUserAnswers(prev => ({ ...prev, [currentQuestionIndex]: choiceIndex }));
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handlePrev = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(currentQuestionIndex - 1);
    }
  };

  const handleSubmit = () => {
    if (window.confirm('시험을 종료하고 답안을 제출하시겠습니까?')) {
        onFinishTest(userAnswers, time);
    }
  };
  
  const currentQuestion = questions[currentQuestionIndex];
  const allQuestionsAnswered = Object.keys(userAnswers).length === questions.length;
  const answeredIndices = new Set(Object.keys(userAnswers).map(Number));

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in flex flex-col" style={{minHeight: '60vh'}}>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-800">{config.examType} - {config.subject}</h2>
          <p className="text-slate-500">{currentQuestionIndex + 1} / {questions.length} 문제</p>
        </div>
        <div className="flex items-center gap-2 mt-2 sm:mt-0 bg-slate-100 px-3 py-1.5 rounded-lg">
          <TimerIcon className="w-6 h-6 text-primary-600" />
          <span className="text-xl font-bold text-slate-700 tabular-nums">{formatTime(time)}</span>
        </div>
      </div>
      
      <ProgressBar 
        total={questions.length}
        current={currentQuestionIndex}
        answered={answeredIndices}
        onJumpTo={setCurrentQuestionIndex}
      />

      <div className="flex-grow mt-6">
        <div key={currentQuestion.question_id}>
          <p className="font-bold text-lg text-slate-800 mb-6 leading-relaxed">
            <span className="text-primary-600 font-black mr-2">Q{currentQuestionIndex + 1}.</span> {currentQuestion.stem}
          </p>
          <div className="space-y-3">
            {currentQuestion.choices.map((choice, cIndex) => {
              const isSelected = userAnswers[currentQuestionIndex] === cIndex;
              const optionClass = isSelected
                ? "bg-primary-100 border-primary-500 ring-2 ring-primary-300"
                : "border-slate-300 hover:border-primary-500 hover:bg-primary-50";

              return (
                <label key={cIndex} className={`flex items-center p-4 border rounded-lg cursor-pointer transition-all duration-200 ${optionClass}`}>
                  <input
                    type="radio"
                    name={`question-${currentQuestionIndex}`}
                    value={cIndex}
                    checked={isSelected}
                    onChange={() => handleAnswerChange(cIndex)}
                    className="hidden"
                  />
                  <span className="flex-grow">{choice}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-10 pt-6 border-t border-slate-200 flex justify-between items-center">
        <button
          onClick={handlePrev}
          disabled={currentQuestionIndex === 0}
          className="bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-lg hover:bg-slate-300 transition disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
        >
          이전 문제
        </button>
        
        {currentQuestionIndex === questions.length - 1 ? (
            <button
              onClick={handleSubmit}
              disabled={!allQuestionsAnswered}
              className="bg-primary-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-primary-700 transition disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
              시험 완료
            </button>
        ) : (
            <button
              onClick={handleNext}
              className="bg-primary-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-primary-700 transition"
            >
              다음 문제
            </button>
        )}
      </div>
    </div>
  );
};

export default ExamMode;