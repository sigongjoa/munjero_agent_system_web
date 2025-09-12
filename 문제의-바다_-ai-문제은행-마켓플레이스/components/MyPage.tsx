
import React, { useMemo } from 'react';
import type { QuizSet, TestResult, AnalysisResult, Review, ActiveView, PersonaAnalysis } from '../types';
import QuizCard from './QuizCard';
import { BrainCircuitIcon, PencilIcon, CheckCircleIcon, TrendingUpIcon, TargetIcon, ClipboardListIcon } from './icons';

interface MyPageProps {
    allQuizSets: QuizSet[];
    userId: string;
    onTakeQuiz: (quizId: string) => void;
    practiceHistory: TestResult[];
    customQuizHistory: AnalysisResult[];
    reviewHistory: Review[];
    purchasedQuizIds: string[];
    personaAnalysis: PersonaAnalysis | null;
    onNavigate: (view: ActiveView) => void;
}

const ScoreChart: React.FC<{ data: { date: string; score: number }[] }> = ({ data }) => {
    if (data.length < 2) {
        return <div className="flex items-center justify-center h-full text-slate-500">학습 기록이 2개 이상 필요합니다.</div>;
    }

    const maxScore = 100;
    const width = 500;
    const height = 200;
    const padding = 40;

    const points = data.map((d, i) => {
        const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
        const y = height - padding - (d.score / maxScore) * (height - padding * 2);
        return `${x},${y}`;
    }).join(' ');
    
    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
            <line x1={padding - 5} y1={padding} x2={width - padding} y2={padding} stroke="#e2e8f0" strokeDasharray="2" />
            <line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#cbd5e1" />
            <defs>
                <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#85dcff" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#f0faff" stopOpacity="0.1" />
                </linearGradient>
            </defs>
            <polyline points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} fill="url(#scoreGradient)" />
            <polyline points={points} fill="none" stroke="#0084ff" strokeWidth="2" />
            {data.map((d, i) => {
                const x = (i / (data.length - 1)) * (width - padding * 2) + padding;
                const y = height - padding - (d.score / maxScore) * (height - padding * 2);
                return <circle key={i} cx={x} cy={y} r="4" fill="#0084ff" stroke="white" strokeWidth="2" />;
            })}
        </svg>
    );
};

const PersonaSetupPrompt: React.FC<{ onNavigate: (view: ActiveView) => void }> = ({ onNavigate }) => (
    <div className="p-6 bg-gradient-to-r from-primary-500 to-blue-600 text-white rounded-2xl shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="flex items-center gap-4">
        <div className="bg-white/20 p-3 rounded-full">
            <BrainCircuitIcon className="w-8 h-8 text-white"/>
        </div>
        <div>
          <h3 className="text-xl font-bold">AI 학습 페르소나를 설정하세요</h3>
          <p className="opacity-90 mt-1">AI 컨설턴트와 대화하여 맞춤형 학습 계획과 문제를 받아보세요!</p>
        </div>
      </div>
      <button
        onClick={() => onNavigate('persona-planner')}
        className="bg-white text-primary-600 font-bold py-3 px-6 rounded-lg hover:bg-primary-50 transition-all duration-200 shadow-md flex-shrink-0"
      >
        AI 컨설턴트 시작하기
      </button>
    </div>
);

