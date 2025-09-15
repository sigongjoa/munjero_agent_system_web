

import React, { useState, useCallback, useEffect } from 'react';
import type { 
    ActiveView, QuizSet, UserAnswers, QuizData, 
    AnalysisResult, ChatMessage, PersonaAnalysis, ExamQuestion, TestConfig, TestResult, Review, HighSchoolSubject, DeepDiveData, DeepDiveGenerationParams
} from './types';
import { ExamType, Subject } from './types';
import { generateQuizFromContent, generateQuestionsFromPersona } from './services/geminiService';
import { initializePdfFonts, areFontsInitialized, convertQuizSetToTestResult, convertAiQuizToTestResult } from './services/pdfGenerator';
import { getMockQuizSets } from './services/mockQuizMarket';
import LoadingSpinner from './components/LoadingSpinner';
import { QuizDisplay } from './components/QuizDisplay';
import LearningGoalSetter from './components/LearningGoalSetter';
import AnalysisReport from './components/AnalysisReport';
import Sidebar from './components/Sidebar';
import KnowledgeBase from './components/KnowledgeBase';
import GoodQuestionGuide from './components/GoodQuestionGuide';
import SubjectKorean from './components/SubjectKorean';
import MyPage from './components/MyPage';
import PersonaPlanner from './components/PersonaPlanner';
import ExamMode from './components/ExamMode';
import TestReport from './components/TestReport';
import SubjectScience from './components/SubjectScience';
import SubjectEnglish from './components/SubjectEnglish';
import SubjectSocial from './components/SubjectSocial';
import SubjectEthics from './components/SubjectEthics';
import SubjectMath from './components/SubjectMath';
import Header from './components/Header';
import ExamSelection from './components/ExamSelection';
import { getMockQuestions } from './services/mockExamData';
import TakeQuizModal from './components/TakeQuizModal';
import DeepDiveModal from './components/DeepDiveModal';
import ChatGPTAutomation from './components/ChatGPTAutomation'; // New import
import TypecastAutomation from './components/TypecastAutomation'; // New import
import QuizAutomation from './components/QuizAutomation'; // New import
import BrowserLogin from './components/BrowserLogin'; // New import


