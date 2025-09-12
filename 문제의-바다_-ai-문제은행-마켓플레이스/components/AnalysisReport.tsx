

import React, { useState } from 'react';
import type { AnalysisResult, QuizData, HighSchoolSubject } from '../types';
import { BarChartIcon, TargetIcon, FileDownIcon, MessageSquareIcon, XCircleIcon, UploadIcon, PlusSquareIcon } from './icons';
import { generateTestPdf, convertAiQuizToTestResult } from '../services/pdfGenerator';

interface AnalysisReportProps {
  result: AnalysisResult;
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
  onStartFocusedPractice: () => void;
  onStartOver: () => void;
  onRegenerateWithFeedback: (feedback: string, newImages: string[] | null) => void;
}

const AnalysisReport: React.FC<AnalysisReportProps> = ({ 
    result, 
    onStartFocusedPractice, 
    onStartOver,
    generatedQuizData,
    userInput,
    fontsReady,
    onRegenerateWithFeedback,
}) => {
  
  const percentage = Math.round((result.score / result.totalQuestions) * 100);
  const [includeAnswers, setIncludeAnswers] = useState(true);
  const [includeConditions, setIncludeConditions] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [fontSizeOption, setFontSizeOption] = useState<'standard' | 'large'>('standard');
  
  // Feedback Modal State
  const [isFeedbackModalOpen, setIsFeedbackModalOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackImages, setFeedbackImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const feedbackFileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadPdf = async () => {
    if (!fontsReady) {
        alert("PDF 폰트가 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
        return;
    }
    if (!generatedQuizData || !userInput) {
        alert("PDF를 생성할 퀴즈 데이터가 없습니다.");
        return;
    }

    setIsGeneratingPdf(true);
    try {
        const testResultForPdf = convertAiQuizToTestResult(generatedQuizData, userInput);
        await generateTestPdf(testResultForPdf, includeAnswers, includeConditions, fontSizeOption);
    } catch (e) {
        alert(`PDF 생성 중 오류가 발생했습니다: ${e instanceof Error ? e.message : 'Unknown error'}`);
        console.error(e);
    } finally {
        setIsGeneratingPdf(false);
    }
  };
  
    // Feedback Modal Logic
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

  return (
    <>
    <div className="bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-slate-200 animate-fade-in">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-1">진단 결과 분석 리포트</h2>
        <p className="text-slate-500">AI가 당신의 취약점을 분석했습니다.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-center">
        <div className="bg-primary-50 p-6 rounded-xl border-2 border-primary-200">
            <h3 className="text-lg font-bold text-primary-800 flex items-center justify-center gap-2"><BarChartIcon className="w-5 h-5"/>진단 점수</h3>
            <p className="text-5xl font-extrabold text-primary-600 my-2">
                {result.score} / {result.totalQuestions}
            </p>
            <p className="text-primary-700 font-semibold">{percentage}점</p>
        </div>
        <div className="bg-amber-50 p-6 rounded-xl border-2 border-amber-200">
            <h3 className="text-lg font-bold text-amber-800 flex items-center justify-center gap-2"><TargetIcon className="w-5 h-5"/>주요 취약점</h3>
            {result.weaknesses.length > 0 ? (
                <div className="mt-3 space-y-1">
                    {result.weaknesses.map((weakness, index) => (
                         <span key={index} className="inline-block bg-amber-200 text-amber-800 text-sm font-semibold mr-2 px-3 py-1.5 rounded-full">
                            #{weakness}
                        </span>
                    ))}
                </div>
            ) : (
                <p className="mt-4 text-amber-700 font-semibold">축하합니다! 발견된 취약점이 없습니다.</p>
            )}
        </div>
      </div>

      <div className="mt-10 text-center">
          <h3 className="text-xl font-bold text-slate-800">다음 단계</h3>
          <p className="text-slate-600 mt-1">
            {result.weaknesses.length > 0
              ? "분석된 약점을 보완하기 위한 맞춤형 문제를 풀어보거나, 전체 시험을 PDF로 저장하여 복습하세요."
              : "훌륭합니다! 전체 시험을 PDF로 저장하거나 새로운 주제로 학습을 시작해 보세요."}
          </p>
      </div>
      
      {generatedQuizData?.suggestedLinks && generatedQuizData.suggestedLinks.length > 0 && (
        <div className="mt-8">
            <h3 className="text-xl font-bold text-slate-800 text-center mb-4">AI 추천 학습 자료</h3>
            <div className="p-4 bg-slate-50/50 rounded-lg border border-slate-200">
                <ul className="space-y-3">
                    {generatedQuizData.suggestedLinks.map((link, index) => (
                        <li key={index} className="p-3 bg-white rounded-md border border-slate-200 shadow-sm">
                            <a href={link.uri} target="_blank" rel="noopener noreferrer" className="font-semibold text-blue-600 hover:underline">
                                {link.title}
                            </a>
                            <p className="text-xs text-slate-500 mt-1 truncate">{link.uri}</p>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
      )}

      <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 flex-wrap">
            <button 
                onClick={handleDownloadPdf} 
                disabled={isGeneratingPdf || !fontsReady} 
                className="w-full sm:w-auto flex items-center justify-center gap-2 bg-green-600 text-white font-bold py-2.5 px-6 rounded-lg hover:bg-green-700 transition disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
                <FileDownIcon className="w-5 h-5" />
                {isGeneratingPdf ? 'PDF 생성 중...' : !fontsReady ? '폰트 로딩 중...' : 'PDF 다운로드'}
            </button>
            <div className="flex items-center gap-x-6 gap-y-2 flex-wrap justify-center">
                <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="include-answers"
                        checked={includeAnswers}
                        onChange={(e) => setIncludeAnswers(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="include-answers" className="ml-2 block text-sm font-medium text-slate-700">
                        해설 포함
                    </label>
                </div>
                <div className="flex items-center">
                    <input
                        type="checkbox"
                        id="include-conditions-report"
                        checked={includeConditions}
                        onChange={(e) => setIncludeConditions(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    <label htmlFor="include-conditions-report" className="ml-2 block text-sm font-medium text-slate-700">
                        문제 조건 포함
                    </label>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">글자 크기:</span>
                    <div className="flex rounded-lg border border-slate-300 p-0.5 bg-slate-100">
                        <button
                            onClick={() => setFontSizeOption('standard')}
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                fontSizeOption === 'standard' ? 'bg-white shadow-sm text-primary-700 font-semibold' : 'text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            기본
                        </button>
                        <button
                            onClick={() => setFontSizeOption('large')}
                            className={`px-3 py-1 text-sm rounded-md transition-colors ${
                                fontSizeOption === 'large' ? 'bg-white shadow-sm text-primary-700 font-semibold' : 'text-slate-600 hover:bg-slate-200'
                            }`}
                        >
                            크게
                        </button>
                    </div>
                </div>
                 {userInput && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-700">난이도:</span>
                        <span className="px-3 py-1 text-sm rounded-md bg-slate-200 text-slate-800 font-semibold">{userInput.difficulty}</span>
                    </div>
                )}
            </div>
        </div>
      </div>

      <div className="mt-8 pt-6 border-t border-slate-200 flex flex-col sm:flex-row gap-4">
        <button
            onClick={() => setIsFeedbackModalOpen(true)}
            className="w-full bg-slate-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-700 transition flex items-center justify-center gap-2"
        >
            <MessageSquareIcon className="w-5 h-5"/>
            피드백 및 재요청
        </button>
        {result.weaknesses.length > 0 && (
            <button
                onClick={onStartFocusedPractice}
                className="w-full bg-primary-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-primary-700 transition"
            >
                약점 집중 공략 학습 시작
            </button>
        )}
        <button
            onClick={onStartOver}
            className="w-full bg-slate-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-slate-700 transition"
        >
            새로운 학습 시작하기
        </button>
      </div>
    </div>
    {isFeedbackModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div
                className="bg-white rounded-2xl shadow-xl w-full max-w-lg transform transition-all p-6 sm:p-8 max-h-[90vh] flex flex-col"
                onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
            >
                <div className="flex justify-between items-center mb-4 flex-shrink-0">
                    <h2 className="text-2xl font-bold text-slate-800">피드백 및 재요청</h2>
                    <button onClick={closeAndResetFeedbackModal} className="text-slate-500 hover:text-slate-800">
                        <XCircleIcon className="w-8 h-8"/>
                    </button>
                </div>
                <div className="space-y-4 overflow-y-auto pr-2 flex-grow">
                    <p className="text-slate-600">AI가 생성한 문제가 만족스럽지 않으신가요? 구체적인 피드백을 남겨주시면 문제를 다시 생성해 드립니다.</p>
                    <div>
                        <label htmlFor="feedback-text" className="block text-sm font-medium text-slate-700 mb-1">피드백</label>
                        <textarea id="feedback-text" value={feedbackText} onChange={(e) => setFeedbackText(e.target.value)} className="w-full h-24 p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500" placeholder="예: 문제가 너무 쉬워요. 좀 더 어렵게 만들어주세요. / 보기의 길이가 너무 짧습니다. 더 길게 작성해주세요." />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">이미지 추가 (선택)</label>
                        <input type="file" accept="image/*" multiple onChange={handleFeedbackImageChange} className="hidden" ref={feedbackFileInputRef} />
                        <div className={`w-full p-4 border-2 border-dashed rounded-lg transition-colors ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300'}`}>
                             {feedbackImages.length === 0 ? (
                                <div onClick={() => feedbackFileInputRef.current?.click()} className="flex flex-col items-center justify-center h-24 cursor-pointer">
                                    <UploadIcon className="w-8 h-8 text-slate-400 mb-2" />
                                    <p className="font-semibold text-slate-700 text-sm">새 이미지를 선택하거나 여기로 드래그하세요</p>
                                </div>
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
    </>
  );
};

export default AnalysisReport;
