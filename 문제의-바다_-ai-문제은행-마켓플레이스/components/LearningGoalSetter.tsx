
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ShortAnswerType, HighSchoolSubject } from '../types';
import { curriculumData } from '../services/curriculumData';
import { UploadIcon, XCircleIcon, TargetIcon, SparklesIcon, PlusSquareIcon, ListOrderedIcon, BookOpenIcon } from './icons';

interface LearningGoalSetterProps {
  category: string;
  onStartGeneration: (
    goal: string,
    textInput: string,
    imagesBase64: string[] | null,
    questionType: string,
    subject: { main: HighSchoolSubject; sub: string },
    passageLength: number,
    difficulty: string,
    numQuestions: number,
    useOriginalText: boolean,
    questionStemStyle: string,
    questionChoicesStyle: string,
  ) => void;
  isLoading: boolean;
}

const questionTypeCategories = {
  '핵심 개념/논리': {
    description: '핵심 개념을 정확히 이해하고, 정보 간의 논리적 관계를 파악하는 유형입니다.',
    types: [
        ShortAnswerType.CONCEPT_UNDERSTANDING, 
        ShortAnswerType.TERM_DEFINITION,
        ShortAnswerType.TRUE_FALSE,
        ShortAnswerType.FILL_IN_THE_BLANK,
        ShortAnswerType.DESCRIPTIVE,
        ShortAnswerType.CAUSE_EFFECT_ANALYSIS, 
        ShortAnswerType.SEQUENTIAL_ARRANGEMENT,
    ]
  },
  '텍스트/자료 분석': {
    description: '제시된 글, 도표, 여러 자료를 깊이 있게 분석하고 종합하는 유형입니다.',
    types: [
        ShortAnswerType.TEXT_INTERPRETATION,
        ShortAnswerType.DIALOGUE_ANALYSIS,
        ShortAnswerType.TABLE_ANALYSIS,
        ShortAnswerType.DIAGRAM_ANALYSIS,
        ShortAnswerType.DATA_INTERPRETATION, 
        ShortAnswerType.COMPARISON, 
        ShortAnswerType.INTEGRATION
    ]
  },
  '사례 적용/주장': {
    description: '이론을 실제 사례에 적용하거나, 특정 논제에 대해 찬반을 논하는 유형입니다.',
    types: [
        ShortAnswerType.CASE_APPLICATION, 
        ShortAnswerType.ARGUMENTATIVE
    ]
  },
  '수능 심화 유형': {
    description: '수능 고난도 문항과 유사한 형식의 심층 분석 문제를 생성합니다.',
    types: [
        ShortAnswerType.CSAT_KOREAN, 
        ShortAnswerType.CSAT_SOCIAL_STUDIES, 
        ShortAnswerType.CSAT_SCIENCE
    ]
  }
};

