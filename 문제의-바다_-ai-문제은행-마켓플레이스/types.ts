




export type ActiveView = 
  'ai-create-concepts' |
  'ai-create-analysis' |
  'ai-create-application' |
  'ai-create-csat' |
  'ai-quiz-display' | 
  'ai-analysis-report' |
  'knowledge-base' |
  'good-question-guide' |
  'subject-korean' |
  'subject-science' |
  'subject-english' |
  'subject-social' |
  'subject-ethics' |
  'subject-math' |
  'my-page' |
  'persona-planner' |
  'persona-exam-mode' |
  'persona-test-report' |
  'exam-selection' |
  'exam-mode' |
  'test-report';

export enum ShortAnswerType {
    TEXT_INTERPRETATION = '사료(텍스트) 해석형',
    DIALOGUE_ANALYSIS = '대화문 분석형',
    TABLE_ANALYSIS = '표 분석형',
    DIAGRAM_ANALYSIS = '도표/그림 분석형',
    DATA_INTERPRETATION = '그래프·통계 자료 해석형',
    CONCEPT_UNDERSTANDING = '개념 이해형',
    TERM_DEFINITION = '용어 정의형',
    TRUE_FALSE = 'O/X (참/거짓)형',
    FILL_IN_THE_BLANK = '빈칸 채우기형',
    DESCRIPTIVE = '서술형',
    COMPARISON = '비교·대조형',
    CASE_APPLICATION = '사례 적용형',
    SEQUENTIAL_ARRANGEMENT = '순서 배열형',
    CAUSE_EFFECT_ANALYSIS = '원인·결과 분석형',
    ARGUMENTATIVE = '논쟁형(찬반형)',
    INTEGRATION = '통합·융합형',
    CSAT_SOCIAL_STUDIES = '수능 심화: 사회 (통계/도표 분석형)',
    CSAT_SCIENCE = '수능 심화: 과학 (실험/자료 해석형)',
    CSAT_KOREAN = '수능 심화: 국어 (논지 비교형)',
}

export enum HighSchoolSubject {
    KOREAN = '국어',
    SOCIAL = '사회',
    ETHICS = '도덕',
    MATH = '수학',
    SCIENCE = '과학',
    ENGLISH = '영어',
}

export enum ExamType {
    SUNEUNG = '수능',
    PSAT = 'PSAT',
    NCS = 'NCS',
    COMMUNITY = '커뮤니티',
}

export enum Subject {
    KOREAN = '국어',
    ENGLISH = '영어',
    LOGIC = '언어논리',
    SITUATION = '상황판단',
    COMMUNICATION = '의사소통능력',
    MATH_SKILLS = '수리능력',
}

export interface TestConfig {
    examType: ExamType;
    subject: Subject;
    numQuestions: number;
}

export interface ExamQuestion {
    exam: string;
    year: number;
    source: string;
    subject: string;
    section: string;
    question_id: string;
    stem: string;
    choices: string[];
    answer_index: number;
    explanation: string;
    tags: string[];
    difficulty: number;
}

// For QuizDisplay state
export interface UserAnswers {
  [questionIndex: number]: number; // key: question index, value: selected choice index
}

export interface TestResult {
    passage?: string; // Optional passage for AI-generated tests
    images?: string[]; // Optional images for AI-generated tests
    dataTable?: string[][]; // Optional data table for CSAT-style questions
    dialogue?: { speaker: string; line: string }[]; // Optional dialogue for conversation-based questions
    title?: string;
    config: TestConfig;
    questions: ExamQuestion[];
    userAnswers: UserAnswers;
    score: number;
    totalQuestions: number;
    timeTaken: number;
    date: string; // ISO date string
    generationConditions?: {
        goal: string;
        questionType: string;
        subject: { main: HighSchoolSubject; sub: string };
        passageLength: number;
        difficulty: string;
        numQuestions: number;
        useOriginalText?: boolean;
        questionStemStyle?: string;
        questionChoicesStyle?: string;
    };
    suggestedLinks?: { title: string; uri: string; }[];
    userProvidedLinks?: string[];
}

export interface Review {
    id: string;
    quizSetId: string;
    questionIndex: number;
    reviewerId: string;
    evaluation: {
        learningObjectiveFit: boolean | null;
        formatStructureAppropriate: boolean | null;
        thinkingProcessInducement: boolean | null;
        clarityAndAccuracy: boolean | null;
        expressionSmoothness: boolean | null;
    };
    comment: string;
    createdAt: string; // ISO date string
}

export interface PersonaAnalysis {
    analysis: {
        examName: string;
        examSubjects: string[];
        examFormat: string;
        commonThemes: {
            subject: string;
            themes: string[];
        }[];
    };
    strategy: {
        focus: string;
        recommendation: string;
    }[];
}

export interface ChatMessage {
    id: string;
    sender: 'user' | 'ai' | 'system';
    text?: string;
    analysis?: PersonaAnalysis;
    isLoading?: boolean;
    sources?: { uri: string; title: string }[];
}


export interface ParsedExamData {
    subject: string;
    passageParagraphs: string[];
    questions: {
        questionText: string;
        options: string[];
    }[];
    imagePlacements?: {
        paragraphIndex: number;
        imageIndex: number;
        caption: string;
    }[];
}


export interface Author {
    id: string;
    name: string;
    isVerified: boolean;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer: number; // 0-based index of the correct option
  explanation: string;
}

export interface QuizSet {
    id:string;
    title: string;
    description: string;
    author: Author;
    price: number; // 0 for free
    rating: number; // average rating 0-5
    downloads: number;
    tags: string[];
    questions: QuizQuestion[];
    createdAt: string; // ISO date string
}

// For AI-generated custom quizzes
export interface AIGeneratedQuestion {
  question: string;
  options: string[];
  answer: number;
  explanation: string;
  knowledgeTag: string;
  shorts_script?: ShortsScript;
}

export interface ShortsScene {
  section: '본문 요약' | '퀴즈 타임' | '마무리' | '훅' | '몰입' | '문제 제시' | '정답 공개' | 'CTA';
  caption: string;
  visual_suggestion: string;
}

export interface ShortsScript {
  title: string;
  scenes: ShortsScene[];
}

export interface QuizData {
  passage?: string;
  dataTable?: string[][];
  dialogue?: { speaker: string; line: string }[];
  quiz: AIGeneratedQuestion[];
  passage_shorts_script?: ShortsScript;
  tags?: string[];
  suggestedLinks?: { title: string; uri: string; }[];
  seoTitle?: string;
  seoDescription?: string;
}

// For Custom Quiz Flow
export interface AnalysisResult {
    score: number;
    totalQuestions: number;
    weaknesses: string[];
    goal?: string; // Optional goal from user input
    date: string; // ISO date string
}

export interface DeepDiveQuizEntry {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: QuizData | null;
  error: string | null;
  params: DeepDiveGenerationParams;
}

export interface DeepDiveData {
  [difficulty: string]: DeepDiveQuizEntry;
}

export interface DeepDiveGenerationParams {
  questionType: string;
  passageLength: number;
  numQuestions: number;
  useOriginalText: boolean;
  questionStemStyle: string;
  questionChoicesStyle: string;
}

export interface AppSettings {
  googleClientId: string;
  youtubeApiKey: string;
  youtubeChannelId: string;
  googleSheetId: string;
  googleWorksheetName: string;
  scheduledSheetId: string;
  scheduledWorksheetName: string;
  thumbnailSheetId: string;
  thumbnailWorksheetName: string;
  googleDocsTemplateId: string;
  googleDriveFolderId: string;
}