
import React, { useState, useEffect, useRef } from 'react';
import type { PersonaAnalysis, ExamQuestion, ChatMessage } from '../types';
import { summarizePersona, getPersonaChatResponse, generateQuestionsFromPersona } from '../services/geminiService';
import { SparklesIcon, BrainCircuitIcon, UserCircleIcon, SendIcon } from './icons';

interface PersonaPlannerProps {
  onStartGeneratedTest: (analysis: PersonaAnalysis, questions: ExamQuestion[]) => void;
  chatHistory: ChatMessage[];
  setChatHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  currentAnalysis: PersonaAnalysis | null;
  setCurrentAnalysis: React.Dispatch<React.SetStateAction<PersonaAnalysis | null>>;
}

const welcomeMessage = `안녕하세요! AI 시험 출제 전문가입니다.
어떤 시험을 준비하고 계신가요? (예: 수능, 9급 공무원, 경찰관, TOPIK 등)

구체적인 시험명과 과목을 알려주시면, 제가 최신 정보를 바탕으로 맞춤형 실전 문제를 바로 생성해 드릴 수 있습니다.

예시: "경찰공무원 순경 공채 시험 문제 만들어줘" 또는 "TOPIK II 쓰기 문제 연습하고 싶어"`;

const PersonaPlanner: React.FC<PersonaPlannerProps> = ({ 
    onStartGeneratedTest,
    chatHistory,
    setChatHistory,
    currentAnalysis,
    setCurrentAnalysis
}) => {
    const [userInput, setUserInput] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      // Initialize with a welcome message if history is empty
      if (chatHistory.length === 0) {
        setChatHistory([{
            id: 'init',
            sender: 'system',
            text: welcomeMessage,
        }]);
      }
    }, []);

    useEffect(() => {
        // Scroll to bottom of chat on new message
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory]);

    const handleSendMessage = async (messageText: string) => {
        if (!messageText.trim() || isLoading) return;
        
        setError(null);
        const newUserMessage: ChatMessage = { id: `user-${Date.now()}`, sender: 'user', text: messageText };
        
        const historyForApi = [...chatHistory, newUserMessage]
            .filter(msg => msg.sender === 'user' || (msg.sender === 'ai' && !msg.isLoading))
            .map(msg => ({
                role: (msg.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
                parts: [{ text: msg.analysis ? JSON.stringify(msg.analysis) : msg.text as string }]
            }));
        
        const createProblemKeywords = ['문제 만들어줘', '문제 생성', '문제 만들어', '문제를 만들어', '문제 풀어', '문제만들어줘'];
        const shouldCreateProblems = createProblemKeywords.some(keyword => messageText.toLowerCase().includes(keyword));

        const summarizeKeywords = ['정리', '분석', '요약', '페르소나', '계획'];
        const shouldSummarize = summarizeKeywords.some(keyword => messageText.includes(keyword));

        if (shouldCreateProblems) {
            setChatHistory(prev => [...prev, newUserMessage, { id: `system-${Date.now()}`, sender: 'system', text: "대화 내용을 기반으로 맞춤형 문제를 즉시 생성합니다..." }]);
            setUserInput('');
            setIsLoading(true);
            try {
                const analysis = await summarizePersona(historyForApi);
                setCurrentAnalysis(analysis);
                const questions = await generateQuestionsFromPersona(analysis, 5);
                onStartGeneratedTest(analysis, questions);
                // No need to set isLoading to false, as the component will unmount upon navigation.
            } catch (e) {
                const errorMessage = e instanceof Error ? e.message : '맞춤 문제 생성 중 알 수 없는 오류가 발생했습니다.';
                setError(errorMessage);
                setChatHistory(prev => [...prev, { id: `error-${Date.now()}`, sender: 'system', text: `오류: ${errorMessage}` }]);
                setIsLoading(false);
            }
            return;
        }

        // Default conversational/summarize flow
        setChatHistory(prev => [...prev, newUserMessage, { id: `ai-loading-${Date.now()}`, sender: 'ai', isLoading: true }]);
        setUserInput('');
        setIsLoading(true);

        try {
            if (shouldSummarize) {
                const result = await summarizePersona(historyForApi);
                setCurrentAnalysis(result);
                const newAiMessage: ChatMessage = { id: `ai-${Date.now()}`, sender: 'ai', analysis: result };
                setChatHistory(prev => prev.map(msg => msg.isLoading ? newAiMessage : msg));
            } else {
                const { text, sources } = await getPersonaChatResponse(historyForApi);
                const newAiMessage: ChatMessage = { id: `ai-${Date.now()}`, sender: 'ai', text, sources };
                setChatHistory(prev => prev.map(msg => msg.isLoading ? newAiMessage : msg));
            }
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : 'AI와 통신 중 오류가 발생했습니다.';
            setError(errorMessage);
            setChatHistory(prev => prev.filter(msg => !msg.isLoading));
        } finally {
            setIsLoading(false);
        }
    };
    
    const handleGenerateQuiz = async () => {
        if (!currentAnalysis) return;
        setIsLoading(true);
        setChatHistory(prev => [...prev, { id: `system-${Date.now()}`, sender: 'system', text: "이 분석을 기반으로 맞춤형 문제를 생성합니다..." }]);

        try {
            const questions = await generateQuestionsFromPersona(currentAnalysis, 5); // Generate 5 questions by default
            onStartGeneratedTest(currentAnalysis, questions);
        } catch (e) {
            const errorMessage = e instanceof Error ? e.message : '맞춤 문제 생성 중 알 수 없는 오류가 발생했습니다.';
            setError(errorMessage);
            setChatHistory(prev => [...prev, { id: `error-${Date.now()}`, sender: 'system', text: `오류: ${errorMessage}` }]);
            setIsLoading(false); // Stop loading on error
        }
    };

    const renderMessage = (msg: ChatMessage) => {
        if (msg.sender === 'user') {
            return (
                <div className="flex items-start gap-3 justify-end">
                    <div className="bg-primary-600 text-white p-3 rounded-xl max-w-lg">
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                    </div>
                    <UserCircleIcon className="w-8 h-8 text-slate-400 flex-shrink-0" />
                </div>
            );
        }

        if (msg.sender === 'ai') {
            if (msg.isLoading) {
                return (
                    <div className="flex items-end gap-3">
                        <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0">
                           <BrainCircuitIcon className="w-5 h-5 text-slate-500 animate-pulse" />
                        </div>
                        <div className="bg-slate-200 p-4 rounded-xl">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce [animation-delay:-.5s]"></div>
                            </div>
                        </div>
                    </div>
                );
            } else if (msg.analysis) {
                 const analysis = msg.analysis;
                 return (
                    <div className="flex items-start gap-3">
                         <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                           <BrainCircuitIcon className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-w-2xl space-y-4">
                            <h3 className="font-bold text-lg text-slate-800">👤 AI 학습 분석 리포트</h3>
                            <div className="space-y-3 text-sm">
                                <p><strong>시험:</strong> {analysis.analysis.examName}</p>
                                <p><strong>과목:</strong> {analysis.analysis.examSubjects.join(', ')}</p>
                                <p><strong>형식:</strong> {analysis.analysis.examFormat}</p>
                            </div>
                             <div className="space-y-3 pt-3 border-t">
                                 <h4 className="font-bold text-slate-700">🔥 자주 출제되는 테마</h4>
                                 {analysis.analysis.commonThemes.map((theme, i) => (
                                     <p key={i} className="text-sm"><strong>{theme.subject}:</strong> {theme.themes.join(', ')}</p>
                                 ))}
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
                              <div className="pt-4 border-t">
                                 <p className="text-xs text-slate-500 mb-2">이 분석이 마음에 드시나요? 아니면 수정하고 싶은 부분이 있다면 채팅으로 알려주세요. (예: "행정법 판례 최신 경향도 추가해줘")</p>
                                 <button onClick={handleGenerateQuiz} disabled={isLoading} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-primary-700 transition disabled:bg-slate-400">
                                     <SparklesIcon className="w-5 h-5"/> {isLoading ? '생성 중...' : '이 분석으로 맞춤 문제 생성'}
                                 </button>
                             </div>
                        </div>
                    </div>
                 );
            } else if (msg.text) {
                 return (
                    <div className="flex items-start gap-3">
                         <div className="w-8 h-8 bg-slate-200 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
                           <BrainCircuitIcon className="w-5 h-5 text-slate-500" />
                        </div>
                        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-sm max-w-lg">
                            <p className="whitespace-pre-wrap">{msg.text}</p>
                            {msg.sources && msg.sources.length > 0 && (
                                <div className="mt-4 pt-3 border-t border-slate-200">
                                    <h4 className="text-xs font-bold text-slate-500 mb-2">출처</h4>
                                    <ul className="space-y-1.5">
                                        {msg.sources.map((source, index) => (
                                            <li key={index} className="flex items-start gap-2">
                                                <span className="text-xs font-semibold text-primary-600 bg-primary-100 rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">{index + 1}</span>
                                                <a 
                                                    href={source.uri} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="text-sm text-blue-600 hover:underline break-all"
                                                    title={source.uri}
                                                >
                                                    {source.title || source.uri}
                                                </a>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    </div>
                 );
            }
        }
        
        if (msg.sender === 'system' && msg.text) {
             return (
                <div className="text-center text-sm text-slate-500 py-2 px-4 bg-slate-100 rounded-full self-center">
                    {msg.text}
                </div>
            );
        }

        return null;
    };


    return (
        <div className="flex flex-col h-[calc(100vh-140px)] bg-slate-50 rounded-2xl shadow-inner">
            <header className="p-4 border-b border-slate-200 text-center flex-shrink-0">
                 <h1 className="text-xl font-bold text-slate-800 flex items-center justify-center gap-3">
                    <BrainCircuitIcon className="h-6 w-6 text-primary-600" />
                    <span>페르소나 기반 AI 학습 설계</span>
                </h1>
            </header>
            <div ref={chatContainerRef} className="flex-1 p-4 sm:p-6 space-y-6 overflow-y-auto">
                {chatHistory.map(msg => <div key={msg.id}>{renderMessage(msg)}</div>)}
                 {error && (
                    <div className="flex justify-center">
                        <div className="bg-red-100 text-red-700 p-3 rounded-lg text-sm border border-red-300">
                            <strong>오류:</strong> {error}
                        </div>
                    </div>
                )}
            </div>
            <footer className="p-4 border-t border-slate-200 bg-white rounded-b-2xl flex-shrink-0">
                <form onSubmit={(e) => { e.preventDefault(); handleSendMessage(userInput); }} className="flex items-center gap-3">
                    <input
                        type="text"
                        value={userInput}
                        onChange={(e) => setUserInput(e.target.value)}
                        placeholder={isLoading ? "AI가 응답을 준비 중입니다..." : "메시지를 입력하세요..."}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 transition disabled:bg-slate-100"
                        disabled={isLoading}
                        aria-label="채팅 메시지 입력"
                    />
                    <button type="submit" disabled={isLoading || !userInput.trim()} className="bg-primary-600 text-white p-3 rounded-lg hover:bg-primary-700 transition disabled:bg-slate-400 disabled:cursor-not-allowed flex-shrink-0">
                        <SendIcon className="w-5 h-5"/>
                    </button>
                </form>
            </footer>
        </div>
    );
};

export default PersonaPlanner;