// Main App Component
export default function App() {
  const [activeView, setActiveView] = useState<ActiveView>('ai-create-concepts');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // PDF Font State
  const [fontsReady, setFontsReady] = useState(areFontsInitialized());

  // AI Custom Quiz State
  const [generatedQuizData, setGeneratedQuizData] = useState<QuizData | null>(null);
  const [lastAnalysisResult, setLastAnalysisResult] = useState<AnalysisResult | null>(null);
  const [customQuizHistory, setCustomQuizHistory] = useState<AnalysisResult[]>([]);
  const [lastUserInput, setLastUserInput] = useState<{ 
    goal: string, 
    text: string, 
    image: string[] | null, 
    questionType: string,
    subject: { main: HighSchoolSubject; sub: string },
    passageLength: number,
    difficulty: string,
    numQuestions: number,
    useOriginalText: boolean,
    questionStemStyle: string,
    questionChoicesStyle: string,
  } | null>(null);
  
  // My Page & Community State
  const [allQuizSets, setAllQuizSets] = useState<QuizSet[]>([]);
  const [purchasedQuizIds, setPurchasedQuizIds] = useState<string[]>(['quiz_2']);
  const [practiceHistory, setPracticeHistory] = useState<TestResult[]>([]);
  const [reviewHistory, setReviewHistory] = useState<Review[]>([]);
  const [quizForModal, setQuizForModal] = useState<QuizSet | null>(null);
  const [isTakeQuizModalOpen, setIsTakeQuizModalOpen] = useState(false);


  // Persona Planner State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<PersonaAnalysis | null>(null);
  const [generatedPersonaQuestions, setGeneratedPersonaQuestions] = useState<ExamQuestion[] | null>(null);
  const [personaTestResult, setPersonaTestResult] = useState<TestResult | null>(null);
  
  // Standard Exam State
  const [currentTestConfig, setCurrentTestConfig] = useState<TestConfig | null>(null);
  const [currentTestQuestions, setCurrentTestQuestions] = useState<ExamQuestion[] | null>(null);
  const [currentTestResult, setCurrentTestResult] = useState<TestResult | null>(null);
  
  // Deep Dive Modal State
  const [isDeepDiveModalOpen, setIsDeepDiveModalOpen] = useState(false);
  const [deepDiveData, setDeepDiveData] = useState<DeepDiveData>({});

  // Automation Entry Point for Puppeteer
  useEffect(() => {
    (window as any).loadQuizDataForAutomation = (data: { generatedQuizData: QuizData; userInput: any; }) => {
      setGeneratedQuizData(data.generatedQuizData);
      setLastUserInput(data.userInput);
      setActiveView('ai-quiz-display');
    };
  }, [setGeneratedQuizData, setLastUserInput, setActiveView]);

  useEffect(() => {
    // Initialize PDF fonts on app startup
    if (!fontsReady) {
        initializePdfFonts()
            .then(() => setFontsReady(true))
            .catch(err => {
                console.error(err);
                setError("PDF 생성에 필요한 폰트를 불러오지 못했습니다. 새로고침하여 다시 시도해 주세요.");
            });
    }
    // Load mock quiz sets for marketplace/mypage
    setAllQuizSets(getMockQuizSets());
  }, [fontsReady]);

  
  const handleSetActiveView = (view: ActiveView) => {
    setActiveView(view);
    setError(null);
  };

  const handleStartGeneration = useCallback(async (
    goal: string, 
    textInput: string, 
    imageDataUrls: string[] | null, 
    questionType: string,
    subject: { main: HighSchoolSubject; sub: string },
    passageLength: number,
    difficulty: string,
    numQuestions: number,
    useOriginalText: boolean,
    questionStemStyle: string,
    questionChoicesStyle: string,
  ) => {
    setIsLoading(true);
    setError(null);
    setGeneratedQuizData(null);
    setDeepDiveData({}); // Clear deep dive data for new generation
    setLastUserInput({ goal, text: textInput, image: imageDataUrls, questionType, subject, passageLength, difficulty, numQuestions, useOriginalText, questionStemStyle, questionChoicesStyle });
    try {
        const data = await generateQuizFromContent(goal, textInput, imageDataUrls, questionType, subject, passageLength, difficulty, numQuestions, useOriginalText, questionStemStyle, questionChoicesStyle);
        setGeneratedQuizData(data);
        setActiveView('ai-quiz-display');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error during generation');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleQuizComplete = useCallback((userAnswers: UserAnswers) => {
    if (!generatedQuizData || !lastUserInput) return;
    
    const quizQuestions = generatedQuizData.quiz ?? [];

    if (quizQuestions.length === 0) {
        // Handle case where AI fails to generate questions
        setError("AI가 문제를 생성하지 못했습니다. 다시 시도해주세요.");
        setActiveView('ai-create-concepts');
        return;
    }

    const score = quizQuestions.reduce((acc, q, i) => (userAnswers[i] ?? -1) === q.answer ? acc + 1 : acc, 0);
    const weaknessesMap: { [key: string]: number } = {};
    quizQuestions.forEach((q, i) => {
        if ((userAnswers[i] ?? -1) !== q.answer) {
            weaknessesMap[q.knowledgeTag] = (weaknessesMap[q.knowledgeTag] || 0) + 1;
        }
    });
    
    const weaknesses = Object.entries(weaknessesMap)
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag)
      .slice(0, 3);

    const analysis: AnalysisResult = {
      score,
      totalQuestions: quizQuestions.length,
      weaknesses,
      goal: lastUserInput.goal,
      date: new Date().toISOString(),
    };
    
    setLastAnalysisResult(analysis);
    setCustomQuizHistory(prev => [...prev, analysis]);
    setActiveView('ai-analysis-report');
  }, [generatedQuizData, lastUserInput]);
  
  const handleRegenerateWithFeedback = useCallback(async (feedback: string, newImages: string[] | null) => {
      if (!lastUserInput) return;
      
      const combinedText = `기존 학습 자료:\n${lastUserInput.text}\n\n사용자 피드백:\n${feedback}`;
      // If new images are provided, use them. Otherwise, use the original ones.
      const images = newImages ?? lastUserInput.image; 
      
      await handleStartGeneration(
        lastUserInput.goal, 
        combinedText, 
        images, 
        lastUserInput.questionType, 
        lastUserInput.subject,
        lastUserInput.passageLength,
        lastUserInput.difficulty,
        lastUserInput.numQuestions,
        false, // Regeneration should always create new content based on feedback
        lastUserInput.questionStemStyle,
        lastUserInput.questionChoicesStyle
      );
  }, [lastUserInput, handleStartGeneration]);
  
  const handleStartOver = useCallback(() => {
    setGeneratedQuizData(null);
    setLastAnalysisResult(null);
    setLastUserInput(null);
    setDeepDiveData({});
    setActiveView('ai-create-concepts');
  }, []);

  const handleStartFocusedPractice = useCallback(async () => {
    if (!lastUserInput || !lastAnalysisResult) return;
    
    setIsLoading(true);
    setError(null);

    const goal = `${lastUserInput.goal} (취약점 집중: ${lastAnalysisResult.weaknesses.join(', ')})`;
    const textInput = `다음은 이전에 학습한 내용입니다. 이 내용과 관련된 취약점인 '${lastAnalysisResult.weaknesses.join(', ')}'에 초점을 맞춰서, 이전과 다른 새로운 문제를 생성해주세요.\n\n${lastUserInput.text}`;

    try {
        const data = await generateQuizFromContent(
          goal, 
          textInput, 
          lastUserInput.image, 
          lastUserInput.questionType, 
          lastUserInput.subject,
          lastUserInput.passageLength,
          lastUserInput.difficulty,
          lastUserInput.numQuestions,
          false, // Focused practice should always create new content
          lastUserInput.questionStemStyle,
          lastUserInput.questionChoicesStyle
        );
        setGeneratedQuizData(data);
        setActiveView('ai-quiz-display');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error during generation');
    } finally {
      setIsLoading(false);
    }
  }, [lastUserInput, lastAnalysisResult]);

  const handleStartGeneratedTest = useCallback((analysis: PersonaAnalysis, questions: ExamQuestion[]) => {
      setCurrentAnalysis(analysis);
      setGeneratedPersonaQuestions(questions);
      setActiveView('persona-exam-mode');
      setIsLoading(false);
  }, []);

  const handleFinishPersonaTest = useCallback((answers: UserAnswers, timeTaken: number) => {
      if (!generatedPersonaQuestions || !currentAnalysis) return;
      const score = generatedPersonaQuestions.reduce((acc, q, i) => (answers[i] ?? -1) === q.answer_index ? acc + 1 : acc, 0);

      const result: TestResult = {
          config: {
            examType: ExamType.COMMUNITY,
            subject: currentAnalysis.analysis.examSubjects[0] as Subject,
            numQuestions: generatedPersonaQuestions.length,
          },
          questions: generatedPersonaQuestions,
          userAnswers: answers,
          score,
          totalQuestions: generatedPersonaQuestions.length,
          timeTaken,
          date: new Date().toISOString(),
      };
      setPersonaTestResult(result);
      setPracticeHistory(prev => [...prev, result]);
      setActiveView('persona-test-report');

  }, [generatedPersonaQuestions, currentAnalysis]);
  
  const handleStartTest = (config: TestConfig) => {
      setIsLoading(true);
      setError(null);
      setCurrentTestConfig(config);
      // In a real app, this would be an API call. Here we use mock data.
      const questions = getMockQuestions(config.examType, config.subject, config.numQuestions);
      if (questions.length > 0) {
          setCurrentTestQuestions(questions);
          setActiveView('exam-mode');
      } else {
          setError(`${config.examType} - ${config.subject}에 대한 모의 문제가 없습니다.`);
      }
      setIsLoading(false);
  };
  
  const handleFinishTest = (userAnswers: UserAnswers, timeTaken: number) => {
      if (!currentTestQuestions || !currentTestConfig) return;

      const score = currentTestQuestions.reduce((total, q, i) => (userAnswers[i] ?? -1) === q.answer_index ? total + 1 : total, 0);
      
      const result: TestResult = {
          config: currentTestConfig,
          questions: currentTestQuestions,
          userAnswers,
          score,
          totalQuestions: currentTestQuestions.length,
          timeTaken,
          date: new Date().toISOString(),
      };
      
      setCurrentTestResult(result);
      setPracticeHistory(prev => [...prev, result]);
      setActiveView('test-report');
  };
  
  const handleStartOverFromReport = () => {
    setCurrentTestConfig(null);
    setCurrentTestQuestions(null);
    setCurrentTestResult(null);
    setActiveView('my-page'); // Or 'exam-selection'
  };

  const handleRetakeIncorrect = (result: TestResult) => {
      const incorrectQuestions = result.questions.filter((q, i) => result.userAnswers[i] !== q.answer_index);
      if (incorrectQuestions.length > 0) {
          setCurrentTestConfig(result.config);
          setCurrentTestQuestions(incorrectQuestions);
          setActiveView('exam-mode');
      }
  };

  const handleOpenTakeQuizModal = (quizId: string) => {
    const quiz = allQuizSets.find(q => q.id === quizId);
    if (quiz) {
        setQuizForModal(quiz);
        setIsTakeQuizModalOpen(true);
    }
  };

  const handleStartCommunityQuiz = () => {
    if (!quizForModal) return;

    const testData = convertQuizSetToTestResult(quizForModal);
    setCurrentTestConfig(testData.config);
    setCurrentTestQuestions(testData.questions);
    
    setIsTakeQuizModalOpen(false);
    setQuizForModal(null);
    setActiveView('exam-mode');
  };

  const handleOpenDeepDiveModal = () => {
    if (!lastUserInput) return;
    const difficultyLevels = ['쉬움', '보통', '어려움', '매우 어려움'];
    
    const defaultParams: DeepDiveGenerationParams = {
        questionType: lastUserInput.questionType,
        passageLength: lastUserInput.passageLength,
        numQuestions: lastUserInput.numQuestions,
        useOriginalText: lastUserInput.useOriginalText,
        questionStemStyle: lastUserInput.questionStemStyle,
        questionChoicesStyle: lastUserInput.questionChoicesStyle,
    };

    setDeepDiveData(prevData => {
        const newData = { ...prevData };
        let needsUpdate = false;
        difficultyLevels.forEach(level => {
            if (!newData[level]) {
                needsUpdate = true;
                newData[level] = { status: 'idle', data: null, error: null, params: defaultParams };
            }
        });
        return needsUpdate ? newData : prevData;
    });
    
    setIsDeepDiveModalOpen(true);
  };

  const handleUpdateDeepDiveParams = (difficulty: string, params: DeepDiveGenerationParams) => {
    setDeepDiveData(prev => {
      if (!prev[difficulty]) return prev;
      return {
        ...prev,
        [difficulty]: { ...prev[difficulty], params },
      };
    });
  };

  const handleGenerateDeepDiveQuiz = async (difficulty: string) => {
    if (!lastUserInput || !deepDiveData[difficulty]) return;

    const { params } = deepDiveData[difficulty];

    setDeepDiveData(prev => ({ ...prev, [difficulty]: { ...prev[difficulty], status: 'loading', data: null, error: null } }));
    
    try {
      const data = await generateQuizFromContent(
        lastUserInput.goal,
        lastUserInput.text,
        lastUserInput.image,
        params.questionType,
        lastUserInput.subject,
        params.passageLength,
        difficulty, // Use the specific difficulty for this call
        params.numQuestions,
        params.useOriginalText,
        params.questionStemStyle,
        params.questionChoicesStyle
      );
      setDeepDiveData(prev => ({ ...prev, [difficulty]: { ...prev[difficulty], status: 'success', data: data, error: null } }));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : `"${difficulty}" 난이도 문제 생성 중 알 수 없는 오류 발생`;
      setDeepDiveData(prev => ({ ...prev, [difficulty]: { ...prev[difficulty], status: 'error', data: null, error: errorMsg } }));
    }
  };

  const handleGenerateAllDeepDiveQuizzes = async () => {
    if (!lastUserInput) return;
    const difficultyLevels = ['쉬움', '보통', '어려움', '매우 어려움'];

    const levelsToGenerate = difficultyLevels.filter(
      level => deepDiveData[level] && (deepDiveData[level].status === 'idle' || deepDiveData[level].status === 'error')
    );

    if (levelsToGenerate.length === 0) return;

    setDeepDiveData(prev => {
      const newData = { ...prev };
      levelsToGenerate.forEach(level => {
        newData[level] = { ...newData[level], status: 'loading', data: null, error: null };
      });
      return newData;
    });

    await Promise.all(levelsToGenerate.map(async (difficulty) => {
      const { params } = deepDiveData[difficulty];
      try {
        const data = await generateQuizFromContent(
          lastUserInput.goal,
          lastUserInput.text,
          lastUserInput.image,
          params.questionType,
          lastUserInput.subject,
          params.passageLength,
          difficulty,
          params.numQuestions,
          params.useOriginalText,
          params.questionStemStyle,
          params.questionChoicesStyle
        );
        setDeepDiveData(prev => ({ ...prev, [difficulty]: { ...prev[difficulty], status: 'success', data, error: null } }));
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : `"${difficulty}" 난이도 문제 생성 중 알 수 없는 오류 발생`;
        setDeepDiveData(prev => ({ ...prev, [difficulty]: { ...prev[difficulty], status: 'error', data: null, error: errorMsg } }));
      }
    }));
  };

  const handleRegenerateDeepDiveQuizWithFeedback = async (difficulty: string, feedback: string, newImages: string[] | null) => {
    if (!lastUserInput || !deepDiveData[difficulty]) return;
    
    const { params } = deepDiveData[difficulty];
    setDeepDiveData(prev => ({ ...prev, [difficulty]: { ...prev[difficulty], status: 'loading', data: null, error: null } }));
    
    const combinedText = `기존 학습 자료:\n${lastUserInput.text}\n\n사용자 피드백:\n${feedback}`;
    const images = newImages ?? lastUserInput.image;

    try {
      const data = await generateQuizFromContent(
        lastUserInput.goal,
        combinedText,
        images,
        params.questionType,
        lastUserInput.subject,
        params.passageLength,
        difficulty,
        params.numQuestions,
        false, // Regeneration always creates new content
        params.questionStemStyle,
        params.questionChoicesStyle
      );
      setDeepDiveData(prev => ({ ...prev, [difficulty]: { ...prev[difficulty], status: 'success', data: data, error: null } }));
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : `"${difficulty}" 난이도 문제 재생성 중 알 수 없는 오류 발생`;
      setDeepDiveData(prev => ({ ...prev, [difficulty]: { ...prev[difficulty], status: 'error', data: null, error: errorMsg } }));
    }
  };

  const renderActiveView = () => {
    if (isLoading) return <LoadingSpinner />;
    if (error) return <div className="p-4 text-center text-red-600 bg-red-100 rounded-lg">{error}</div>;

    switch (activeView) {
      case 'ai-create-concepts':
        return <LearningGoalSetter category="핵심 개념/논리" onStartGeneration={handleStartGeneration} isLoading={isLoading} />;
      case 'ai-create-analysis':
        return <LearningGoalSetter category="텍스트/자료 분석" onStartGeneration={handleStartGeneration} isLoading={isLoading} />;
      case 'ai-create-application':
        return <LearningGoalSetter category="사례 적용/주장" onStartGeneration={handleStartGeneration} isLoading={isLoading} />;
      case 'ai-create-csat':
        return <LearningGoalSetter category="수능 심화 유형" onStartGeneration={handleStartGeneration} isLoading={isLoading} />;
      case 'ai-quiz-display':
        if (generatedQuizData) {
          const quizQuestions = generatedQuizData.quiz ?? [];
          if(quizQuestions.length === 0) {
            return <div>AI가 문제를 생성하지 못했습니다. 다시 시도해주세요.</div>;
          }
          const quizSetForDisplay: QuizSet = {
              id: 'ai-generated',
              title: lastUserInput?.goal || 'AI 생성 퀴즈',
              author: { id: 'ai', name: 'AI Tutor', isVerified: true },
              questions: quizQuestions.map(q => ({
                  question: q.question,
                  options: q.options,
                  answer: q.answer,
                  explanation: q.explanation,
              })),
              // Dummy values
              description: '',
              price: 0,
              rating: 0,
              downloads: 0,
              tags: [],
              createdAt: new Date().toISOString()
          };
          return (
            <QuizDisplay 
                quizSet={quizSetForDisplay} 
                onComplete={handleQuizComplete} 
                referenceImages={lastUserInput?.image || null}
                passage={generatedQuizData.passage}
                generatedQuizData={generatedQuizData}
                userInput={lastUserInput}
                fontsReady={fontsReady}
                onRegenerateWithFeedback={handleRegenerateWithFeedback}
                onOpenDeepDiveModal={handleOpenDeepDiveModal}
                onUpdateQuizData={setGeneratedQuizData}
            />
          );
        }
        return <div>퀴즈 데이터를 불러오는 중 오류가 발생했습니다.</div>;
      case 'ai-analysis-report':
        if (lastAnalysisResult) {
            return (
                <AnalysisReport 
                    result={lastAnalysisResult}
                    generatedQuizData={generatedQuizData}
                    userInput={lastUserInput}
                    fontsReady={fontsReady}
                    onStartFocusedPractice={handleStartFocusedPractice}
                    onStartOver={handleStartOver}
                    onRegenerateWithFeedback={handleRegenerateWithFeedback}
                />
            );
        }
        return <div>분석 리포트를 불러오는 중 오류가 발생했습니다.</div>;
      case 'my-page':
          return <MyPage 
                    allQuizSets={allQuizSets} 
                    userId="user_01" 
                    onTakeQuiz={handleOpenTakeQuizModal}
                    practiceHistory={practiceHistory} 
                    customQuizHistory={customQuizHistory} 
                    reviewHistory={reviewHistory} 
                    purchasedQuizIds={purchasedQuizIds}
                    personaAnalysis={currentAnalysis}
                    onNavigate={setActiveView}
                  />;
      case 'persona-planner':
          return <PersonaPlanner 
                    onStartGeneratedTest={handleStartGeneratedTest}
                    chatHistory={chatHistory}
                    setChatHistory={setChatHistory}
                    currentAnalysis={currentAnalysis}
                    setCurrentAnalysis={setCurrentAnalysis}
                 />;
      case 'persona-exam-mode':
          if (generatedPersonaQuestions && currentAnalysis) {
              return <ExamMode
                        questions={generatedPersonaQuestions}
                        config={{
                            examType: ExamType.COMMUNITY,
                            subject: currentAnalysis.analysis.examSubjects[0] as Subject,
                            numQuestions: generatedPersonaQuestions.length,
                        }}
                        onFinishTest={handleFinishPersonaTest}
                    />;
          }
          return <div>AI 생성 문제를 불러오는 데 실패했습니다.</div>;
      case 'persona-test-report':
          if (personaTestResult) {
              return <TestReport 
                        result={personaTestResult} 
                        onStartOver={() => setActiveView('my-page')}
                        onRetakeIncorrect={handleRetakeIncorrect}
                    />
          }
          return <div>페르소나 시험 결과를 불러오는 데 실패했습니다.</div>;
       case 'exam-selection':
        return <ExamSelection onStartTest={handleStartTest} isLoading={isLoading} />;
      case 'exam-mode':
        if (currentTestQuestions && currentTestConfig) {
          return <ExamMode questions={currentTestQuestions} config={currentTestConfig} onFinishTest={handleFinishTest} />;
        }
        return <div>시험을 불러오는 중 오류가 발생했습니다.</div>;
      case 'test-report':
        if (currentTestResult) {
          return <TestReport result={currentTestResult} onStartOver={handleStartOverFromReport} onRetakeIncorrect={handleRetakeIncorrect}/>;
        }
        return <div>결과 리포트를 불러오는 중 오류가 발생했습니다.</div>;
      case 'knowledge-base':
        return <KnowledgeBase />;
      case 'good-question-guide':
        return <GoodQuestionGuide />;
      case 'subject-korean':
        return <SubjectKorean />;
      case 'subject-science':
        return <SubjectScience />;
      case 'subject-english':
        return <SubjectEnglish />;
      case 'subject-social':
        return <SubjectSocial />;
      case 'subject-ethics':
        return <SubjectEthics />;
      case 'subject-math':
        return <SubjectMath />;
      case 'chatgpt-automation': // New case
        return <ChatGPTAutomation />;
      case 'typecast-automation': // New case
        return <TypecastAutomation />;
      case 'quiz-automation': // New case
        return <QuizAutomation />;
      case 'browser-login': // New case
        return <BrowserLogin />;
      default:
        return <div>선택된 뷰가 없습니다.</div>;
    }
  };

  return (
    <div className="flex h-screen font-sans">
        <Sidebar activeView={activeView} setActiveView={handleSetActiveView} />
        <div className="flex-1 flex flex-col h-screen">
            <Header />
            <main className="flex-1 p-4 sm:p-6 overflow-y-auto">
                {renderActiveView()}
            </main>
        </div>
        {isTakeQuizModalOpen && quizForModal && (
            <TakeQuizModal
                isOpen={isTakeQuizModalOpen}
                onClose={() => setIsTakeQuizModalOpen(false)}
                onStartWebQuiz={handleStartCommunityQuiz}
                quizSet={quizForModal}
                fontsReady={fontsReady}
            />
        )}
        {isDeepDiveModalOpen && lastUserInput && (
            <DeepDiveModal
                isOpen={isDeepDiveModalOpen}
                onClose={() => setIsDeepDiveModalOpen(false)}
                lastUserInput={lastUserInput}
                deepDiveData={deepDiveData}
                onGenerate={handleGenerateDeepDiveQuiz}
                onRegenerateWithFeedback={handleRegenerateDeepDiveQuizWithFeedback}
                onUpdateParams={handleUpdateDeepDiveParams}
                onGenerateAll={handleGenerateAllDeepDiveQuizzes}
                fontsReady={fontsReady}
            />
        )}
    </div>
  );
}