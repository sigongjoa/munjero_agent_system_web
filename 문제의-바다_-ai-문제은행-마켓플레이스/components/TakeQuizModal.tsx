
import React, { useState } from 'react';
import type { QuizSet, TestResult, ExamQuestion } from '../types';
import { ExamType, Subject } from '../types';
import { XCircleIcon, FileTextIcon, FileDownIcon } from './icons';
import { generateTestPdf, convertQuizSetToTestResult } from '../services/pdfGenerator';


interface TakeQuizModalProps {
    isOpen: boolean;
    onClose: () => void;
    onStartWebQuiz: () => void;
    quizSet: QuizSet;
    fontsReady: boolean;
}

const TakeQuizModal: React.FC<TakeQuizModalProps> = ({ isOpen, onClose, onStartWebQuiz, quizSet, fontsReady }) => {
    if (!isOpen) return null;
    
    const [includeAnswersInPdf, setIncludeAnswersInPdf] = useState(true);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
    const [fontSizeOption, setFontSizeOption] = useState<'standard' | 'large'>('standard');

    const handleDownloadPdf = async () => {
        if (!fontsReady) {
            alert("PDF 폰트가 아직 로딩 중입니다. 잠시 후 다시 시도해주세요.");
            return;
        }
        setIsGeneratingPdf(true);
        try {
            const testResultForPdf = convertQuizSetToTestResult(quizSet);
            await generateTestPdf(testResultForPdf, includeAnswersInPdf, false, fontSizeOption);
        } catch (e) {
            alert(`PDF 생성 중 오류가 발생했습니다: ${e instanceof Error ? e.message : 'Unknown error'}`);
            console.error(e);
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg transform transition-all p-6 sm:p-8" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-2xl font-bold text-slate-800">어떻게 풀어볼까요?</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
                        <XCircleIcon className="w-8 h-8"/>
                    </button>
                </div>
                <p className="text-slate-600 mb-6">선택한 문제집 <strong className="text-primary-700">'{quizSet.title}'</strong>을(를) 활용할 방법을 선택하세요.</p>
                
                <div className="grid grid-cols-1 gap-4">
                    <button
                        onClick={onStartWebQuiz}
                        className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-3 hover:border-primary-500 hover:ring-2 hover:ring-primary-200 transition-all duration-200 transform hover:-translate-y-1"
                    >
                        <FileTextIcon className="w-10 h-10 text-primary-600"/>
                        <span className="font-bold text-lg text-slate-800">웹으로 바로 풀기</span>
                        <p className="text-slate-600 text-sm text-center">실제 시험처럼 집중해서 문제를 풀어봅니다.</p>
                    </button>
                    
                    <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 flex flex-col items-center gap-4">
                        <div className="flex items-center flex-wrap justify-center gap-x-6 gap-y-3">
                            <div className="flex items-center">
                                <input
                                    type="checkbox"
                                    id="include-answers-modal"
                                    checked={includeAnswersInPdf}
                                    onChange={(e) => setIncludeAnswersInPdf(e.target.checked)}
                                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <label htmlFor="include-answers-modal" className="ml-2 block text-sm font-medium text-slate-700">
                                    PDF에 정답 및 해설 포함
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
                        </div>
                         <button
                            onClick={handleDownloadPdf}
                            disabled={isGeneratingPdf || !fontsReady}
                            className="w-full p-6 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col items-center justify-center gap-3 hover:border-green-500 hover:ring-2 hover:ring-green-200 transition-all duration-200 transform hover:-translate-y-1 disabled:opacity-50"
                        >
                            <FileDownIcon className="w-10 h-10 text-green-600"/>
                            <span className="font-bold text-lg text-slate-800">
                                {isGeneratingPdf ? 'PDF 생성 중...' : !fontsReady ? '폰트 로딩 중...' : 'PDF로 만들어 풀기'}
                            </span>
                            <p className="text-slate-600 text-sm text-center">인쇄 가능한 시험지와 해설집을 생성합니다.</p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default TakeQuizModal;