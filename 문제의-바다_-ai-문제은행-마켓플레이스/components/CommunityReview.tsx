
import React, { useState, useMemo, useEffect } from 'react';
import type { QuizSet, Review } from '../types';
import { ThumbsUpIcon, ThumbsDownIcon, CheckCircleIcon, LightbulbIcon } from './icons';

interface CommunityReviewProps {
    quizSets: QuizSet[];
    userId: string;
    reviewHistory: Review[];
    onReviewSubmit: (review: Omit<Review, 'id' | 'reviewerId' | 'createdAt'>) => void;
}

type QuestionForReview = {
    quizSetId: string;
    questionIndex: number;
    quizSet: QuizSet;
    question: QuizSet['questions'][0];
};

const CommunityReview: React.FC<CommunityReviewProps> = ({ quizSets, userId, reviewHistory, onReviewSubmit }) => {
    const [currentQuestion, setCurrentQuestion] = useState<QuestionForReview | null>(null);
    const [evaluation, setEvaluation] = useState({
        learningObjectiveFit: null as boolean | null,
        formatStructureAppropriate: null as boolean | null,
        thinkingProcessInducement: null as boolean | null,
        clarityAndAccuracy: null as boolean | null,
        expressionSmoothness: null as boolean | null,
    });
    const [comment, setComment] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const questionsToReview = useMemo(() => {
        const allQuestions = quizSets.flatMap(qs =>
            qs.questions.map((q, qi) => ({
                quizSetId: qs.id,
                questionIndex: qi,
                quizSet: qs,
                question: q
            }))
        );

        const reviewedQuestionKeys = new Set(
            reviewHistory.map(r => `${r.quizSetId}-${r.questionIndex}`)
        );

        // Filter out questions created by the user and already reviewed questions
        return allQuestions.filter(q => q.quizSet.author.id !== userId && !reviewedQuestionKeys.has(`${q.quizSetId}-${q.questionIndex}`));
    }, [quizSets, reviewHistory, userId]);

    const selectNextQuestion = () => {
        if (questionsToReview.length > 0) {
            const randomIndex = Math.floor(Math.random() * questionsToReview.length);
            setCurrentQuestion(questionsToReview[randomIndex]);
        } else {
            setCurrentQuestion(null);
        }
        // Reset form
        setEvaluation({
            learningObjectiveFit: null,
            formatStructureAppropriate: null,
            thinkingProcessInducement: null,
            clarityAndAccuracy: null,
            expressionSmoothness: null,
        });
        setComment('');
    };

    useEffect(() => {
        selectNextQuestion();
    }, [questionsToReview.length]); // Re-select if the list of reviewable questions changes

    const handleVote = (criterion: keyof typeof evaluation, value: boolean) => {
        setEvaluation(prev => ({ ...prev, [criterion]: value }));
    };

    const handleSubmit = () => {
        if (currentQuestion) {
            setIsSubmitting(true);
            onReviewSubmit({
                quizSetId: currentQuestion.quizSetId,
                questionIndex: currentQuestion.questionIndex,
                evaluation,
                comment,
            });
            // Give a slight delay to feel the submission
            setTimeout(() => {
                setIsSubmitting(false);
                selectNextQuestion();
            }, 500);
        }
    };
    
    const evaluationCriteria = [
        { id: 'learningObjectiveFit', question: '🎯 학습 목표 부합?', description: '이 문제는 수험생의 진짜 약점을 겨냥했는가?' },
        { id: 'formatStructureAppropriate', question: '📚 형식/문제 구조 적절?', description: '수능 스타일인가? 보기 개수, 문장 길이 등은 적당한가?' },
        { id: 'thinkingProcessInducement', question: '🧠 사고 유도하는가?', description: '단순 암기보다, “생각하게 만드는가?”' },
        { id: 'clarityAndAccuracy', question: '🪓 표현의 명확성/정확성', description: '해설이 부정확하거나 헷갈리게 쓰이지 않았는가?' },
        { id: 'expressionSmoothness', question: '💬 문장 표현의 자연스러움', description: '부자연스러운 어휘나 문장이 있는가?' },
    ];

    const renderNoMoreQuestions = () => (
        <div className="text-center p-12 bg-white rounded-2xl shadow-lg border border-slate-200">
            <CheckCircleIcon className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-slate-800">모든 문제를 검수했습니다!</h2>
            <p className="text-slate-500 mt-2">당신의 기여에 감사드립니다. 새로운 문제가 추가되면 다시 확인해주세요.</p>
        </div>
    );

    if (questionsToReview.length > 0 && !currentQuestion) {
        return <div className="text-center p-8">로딩 중...</div>;
    }

    if (!currentQuestion) {
        return renderNoMoreQuestions();
    }
    
    const q = currentQuestion.question;
    const allVotesMade = Object.values(evaluation).every(v => v !== null);

    return (
        <div className="animate-fade-in space-y-8">
            <div className="text-center">
                <h1 className="text-3xl font-bold text-slate-800">커뮤니티 문제 검수</h1>
                <p className="text-slate-500 mt-2 max-w-2xl mx-auto">
                    “검수하는 것 = 학습하는 것.” 검수 과정은 단순한 피드백을 넘어, 개념을 역으로 복습하고, 문장 이해력을 높이며, 문제 유형의 차이를 배우는 최고의 학습 방법입니다.
                </p>
            </div>

            <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200">
                <div className="border-b border-slate-200 pb-4 mb-6">
                    <p className="text-sm text-slate-500">문제집: {currentQuestion.quizSet.title}</p>
                    <p className="font-bold text-lg text-slate-800 mt-2">
                        <span className="text-primary-600 font-black mr-2">Q.</span> {q.question}
                    </p>
                    <div className="mt-4 space-y-2">
                        {q.options.map((option, oIndex) => (
                            <div key={oIndex} className={`flex items-center p-3 border rounded-lg ${oIndex === q.answer ? 'bg-green-100 border-green-300' : 'bg-slate-50'}`}>
                                <span className={`font-semibold mr-3 ${oIndex === q.answer ? 'text-green-700' : 'text-slate-600'}`}>({oIndex + 1})</span>
                                <span className={oIndex === q.answer ? 'text-green-800' : 'text-slate-700'}>{option}</span>
                                {oIndex === q.answer && <CheckCircleIcon className="w-5 h-5 text-green-600 ml-auto" />}
                            </div>
                        ))}
                    </div>
                     <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="font-bold flex items-center gap-2 text-amber-800"><LightbulbIcon className="w-5 h-5"/>해설</p>
                        <p className="text-amber-900 mt-1">{q.explanation}</p>
                    </div>
                </div>
                
                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-slate-800 text-center mb-4">상세 평가</h3>
                    {evaluationCriteria.map(criterion => (
                        <div key={criterion.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-semibold text-slate-700">{criterion.question}</h4>
                                    <p className="text-sm text-slate-500">{criterion.description}</p>
                                </div>
                                <div className="flex gap-2 flex-shrink-0 ml-4">
                                    <button onClick={() => handleVote(criterion.id as keyof typeof evaluation, true)} className={`p-2 rounded-full border-2 transition ${evaluation[criterion.id as keyof typeof evaluation] === true ? 'bg-blue-100 border-blue-500' : 'bg-white border-slate-300 hover:border-blue-400'}`} aria-label="예">
                                        <ThumbsUpIcon className="w-5 h-5 text-blue-600"/>
                                    </button>
                                    <button onClick={() => handleVote(criterion.id as keyof typeof evaluation, false)} className={`p-2 rounded-full border-2 transition ${evaluation[criterion.id as keyof typeof evaluation] === false ? 'bg-red-100 border-red-500' : 'bg-white border-slate-300 hover:border-red-400'}`} aria-label="아니오">
                                        <ThumbsDownIcon className="w-5 h-5 text-red-600"/>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">추가 의견 (선택)</h4>
                        <textarea value={comment} onChange={e => setComment(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg h-24 focus:ring-2 focus:ring-primary-500" placeholder="문제나 해설에 대한 구체적인 의견을 남겨주세요." />
                    </div>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200 flex gap-4">
                    <button onClick={selectNextQuestion} className="w-full sm:w-auto bg-slate-200 text-slate-700 font-bold py-3 px-6 rounded-lg hover:bg-slate-300 transition">
                        다른 문제 검수하기
                    </button>
                    <button 
                        onClick={handleSubmit}
                        disabled={isSubmitting || !allVotesMade}
                        className="w-full sm:flex-1 bg-primary-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-primary-700 transition flex items-center justify-center gap-2 disabled:bg-slate-400 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? '제출 중...' : '리뷰 제출'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CommunityReview;