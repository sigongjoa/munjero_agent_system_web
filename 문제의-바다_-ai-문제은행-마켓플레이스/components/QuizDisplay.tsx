

import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import type { QuizSet, UserAnswers, QuizData, HighSchoolSubject, ShortsScript, QuizQuestion, AIGeneratedQuestion } from '../types';
import { CheckCircleIcon, XCircleIcon, LightbulbIcon, FileDownIcon, MessageSquareIcon, UploadIcon, PlusSquareIcon, VideoIcon, CaptionsIcon, ImageIcon, FileTextIcon, HelpCircleIcon, PartyPopperIcon, LayersIcon, CopyIcon, DownloadIcon, CameraIcon, PencilIcon } from './icons';
import { generateTestPdf, convertAiQuizToTestResult } from '../services/pdfGenerator';

interface QuizDisplayProps {
  quizSet: QuizSet;
  onComplete: (answers: UserAnswers) => void;
  referenceImages: string[] | null;
  passage?: string;
  generatedQuizData: QuizData | null;
  userInput: { 
    goal: string;
    text: string;
    image: string[] | null;
    questionType: string;
    subject: { main: HighSchoolSubject; sub: string };
    passageLength: number;
    difficulty: string;
    numQuestions: number;
    useOriginalText: boolean;
    questionStemStyle: string;
    questionChoicesStyle: string;
  } | null;
  fontsReady: boolean;
  onRegenerateWithFeedback: (feedback: string, newImages: string[] | null) => void;
  onOpenDeepDiveModal: () => void;
  onUpdateQuizData: React.Dispatch<React.SetStateAction<QuizData | null>>;
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

// Component to render the styled image for capturing
const ShortsImageRenderer: React.FC<{
  question: QuizQuestion;
  questionNumber: number;
  isAnswerVersion: boolean;
  highlightedItem?: 'question' | `option-${number}` | null;
  shortExplanation: string;
}> = ({ question, questionNumber, isAnswerVersion, highlightedItem, shortExplanation }) => {
    
  const prefixChars = '①②③④⑤';

  // --- Question Sequence Rendering ---
  if (!isAnswerVersion) {
    const isQuestionHighlighted = highlightedItem === 'question';

    return (
      <div className={`w-[450px] min-h-[450px] p-8 font-sans flex flex-col justify-between gap-6 border-2 border-slate-200 transition-colors duration-300 ${isQuestionHighlighted ? 'bg-primary-50' : 'bg-gradient-to-b from-slate-50 to-white'}`}>
        <div className={`text-xl transition-colors duration-300 ${isQuestionHighlighted ? 'font-extrabold text-black' : 'font-bold text-slate-400'}`}>
            <span className="text-primary-600">Q{questionNumber}.</span>{' '}
            <span className={isQuestionHighlighted ? 'bg-primary-100 px-2 py-1 rounded' : ''}>
                {question.question}
            </span>
        </div>
        <div className="space-y-4">
          {question.options?.map((option, index) => {
            const prefix = prefixChars[index];
            const prefixRegex = new RegExp(`^[${prefixChars}]\\s*`);
            const optionText = option.replace(prefixRegex, '').trim();
            const isOptionHighlighted = highlightedItem === `option-${index}`;

            return (
              <div
                key={index}
                className={`flex items-start p-4 border-2 rounded-lg text-left transition-all duration-300 ${
                  isOptionHighlighted
                    ? 'border-primary-400 bg-white shadow-lg scale-105'
                    : 'border-slate-200 bg-slate-100 text-slate-400'
                }`}
              >
                <span className={`font-bold mr-3 ${isOptionHighlighted ? 'text-primary-600' : ''}`}>{prefix}</span>
                <span className={`flex-grow ${isOptionHighlighted ? 'font-bold text-black' : ''}`}>{optionText}</span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // --- Answer and Explanation Rendering ---
  return (
    <div className="w-[450px] min-h-[450px] bg-white p-8 font-sans flex flex-col justify-center gap-6 border-2 border-slate-200">
      <div className="text-xl font-bold text-slate-800">
          <span className="text-primary-600">Q{questionNumber}.</span>{' '}
          {question.question}
      </div>
      
      <div className="space-y-3">
          {question.options?.map((option, index) => {
              const isCorrect = index === question.answer;
              const prefix = prefixChars[index];
              const prefixRegex = new RegExp(`^[${prefixChars}]\\s*`);
              const optionText = option.replace(prefixRegex, '').trim();

              return (
                  <div key={index} className={`flex items-start p-4 border-2 rounded-lg text-left transition-all duration-300 ${isCorrect ? 'bg-green-50 border-green-300' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>
                      <span className={`font-bold mr-3 ${isCorrect ? 'text-green-600' : ''}`}>{prefix}</span>
                      <span className={`flex-grow ${isCorrect ? 'font-bold text-green-900' : ''}`}>{optionText}</span>
                      {isCorrect && <CheckCircleIcon className="w-5 h-5 text-green-600 ml-2 flex-shrink-0" />}
                  </div>
              );
          })}
      </div>
      
      {shortExplanation && (
        <div className="animate-fade-in mt-4 p-5 bg-primary-50 border-2 border-primary-200 rounded-xl shadow-md">
          <h4 className="font-extrabold text-lg text-primary-800 mb-2 flex items-center gap-2">
            <LightbulbIcon className="w-6 h-6 text-primary-600" />
            핵심 정리 ✨
          </h4>
          <p className="leading-relaxed text-slate-800 font-medium text-base">{shortExplanation}</p>
        </div>
      )}
    </div>
  );
};


export const QuizDisplay: React.FC<QuizDisplayProps> = ({
  quizSet,
  onComplete,
  referenceImages,
  passage,
  generatedQuizData,
  userInput,
  fontsReady,
  onRegenerateWithFeedback,
  onOpenDeepDiveModal,
  onUpdateQuizData,
}) => {
  const [userAnswers, setUserAnswers] = useState<UserAnswers>({});
  const [isCompleted, setIsCompleted] = useState(false);
  const [showExplanation, setShowExplanation] = useState<{ [key: number]: boolean }>({});

  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackImages, setFeedbackImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const feedbackFileInputRef = useRef<HTMLInputElement>(null);

  const [activeTab, setActiveTab] = useState<'quiz' | 'shorts'>('quiz');
  const [shortsScriptType, setShortsScriptType] = useState<'passage' | 'question'>('passage');
  const [selectedQuestionForShorts, setSelectedQuestionForShorts] = useState(0);
  
  // State for Shorts Frame Generation
  const shortsImageRef = useRef<HTMLDivElement>(null);
  const shortsImageAnswerRef = useRef<HTMLDivElement>(null);
  const [isGeneratingFrames, setIsGeneratingFrames] = useState(false);
  const [generationProgress, setGenerationProgress] = useState({ current: 0, total: 0 });
  const [highlightedItem, setHighlightedItem] = useState<'question' | `option-${number}` | null>(null);

  // New states for edit modal
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingQuestionIndex, setEditingQuestionIndex] = useState<number | null>(null);
  const [editFormData, setEditFormData] = useState<AIGeneratedQuestion | null>(null);

  useEffect(() => {
    const defaultTitle = "문제의 바다: AI 문제은행 마켓플레이스";
    const defaultDescription = "AI로 나만의 학습 문제를 만들고 공유하세요. 수능, PSAT, NCS 등 모든 시험 대비가 가능한 커뮤니티 기반 문제은행 플랫폼, 문제의 바다입니다.";

    const newTitle = generatedQuizData?.seoTitle || quizSet.title;
    const newDescription = generatedQuizData?.seoDescription || (quizSet.description.trim() ? quizSet.description : defaultDescription);

    const originalTitle = document.title;
    const metaDescriptionTag = document.querySelector('meta[name="description"]');
    const originalDescription = metaDescriptionTag ? metaDescriptionTag.getAttribute('content') : defaultDescription;
    
    const ogTitleTag = document.querySelector('meta[property="og:title"]');
    const originalOgTitle = ogTitleTag ? ogTitleTag.getAttribute('content') : defaultTitle;
    const ogDescriptionTag = document.querySelector('meta[property="og:description"]');
    const originalOgDescription = ogDescriptionTag ? ogDescriptionTag.getAttribute('content') : defaultDescription;

    const twitterTitleTag = document.querySelector('meta[property="twitter:title"]');
    const originalTwitterTitle = twitterTitleTag ? twitterTitleTag.getAttribute('content') : defaultTitle;
    const twitterDescriptionTag = document.querySelector('meta[property="twitter:description"]');
    const originalTwitterDescription = twitterDescriptionTag ? twitterDescriptionTag.getAttribute('content') : defaultDescription;

    document.title = newTitle;
    if (metaDescriptionTag) metaDescriptionTag.setAttribute('content', newDescription);
    if (ogTitleTag) ogTitleTag.setAttribute('content', newTitle);
    if (ogDescriptionTag) ogDescriptionTag.setAttribute('content', newDescription);
    if (twitterTitleTag) twitterTitleTag.setAttribute('content', newTitle);
    if (twitterDescriptionTag) twitterDescriptionTag.setAttribute('content', newDescription);


    return () => {
        document.title = originalTitle;
        if (metaDescriptionTag && originalDescription) metaDescriptionTag.setAttribute('content', originalDescription);
        if (ogTitleTag && originalOgTitle) ogTitleTag.setAttribute('content', originalOgTitle);
        if (ogDescriptionTag && originalOgDescription) ogDescriptionTag.setAttribute('content', originalOgDescription);
        if (twitterTitleTag && originalTwitterTitle) twitterTitleTag.setAttribute('content', originalTwitterTitle);
        if (twitterDescriptionTag && originalTwitterDescription) twitterDescriptionTag.setAttribute('content', originalTwitterDescription);
    };
  }, [generatedQuizData, quizSet.title, quizSet.description]);

  const handleAnswerSelect = (questionIndex: number, choiceIndex: number) => {
    if (isCompleted) return;
    setUserAnswers(prev => ({ ...prev, [questionIndex]: choiceIndex }));
  };

  const handleSubmit = () => {
    setIsCompleted(true);
  };

  const handleRetry = () => {
    setIsCompleted(false);
    setUserAnswers({});
    setShowExplanation({});
  };

  const handleFinish = () => {
    onComplete(userAnswers);
  };

  const toggleExplanation = (index: number) => {
    setShowExplanation(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const allQuestionsAnswered = useMemo(() => {
    return quizSet.questions.length > 0 && quizSet.questions.length === Object.keys(userAnswers).length;
  }, [quizSet.questions.length, userAnswers]);

  const score = useMemo(() => {
    if (!isCompleted) return 0;
    return quizSet.questions.reduce((acc, q, i) => (userAnswers[i] === q.answer ? acc + 1 : acc), 0);
  }, [isCompleted, quizSet.questions, userAnswers]);

  const handleFeedbackFileSelect = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => setFeedbackImages(prev => [...prev, reader.result as string]);
            reader.readAsDataURL(file);
        }
    });
  };

  const handleFeedbackImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFeedbackFileSelect(e.target.files);
    if(feedbackFileInputRef.current) feedbackFileInputRef.current.value = "";
  };

  const removeFeedbackImage = (indexToRemove: number) => setFeedbackImages(prev => prev.filter((_, i) => i !== indexToRemove));
  const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); e.stopPropagation(); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { handleDragEvents(e); if (!isDragging) setIsDragging(true); };
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => { handleDragEvents(e); setIsDragging(false); };
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    handleDragEvents(e);
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFeedbackFileSelect(e.dataTransfer.files);
  };
  
  const closeAndResetFeedbackModal = () => {
    setIsFeedbackModalOpen(false);
    setFeedbackText('');
    setFeedbackImages([]);
    setIsDragging(false);
  };
  
  const handleFeedbackSubmit = () => {
    if (feedbackText.trim() || feedbackImages.length > 0) {
        onRegenerateWithFeedback(feedbackText, feedbackImages.length > 0 ? feedbackImages : null);
        closeAndResetFeedbackModal();
    }
  };

  const isFeedbackSubmitDisabled = !feedbackText.trim() && feedbackImages.length === 0;

  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const handleDownloadPdf = async () => {
    if (!fontsReady || !generatedQuizData || !userInput) {
        alert("PDF 생성에 필요한 정보가 준비되지 않았습니다.");
        return;
    }
    setIsGeneratingPdf(true);
    try {
        const testResultForPdf = convertAiQuizToTestResult(generatedQuizData, userInput);
        await generateTestPdf(testResultForPdf, true, true, 'standard');
    } catch (e) {
        alert(`PDF 생성 중 오류가 발생했습니다: ${e instanceof Error ? e.message : 'Unknown error'}`);
        console.error(e);
    } finally {
        setIsGeneratingPdf(false);
    }
  };
  
  const downloadJson = (content: object, filename: string) => {
    const jsonString = JSON.stringify(content, null, 2);
    const blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  const handleDownloadJson = () => {
    if (!generatedQuizData || !userInput) {
        alert("JSON 명세서를 생성할 퀴즈 데이터가 없습니다.");
        return;
    }
    
    const fullQuizSpec = {
      specVersion: "1.0",
      id: `ai-gen-${new Date().getTime()}`,
      title: userInput.goal,
      description: `AI가 생성한 '${userInput.subject.main} > ${userInput.subject.sub}' 과목의 '${userInput.questionType}' 유형 문제집입니다. 학습 목표는 '${userInput.goal}'입니다.`,
      createdAt: new Date().toISOString(),
      sourceType: "AI_GENERATED",
      author: {
        id: "ai-tutor-gemini-2.5-flash",
        name: "AI Tutor"
      },
      tags: generatedQuizData.tags || [],
      subject: {
        main: userInput.subject.main,
        sub: userInput.subject.sub
      },
      difficulty: userInput.difficulty,
      generationConfig: {
        goal: userInput.goal,
        questionType: userInput.questionType,
        passageLength: userInput.passageLength,
        useOriginalText: userInput.useOriginalText,
        questionStemStyle: userInput.questionStemStyle,
        questionChoicesStyle: userInput.questionChoicesStyle,
      },
      ...(generatedQuizData.passage && { passage: generatedQuizData.passage }),
      ...(generatedQuizData.dataTable && { dataTable: generatedQuizData.dataTable }),
      ...(generatedQuizData.dialogue && { dialogue: generatedQuizData.dialogue }),
      ...(generatedQuizData.passage_shorts_script && { passage_shorts_script: generatedQuizData.passage_shorts_script }),
      ...(generatedQuizData.suggestedLinks && { suggestedLinks: generatedQuizData.suggestedLinks }),
      questions: generatedQuizData.quiz.map((q, index) => ({
        questionNumber: index + 1,
        questionText: q.question,
        options: q.options,
        answerIndex: q.answer,
        explanation: q.explanation,
        knowledgeTag: q.knowledgeTag,
        shorts_script: q.shorts_script
      }))
    };
    
    const safeTitle = (userInput.goal || '문제')
        .replace(/[/\\?%*:|"<>]/g, '')
        .replace(/\s+/g, '_');
    const jsonFilename = `${userInput.subject.main}_${safeTitle}_spec.json`;

    downloadJson(fullQuizSpec, jsonFilename);
  };

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('클립보드에 복사되었습니다.');
    }, (err) => {
      console.error('클립보드 복사 실패:', err);
      alert('클립보드 복사에 실패했습니다.');
    });
  };
  
  const handleDownloadImage = async (ref: React.RefObject<HTMLDivElement>, filename: string) => {
    if (!ref.current) return;
    try {
        const dataUrl = await htmlToImage.toPng(ref.current, { quality: 0.98, pixelRatio: 2 });
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        link.click();
    } catch (error) {
        console.error('이미지 다운로드 실패:', error);
        alert('이미지 다운로드에 실패했습니다.');
    }
  };

  const handleDownloadTtsScript = () => {
    if (!quizSet.questions[selectedQuestionForShorts]) {
      alert('TTS 대본을 생성할 문제를 찾을 수 없습니다.');
      return;
    }

    const question = quizSet.questions[selectedQuestionForShorts];
    const questionNumber = selectedQuestionForShorts + 1;
    const prefixChars = '①②③④⑤';
    const explanationText = currentShortExplanation;

    const ttsContent = `
${question.question}

${question.options?.map((option, index) => {
        const prefix = prefixChars[index];
        const prefixRegex = new RegExp(`^[${prefixChars}]\\s*`);
        const optionText = option.replace(prefixRegex, '').trim();
        return `${index + 1}번 보기. ${optionText}`;
    }).join('\n')}

정답은 ${question.answer + 1}번 입니다.

${explanationText}
    `.trim();

    const blob = new Blob([ttsContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `TTS_script_Q${questionNumber}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadQuestionFrames = async () => {
    setIsGeneratingFrames(true);
    const question = quizSet.questions[selectedQuestionForShorts];
    if (!question.options) {
      setIsGeneratingFrames(false);
      return;
    }
    const totalFrames = 1 + question.options.length; // 1 for question, N for N options
    setGenerationProgress({ current: 0, total: totalFrames });

    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
    
    // A more robust way to wait for repaint + transition
    const waitForNextFrameAndTransition = () => {
        return new Promise<void>(resolve => {
            requestAnimationFrame(() => {
                // This waits for the browser to be ready to paint.
                // The 350ms timeout waits for our CSS transition to complete.
                setTimeout(resolve, 350); 
            });
        });
    };

    // Frame 1: Highlight question
    setHighlightedItem('question');
    await waitForNextFrameAndTransition();
    await handleDownloadImage(shortsImageRef, `question_frame_01.png`);
    setGenerationProgress({ current: 1, total: totalFrames });

    // Subsequent frames: Highlight options one by one
    for (let i = 0; i < question.options.length; i++) {
        setHighlightedItem(`option-${i}`);
        await waitForNextFrameAndTransition();
        await handleDownloadImage(shortsImageRef, `question_frame_${String(i + 2).padStart(2, '0')}.png`);
        setGenerationProgress({ current: i + 2, total: totalFrames });
    }

    // Reset highlighting and capture one last time to be safe if needed, or just clean up state
    setHighlightedItem(null); 
    await waitForNextFrameAndTransition(); // ensure the final state is rendered before finishing
    setIsGeneratingFrames(false);
  };

  const handleDownloadAnswerFrames = async () => {
    setIsGeneratingFrames(true);
    setGenerationProgress({ current: 0, total: 1 });
    const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // A single frame for the answer reveal.
    await wait(100);
    await handleDownloadImage(shortsImageAnswerRef, `answer_frame_01.png`);
    setGenerationProgress({ current: 1, total: 1 });

    setIsGeneratingFrames(false);
  };

  const currentShortsScript: ShortsScript | undefined | null = useMemo(() => {
    if (shortsScriptType === 'passage') {
      return generatedQuizData?.passage_shorts_script;
    }
    if (shortsScriptType === 'question' && generatedQuizData?.quiz) {
      return (generatedQuizData.quiz[selectedQuestionForShorts] as AIGeneratedQuestion)?.shorts_script;
    }
    return null;
  }, [shortsScriptType, generatedQuizData, selectedQuestionForShorts]);

  const currentShortExplanation = useMemo(() => {
    if (shortsScriptType === 'question' && generatedQuizData?.quiz) {
        const script = (generatedQuizData.quiz[selectedQuestionForShorts] as AIGeneratedQuestion)?.shorts_script;
        const revealScene = script?.scenes.find(s => s.section === '정답 공개');
        if (revealScene) {
            // "정답은 X번!" 부분을 제외하고 해설만 추출
            return revealScene.caption.replace(/정답은\s*.번!\s*/, '').trim();
        }
    }
    // Fallback to the full main explanation if no script explanation is found
    const fullExplanation = quizSet.questions[selectedQuestionForShorts]?.explanation || '';
    return fullExplanation;
  }, [shortsScriptType, generatedQuizData, selectedQuestionForShorts, quizSet.questions]);

  // Handlers for Edit Modal
  const handleOpenEditModal = (index: number) => {
    if (!generatedQuizData?.quiz) return;
    setEditingQuestionIndex(index);
    // Deep copy to prevent direct state mutation while editing
    setEditFormData(JSON.parse(JSON.stringify(generatedQuizData.quiz[index])));
    setIsEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setIsEditModalOpen(false);
    setEditingQuestionIndex(null);
    setEditFormData(null);
  };

  const handleEditFormChange = (field: keyof AIGeneratedQuestion, value: string) => {
    if (!editFormData) return;
    setEditFormData(prev => prev ? { ...prev, [field]: value } : null);
  };
  
  const handleEditOptionChange = (optionIndex: number, value: string) => {
    if (!editFormData) return;
    const newOptions = [...editFormData.options];
    newOptions[optionIndex] = value;
    setEditFormData(prev => prev ? { ...prev, options: newOptions } : null);
  };
  
  const handleEditAnswerChange = (answerIndex: number) => {
    if (!editFormData) return;
    setEditFormData(prev => prev ? { ...prev, answer: answerIndex } : null);
  };

  const handleSaveEdit = () => {
    if (!generatedQuizData || editingQuestionIndex === null || !editFormData) return;
    
    // Create a new quiz array with the updated question
    const newQuizArray = [...generatedQuizData.quiz];
    newQuizArray[editingQuestionIndex] = editFormData;
    
    // Create a new quiz data object and call the updater from App.tsx
    onUpdateQuizData(prevData => prevData ? { ...prevData, quiz: newQuizArray } : null);
    
    handleCloseEditModal();
  };

  const renderQuizContent = () => (
    <>
      {(passage || referenceImages) && (
        <div className="mb-8 p-6 bg-slate-50 border border-slate-200 rounded-xl">
          <h3 className="text-xl font-bold text-slate-800 flex items-center gap-2 mb-4"><FileTextIcon className="w-5 h-5"/>제시문</h3>
          {passage && <div className="prose prose-slate max-w-none mb-4">{renderWithBold(passage)}</div>}
          {referenceImages && referenceImages.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {referenceImages.map((imgSrc, index) => (
                <div key={index} className="border rounded-lg p-2 bg-white">
                  <img src={imgSrc} alt={`Reference ${index + 1}`} className="w-full h-auto rounded-md" />
                  <p className="text-center text-sm font-semibold text-slate-600 mt-2">[그림 {index + 1}]</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="space-y-8">
        {quizSet.questions.map((q, qIndex) => (
            <div key={qIndex} className="border border-slate-200 p-6 rounded-xl relative">
                <button 
                  onClick={() => handleOpenEditModal(qIndex)}
                  className="absolute top-4 right-4 p-2 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 transition"
                  aria-label={`문제 ${qIndex + 1} 수정`}
                >
                    <PencilIcon className="w-5 h-5" />
                </button>
                <p className="font-bold text-lg text-slate-800 mb-4 pr-12">
                    <span className="text-primary-600 font-black mr-2">Q{qIndex + 1}.</span> {renderWithBold(q.question)}
                </p>
                <div className="space-y-3">
                    {q.options?.map((option, oIndex) => {
                        const isSelected = userAnswers[qIndex] === oIndex;
                        const isCorrect = q.answer === oIndex;
                        let optionClass = "border-slate-300 hover:border-primary-500 hover:bg-primary-50";
                        if (isCompleted) {
                            if (isCorrect) optionClass = "bg-green-100 border-green-500 text-green-800 font-semibold";
                            else if (isSelected) optionClass = "bg-red-100 border-red-500 text-red-800 font-semibold";
                        } else if (isSelected) {
                            optionClass = "bg-primary-100 border-primary-500 ring-2 ring-primary-300";
                        }

                        return (
                            <label key={oIndex} className={`flex items-start p-4 border rounded-lg transition-all duration-200 ${isCompleted ? 'cursor-default' : 'cursor-pointer'} ${optionClass}`}>
                                <input type="radio" name={`q-${qIndex}`} checked={isSelected} onChange={() => handleAnswerSelect(qIndex, oIndex)} className="hidden" disabled={isCompleted} />
                                <span className="flex-grow">{renderWithBold(option)}</span>
                                {isCompleted && isCorrect && <CheckCircleIcon className="w-6 h-6 text-green-600 ml-2 flex-shrink-0" />}
                                {isCompleted && isSelected && !isCorrect && <XCircleIcon className="w-6 h-6 text-red-600 ml-2 flex-shrink-0" />}
                            </label>
                        );
                    })}
                </div>
                {isCompleted && (
                    <div className="mt-4">
                        <button onClick={() => toggleExplanation(qIndex)} className="text-sm font-semibold text-primary-600 hover:underline">
                            {showExplanation[qIndex] ? '해설 숨기기' : '해설 보기'}
                        </button>
                        {showExplanation[qIndex] && (
                            <div className="mt-2 p-4 bg-amber-50 border border-amber-200 rounded-lg animate-fade-in">
                                <p className="font-bold flex items-center gap-2 text-amber-800"><LightbulbIcon className="w-5 h-5"/>해설</p>
                                <p className="text-amber-900 mt-1">{renderWithBold(q.explanation)}</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        ))}
      </div>
       <div className="mt-10 pt-6 border-t border-slate-200">
          {isCompleted ? (
              <div className="text-center bg-blue-50 p-6 rounded-xl border border-blue-200">
                  <h3 className="text-2xl font-bold text-blue-800">결과: {score} / {quizSet.questions.length} 점</h3>
                  <div className="mt-4 flex flex-col sm:flex-row justify-center gap-4">
                      <button onClick={handleRetry} className="bg-slate-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-slate-700 transition">다시 풀기</button>
                      <button onClick={handleFinish} className="bg-primary-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-primary-700 transition">분석 리포트 보기</button>
                  </div>
              </div>
          ) : (
              <button onClick={handleSubmit} disabled={!allQuestionsAnswered} className="w-full bg-primary-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-primary-700 transition disabled:bg-slate-400 disabled:cursor-not-allowed">
                  {allQuestionsAnswered ? '답안 제출' : '모든 문제에 답해주세요'}
              </button>
          )}
      </div>
    </>
  );

  const renderShortsContent = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Controls and Script Display */}
      <div className="space-y-6">
        <div className="flex items-center gap-4 bg-slate-100 p-2 rounded-lg">
            <h3 className="text-lg font-semibold text-slate-800">대본 선택:</h3>
            <div className="flex-1 flex rounded-md border border-slate-300 p-0.5 bg-white shadow-sm">
                <button onClick={() => setShortsScriptType('passage')} className={`flex-1 px-3 py-1.5 text-sm rounded-md transition ${shortsScriptType === 'passage' ? 'bg-primary-600 text-white font-bold' : 'hover:bg-slate-100'}`}>
                    제시문 요약
                </button>
                <button onClick={() => setShortsScriptType('question')} className={`flex-1 px-3 py-1.5 text-sm rounded-md transition ${shortsScriptType === 'question' ? 'bg-primary-600 text-white font-bold' : 'hover:bg-slate-100'}`}>
                    문제 풀이
                </button>
            </div>
        </div>
        
        {shortsScriptType === 'question' && (
            <div className="flex items-center gap-2">
                <label htmlFor="question-select" className="font-semibold text-slate-700">문제 번호:</label>
                <select id="question-select" value={selectedQuestionForShorts} onChange={e => setSelectedQuestionForShorts(Number(e.target.value))} className="p-2 border border-slate-300 rounded-lg">
                    {quizSet.questions.map((_, index) => <option key={index} value={index}>Q{index+1}</option>)}
                </select>
            </div>
        )}

        {currentShortsScript ? (
            <div className="space-y-4 p-4 border rounded-xl bg-slate-50 max-h-[60vh] overflow-y-auto">
                <div className="flex justify-between items-center">
                    <h4 className="text-xl font-bold text-slate-800 flex items-center gap-2"><VideoIcon className="w-5 h-5 text-primary-600"/> {currentShortsScript.title}</h4>
                    <button onClick={() => handleCopyToClipboard(currentShortsScript.scenes.map(s => `[${s.section}]\n${s.caption}\nVisual: ${s.visual_suggestion}`).join('\n\n'))} className="p-1.5 rounded-md hover:bg-slate-200"><CopyIcon className="w-4 h-4 text-slate-500"/></button>
                </div>
                <div className="space-y-3">
                    {currentShortsScript.scenes.map((scene, index) => (
                        <div key={index} className="p-3 bg-white rounded-lg border">
                            <p className="font-bold text-primary-700 text-sm">[{scene.section}]</p>
                            <p className="mt-1 text-slate-700 flex items-start gap-2">
                                <CaptionsIcon className="w-4 h-4 mt-1 flex-shrink-0 text-slate-500"/> <span>{scene.caption}</span>
                            </p>
                            <p className="mt-1 text-slate-500 text-sm flex items-start gap-2">
                                <ImageIcon className="w-4 h-4 mt-1 flex-shrink-0 text-slate-400"/> <span>{scene.visual_suggestion}</span>
                            </p>
                        </div>
                    ))}
                </div>
            </div>
        ) : <p className="text-center text-slate-500 p-8">선택된 쇼츠 대본이 없습니다.</p>}
      </div>
      
      {shortsScriptType === 'question' && (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-slate-800">SNS 공유용 이미지 생성</h3>
                <button
                    onClick={handleDownloadTtsScript}
                    className="flex items-center gap-1.5 text-sm bg-slate-100 text-slate-700 font-semibold py-1 px-3 rounded-full hover:bg-slate-200"
                    aria-label="TTS 대본 다운로드"
                >
                    <FileTextIcon className="w-4 h-4" />
                    TTS 대본
                </button>
            </div>
            {isGeneratingFrames && (
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                    <div className="bg-primary-600 h-2.5 rounded-full" style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}></div>
                    <p className="text-center text-sm text-slate-600 mt-1">{generationProgress.current} / {generationProgress.total} 프레임 생성됨</p>
                </div>
            )}
            <div className="space-y-6">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-slate-700">문제 영상 프레임</h4>
                        <button onClick={handleDownloadQuestionFrames} disabled={isGeneratingFrames} className="flex items-center gap-1.5 text-sm bg-blue-100 text-blue-700 font-semibold py-1 px-3 rounded-full hover:bg-blue-200 disabled:opacity-50">
                            <DownloadIcon className="w-4 h-4"/> 생성 및 다운로드
                        </button>
                    </div>
                    <div ref={shortsImageRef} className="inline-block">
                        <ShortsImageRenderer 
                            question={quizSet.questions[selectedQuestionForShorts]} 
                            questionNumber={selectedQuestionForShorts+1} 
                            isAnswerVersion={false} 
                            highlightedItem={highlightedItem}
                            shortExplanation={currentShortExplanation}
                        />
                    </div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <h4 className="font-semibold text-slate-700">정답 영상 프레임</h4>
                        <button onClick={handleDownloadAnswerFrames} disabled={isGeneratingFrames} className="flex items-center gap-1.5 text-sm bg-green-100 text-green-700 font-semibold py-1 px-3 rounded-full hover:bg-green-200 disabled:opacity-50">
                            <DownloadIcon className="w-4 h-4"/> 생성 및 다운로드
                        </button>
                    </div>
                    <div ref={shortsImageAnswerRef} className="inline-block">
                        <ShortsImageRenderer 
                            question={quizSet.questions[selectedQuestionForShorts]} 
                            questionNumber={selectedQuestionForShorts+1} 
                            isAnswerVersion={true} 
                            shortExplanation={currentShortExplanation}
                        />
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in">
      <div className="flex flex-col sm:flex-row justify-between items-start mb-6 border-b pb-4">
        <div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">{quizSet.title}</h2>
            {userInput && <p className="text-sm text-slate-500 mt-1">학습 목표: {userInput.goal}</p>}
        </div>
        <div className="flex gap-2 mt-3 sm:mt-0">
            <button onClick={() => setIsFeedbackModalOpen(true)} className="flex items-center gap-2 text-sm bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-300"><MessageSquareIcon className="w-5 h-5"/>피드백</button>
            <button onClick={handleDownloadPdf} disabled={isGeneratingPdf || !fontsReady} className="flex items-center gap-2 text-sm bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-300 disabled:opacity-50"><FileDownIcon className="w-5 h-5"/>PDF</button>
            <button
                onClick={handleDownloadJson}
                disabled={!generatedQuizData || !userInput}
                className="flex items-center gap-2 text-sm bg-slate-200 text-slate-700 font-semibold py-2 px-4 rounded-lg hover:bg-slate-300 disabled:opacity-50"
            >
                <FileDownIcon className="w-5 h-5"/>JSON
            </button>
            <button
                onClick={onOpenDeepDiveModal}
                className="flex items-center gap-2 text-sm bg-indigo-200 text-indigo-700 font-semibold py-2 px-4 rounded-lg hover:bg-indigo-300"
            >
                <LayersIcon className="w-5 h-5"/>
                난이도별 심화 학습
            </button>
        </div>
      </div>
      
      <div className="flex justify-center mb-6">
          <div className="flex rounded-lg border border-slate-300 p-1 bg-slate-100">
              <button onClick={() => setActiveTab('quiz')} className={`px-4 py-2 text-sm font-semibold rounded-md transition ${activeTab === 'quiz' ? 'bg-white shadow text-primary-700' : 'text-slate-600 hover:bg-slate-200'}`}>퀴즈 풀기</button>
              {generatedQuizData?.passage_shorts_script && (
                  <button onClick={() => setActiveTab('shorts')} className={`px-4 py-2 text-sm font-semibold rounded-md transition ${activeTab === 'shorts' ? 'bg-white shadow text-primary-700' : 'text-slate-600 hover:bg-slate-200'}`}>AI 쇼츠 대본</button>
              )}
          </div>
      </div>

      {activeTab === 'quiz' ? renderQuizContent() : renderShortsContent()}
      
      {isFeedbackModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-lg transform transition-all p-6 sm:p-8 max-h-[90vh] flex flex-col"
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            >
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-2xl font-bold text-slate-800">피드백 및 재요청</h2>
                    <button onClick={closeAndResetFeedbackModal} className="text-slate-500 hover:text-slate-800"><XCircleIcon className="w-8 h-8"/></button>
                </div>
                <div className="space-y-4 overflow-y-auto pr-2 flex-grow">
                    <p className="text-slate-600">AI가 생성한 문제가 만족스럽지 않으신가요? 구체적인 피드백을 남겨주시면 문제를 다시 생성해 드립니다.</p>
                    <div>
                        <label htmlFor="feedback-text" className="block text-sm font-medium text-slate-700 mb-1">피드백</label>
                        <textarea id="feedback-text" value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="예: 문제가 너무 쉬워요. 좀 더 어렵게 만들어주세요." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">이미지 추가 (선택)</label>
                        <input type="file" accept="image/*" multiple onChange={handleFeedbackImageChange} className="hidden" ref={feedbackFileInputRef} />
                        <div className={`w-full p-4 border-2 border-dashed rounded-lg transition-colors ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300'}`}>
                             {feedbackImages.length === 0 ? (
                                <div onClick={() => feedbackFileInputRef.current?.click()} className="flex flex-col items-center justify-center h-24 cursor-pointer"><UploadIcon className="w-8 h-8 text-slate-400 mb-2" /><p className="font-semibold text-slate-700 text-sm">새 이미지를 선택하거나 여기로 드래그하세요</p></div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                    {feedbackImages.map((preview, index) => (
                                        <div key={index} className="relative aspect-square group">
                                            <img src={preview} alt="Feedback preview" className="w-full h-full object-cover rounded-md border" />
                                            <button type="button" onClick={() => removeFeedbackImage(index)} className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-md hover:bg-red-100"><XCircleIcon className="w-6 h-6 text-red-500"/></button>
                                        </div>
                                    ))}
                                    <button type="button" onClick={() => feedbackFileInputRef.current?.click()} className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-slate-300 rounded-md cursor-pointer hover:bg-slate-50 transition text-slate-500 hover:text-primary-600"><PlusSquareIcon className="w-6 h-6" /></button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                <div className='flex-shrink-0 pt-6'>
                    <button onClick={handleFeedbackSubmit} disabled={isFeedbackSubmitDisabled} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-primary-700 disabled:bg-slate-400 disabled:cursor-not-allowed">피드백 제출 및 재생성</button>
                </div>
            </div>
        </div>
    )}
    {isEditModalOpen && editFormData && (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl transform transition-all p-6 sm:p-8 max-h-[90vh] flex flex-col">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
                <h2 className="text-2xl font-bold text-slate-800">문제 {editingQuestionIndex !== null ? editingQuestionIndex + 1 : ''} 수정</h2>
                <button onClick={handleCloseEditModal} className="text-slate-500 hover:text-slate-800"><XCircleIcon className="w-8 h-8"/></button>
            </div>
            <div className="space-y-4 overflow-y-auto pr-2 flex-grow">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">문제</label>
                    <textarea value={editFormData.question} onChange={e => handleEditFormChange('question', e.target.value)} className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">선택지 및 정답</label>
                    <div className="space-y-2">
                      {editFormData.options.map((option, index) => (
                        <div key={index} className="flex items-center gap-2">
                           <input type="radio" name="edit-answer" checked={editFormData.answer === index} onChange={() => handleEditAnswerChange(index)} className="w-4 h-4 accent-primary-600 cursor-pointer flex-shrink-0"/>
                           <input type="text" value={option} onChange={e => handleEditOptionChange(index, e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg" />
                        </div>
                      ))}
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">해설</label>
                    <textarea value={editFormData.explanation} onChange={e => handleEditFormChange('explanation', e.target.value)} className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
                </div>
                 <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">지식 태그</label>
                    <input type="text" value={editFormData.knowledgeTag} onChange={e => handleEditFormChange('knowledgeTag', e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg" />
                </div>
            </div>
            <div className='flex-shrink-0 pt-6 flex gap-4'>
                <button onClick={handleCloseEditModal} className="w-full bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-lg hover:bg-slate-300 transition">취소</button>
                <button onClick={handleSaveEdit} className="w-full flex items-center justify-center gap-2 bg-primary-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-primary-700">저장</button>
            </div>
        </div>
      </div>
    )}
    </div>
  );
};