const LearningGoalSetter: React.FC<LearningGoalSetterProps> = ({ category, onStartGeneration, isLoading }) => {
  const [goal, setGoal] = useState<string>('');
  const [textInput, setTextInput] = useState<string>('');
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [questionType, setQuestionType] = useState<ShortAnswerType>(ShortAnswerType.CONCEPT_UNDERSTANDING);
  const [mainSubject, setMainSubject] = useState<HighSchoolSubject | ''>('');
  const [subSubject, setSubSubject] = useState<string>('');
  
  const [passageLength, setPassageLength] = useState(500);
  const [difficulty, setDifficulty] = useState<string>('보통');
  const [numQuestions, setNumQuestions] = useState(3);
  const [useOriginalText, setUseOriginalText] = useState<boolean>(false);
  const [questionStemStyle, setQuestionStemStyle] = useState<string>('3문장 이내로 간결하게');
  const [questionChoicesStyle, setQuestionChoicesStyle] = useState<string>('각 선택지는 20자 내외');


  const [isDragging, setIsDragging] = useState(false);

  const difficultyOptions = ['쉬움', '보통', '어려움', '매우 어려움', '수능 킬러 문항 수준'];

  const isSubSubjectRequired = useMemo(() => {
    return category === '수능 심화 유형';
  }, [category]);
  
  const isSubSubjectVisible = useMemo(() => {
    return category === '수능 심화 유형';
  }, [category]);

  const availableTypesInCategory = useMemo(() => {
    if (!category || !questionTypeCategories[category as keyof typeof questionTypeCategories]) return [];
    
    let types = questionTypeCategories[category as keyof typeof questionTypeCategories].types;

    if (category === '수능 심화 유형') {
        if (mainSubject === HighSchoolSubject.KOREAN) return [ShortAnswerType.CSAT_KOREAN];
        if (mainSubject === HighSchoolSubject.SOCIAL) return [ShortAnswerType.CSAT_SOCIAL_STUDIES];
        if (mainSubject === HighSchoolSubject.SCIENCE) return [ShortAnswerType.CSAT_SCIENCE];
        return []; // Hide all CSAT types if subject doesn't match
    }
    
    return types;
  }, [category, mainSubject]);


  useEffect(() => {
    // When category changes or available types change, reset type if it's no longer valid.
    if (!availableTypesInCategory.includes(questionType)) {
        setQuestionType(availableTypesInCategory[0] || ShortAnswerType.CONCEPT_UNDERSTANDING);
    }
  }, [availableTypesInCategory, questionType, category]);


  const handleMainSubjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMainSubject = e.target.value as HighSchoolSubject | '';
    setMainSubject(newMainSubject);
    setSubSubject(''); // Reset sub-subject when main subject changes
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    const newFiles = Array.from(files);
    
    newFiles.forEach(file => {
        if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImagePreviews(prev => [...prev, reader.result as string]);
            };
            reader.readAsDataURL(file);
        }
    });
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleFileSelect(event.target.files);
    if(fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const removeImage = (indexToRemove: number) => {
    setImagePreviews(prev => prev.filter((_, index) => index !== indexToRemove));
  }

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

  const isUseOriginalTextDisabled = questionType === ShortAnswerType.DIALOGUE_ANALYSIS;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitDisabled) return;
    const imagesDataUrls = imagePreviews.length > 0 ? imagePreviews : null;
    const finalUseOriginalText = isUseOriginalTextDisabled ? false : useOriginalText;
    onStartGeneration(goal, textInput, imagesDataUrls, questionType, { main: mainSubject as HighSchoolSubject, sub: subSubject }, passageLength, difficulty, numQuestions, finalUseOriginalText, questionStemStyle, questionChoicesStyle);
  };

  const isSubmitDisabled = isLoading || !goal.trim() || !textInput.trim() || !mainSubject || (isSubSubjectRequired && !subSubject) || !difficulty.trim();
  
  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-slate-800">새로운 학습 시작하기: <span className="text-primary-600">{category}</span></h2>
        <p className="text-slate-500 mt-1">{questionTypeCategories[category as keyof typeof questionTypeCategories].description}</p>
      </div>
      
      {/* Step 1: Goal */}
      <div>
        <label htmlFor="goal" className="block text-lg font-bold text-slate-700 mb-2">1. 학습 목표 설정</label>
        <div className="relative">
            <TargetIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
            <input
              type="text"
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
              placeholder="예: 토익 파트 5 문법 정복하기, 한국사 근현대사 마스터"
              required
            />
        </div>
      </div>
      
      {/* Step 2: Learning Material */}
      <div>
        <label className="block text-lg font-bold text-slate-700 mb-2">2. 학습 자료 제공</label>
        
        <div className="space-y-2">
            <label htmlFor="text-input" className="block text-sm font-medium text-slate-600">텍스트 입력 (필수)</label>
            <textarea
                id="text-input"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                className="w-full h-48 p-4 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition"
                placeholder="여기에 진단 테스트를 만들고 싶은 내용을 붙여넣으세요. (예: 교과서 내용, 기사, 논문)"
                required
            />
             <div className="relative flex items-start mt-2">
                <div className="flex h-6 items-center">
                    <input
                    id="use-original-text"
                    aria-describedby="use-original-text-description"
                    name="use-original-text"
                    type="checkbox"
                    checked={useOriginalText && !isUseOriginalTextDisabled}
                    onChange={(e) => setUseOriginalText(e.target.checked)}
                    disabled={isUseOriginalTextDisabled}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:bg-slate-200 disabled:cursor-not-allowed"
                    />
                </div>
                <div className="ml-3 text-sm leading-6">
                    <label htmlFor="use-original-text" className={`font-medium ${isUseOriginalTextDisabled ? 'text-slate-400' : 'text-slate-700'}`}>
                    입력한 본문 그대로 사용하기
                    </label>
                    <p id="use-original-text-description" className="text-slate-500 text-xs">
                    AI가 텍스트를 요약/확장하지 않습니다. 이미지 첨부 시, 본문 내 적절한 위치에 자동 삽입됩니다.
                    </p>
                    {isUseOriginalTextDisabled && <p className="text-xs text-slate-500"> (대화문 분석 유형은 지원되지 않음)</p>}
                </div>
            </div>
        </div>

        <div 
            className="mt-4 space-y-2"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
        >
            <label className="block text-sm font-medium text-slate-600">이미지 추가 (선택)</label>
            <p className="text-xs text-slate-500 mb-2">텍스트와 함께 분석할 이미지가 있다면 업로드하세요.</p>
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageChange}
              className="hidden"
              ref={fileInputRef}
            />
            <div 
                className={`w-full p-4 border-2 border-dashed rounded-lg transition-colors ${isDragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300'}`}
            >
                {imagePreviews.length === 0 ? (
                    <div onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center h-32 cursor-pointer">
                        <UploadIcon className="w-10 h-10 text-slate-400 mb-2" />
                        <p className="font-semibold text-slate-700">이미지를 선택하거나 여기로 드래그하세요</p>
                        <p className="text-sm text-slate-500">여러 장의 사진을 한 번에 올릴 수 있습니다.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {imagePreviews.map((preview, index) => (
                            <div key={index} className="relative aspect-square group">
                                <img src={preview} alt={`Uploaded preview ${index + 1}`} className="w-full h-full object-cover rounded-md border border-slate-200" />
                                <button type="button" onClick={() => removeImage(index)} className="absolute -top-2 -right-2 bg-white rounded-full p-0.5 shadow-md hover:bg-red-100 transition opacity-0 group-hover:opacity-100">
                                    <XCircleIcon className="w-6 h-6 text-red-500"/>
                                </button>
                            </div>
                        ))}
                        <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex flex-col items-center justify-center aspect-square border-2 border-dashed border-slate-300 rounded-md cursor-pointer hover:bg-slate-50 transition text-slate-500 hover:text-primary-600 hover:border-primary-400"
                            aria-label="Add more images"
                        >
                            <PlusSquareIcon className="w-8 h-8" />
                            <span className="text-xs font-semibold mt-1">이미지 추가</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* Step 3: Generation Conditions */}
      <div>
        <label className="block text-lg font-bold text-slate-700 mb-2">3. 생성할 문제 조건 선택</label>
        
        <div className="space-y-6">
            <div className={`grid grid-cols-1 ${isSubSubjectVisible ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-4`}>
                 <div className="relative sm:col-span-1">
                    <ListOrderedIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                    <select
                      id="questionType"
                      value={questionType}
                      onChange={(e) => setQuestionType(e.target.value as ShortAnswerType)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition appearance-none"
                    >
                      {availableTypesInCategory.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                </div>
                <div className="relative sm:col-span-1">
                    <BookOpenIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                     <select
                        id="mainSubject"
                        value={mainSubject}
                        onChange={handleMainSubjectChange}
                        className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition appearance-none"
                        required
                     >
                        <option value="" disabled>교과 과목</option>
                        {Object.values(HighSchoolSubject).map(subject => (
                            <option key={subject} value={subject}>{subject}</option>
                        ))}
                    </select>
                </div>
                 {isSubSubjectVisible && (
                    <div className="relative sm:col-span-1">
                        <BookOpenIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
                        <select
                            id="subSubject"
                            value={subSubject}
                            onChange={(e) => setSubSubject(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition appearance-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                            disabled={!mainSubject || !curriculumData[mainSubject] || curriculumData[mainSubject]?.length === 0}
                            required={isSubSubjectRequired}
                        >
                            <option value="" disabled>
                                세부 과목 (필수)
                            </option>
                            {mainSubject && curriculumData[mainSubject]?.map(sub => (
                                <option key={sub} value={sub}>{sub}</option>
                            ))}
                        </select>
                    </div>
                 )}
            </div>
             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-4">
                <div>
                    <label htmlFor="passageLength" className="block text-sm font-medium text-slate-700 mb-2 text-center">본문 길이 (글자 수)</label>
                    <input
                        type="number"
                        id="passageLength"
                        value={passageLength}
                        onChange={e => setPassageLength(Math.max(100, Math.min(7000, parseInt(e.target.value, 10) || 100)))}
                        min="100"
                        max="7000"
                        step="50"
                        className="w-full p-2 border border-slate-300 rounded-lg text-center"
                    />
                     <p className="text-xs text-slate-500 mt-1 text-center">최소 100자, 최대 7000자</p>
                </div>
                 <div>
                    <label htmlFor="difficulty" className="block text-sm font-medium text-slate-700 mb-2 text-center">문제 난이도</label>
                    <select
                        id="difficulty"
                        value={difficulty}
                        onChange={e => setDifficulty(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-center"
                        required
                    >
                        {difficultyOptions.map(option => (
                            <option key={option} value={option}>{option}</option>
                        ))}
                    </select>
                </div>
                <div>
                    <label htmlFor="numQuestions" className="block text-sm font-medium text-slate-700 mb-2 text-center">문제 수</label>
                    <input type="number" id="numQuestions" value={numQuestions} onChange={e => setNumQuestions(Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1)))} min="1" max="10" className="w-full p-2 border border-slate-300 rounded-lg text-center"/>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                <div>
                    <label htmlFor="questionStemStyle" className="block text-sm font-medium text-slate-700 mb-2 text-center">문제(발문) 스타일</label>
                    <input
                        type="text"
                        id="questionStemStyle"
                        value={questionStemStyle}
                        onChange={e => setQuestionStemStyle(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-center"
                        placeholder="예: 3문장 이내로 간결하게"
                    />
                    <p className="text-xs text-slate-500 mt-1 text-center">문제의 길이, 톤 등을 지시하세요.</p>
                </div>
                <div>
                    <label htmlFor="questionChoicesStyle" className="block text-sm font-medium text-slate-700 mb-2 text-center">선택지(보기) 스타일</label>
                    <input
                        type="text"
                        id="questionChoicesStyle"
                        value={questionChoicesStyle}
                        onChange={e => setQuestionChoicesStyle(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-center"
                        placeholder="예: 각 선택지는 20자 내외"
                    />
                    <p className="text-xs text-slate-500 mt-1 text-center">선택지의 길이, 형식 등을 지시하세요.</p>
                </div>
            </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isSubmitDisabled}
        className="w-full flex items-center justify-center gap-3 bg-primary-600 text-white font-bold py-3.5 px-4 rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-all duration-200 disabled:bg-slate-400 disabled:cursor-not-allowed text-lg"
      >
        <SparklesIcon className="w-6 h-6" />
        {isLoading ? '생성 중...' : 'AI 학습 시작하기'}
      </button>
    </form>
  );
};

export default LearningGoalSetter;
