
import React, { useState, useRef } from 'react';
import type { QuizData, HighSchoolSubject, DeepDiveData, DeepDiveGenerationParams } from '../types';
import { XCircleIcon, UploadIcon, PlusSquareIcon, FileDownIcon, MessageSquareIcon, SparklesIcon, TrendingUpIcon, PencilIcon, EyeIcon, CheckCircleIcon } from './icons';
import { generateTestPdf, convertAiQuizToTestResult } from '../services/pdfGenerator';
import { ShortAnswerType } from '../types';

interface DeepDiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  lastUserInput: { 
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
  };
  deepDiveData: DeepDiveData;
  onGenerate: (difficulty: string) => void;
  onRegenerateWithFeedback: (difficulty: string, feedback: string, newImages: string[] | null) => void;
  onUpdateParams: (difficulty: string, params: DeepDiveGenerationParams) => void;
  onGenerateAll: () => void;
  fontsReady: boolean;
}

const difficultyLevels = ['쉬움', '보통', '어려움', '매우 어려움'];

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


const DeepDiveModal: React.FC<DeepDiveModalProps> = ({ 
  isOpen, 
  onClose, 
  lastUserInput, 
  deepDiveData, 
  onGenerate, 
  onRegenerateWithFeedback,
  onUpdateParams, 
  onGenerateAll, 
  fontsReady 
}) => {
  const [feedbackForDifficulty, setFeedbackForDifficulty] = useState<string | null>(null);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackImages, setFeedbackImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const feedbackFileInputRef = useRef<HTMLInputElement>(null);
  
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
  const [isDownloadingAll, setIsDownloadingAll] = useState(false);
  
  const [editingDifficulty, setEditingDifficulty] = useState<string | null>(null);
  const [previewingDifficulty, setPreviewingDifficulty] = useState<string | null>(null);
  const [showPreviewAnswers, setShowPreviewAnswers] = useState(false);


  if (!isOpen) return null;
  
  const handleDownloadPdf = async (difficulty: string) => {
    const entry = deepDiveData[difficulty];
    if (!fontsReady || !entry || entry.status !== 'success' || !entry.data) {
        alert("PDF 생성에 필요한 정보가 준비되지 않았습니다.");
        return;
    }
    setIsGeneratingPdf(difficulty);
    try {
        const userInputForPdf = { ...lastUserInput, difficulty };
        const testResultForPdf = convertAiQuizToTestResult(entry.data, userInputForPdf);
        await generateTestPdf(testResultForPdf, true, true, 'standard');
    } catch (e) {
        alert(`PDF 생성 중 오류가 발생했습니다: ${e instanceof Error ? e.message : 'Unknown error'}`);
        console.error(e);
    } finally {
        setIsGeneratingPdf(null);
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

  const handleDownloadJson = (difficulty: string) => {
    const entry = deepDiveData[difficulty];
    if (!entry || entry.status !== 'success' || !entry.data) {
        alert("JSON 명세서를 생성할 퀴즈 데이터가 없습니다.");
        return;
    }
    
    const userInputForJson = { ...lastUserInput, difficulty };
    const quizData = entry.data;

    const fullQuizSpec = {
      specVersion: "1.0",
      id: `ai-gen-${new Date().getTime()}`,
      title: userInputForJson.goal,
      description: `AI가 생성한 '${userInputForJson.subject.main} > ${userInputForJson.subject.sub}' 과목의 '${userInputForJson.questionType}' 유형 문제집입니다. 학습 목표는 '${userInputForJson.goal}'입니다.`,
      createdAt: new Date().toISOString(),
      sourceType: "AI_GENERATED",
      author: { id: "ai-tutor-gemini-2.5-flash", name: "AI Tutor" },
      tags: quizData.tags || [],
      subject: { main: userInputForJson.subject.main, sub: userInputForJson.subject.sub },
      difficulty: userInputForJson.difficulty,
      generationConfig: { ...entry.params },
      ...(quizData.passage && { passage: quizData.passage }),
      ...(quizData.dataTable && { dataTable: quizData.dataTable }),
      ...(quizData.dialogue && { dialogue: quizData.dialogue }),
      ...(quizData.passage_shorts_script && { passage_shorts_script: quizData.passage_shorts_script }),
      ...(quizData.suggestedLinks && { suggestedLinks: quizData.suggestedLinks }),
      questions: quizData.quiz?.map((q, index) => ({
        questionNumber: index + 1,
        questionText: q.question,
        options: q.options,
        answerIndex: q.answer,
        explanation: q.explanation,
        knowledgeTag: q.knowledgeTag,
        shorts_script: q.shorts_script
      }))
    };
    
    const safeTitle = (userInputForJson.goal || '문제').replace(/[/\\?%*:|"<>]/g, '').replace(/\s+/g, '_');
    const jsonFilename = `${userInputForJson.subject.main}_${safeTitle}_${difficulty}_spec.json`;

    downloadJson(fullQuizSpec, jsonFilename);
  };
  
  const handleDownloadAllPdfs = async () => {
    if (!fontsReady) return;
    setIsDownloadingAll(true);
    const successfulLevels = difficultyLevels.filter(level => deepDiveData[level]?.status === 'success');
    
    for (const level of successfulLevels) {
        await handleDownloadPdf(level);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setIsDownloadingAll(false);
  };

  const openFeedbackForm = (difficulty: string) => {
    setFeedbackForDifficulty(difficulty);
    setFeedbackText('');
    setFeedbackImages([]);
  };

  const closeFeedbackForm = () => {
    setFeedbackForDifficulty(null);
  };

  const handleFeedbackSubmit = () => {
    if (feedbackForDifficulty && (feedbackText.trim() || feedbackImages.length > 0)) {
        onRegenerateWithFeedback(feedbackForDifficulty, feedbackText, feedbackImages.length > 0 ? feedbackImages : null);
        closeFeedbackForm();
    }
  };
  
  const handleEditParamChange = (difficulty: string, field: keyof DeepDiveGenerationParams, value: string | number | boolean) => {
    const currentParams = deepDiveData[difficulty].params;
    onUpdateParams(difficulty, { ...currentParams, [field]: value });
  };

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
  const isFeedbackSubmitDisabled = !feedbackText.trim() && feedbackImages.length === 0;
  
  const canGenerateAll = difficultyLevels.some(level => deepDiveData[level]?.status === 'idle' || deepDiveData[level]?.status === 'error');
  const hasGeneratedQuizzes = difficultyLevels.some(level => deepDiveData[level]?.status === 'success');
  const isLoadingAny = difficultyLevels.some(level => deepDiveData[level]?.status === 'loading');

  const renderFeedbackView = () => (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 className="text-2xl font-bold text-slate-800">피드백 및 재생성 ({feedbackForDifficulty})</h2>
            <button onClick={closeFeedbackForm} className="text-slate-500 hover:text-slate-800"><XCircleIcon className="w-8 h-8"/></button>
        </div>
        <div className="space-y-4 overflow-y-auto pr-2 flex-grow">
            <p className="text-slate-600">'{feedbackForDifficulty}' 난이도 문제에 대한 피드백을 남겨주시면 문제를 다시 생성해 드립니다.</p>
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
  );
  
  const renderMainView = () => (
    <>
        <div className="flex justify-between items-center mb-2">
            <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                <TrendingUpIcon className="w-7 h-7 text-indigo-500"/>
                난이도별 심화 학습
            </h2>
            <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
                <XCircleIcon className="w-8 h-8"/>
            </button>
        </div>
        <p className="text-slate-600 mb-6">동일한 학습 목표와 자료를 바탕으로 난이도별 맞춤 문제를 생성하고 연습해보세요.</p>
        
        <div className="flex flex-col sm:flex-row justify-end gap-2 mb-6">
            <button
                onClick={onGenerateAll}
                disabled={!canGenerateAll || isLoadingAny}
                className="flex items-center justify-center gap-2 bg-indigo-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-indigo-700 transition disabled:bg-slate-400"
            >
                <SparklesIcon className="w-5 h-5"/>
                {isLoadingAny ? '생성 중...' : '모든 난이도 문제 생성'}
            </button>
            {hasGeneratedQuizzes && (
                <button
                    onClick={handleDownloadAllPdfs}
                    disabled={isDownloadingAll || !fontsReady}
                    className="flex items-center justify-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition disabled:bg-slate-400"
                >
                    <FileDownIcon className="w-5 h-5"/>
                    {isDownloadingAll ? '다운로드 중...' : '모든 PDF 다운로드'}
                </button>
            )}
        </div>
        
        <div className="space-y-3 max-h-[60vh] overflow-y-auto -mr-3 pr-3">
            {difficultyLevels.map(level => {
                const entry = deepDiveData[level];
                if (!entry) return null;

                const isLoading = entry.status === 'loading';
                const isEditing = editingDifficulty === level;
                const isPreviewing = previewingDifficulty === level;
                const allQuestionTypes = Object.values(ShortAnswerType);
                const isUseOriginalTextDisabled = entry.params.questionType === ShortAnswerType.DIALOGUE_ANALYSIS;

                return (
                    <div key={level} className="bg-white rounded-lg border border-slate-200 transition-shadow hover:shadow-md">
                        <div className="p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex-1 text-center sm:text-left">
                                <h3 className="text-lg font-bold text-slate-800">{level}</h3>
                                {entry.status === 'idle' && <p className="text-sm text-slate-500">대기중</p>}
                                {entry.status === 'success' && <p className="text-sm text-green-600 font-semibold">문제 생성 완료</p>}
                                {entry.status === 'error' && <p className="text-sm text-red-600 font-semibold truncate" title={entry.error || ''}>오류 발생: {entry.error}</p>}
                                {isLoading && <p className="text-sm text-primary-600 font-semibold">AI가 생성 중입니다...</p>}
                            </div>
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-center">
                                {entry.status === 'success' ? (
                                    <>
                                        <button onClick={() => {
                                            if (isPreviewing) {
                                                setPreviewingDifficulty(null);
                                            } else {
                                                setPreviewingDifficulty(level);
                                                setShowPreviewAnswers(false);
                                            }
                                        }} className="btn-sm bg-purple-100 text-purple-700 hover:bg-purple-200">
                                            <EyeIcon className="w-4 h-4"/> {isPreviewing ? '닫기' : '미리보기'}
                                        </button>
                                        <button onClick={() => handleDownloadPdf(level)} disabled={isGeneratingPdf === level || !fontsReady} className="btn-sm bg-green-100 text-green-700 hover:bg-green-200"><FileDownIcon className="w-4 h-4"/> PDF</button>
                                        <button onClick={() => handleDownloadJson(level)} className="btn-sm bg-sky-100 text-sky-700 hover:bg-sky-200"><FileDownIcon className="w-4 h-4"/> JSON</button>
                                        <button onClick={() => openFeedbackForm(level)} className="btn-sm bg-slate-200 text-slate-700 hover:bg-slate-300"><MessageSquareIcon className="w-4 h-4"/> 피드백</button>
                                    </>
                                ) : null}
                                <button onClick={() => onGenerate(level)} disabled={isLoading} className="btn-sm bg-primary-600 text-white hover:bg-primary-700">
                                    <SparklesIcon className="w-4 h-4"/> {entry.status === 'success' ? '재생성' : '문제 생성'}
                                </button>
                                <button onClick={() => setEditingDifficulty(isEditing ? null : level)} className={`btn-sm bg-slate-200 text-slate-700 hover:bg-slate-300 ${isEditing ? 'bg-slate-300' : ''}`}>
                                    <PencilIcon className="w-4 h-4"/> 조건 수정
                                </button>
                            </div>
                        </div>
                        {isPreviewing && entry.data && (
                            <div className="p-4 border-t-2 border-dashed border-slate-300 bg-slate-50/50 text-sm">
                                <div className="flex justify-end mb-4">
                                    <button onClick={() => setShowPreviewAnswers(!showPreviewAnswers)} className="text-xs font-semibold bg-white border border-slate-300 px-3 py-1 rounded-full hover:bg-slate-100">
                                        {showPreviewAnswers ? '정답/해설 숨기기' : '정답/해설 보기'}
                                    </button>
                                </div>
                                {entry.data.passage && (
                                    <div className="mb-6 p-4 bg-white rounded-lg border border-slate-200">
                                        <h4 className="font-bold text-base mb-2 text-slate-700">제시문</h4>
                                        <div className="prose prose-sm max-w-none text-slate-800">
                                          {renderWithBold(entry.data.passage)}
                                        </div>
                                    </div>
                                )}
                                <div className="space-y-6">
                                    {entry.data.quiz && entry.data.quiz.length > 0 ? (
                                        entry.data.quiz.map((q, qIndex) => (
                                            <div key={qIndex}>
                                                <p className="font-bold text-slate-800 mb-2">
                                                    <span className="text-primary-600">Q{qIndex + 1}.</span> {renderWithBold(q.question)}
                                                </p>
                                                <div className="space-y-2 pl-4">
                                                    {q.options?.map((option, oIndex) => {
                                                        const isCorrect = q.answer === oIndex;
                                                        return (
                                                            <div key={oIndex} className={`flex items-start p-2 rounded-md ${showPreviewAnswers && isCorrect ? 'bg-green-100 border border-green-200' : ''}`}>
                                                                <span className={`mr-2 font-semibold ${showPreviewAnswers && isCorrect ? 'text-green-700' : 'text-slate-600'}`}>{`①②③④⑤`[oIndex]}</span>
                                                                <span className={`flex-1 ${showPreviewAnswers && isCorrect ? 'text-green-800 font-medium' : 'text-slate-700'}`}>{renderWithBold(option)}</span>
                                                                {showPreviewAnswers && isCorrect && <CheckCircleIcon className="w-4 h-4 text-green-600 ml-2 mt-0.5 flex-shrink-0" />}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                                {showPreviewAnswers && (
                                                    <div className="mt-3 p-3 bg-amber-50 border-l-4 border-amber-300 rounded-r-md">
                                                        <p className="font-bold text-amber-800 text-xs">해설</p>
                                                        <p className="text-amber-900 mt-1">{renderWithBold(q.explanation)}</p>
                                                    </div>
                                                )}
                                            </div>
                                        ))
                                    ) : (
                                        <p className="text-slate-500 text-center py-4">AI가 이 난이도에 대한 문제를 생성하지 못했습니다. 다른 조건으로 재생성해 보세요.</p>
                                    )}
                                </div>
                            </div>
                        )}
                        {isEditing && (
                            <div className="p-4 border-t border-slate-200 bg-slate-50 space-y-4">
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 mb-1">문제 유형</label>
                                    <select value={entry.params.questionType} onChange={(e) => handleEditParamChange(level, 'questionType', e.target.value)} className="form-input-sm">
                                        {allQuestionTypes.map(type => (<option key={type} value={type}>{type}</option>))}
                                    </select>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">본문 길이 (자)</label>
                                        <input type="number" value={entry.params.passageLength} onChange={e => handleEditParamChange(level, 'passageLength', parseInt(e.target.value, 10) || 100)} min="100" max="7000" step="50" className="form-input-sm"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">문제 수</label>
                                        <input type="number" value={entry.params.numQuestions} onChange={e => handleEditParamChange(level, 'numQuestions', parseInt(e.target.value, 10) || 1)} min="1" max="10" className="form-input-sm"/>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">문제 스타일</label>
                                        <input type="text" value={entry.params.questionStemStyle} onChange={e => handleEditParamChange(level, 'questionStemStyle', e.target.value)} className="form-input-sm"/>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-slate-600 mb-1">선택지 스타일</label>
                                        <input type="text" value={entry.params.questionChoicesStyle} onChange={e => handleEditParamChange(level, 'questionChoicesStyle', e.target.value)} className="form-input-sm"/>
                                    </div>
                                </div>
                                <div className="flex items-center">
                                    <input id={`useOriginalText-${level}`} type="checkbox" checked={entry.params.useOriginalText && !isUseOriginalTextDisabled} onChange={(e) => handleEditParamChange(level, 'useOriginalText', e.target.checked)} disabled={isUseOriginalTextDisabled} className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:bg-slate-200"/>
                                    <label htmlFor={`useOriginalText-${level}`} className={`ml-2 text-sm ${isUseOriginalTextDisabled ? 'text-slate-400' : 'text-slate-700'}`}>본문 그대로 사용</label>
                                </div>
                            </div>
                        )}
                    </div>
                )
            })}
        </div>
    </>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
        <style>{`
          .btn-sm { display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; font-weight: 600; padding: 0.5rem 0.75rem; border-radius: 0.5rem; transition: background-color 0.2s; }
          .btn-sm:disabled { opacity: 0.5; cursor: not-allowed; }
          .form-input-sm { width: 100%; padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 0.5rem; font-size: 0.875rem; }
          .form-input-sm:focus { outline: none; border-color: #21a3ff; box-shadow: 0 0 0 2px rgba(33, 163, 255, 0.3); }
        `}</style>
        <div className="bg-slate-50 rounded-2xl shadow-xl w-full max-w-3xl transform transition-all p-6 sm:p-8 max-h-[90vh] flex flex-col">
            {feedbackForDifficulty ? renderFeedbackView() : renderMainView()}
        </div>
    </div>
  );
};

export default DeepDiveModal;
