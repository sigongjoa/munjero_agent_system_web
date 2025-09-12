
import React from 'react';
import type { QuizSet } from '../types';
import { StarIcon, DownloadIcon, UserCheckIcon, TagIcon, PencilIcon } from './icons';

interface QuizCardProps {
    quizSet: QuizSet;
    onTakeQuiz?: (quizId: string) => void;
    onAcquireQuiz?: (quizId: string) => void;
    isMyQuiz?: boolean;
    isAcquired?: boolean;
}

const QuizCard: React.FC<QuizCardProps> = ({ quizSet, onTakeQuiz, onAcquireQuiz, isMyQuiz = false, isAcquired = false }) => {
    return (
        <div className="bg-white rounded-xl shadow-md border border-slate-200 flex flex-col transition-transform hover:scale-105 hover:shadow-lg">
            <div className="p-5 flex-grow">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-slate-800 pr-2">{quizSet.title}</h3>
                    <div className={`flex items-center gap-1 text-sm font-bold ${quizSet.price > 0 ? 'text-green-600' : 'text-primary-600'}`}>
                         <TagIcon className="w-4 h-4"/>
                         <span>{quizSet.price === 0 ? '무료' : `₩${quizSet.price.toLocaleString()}`}</span>
                    </div>
                </div>

                <div className="flex items-center gap-2 text-sm text-slate-500 mb-3">
                    <span>{quizSet.author.name}</span>
                    {quizSet.author.isVerified && <UserCheckIcon className="w-4 h-4 text-blue-500" />}
                </div>

                <p className="text-sm text-slate-600 mb-4 h-10 overflow-hidden">
                    {quizSet.description}
                </p>

                <div className="flex items-center justify-between text-sm text-slate-500 mb-4">
                    <div className="flex items-center gap-1">
                        <StarIcon className={`w-4 h-4 ${quizSet.rating > 0 ? 'text-amber-500' : 'text-slate-300'}`} />
                        <span className="font-semibold">{quizSet.rating.toFixed(1)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <DownloadIcon className="w-4 h-4" />
                        <span>{quizSet.downloads.toLocaleString()}</span>
                    </div>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    {quizSet.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-xs font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded-full">
                            #{tag}
                        </span>
                    ))}
                </div>
            </div>

            <div className="p-4 bg-slate-50/70 border-t border-slate-200 rounded-b-xl">
                 {onAcquireQuiz && ( // Marketplace context
                    <button 
                        onClick={() => onAcquireQuiz(quizSet.id)}
                        disabled={isAcquired || isMyQuiz}
                        className="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition flex items-center justify-center gap-2 disabled:bg-slate-400 disabled:cursor-not-allowed disabled:text-slate-600"
                    >
                        {isMyQuiz ? "내 문제집" : isAcquired ? "보관함에 추가됨" : "내 보관함에 추가"}
                    </button>
                 )}
                 {onTakeQuiz && ( // MyPage context
                    <button 
                        onClick={() => onTakeQuiz(quizSet.id)}
                        className="w-full bg-primary-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2"
                    >
                        {isMyQuiz ? <><PencilIcon className="w-5 h-5"/> 수정/관리</> : '문제 풀어보기'}
                    </button>
                 )}
            </div>
        </div>
    );
};

export default QuizCard;
