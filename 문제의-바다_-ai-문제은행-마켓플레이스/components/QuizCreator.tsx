

import React, { useState, useRef } from 'react';
import type { QuizQuestion, QuizSet } from '../types';
import { PlusSquareIcon, TrashIcon, CheckCircleIcon, SparklesIcon, XCircleIcon, UploadIcon } from './icons';
import { generateBulkQuestions } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';

interface QuizCreatorProps {
    onPublish: (quizSet: Omit<QuizSet, 'id' | 'author' | 'rating' | 'downloads' | 'createdAt'>) => void;
    isLoading: boolean;
}

const emptyQuestion: QuizQuestion = {
    question: '',
    options: ['', '', '', ''],
    answer: 0,
    explanation: ''
};

const QuizCreator: React.FC<QuizCreatorProps> = ({ onPublish, isLoading }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [price, setPrice] = useState(0);
    const [tags, setTags] = useState('');
    const [questions, setQuestions] = useState<QuizQuestion[]>([emptyQuestion]);
    
    // State for AI Generation Modal
    const [isAIGeneratorOpen, setIsAIGeneratorOpen] = useState(false);
    const [aiTopic, setAiTopic] = useState('');
    const [aiContext, setAiContext] = useState('');
    const [aiNumQuestions, setAiNumQuestions] = useState(3);
    const [isGenerating, setIsGenerating] = useState(false);
    const [aiImagePreviews, setAiImagePreviews] = useState<string[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const aiFileInputRef = useRef<HTMLInputElement>(null);


    const handleQuestionChange = (qIndex: number, field: keyof QuizQuestion, value: any) => {
        const newQuestions = [...questions];
        newQuestions[qIndex] = { ...newQuestions[qIndex], [field]: value };
        setQuestions(newQuestions);
    };

    const handleOptionChange = (qIndex: number, oIndex: number, value: string) => {
        const newQuestions = [...questions];
        newQuestions[qIndex].options[oIndex] = value;
        setQuestions(newQuestions);
    };

    const addQuestion = () => {
        setQuestions([...questions, { ...emptyQuestion }]);
    };

    const removeQuestion = (qIndex: number) => {
        if (questions.length > 1) {
            const newQuestions = questions.filter((_, index) => index !== qIndex);
            setQuestions(newQuestions);
        } else {
            alert("최소 1개의 문제는 필요합니다.");
        }
    };
    
    const handleFileSelect = (files: FileList | null) => {
        if (!files) return;
        const newFiles = Array.from(files);
        newFiles.forEach(file => {
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    setAiImagePreviews(prev => [...prev, reader.result as string]);
                };
                reader.readAsDataURL(file);
            }
        });
    };

    const handleAIImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        handleFileSelect(event.target.files);
        if (aiFileInputRef.current) {
            aiFileInputRef.current.value = "";
        }
    };

    const removeAIImage = (indexToRemove: number) => {
        setAiImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
    };
    
    const handleDragEvents = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        handleDragEvents(e);
        if (!isDragging) setIsDragging(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        handleDragEvents(e);
        setIsDragging(false);
    };
    
    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        handleDragEvents(e);
        setIsDragging(false);
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            handleFileSelect(files);
        }
    };

    const resetAIGenerator = () => {
        setIsAIGeneratorOpen(false);
        setAiTopic('');
        setAiContext('');
        setAiImagePreviews([]);
    };

    const handleAIGenerate = async () => {
        if (!aiTopic.trim()) {
            alert("주제를 입력해주세요.");
            return;
        }
        if (!aiContext.trim() && aiImagePreviews.length === 0) {
            alert("문제 생성을 위한 참고 내용으로 텍스트나 이미지를 제공해주세요.");
            return;
        }

        setIsGenerating(true);
        try {
            const imagesDataUrls = aiImagePreviews.length > 0 ? aiImagePreviews : null;
            const newAIQuestions = await generateBulkQuestions(aiTopic, aiContext, aiNumQuestions, imagesDataUrls);
            
            const isFirstQuestionEmpty = questions.length === 1 && 
                                       questions[0].question.trim() === '' && 
                                       questions[0].options.every(o => o.trim() === '') && 
                                       questions[0].explanation.trim() === '';

            if (isFirstQuestionEmpty) {
                setQuestions(newAIQuestions);
            } else {
                setQuestions(prev => [...prev, ...newAIQuestions]);
            }
            
            resetAIGenerator();
        } catch (error) {
            console.error("AI question generation failed:", error);
            alert(`AI 문제 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : 'Unknown error'}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Basic validation
        if (!title.trim() || !description.trim()) {
            alert("제목과 설명을 입력해주세요.");
            return;
        }
        if (questions.some(q => !q.question.trim() || q.options.some(o => !o.trim()) || !q.explanation.trim())) {
            alert("모든 문제, 선택지, 해설을 채워주세요.");
            return;
        }

        const quizSetData = {
            title,
            description,
            price,
            tags: tags.split(',').map(tag => tag.trim()).filter(Boolean),
            questions
        };
        onPublish(quizSetData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-bold text-slate-800">나만의 문제집 만들기</h1>
                <p className="text-slate-500 mt-1">지식을 공유하고 수익을 창출해보세요.</p>
            </div>

            {/* Quiz Set Details */}
            <div className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 space-y-4">
                 <h2 className="text-xl font-bold text-slate-800">문제집 정보</h2>
                 <div>
                    <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">제목</label>
                    <input type="text" id="title" value={title} onChange={e => setTitle(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-lg" placeholder="예: 토익 필수 단어 100제" />
                 </div>
                 <div>
                    <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">설명</label>
                    <textarea id="description" value={description} onChange={e => setDescription(e.target.value)} required className="w-full p-2 border border-slate-300 rounded-lg h-24" placeholder="이 문제집에 대한 설명을 입력하세요." />
                 </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label htmlFor="price" className="block text-sm font-medium text-slate-700 mb-1">가격 (원)</label>
                        <input type="number" id="price" value={price} onChange={e => setPrice(parseInt(e.target.value, 10) || 0)} min="0" step="500" className="w-full p-2 border border-slate-300 rounded-lg" />
                        <p className="text-xs text-slate-500 mt-1">무료로 공유하려면 0으로 설정하세요.</p>
                     </div>
                     <div>
                        <label htmlFor="tags" className="block text-sm font-medium text-slate-700 mb-1">태그</label>
                        <input type="text" id="tags" value={tags} onChange={e => setTags(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg" placeholder="예: 토익, 단어, 영어 (쉼표로 구분)" />
                     </div>
                 </div>
            </div>
            
            {/* Questions List */}
            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-slate-800">문제 목록</h2>
                    <button type="button" onClick={() => setIsAIGeneratorOpen(true)} className="flex items-center justify-center gap-2 bg-primary-100 text-primary-700 font-bold py-2 px-4 rounded-lg hover:bg-primary-200 transition">
                        <SparklesIcon className="w-5 h-5"/>
                        AI로 문제 대량 생성
                    </button>
                </div>
                {questions.map((q, qIndex) => (
                    <div key={qIndex} className="p-6 bg-white rounded-xl shadow-sm border border-slate-200 relative animate-fade-in">
                        <button type="button" onClick={() => removeQuestion(qIndex)} className="absolute top-4 right-4 text-slate-400 hover:text-red-500 transition">
                            <TrashIcon className="w-6 h-6"/>
                        </button>
                        <h3 className="font-bold text-lg mb-4 text-primary-700">문제 {qIndex + 1}</h3>
                        <div className="space-y-4">
                            <textarea value={q.question} onChange={e => handleQuestionChange(qIndex, 'question', e.target.value)} required className="w-full p-2 border border-slate-300 rounded-lg" placeholder="문제를 입력하세요." />
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {q.options.map((opt, oIndex) => (
                                    <div key={oIndex} className="relative">
                                        <input type="radio" name={`answer_${qIndex}`} id={`answer_${qIndex}_${oIndex}`} checked={q.answer === oIndex} onChange={() => handleQuestionChange(qIndex, 'answer', oIndex)} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 accent-primary-600 cursor-pointer" />
                                        <input type="text" value={opt} onChange={e => handleOptionChange(qIndex, oIndex, e.target.value)} required className="w-full p-2 pl-9 border border-slate-300 rounded-lg" placeholder={`선택지 ${oIndex + 1}`} />
                                    </div>
                                ))}
                            </div>
                            <textarea value={q.explanation} onChange={e => handleQuestionChange(qIndex, 'explanation', e.target.value)} required className="w-full p-2 border border-slate-300 rounded-lg" placeholder="해설을 입력하세요." />
                        </div>
                    </div>
                ))}
                 <button type="button" onClick={addQuestion} className="w-full flex items-center justify-center gap-2 bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-lg hover:bg-slate-300 transition">
                    <PlusSquareIcon className="w-5 h-5"/>문제 추가하기
                 </button>
            </div>

            {/* Submit Button */}
            <button
                type="submit"
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-3 bg-primary-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed"
            >
                {isLoading ? '등록 중...' : <><CheckCircleIcon className="w-6 h-6"/> 마켓에 등록하기</>}
            </button>
            
            {/* AI Generator Modal */}
            {isAIGeneratorOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in">
                    <div 
                        className="bg-white rounded-2xl shadow-xl w-full max-w-2xl transform transition-all p-6 sm:p-8 max-h-[90vh] flex flex-col"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {isGenerating ? (
                            <LoadingSpinner message="AI가 문제들을 생성하고 있습니다..." />
                        ) : (
                            <>
                                <div className="flex justify-between items-center mb-6 flex-shrink-0">
                                    <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3"><SparklesIcon className="w-7 h-7 text-primary-500"/>AI 문제 생성기</h2>
                                    <button onClick={resetAIGenerator} className="text-slate-500 hover:text-slate-800">
                                        <XCircleIcon className="w-8 h-8"/>
                                    </button>
                                </div>
                                <div className="space-y-4 overflow-y-auto pr-2 flex-grow">
                                    <div>
                                        <label htmlFor="ai-topic" className="block text-sm font-medium text-slate-700 mb-1">주제</label>
                                        <input type="text" id="ai-topic" value={aiTopic} onChange={e => setAiTopic(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg" placeholder="예: 한국사, 삼국시대" />
                                    </div>
                                    <div>
                                        <label htmlFor="ai-context" className="block text-sm font-medium text-slate-700 mb-1">참고 내용 (텍스트)</label>
                                        <textarea id="ai-context" value={aiContext} onChange={e => setAiContext(e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg h-32" placeholder="AI가 문제를 만드는 데 참고할 내용을 여기에 붙여넣으세요. 내용이 상세할수록 좋습니다." />
                                    </div>
                                     <div
                                        className={`p-4 rounded-lg border-2 border-dashed transition-colors ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300'}`}
                                     >
                                        <label className="block text-sm font-medium text-slate-700 mb-2">참고 내용 (이미지, 선택)</label>
                                        <input type="file" accept="image/*" multiple onChange={handleAIImageChange} className="hidden" ref={aiFileInputRef} />
                                        {aiImagePreviews.length === 0 ? (
                                            <div onClick={() => aiFileInputRef.current?.click()} className="flex flex-col items-center justify-center h-24 cursor-pointer">
                                                <UploadIcon className="w-8 h-8 text-slate-400 mb-2" />
                                                <p className="font-semibold text-slate-700 text-sm">이미지를 선택하거나 여기로 드래그하세요</p>
                                            </div>
                                        ) : (
                                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                                {aiImagePreviews.map((preview, index) => (
                                                    <div key={index} className="relative aspect-square group">
                                                        <img src={preview} alt="Preview" className="w-full h-full object-cover rounded-md border" />
                                                        <button type="button" onClick={() => removeAIImage(index)} className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-md hover:bg-red-100 transition opacity-0 group-hover:opacity-100">
                                                            <XCircleIcon className="w-6 h-6 text-red-500"/>
                                                        </button>
                                                    </div>
                                                ))}
                                                <button type="button" onClick={() => aiFileInputRef.current?.click()} className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-slate-300 rounded-md cursor-pointer hover:bg-slate-50 transition text-slate-500 hover:text-primary-600">
                                                    <PlusSquareIcon className="w-6 h-6" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label htmlFor="ai-num" className="block text-sm font-medium text-slate-700 mb-1">생성할 문제 수</label>
                                        <input type="number" id="ai-num" value={aiNumQuestions} onChange={e => setAiNumQuestions(parseInt(e.target.value, 10))} min="1" max="10" className="w-full p-2 border border-slate-300 rounded-lg" />
                                    </div>
                                </div>
                                <div className='flex-shrink-0 pt-4'>
                                <button
                                    onClick={handleAIGenerate}
                                    disabled={isGenerating || !aiTopic.trim() || (!aiContext.trim() && aiImagePreviews.length === 0)}
                                    className="w-full flex items-center justify-center gap-3 bg-primary-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-primary-700 disabled:bg-slate-400"
                                >
                                    생성 시작
                                </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </form>
    );
};

export default QuizCreator;