const PersonaDisplay: React.FC<{ analysis: PersonaAnalysis; onNavigate: (view: ActiveView) => void }> = ({ analysis, onNavigate }) => (
    <div className="p-6 bg-gradient-to-r from-primary-50 to-blue-50 rounded-2xl shadow-sm border border-slate-200 space-y-4">
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
            <BrainCircuitIcon className="w-8 h-8 text-primary-600"/>
            <span>나의 AI 학습 페르소나</span>
        </h3>
        <button
          onClick={() => onNavigate('persona-planner')}
          className="bg-primary-600 text-white font-bold py-2 px-5 rounded-lg hover:bg-primary-700 transition-all duration-200 shadow-md flex-shrink-0"
        >
          AI 컨설턴트와 대화하기
        </button>
      </div>
      <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-4">
          <div className="space-y-3 text-sm">
              <p><strong>시험:</strong> {analysis.analysis.examName}</p>
              <p><strong>과목:</strong> {analysis.analysis.examSubjects.join(', ')}</p>
          </div>
           <div className="space-y-3 pt-3 border-t">
               <h4 className="font-bold text-slate-700">💡 학습 전략</h4>
               {analysis.strategy.map((strat, i) => (
                    <div key={i} className="text-sm">
                      <p className="font-semibold text-primary-700">[{i+1}] {strat.focus}</p>
                      <p className="text-slate-600 pl-1">→ {strat.recommendation}</p>
                    </div>
               ))}
           </div>
      </div>
    </div>
);


const MyPage: React.FC<MyPageProps> = ({ allQuizSets, userId, onTakeQuiz, practiceHistory, customQuizHistory, reviewHistory, purchasedQuizIds, personaAnalysis, onNavigate }) => {
    
    const myQuizzes = useMemo(() => allQuizSets.filter(q => q.author.id === userId).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [allQuizSets, userId]);
    const purchasedQuizzes = useMemo(() => allQuizSets.filter(q => purchasedQuizIds.includes(q.id) && q.author.id !== userId), [allQuizSets, purchasedQuizIds, userId]);

    const totalDownloads = myQuizzes.reduce((sum, q) => sum + q.downloads, 0);
    const averageRating = myQuizzes.length > 0 ? myQuizzes.reduce((sum, q) => sum + q.rating, 0) / myQuizzes.length : 0;
    
    const combinedHistory = useMemo(() => {
        const practiceAsChartData = practiceHistory.map(r => ({ type: '실전 모의고사' as const, title: `${r.config.examType} - ${r.config.subject}`, score: Math.round((r.score / r.totalQuestions) * 100), date: new Date(r.date) }));
        const customAsChartData = customQuizHistory.map(r => ({ type: 'AI 진단 퀴즈' as const, title: r.goal || '진단 퀴즈', score: Math.round((r.score / r.totalQuestions) * 100), date: new Date(r.date) }));
        return [...practiceAsChartData, ...customAsChartData].sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [practiceHistory, customQuizHistory]);

    const aggregatedWeaknesses = useMemo(() => {
        const allWeaknesses: string[] = [];
        practiceHistory.forEach(r => { r.questions.forEach((q, i) => { if(r.userAnswers[i] !== q.answer_index) allWeaknesses.push(...q.tags) }) });
        customQuizHistory.forEach(r => allWeaknesses.push(...r.weaknesses));
        const weaknessCounts = allWeaknesses.reduce((acc, tag) => { acc[tag] = (acc[tag] || 0) + 1; return acc; }, {} as Record<string, number>);
        return Object.entries(weaknessCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [practiceHistory, customQuizHistory]);

    const chartData = combinedHistory.map(h => ({ date: h.date.toISOString(), score: h.score }));

    const hasLearningHistory = practiceHistory.length > 0 || customQuizHistory.length > 0;

    return (
        <div className="space-y-10 animate-fade-in">
            {personaAnalysis
                ? <PersonaDisplay analysis={personaAnalysis} onNavigate={onNavigate} />
                : <PersonaSetupPrompt onNavigate={onNavigate} />
            }
            <div>
                <h1 className="text-3xl font-bold text-slate-800">마이페이지</h1>
                <p className="text-slate-500 mt-1">나의 학습 활동과 제작한 문제들을 관리하세요.</p>
            </div>
            
            {/* Learning Dashboard Section */}
            <div className="space-y-4">
                <h2 className="text-2xl font-bold text-slate-800">학습 대시보드</h2>
                {!hasLearningHistory ? (
                     <div className="text-center p-10 bg-white rounded-2xl shadow-sm border border-slate-200">
                        <p className="mt-2 text-slate-500">'AI 학습 만들기' 또는 '실전 모의고사'를 시작하여 학습 여정을 기록해보세요.</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                            <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4"><TrendingUpIcon className="w-6 h-6 text-primary-600"/>성적 추이</h3>
                            <ScoreChart data={chartData} />
                        </div>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4"><TargetIcon className="w-6 h-6 text-amber-500"/>누적 약점 TOP 5</h3>
                                {aggregatedWeaknesses.length > 0 ? (
                                    <div className="space-y-2">{aggregatedWeaknesses.map(([tag, count]) => ( <div key={tag} className="flex items-center justify-between p-3 bg-amber-50 rounded-lg"><span className="font-semibold text-amber-800">#{tag}</span><span className="text-sm text-amber-600 bg-amber-200 font-bold px-2 py-0.5 rounded-full">{count}회</span></div> ))}</div>
                                ) : <p className="text-slate-500">발견된 약점이 없습니다.</p>}
                            </div>
                            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4"><ClipboardListIcon className="w-6 h-6 text-indigo-500"/>최근 학습 활동</h3>
                                <ul className="space-y-3 max-h-80 overflow-y-auto pr-2">{[...combinedHistory].reverse().slice(0, 10).map((item, index) => ( <li key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg"><div><p className={`font-semibold ${item.type === '실전 모의고사' ? 'text-indigo-800' : 'text-sky-800'}`}>{item.title}</p><p className="text-sm text-slate-500">{item.date.toLocaleDateString()}</p></div><span className="font-bold text-slate-700">{item.score}점</span></li> ))}</ul>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Marketplace Activity Section */}
            <div className="space-y-4">
                 <h2 className="text-2xl font-bold text-slate-800">마켓 활동</h2>
                 <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
                    <div className="p-4 bg-slate-50 rounded-lg"><h3 className="font-semibold text-slate-500 text-sm">제작한 문제집</h3><p className="text-3xl font-bold text-primary-600">{myQuizzes.length}</p></div>
                    <div className="p-4 bg-slate-50 rounded-lg"><h3 className="font-semibold text-slate-500 text-sm">총 다운로드</h3><p className="text-3xl font-bold text-primary-600">{totalDownloads.toLocaleString()}</p></div>
                    <div className="p-4 bg-slate-50 rounded-lg"><h3 className="font-semibold text-slate-500 text-sm">평균 평점</h3><p className="text-3xl font-bold text-primary-600">{averageRating.toFixed(1)}</p></div>
                    <div className="p-4 bg-slate-50 rounded-lg"><h3 className="font-semibold text-slate-500 text-sm">제출한 리뷰</h3><p className="text-3xl font-bold text-primary-600">{reviewHistory.length}</p></div>
                </div>
            </div>

            <div className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><PencilIcon className="w-5 h-5" />내가 만든 문제집</h3>
                {myQuizzes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{myQuizzes.map(quizSet => ( <QuizCard key={quizSet.id} quizSet={quizSet} onTakeQuiz={onTakeQuiz} isMyQuiz={true} />))}</div>
                ) : ( <div className="text-center py-16 bg-white rounded-lg shadow-sm border"><p className="text-slate-500 font-semibold">'문제 직접 만들기'에서 첫 문제집을 만들어보세요!</p></div> )}
            </div>

             <div className="space-y-4">
                <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2"><CheckCircleIcon className="w-5 h-5" />내 보관함 (구매한 문제집)</h3>
                {purchasedQuizzes.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{purchasedQuizzes.map(quizSet => ( <QuizCard key={quizSet.id} quizSet={quizSet} onTakeQuiz={onTakeQuiz} />))}</div>
                 ) : ( <div className="text-center py-16 bg-white rounded-lg shadow-sm border"><p className="text-slate-500 font-semibold">마켓플레이스에서 유용한 문제집을 보관함에 추가해보세요!</p></div>)}
            </div>
        </div>
    );
};

export default MyPage;