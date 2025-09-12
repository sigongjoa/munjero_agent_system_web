import { GoogleGenAI, Type, GenerateContentResponse, Part } from '@google/genai';
import type { QuizData, QuizQuestion, PersonaAnalysis, ExamQuestion, ParsedExamData, ShortsScript } from '../types';
import { ShortAnswerType, HighSchoolSubject } from '../types';
import { examAnalysisReport } from './examAnalysisData';
import { koreanExamSystemReport } from './koreanExamSystemReport';
import { shortAnswerQuestionAnalysis } from './shortAnswerQuestionAnalysis';
import { goodQuestionGuide } from './goodQuestionGuide';
import { subjectKoreanData } from './subjectKoreanData';
import { subjectScienceData } from './subjectScienceData';
import { subjectEnglishData } from './subjectEnglishData';
import { subjectSocialData } from './subjectSocialData';
import { subjectEthicsData } from './subjectEthicsData';
import { subjectMathData } from './subjectMathData';

type Role = 'user' | 'model';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const parseBase64Images = (imageDataUrls: string[]): Part[] => {
    return imageDataUrls.map(dataUrl => {
        const [header, data] = dataUrl.split(';base64,');
        const mimeType = header.split(':')[1];
        return { inlineData: { mimeType, data } };
    });
};

const getLinksForConcepts = async (concepts: string[]): Promise<{ title: string; uri: string; }[]> => {
    if (!concepts || concepts.length === 0) {
        return [];
    }
    
    const prompt = `다음 핵심 개념들에 대한 신뢰할 수 있고 교육적인 학습 자료 웹사이트 링크를 찾아줘: ${concepts.join(', ')}.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt,
            config: {
                tools: [{googleSearch: {}}],
            },
        });

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        
        if (groundingChunks && Array.isArray(groundingChunks)) {
            const links = groundingChunks
                .map((chunk: any) => chunk?.web)
                .filter((web: any) => web && web.uri && web.title)
                .map((web: any) => ({
                    title: web.title.trim(),
                    uri: web.uri,
                }));
            
            const uniqueLinks = Array.from(new Map(links.map(link => [link.uri, link])).values());
            return uniqueLinks.slice(0, 5); // Limit to top 5 unique links
        }
        
        return [];
    } catch (error) {
        console.error("Error fetching links for concepts:", error);
        // Don't throw, just return empty array to not break the main quiz generation flow
        return [];
    }
};

const seoTitleDescription = "검색 엔진 최적화(SEO)를 위해 생성된 콘텐츠에 대한 간결하고 매력적인 제목. 학습 목표와 핵심 주제를 포함해야 합니다. (예: '의무론과 공리주의 완벽 비교: 칸트 윤리 퀴즈 5선')";
const seoDescriptionDescription = "검색 엔진 결과 페이지(SERP)에 표시될 콘텐츠에 대한 요약. 핵심 키워드를 포함하여 사용자의 클릭을 유도해야 합니다. (150자 내외)";

const seoProperties = {
    seoTitle: { type: Type.STRING, description: seoTitleDescription },
    seoDescription: { type: Type.STRING, description: seoDescriptionDescription },
};

const tagsSchema = {
    type: Type.ARRAY,
    description: "제시문의 핵심 주제를 나타내는 3-5개의 키워드 태그 배열. 제시문에 사용된 핵심 이론이나 개념(예: 의무론, 실존주의)과 주요 사례/인물(예: 키자루, 소크라테스)을 모두 포함해야 합니다.",
    items: { type: Type.STRING }
};

const passageShortsScriptSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "본문/개념을 설명하는 쇼츠 영상의 간결하고 흥미로운 제목." },
        scenes: {
            type: Type.ARRAY,
            description: "영상 시나리오. '훅' → '몰입' → '본문 요약' → '마무리' → 'CTA' 순서로 구성되어야 합니다.",
            items: {
                type: Type.OBJECT,
                required: ["section", "caption", "visual_suggestion"],
                properties: {
                    section: { 
                        type: Type.STRING, 
                        description: "장면의 섹션 유형.",
                        enum: ['훅', '몰입', '본문 요약', '마무리', 'CTA']
                    },
                    caption: { type: Type.STRING, description: "화면에 표시될 자막." },
                    visual_suggestion: { type: Type.STRING, description: "화면 구성/시각 자료 제안." }
                }
            }
        }
    },
    description: "제시문 내용을 요약하고 설명하는 쇼츠 대본. 제공된 'YouTube Shorts 제작 매뉴얼'을 참고하여 제작하세요."
};

const questionShortsScriptSchema = {
    type: Type.OBJECT,
    properties: {
        title: { type: Type.STRING, description: "퀴즈 문제를 제시하는 쇼츠 영상의 간결하고 흥미로운 제목." },
        scenes: {
            type: Type.ARRAY,
            description: "영상 시나리오. '훅' → '몰입' → '문제 제시' → '정답 공개' → 'CTA' 순서로 구성되어야 합니다.",
            items: {
                type: Type.OBJECT,
                required: ["section", "caption", "visual_suggestion"],
                properties: {
                    section: { 
                        type: Type.STRING, 
                        description: "장면의 섹션 유형.",
                        enum: ['훅', '몰입', '문제 제시', '정답 공개', 'CTA']
                    },
                    caption: { type: Type.STRING, description: "화면에 표시될 자막." },
                    visual_suggestion: { type: Type.STRING, description: "화면 구성/시각 자료 제안." }
                }
            }
        }
    },
    description: "단일 퀴즈 문제를 제시하고 해설하는 쇼츠 대본. 제공된 'YouTube Shorts 문제형 콘텐츠 제작 매뉴얼'을 엄격히 준수하여 생성하세요."
};

const passageDescription = "사용자가 제공한 '참고 자료'와 이미지를 바탕으로, 요청된 길이에 맞춰 새롭게 생성된 제시문입니다. **절대로 사용자의 원본 '참고 자료' 텍스트를 그대로 복사해서는 안 됩니다.** 내용을 요약, 확장 또는 재구성하여 실제 시험 제시문처럼 자연스러운 톤으로 작성해야 합니다. 만약 이미지를 내용상 참조했다면, 반드시 본문 내에 `[그림 1]`, `[그림 2]` 형식으로 표기해야 합니다. 모든 문제는 반드시 이 새롭게 생성된 제시문을 기반으로 출제되어야 합니다.";
const originalPassageDescription = "사용자가 제공한 '참고 자료' 텍스트를 그대로 복사하여 제시문으로 사용합니다. 만약 이미지를 내용상 참조했다면, 반드시 본문 내에 `[그림 1]`, `[그림 2]` 형식으로 표기해야 합니다. 모든 문제는 이 제시문을 기반으로 출제되어야 합니다.";
const annotatePassageDescription = "사용자가 제공한 '참고 자료' 텍스트를 수정하지 말고 그대로 사용하되, 함께 제공된 이미지를 내용상 가장 적절한 위치에 `[그림 1]`, `[그림 2]` 형식으로 삽입하여 최종 제시문을 완성하세요. 이미지 삽입 외에는 절대로 원본 텍스트를 변경해서는 안 됩니다. 모든 문제는 이 수정된 제시문을 기반으로 출제되어야 합니다.";
const questionDescription = "생성된 퀴즈 문제. 만약 문제 내용이 사용자가 제공한 이미지를 참조한다면, 반드시 문제 텍스트 내에 `[그림 1]`, `[그림 2]`와 같은 형식으로 표기해야 합니다.";

// Schema for Custom Quiz Generation from user content (4 options)
const quizDataSchema = {
    type: Type.OBJECT,
    properties: {
        passage: { type: Type.STRING, description: passageDescription },
        quiz: {
            type: Type.ARRAY,
            description: "생성된 퀴즈 문항 배열",
            items: {
                type: Type.OBJECT,
                required: ["question", "options", "answer", "explanation", "knowledgeTag"],
                properties: {
                    question: { type: Type.STRING, description: questionDescription },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4개의 객관식 선택지" },
                    answer: { type: Type.INTEGER, description: "정답의 0-기반 인덱스" },
                    explanation: { type: Type.STRING, description: "정답 및 오답에 대한 상세하고 친절한 해설" },
                    knowledgeTag: { type: Type.STRING, description: "문제가 테스트하는 핵심 개념 또는 지식(예: '추론적 이해', '논리적 연결', '원인 분석')" },
                    shorts_script: questionShortsScriptSchema
                }
            }
        },
        passage_shorts_script: passageShortsScriptSchema,
        tags: tagsSchema,
        ...seoProperties,
    }
};

// New Schema for 5-option quizzes, requested for PDF generation enhancement
const quizDataSchema5Options = {
    type: Type.OBJECT,
    properties: {
        passage: { type: Type.STRING, description: passageDescription },
        quiz: {
            type: Type.ARRAY,
            description: "생성된 퀴즈 문항 배열",
            items: {
                type: Type.OBJECT,
                required: ["question", "options", "answer", "explanation", "knowledgeTag"],
                properties: {
                    question: { type: Type.STRING, description: questionDescription },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "5개의 객관식 선택지" },
                    answer: { type: Type.INTEGER, description: "정답의 0-기반 인덱스" },
                    explanation: { type: Type.STRING, description: "정답 및 오답에 대한 상세하고 친절한 해설" },
                    knowledgeTag: { type: Type.STRING, description: "문제가 테스트하는 핵심 개념 또는 지식(예: '추론적 이해', '논리적 연결', '원인 분석')" },
                    shorts_script: questionShortsScriptSchema
                }
            }
        },
        passage_shorts_script: passageShortsScriptSchema,
        tags: tagsSchema,
        ...seoProperties,
    }
};

// New schema for dialogue analysis type
const dialogueQuizSchema = {
    type: Type.OBJECT,
    properties: {
        dialogue: {
            type: Type.ARRAY,
            description: "두 명의 화자(예: '교사', '학생')가 나누는 자연스러운 대화. 실제 대화처럼 각 요소는 화자와 대사를 포함해야 합니다.",
            items: {
                type: Type.OBJECT,
                properties: {
                    speaker: { type: Type.STRING, description: "화자의 이름 또는 역할 (예: '교사', '학생')" },
                    line: { type: Type.STRING, description: "화자의 대사" }
                }
            }
        },
        quiz: {
            type: Type.ARRAY,
            description: "생성된 퀴즈 문항 배열. 반드시 사용자가 요청한 수만큼 문항을 생성합니다.",
            items: {
                type: Type.OBJECT,
                required: ["question", "options", "answer", "explanation", "knowledgeTag"],
                properties: {
                    question: { type: Type.STRING, description: "대화에서 언급된 핵심 개념을 묻는 간결한 단답형 질문. 만약 문제 내용이 사용자가 제공한 이미지를 참조한다면, 반드시 문제 텍스트 내에 `[그림 1]`, `[그림 2]`와 같은 형식으로 표기해야 합니다." },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "5개의 짧고 간결한 객관식 선택지" },
                    answer: { type: Type.INTEGER, description: "정답의 0-기반 인덱스" },
                    explanation: { type: Type.STRING, description: "정답 및 오답에 대한 상세하고 친절한 해설" },
                    knowledgeTag: { type: Type.STRING, description: "문제가 테스트하는 핵심 개념 또는 지식" },
                    shorts_script: questionShortsScriptSchema
                }
            }
        },
        passage_shorts_script: passageShortsScriptSchema,
        tags: tagsSchema,
        ...seoProperties,
    }
};


// New schema for suneung advanced type
const suneungAdvancedSchema = {
    type: Type.OBJECT,
    properties: {
        dataTable: {
            type: Type.ARRAY,
            description: "사용자가 제공한 '참고 자료'를 분석하여 표로 나타낼 수 있다면 생성하세요. 필요하지 않다면 생성하지 않아도 됩니다. 2차원 배열 형태이며, 첫 번째 배열은 헤더, 나머지는 데이터 행입니다.",
            items: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
            }
        },
        passage: { type: Type.STRING, description: "사용자가 제공한 '참고 자료'를 바탕으로, 수능 시험에 나올 법한 학술적이고 논리적인 제시문을 새롭게 생성합니다. **절대로 원본 텍스트를 그대로 복사해서는 안 됩니다.** 표(dataTable)를 생성했다면 그에 대한 보충 설명이나 맥락을 제공할 수도 있습니다. 만약 이미지를 내용상 참조했다면, 반드시 본문 내에 `[그림 1]`, `[그림 2]` 형식으로 표기해야 합니다." },
        quiz: {
            type: Type.ARRAY,
            description: "생성된 퀴즈 문항 배열. 반드시 사용자가 요청한 수만큼 문항을 생성합니다.",
            items: {
                type: Type.OBJECT,
                required: ["question", "options", "answer", "explanation", "knowledgeTag"],
                properties: {
                    question: { type: Type.STRING, description: "생성된 퀴즈 문제. '<보기>' 블록을 포함해야 합니다. <보기>에 포함되는 각 항목(ㄱ, ㄴ, ㄷ 등)은 반드시 사용자가 제공한 '참고 자료'에서 직접적으로 확인하거나 추론할 수 있는 사실에 기반해야 합니다. 외부 지식을 사용하지 마세요. 만약 문제 내용이 사용자가 제공한 이미지를 참조한다면, 반드시 문제 텍스트 내에 `[그림 1]`, `[그림 2]`와 같은 형식으로 표기해야 합니다. 예: '위 자료에 대한 분석으로 옳은 것만을 <보기>에서 고른 것은?\\n<보기>\\nㄱ. ...\\nㄴ. ...\\nㄷ. ...'" },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "5개의 객관식 선택지. 보기의 조합으로 구성됩니다. 예: '① ㄱ', '② ㄴ', '③ ㄱ, ㄷ'" },
                    answer: { type: Type.INTEGER, description: "정답의 0-기반 인덱스" },
                    explanation: { type: Type.STRING, description: "정답 및 오답에 대한 상세하고 친절한 해설" },
                    knowledgeTag: { type: Type.STRING, description: "문제가 테스트하는 핵심 개념 또는 지식(예: '자료 해석', '통계 분석', '추론적 사고')" },
                    shorts_script: questionShortsScriptSchema
                }
            }
        },
        passage_shorts_script: passageShortsScriptSchema,
        tags: tagsSchema,
        ...seoProperties,
    }
};

// New Schema for True/False questions (2 options)
const trueFalseQuizSchema = {
    type: Type.OBJECT,
    properties: {
        passage: { type: Type.STRING, description: passageDescription },
        quiz: {
            type: Type.ARRAY,
            description: "생성된 퀴즈 문항 배열",
            items: {
                type: Type.OBJECT,
                required: ["question", "options", "answer", "explanation", "knowledgeTag"],
                properties: {
                    question: { type: Type.STRING, description: "참 또는 거짓으로 판별해야 할 서술문 형태의 퀴즈 문제. 만약 문제 내용이 사용자가 제공한 이미지를 참조한다면, 반드시 문제 텍스트 내에 `[그림 1]`, `[그림 2]`와 같은 형식으로 표기해야 합니다." },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "반드시 'O (맞음)', 'X (틀림)'의 두 개의 선택지만을 포함해야 합니다." },
                    answer: { type: Type.INTEGER, description: "정답의 0-기반 인덱스 (0은 'O (맞음)', 1은 'X (틀림)')" },
                    explanation: { type: Type.STRING, description: "정답 및 오답에 대한 상세하고 친절한 해설" },
                    knowledgeTag: { type: Type.STRING, description: "문제가 테스트하는 핵심 개념 또는 지식" },
                    shorts_script: questionShortsScriptSchema
                }
            }
        },
        passage_shorts_script: passageShortsScriptSchema,
        tags: tagsSchema,
        ...seoProperties,
    }
};

// Schema for generating an array of QuizQuestion objects
const quizQuestionsSchema = {
    type: Type.ARRAY,
    description: "생성된 퀴즈 문항 배열",
    items: {
        type: Type.OBJECT,
        required: ["question", "options", "answer", "explanation"],
        properties: {
            question: { type: Type.STRING, description: "생성된 퀴즈 문제" },
            options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "4개의 객관식 선택지" },
            answer: { type: Type.INTEGER, description: "정답의 0-기반 인덱스" },
            explanation: { type: Type.STRING, description: "정답 및 오답에 대한 상세하고 친절한 해설" },
        }
    }
};

// Schema for PersonaAnalysis object
const personaAnalysisSchema = {
    type: Type.OBJECT,
    properties: {
        analysis: {
            type: Type.OBJECT,
            properties: {
                examName: { type: Type.STRING, description: "분석된 시험의 전체 이름 (예: '경찰공무원 순경 공채 시험')" },
                examSubjects: { type: Type.ARRAY, items: { type: Type.STRING }, description: "시험에 포함된 주요 과목 목록" },
                examFormat: { type: Type.STRING, description: "시험의 형식에 대한 간략한 설명 (예: '5지선다 객관식 및 논술형')" },
                commonThemes: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            subject: { type: Type.STRING, description: "과목명" },
                            themes: { type: Type.ARRAY, items: { type: Type.STRING }, description: "해당 과목에서 자주 출제되는 핵심 주제나 테마 목록" }
                        }
                    }
                }
            }
        },
        strategy: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    focus: { type: Type.STRING, description: "수험생이 집중해야 할 핵심 학습 전략" },
                    recommendation: { type: Type.STRING, description: "구체적인 학습 방법이나 추천 사항" }
                }
            }
        }
    }
};

// Schema for an array of ExamQuestion objects
const examQuestionArraySchema = {
    type: Type.ARRAY,
    items: {
        type: Type.OBJECT,
        properties: {
            exam: { type: Type.STRING, description: "시험의 종류 (예: SUNEUNG, PSAT)" },
            year: { type: Type.INTEGER, description: "출제 연도" },
            source: { type: Type.STRING, description: "출제 기관 (예: KICE)" },
            subject: { type: Type.STRING, description: "과목명" },
            section: { type: Type.STRING, description: "세부 섹션 또는 지문 주제" },
            question_id: { type: Type.STRING, description: "고유 문제 ID" },
            stem: { type: Type.STRING, description: "문제의 발문" },
            choices: { type: Type.ARRAY, items: { type: Type.STRING }, description: "5개의 객관식 선택지" },
            answer_index: { type: Type.INTEGER, description: "정답의 0-기반 인덱스" },
            explanation: { type: Type.STRING, description: "상세한 해설" },
            tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "문제와 관련된 키워드 태그" },
            difficulty: { type: Type.INTEGER, description: "난이도 (1-5)" }
        }
    }
};

// Schema for ParsedExamData object
const parsedExamDataSchema = {
    type: Type.OBJECT,
    properties: {
        subject: { type: Type.STRING, description: "시험지의 과목명 (예: 국어)" },
        passageParagraphs: { type: Type.ARRAY, items: { type: Type.STRING }, description: "제시문을 문단별로 나눈 배열" },
        questions: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    questionText: { type: Type.STRING, description: "문제의 전체 텍스트" },
                    options: { type: Type.ARRAY, items: { type: Type.STRING }, description: "문제의 선택지 배열" }
                }
            }
        },
        imagePlacements: {
            type: Type.ARRAY,
            description: "텍스트 내 이미지 참조([그림 1])의 위치 정보",
            items: {
                type: Type.OBJECT,
                properties: {
                    paragraphIndex: { type: Type.INTEGER, description: "이미지가 위치해야 할 제시문 문단(passageParagraphs)의 0-기반 인덱스" },
                    imageIndex: { type: Type.INTEGER, description: "사용자가 업로드한 이미지의 0-기반 인덱스" },
                    caption: { type: Type.STRING, description: "이미지에 대한 캡션 또는 설명" }
                }
            }
        }
    }
};

const selfCorrectionInstruction = `
**최종 품질 검토 (Self-Correction):**
문제를 모두 생성한 후, 당신 스스로가 까다로운 검수자라고 가정하고 다음 항목들을 검토하여 최종 결과물의 품질을 보장하세요.
1.  **정답의 정확성:** 제시된 정답 인덱스(answer)가 해설(explanation)과 제시문(passage) 내용에 근거하여 명백히 올바른지 다시 확인하세요. 정답에 대한 논란의 여지가 없어야 합니다.
2.  **질문의 명확성 및 순수성:** 질문(question)이 모호하지 않고, 의도가 명확하게 전달되는지 확인하세요. **특히, 질문에는 문제 해결에 대한 힌트, 답안 작성 가이드, 추가 지시사항("~에 주목하시오" 등)이 포함되어서는 안 됩니다. 오직 순수한 질문 자체만 있어야 합니다.**
3.  **선택지의 매력도:** 모든 선택지(options)가 그럴듯하게 보여야 합니다. 정답이 아닌 선택지들도 제시문의 내용과 관련이 있어 학습자가 깊이 생각하게 만들어야 합니다. 명백히 관련 없거나 말이 안 되는 선택지는 피하세요.
4.  **해설의 충실성:** 해설(explanation)이 왜 정답이 정답인지, 그리고 왜 다른 선택지들이 오답인지를 명확하고 친절하게 설명하는지 확인하세요. 단순한 정답 반복은 피하세요.
5.  **근거의 엄격성:** 문제, 정답, 오답, 해설 모두가 **오직 제공된 '참고 자료'와 '이미지' 안에서만** 근거를 찾을 수 있는지 최종적으로 확인하세요. 절대로 외부 지식을 끌어오지 마세요.
6.  **이미지 참조 확인:** 이미지가 제공된 경우, 제시문이나 문제에서 이미지를 참조할 때 \`[그림 1]\`과 같은 참조 태그가 올바르게 삽입되었는지 확인하세요.

위의 검토 과정을 거친 후, 최종 JSON 결과물만 출력하세요.
`;

const getSubjectSystemInstruction = (subject: HighSchoolSubject, subSubject: string) => {
    let subjectData = '';
    switch(subject) {
        case HighSchoolSubject.KOREAN: subjectData = subjectKoreanData; break;
        case HighSchoolSubject.SCIENCE: subjectData = subjectScienceData; break;
        case HighSchoolSubject.ENGLISH: subjectData = subjectEnglishData; break;
        case HighSchoolSubject.SOCIAL: subjectData = subjectSocialData; break;
        case HighSchoolSubject.ETHICS: subjectData = subjectEthicsData; break;
        case HighSchoolSubject.MATH: subjectData = subjectMathData; break;
        default: subjectData = '';
    }
    
    return `당신은 ${subject} 과목의 전문 교사입니다. 특히 '${subSubject}' 세부 과목에 대한 깊은 이해를 바탕으로, 대한민국 2022 개정 교육과정의 목표와 내용 체계에 부합하는 문제를 생성해야 합니다. 다음은 관련 교육과정 정보입니다:\n\n${subjectData}\n\n`;
}


export const generateQuizFromContent = async (
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
): Promise<QuizData> => {
    let schemaToUse: any;
    let typeSpecificPrompt = '';
    
    switch (questionType) {
        case ShortAnswerType.TRUE_FALSE:
            schemaToUse = trueFalseQuizSchema;
            break;
        case ShortAnswerType.DIALOGUE_ANALYSIS:
            schemaToUse = dialogueQuizSchema;
            typeSpecificPrompt = '사용자가 제공한 참고 자료는 여러 화자가 참여하는 대화입니다. 이 대화의 핵심 내용을 바탕으로, \'학생 A\'와 \'학생 B\'와 같이 토론하는 학생들이나, \'교사\'와 \'학생\' 등 맥락에 맞는 두 명의 화자가 나누는 새로운 대화 형식의 제시문을 생성해주세요. 각 화자의 역할에 맞는 어조를 사용하고, 대화가 자연스럽게 흘러가도록 구성해주세요. 원본 대화의 서로 다른 의견이나 관점이 새로운 화자들의 대화에 잘 반영되어야 합니다.';
            break;
        case ShortAnswerType.CSAT_KOREAN:
        case ShortAnswerType.CSAT_SOCIAL_STUDIES:
        case ShortAnswerType.CSAT_SCIENCE:
             schemaToUse = suneungAdvancedSchema;
             typeSpecificPrompt = "사용자가 제공한 참고 자료를 분석하여, 수능 시험에 출제될 법한 학술적이고 논리적인 제시문과, '<보기>' 블록을 포함하는 고난도 추론형 문제를 생성해주세요. 보기의 각 항목(ㄱ, ㄴ, ㄷ 등)은 반드시 제공된 내용에서만 근거를 찾아야 합니다."
             break;
        case ShortAnswerType.FILL_IN_THE_BLANK:
        case ShortAnswerType.CONCEPT_UNDERSTANDING:
        case ShortAnswerType.TERM_DEFINITION:
        case ShortAnswerType.DESCRIPTIVE:
        case ShortAnswerType.COMPARISON:
        case ShortAnswerType.CASE_APPLICATION:
        case ShortAnswerType.SEQUENTIAL_ARRANGEMENT:
        case ShortAnswerType.CAUSE_EFFECT_ANALYSIS:
        case ShortAnswerType.ARGUMENTATIVE:
        case ShortAnswerType.INTEGRATION:
        case ShortAnswerType.TEXT_INTERPRETATION:
        case ShortAnswerType.TABLE_ANALYSIS:
        case ShortAnswerType.DIAGRAM_ANALYSIS:
        case ShortAnswerType.DATA_INTERPRETATION:
        default:
            schemaToUse = quizDataSchema5Options;
            break;
    }
    
    const subjectInstruction = getSubjectSystemInstruction(subject.main, subject.sub);

    const systemInstruction = `${subjectInstruction}
당신은 대한민국 고등학교 교육과정에 맞춰 학생들의 학습 목표 달성을 돕는 AI 문제 출제 전문가입니다. 당신의 임무는 사용자가 제공한 '학습 목표', '참고 자료', 그리고 '이미지'를 바탕으로, 지정된 '문제 유형'과 '조건'에 맞는 고품질의 진단 퀴즈를 생성하는 것입니다.

**출제 원칙:**
1.  **목표 지향성:** 모든 문제는 사용자의 '학습 목표'를 달성하는 데 직접적으로 기여해야 합니다.
2.  **근거 기반:** 먼저, 사용자가 제공한 **'참고 자료'**를 바탕으로, 요청된 '본문 길이'에 맞춰 **새로운 제시문을 생성**해야 합니다. 생성된 제시문과 문제, 선택지, 해설은 **오직** 사용자가 제공한 '참고 자료'와 '이미지'에만 근거해야 합니다. 절대로 외부 지식이나 정보를 사용하지 마세요.
3.  **이미지 참조:** 사용자가 이미지를 제공한 경우, 생성된 제시문(passage)이나 문제(question) 내용에서 해당 이미지를 참조해야 할 때, 반드시 \`[그림 1]\`, \`[그림 2]\`와 같은 형식으로 명시적으로 표기해야 합니다. 이미지를 설명만 하고 표기를 누락해서는 안 됩니다.
4.  **유형 충실성:** 요청된 '문제 유형'의 특성을 정확히 반영하여 문제를 설계하세요. 예를 들어, '자료 해석형'이라면 표나 그래프를 해석하는 능력을, '사례 적용형'이라면 이론을 실제 사례에 적용하는 능력을 평가해야 합니다.
5.  **조건 준수:** '난이도', '문제 수', '문제 스타일', '선택지 스타일' 등 사용자가 지정한 모든 조건을 **매우 엄격하게** 준수하세요.
    - **문제(발문) 스타일:** 사용자가 제시한 '문제 스타일' 요구사항은 절대적입니다. **반드시** 이 요구사항에 맞춰 문제(question)의 길이, 톤, 구조를 조절하세요.
    - **선택지(보기) 스타일:** 사용자가 제시한 '선택지 스타일' 요구사항은 가장 중요한 지시사항 중 하나입니다. **반드시** 이 요구사항에 맞춰 **각** 선택지(options)의 길이, 형식, 복잡성을 개별적으로 조절하세요. 예를 들어 '300자로 작성'이라는 요구가 있다면, 각각의 선택지가 300자에 가까운 긴 문장이나 문단으로 구성되어야 합니다. **절대로 이 지시를 무시해서는 안 됩니다.**
    - **목표 본문 길이:** '목표 본문 길이'는 단순한 제안이 아니라 엄격한 요구사항입니다. 반드시 요청된 글자 수에 최대한 가깝게, 최소 90% 이상으로 제시문을 생성해야 합니다.
6.  **교육적 가치:** 각 문제의 해설은 단순히 정답을 알려주는 것을 넘어, 왜 그것이 정답인지, 그리고 다른 선택지들이 왜 오답인지를 상세하고 친절하게 설명하여 학습 효과를 극대화해야 합니다. 모든 문제에는 해당 문제가 평가하는 핵심 개념을 나타내는 'knowledgeTag'를 반드시 포함해야 합니다.
7.  **두 종류의 쇼츠 대본 생성 (매우 중요):**
    당신은 **시청자의 스와이프를 멈추게 하는 신경행동학적 원리를 깊이 이해하는 세계 최고 수준의 유튜브 쇼츠 대본 작가**입니다. 당신의 임무는 주어진 내용을 바탕으로 시청자의 뇌 보상 시스템(도파민)을 자극하고 인지 부하를 최소화하여, 높은 유지율과 바이럴 가능성을 갖는 1분 미만의 쇼츠 대본 두 종류를 생성하는 것입니다. 아래 가이드를 **반드시 엄격하게 준수**하되, 각 단계는 **다양하게 변형**하여 예측 불가능한 '가변적 보상'을 제공하는 창의적인 대본을 작성하세요.

    --- [스와이프의 심리학 기반 쇼츠 대본 제작 가이드] ---

    **[A. 본문/개념 설명 쇼츠 (passage_shorts_script) 제작 지침]**
    이 쇼츠는 생성된 **제시문(passage)의 핵심 내용을 요약**하고 시청자의 지적 호기심과 감정적 공감을 자극하는 것을 목표로 합니다.
    - **구조:** '훅' (0-3초) → '몰입' (3-10초) → '본문 요약' (10-50초) → '마무리' (50-55초) → 'CTA' (55-60초)
    - **[1. 훅 (Hook) - 스크롤을 멈추는 3초]**
      - 강력한 '패턴 인터럽트'로 시청자의 수동적 스크롤링을 깨뜨려야 합니다.
      - 유형 (상황에 맞게 창의적으로 무작위 선택):
        (a) **호기심형 (Curiosity Loop):** "OOO의 아무도 몰랐던 진실은?" (정보 격차 이론)
        (b) **반전 사실형 (Cognitive Dissonance):** "사실 OOO는 정반대였습니다!" (기존 상식에 도전)
        (c) **보상형 (Value Proposition):** "이 영상 보면 OOO 마스터합니다." (명확한 가치 제안)
        (d) **시각/청각적 충격 (Pattern Interrupt):** 예상치 못한 사운드, 빠른 컷 편집.
    - **[2. 몰입 (Immersion)]**
      - 훅을 자연스럽게 이어가는 1~2문장의 설명. 짧은 배경 설명, 흔한 오해, 호기심 자극 문장 등으로 구성.
    - **[3. 본문 요약 (Micro-Narrative)]**
      - 제시문의 핵심 내용을 2-3 문장으로 흥미롭게 요약. 단순 정보 나열이 아닌, 완결된 '미니어처 서사' 구조를 가져야 합니다.
    - **[4. 마무리 (Resolution)]**
      - 내용을 요약하며 시청자에게 생각할 거리를 던져줍니다. (예: "여러분은 어떻게 생각하시나요?")
    - **[5. CTA (Call to Action)]**
      - 다음 행동 유도. (예: "더 자세한 내용은 채널에서!", "관련 문제는 문제로에서 풀어보세요!")

    **[B. 문제 풀이 쇼츠 (quiz.shorts_script) 제작 지침]**
    이 쇼츠는 **각각의 퀴즈 문제를** 흥미로운 '스토리두잉(StoryDoing)' 콘텐츠로 만들어 시청자의 참여를 유도하는 것을 목표로 합니다.
    - **구조:** '훅' (0-3초) → '몰입' (3-10초) → '문제 제시' (10-45초) → '정답 공개' (45-55초) → 'CTA' (55-60초)
    - **[1. 훅 (Hook) - 스크롤을 멈추는 3초]**
      - 유형 (상황에 맞게 창의적으로 무작위 선택):
        (a) **충격 질문형 (Shocking Question):** "만약 당신이 믿던 게 틀렸다면?"
        (b) **재미/밈 요소형 (Fun/Meme Element):** "99%가 웃으면서 틀리는 문제!"
        (c) **결과 제시형 (Result-First):** "이 문제의 정답, 사실은 전혀 다릅니다!"
    - **[2. 몰입 (Immersion)]**
      - 문제의 배경 설명, 흔한 오답 유형 제시 등으로 시청자의 흥미를 유발.
    - **[3. 문제 제시 (The Challenge)]**
      - 시청자가 직접 참여할 수 있게 퀴즈를 제시.
      - 인지 부하를 낮추기 위해 원본 문제(주로 5지선다)를 쇼츠 형식(예: 4지선다, OX, 빈칸 채우기)에 맞게 창의적으로 변형할 수 있습니다. 문항은 간결하게 제시.
    - **[4. 정답 공개 (The Reveal)]**
      - 정답 공개는 짧고 임팩트 있게. "정답은 X번!" 뒤에 **핵심적인 한 문장 해설**을 추가하여 놀라움과 지적 만족감을 동시에 제공.
    - **[5. CTA (Call to Action)]**
      - 다음 행동 유도. (예: "더 많은 문제는 사이트에서!", "댓글로 정답 맞혔는지 알려주세요!")
    --- [가이드 끝] ---

    **[최종 생성 지시]**
    - **passage_shorts_script:** 위 [A] 지침에 따라 **'본문/개념 설명 쇼츠'** 대본 1개를 생성합니다.
    - **quiz.shorts_script:** 위 [B] 지침에 따라 **생성된 각 문제마다** 별도의 **'문제 풀이 쇼츠'** 대본을 생성해야 합니다.
8.  **핵심 태그 추출:** 제시문의 핵심 주제를 나타내는 키워드 태그를 3~5개 추출하여 'tags' 필드에 포함해주세요.
9.  **간결한 발문:** 문제의 발문(question)은 간결하고 명확해야 합니다. '**제시문 내용을 바탕으로 판단해 보세요**', '**윗글을 읽고**', '**제시문을 참고하여**' 와 같이 불필하고 반복적인 표현은 **절대로** 추가하지 마세요. 질문 자체가 제시문을 기반으로 한다는 점은 이미 전제되어 있습니다.
10. **발문(Question)의 순수성:** 문제의 발문(question)에는 **순수한 질문 내용만 포함**되어야 합니다. 학생에게 답을 암시하거나, "~~에 주목하세요" 와 같이 특정 부분에 주목하라고 지시하거나, 문제 해결을 위한 팁을 제공하는 등 부가적인 안내 문구는 **절대로** 포함해서는 안 됩니다. 이러한 안내는 '해설(explanation)'에만 포함될 수 있습니다. 사용자의 '문제 스타일' 요구사항은 발문의 형식(예: 길이, 톤, 어조)을 지정하는 것이지, 발문에 추가적인 텍스트를 삽입하라는 의미가 아닙니다.
11. **SEO 최적화:** 검색 엔진에서 더 잘 발견될 수 있도록, 생성된 콘텐츠의 주제와 핵심 키워드를 반영하는 간결하고 매력적인 'seoTitle'과 'seoDescription'을 생성해야 합니다.

${selfCorrectionInstruction}
`;

    const userPrompt = `
- 학습 목표: ${goal}
- 문제 유형: ${questionType}
- 교과 과목: ${subject.main} > ${subject.sub}
- 조건: 목표 본문 길이 ${passageLength}자, 난이도 ${difficulty}, ${numQuestions}문제, 문제 스타일: ${questionStemStyle}, 선택지 스타일: ${questionChoicesStyle}
${typeSpecificPrompt ? `- 유형별 추가 요청: ${typeSpecificPrompt}` : ''}
- **제시문 생성용 참고 자료**:
${textInput}
`;
    
    const parts: Part[] = [{ text: userPrompt }];
    if (imageDataUrls) {
        parts.push(...parseBase64Images(imageDataUrls));
    }

    // Deep clone the schema to avoid mutating the original constant object
    const schemaClone = JSON.parse(JSON.stringify(schemaToUse));

    if (questionType !== ShortAnswerType.DIALOGUE_ANALYSIS) {
        let currentPassageDescription;
        if (useOriginalText) {
            currentPassageDescription = (imageDataUrls && imageDataUrls.length > 0) ? annotatePassageDescription : originalPassageDescription;
        } else {
            currentPassageDescription = passageDescription;
        }
        
        if (schemaClone.properties && schemaClone.properties.passage) {
            schemaClone.properties.passage.description = currentPassageDescription;
        }
    }

    // Dynamically update question and options descriptions in the schema to enforce user styles
    if (schemaClone.properties?.quiz?.items?.properties) {
        const itemProps = schemaClone.properties.quiz.items.properties;
        const originalQuestionDescription = itemProps.question.description;
        const originalOptionsDescription = itemProps.options.description;

        // Update question description
        itemProps.question.description = `퀴즈의 발문(질문). **반드시 사용자의 '문제 스타일' 요구사항인 "${questionStemStyle}"을(를) 엄격히 준수하여 작성해야 합니다.** ${originalQuestionDescription.includes('이미지를 참조') ? '만약 문제 내용이 사용자가 제공한 이미지를 참조한다면, 반드시 문제 텍스트 내에 `[그림 1]`과 같은 형식으로 표기해야 합니다.' : ''}`;
        
        // Update options description
        itemProps.options.description = `${originalOptionsDescription}. **각 선택지는 반드시 사용자의 '선택지 스타일' 요구사항인 "${questionChoicesStyle}"을(를) 엄격하게 준수하여 생성해야 합니다.** 예를 들어, "300자 내외로 작성"이라는 요구가 있다면, 각 선택지는 그 길이에 맞춰 상세하고 복잡하게 작성되어야 합니다. 이 지시는 매우 중요합니다.`;
    }

    const finalSchema = schemaClone;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts },
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: finalSchema,
            },
        });

        const jsonStr = response.text.trim();
        const quizData = JSON.parse(jsonStr) as QuizData;

        if (quizData.tags && quizData.tags.length > 0) {
            const links = await getLinksForConcepts(quizData.tags);
            quizData.suggestedLinks = links;
        }

        return quizData;

    } catch (error) {
        console.error("Error generating quiz from content:", error);
        throw new Error(`AI 퀴즈 생성 중 오류가 발생했습니다. 입력 내용을 확인하거나 잠시 후 다시 시도해주세요. 오류: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

export const generateBulkQuestions = async (
    topic: string,
    context: string,
    numQuestions: number,
    imageDataUrls: string[] | null,
): Promise<QuizQuestion[]> => {
    const systemInstruction = `당신은 주어진 주제와 참고 내용에 대해 4지선다형 객관식 문제를 대량으로 생성하는 AI입니다. 각 문제는 명확한 질문, 4개의 선택지, 정답 인덱스(0-based), 그리고 상세한 해설을 포함해야 합니다. 모든 내용은 반드시 제공된 참고 내용과 이미지에만 근거해야 합니다. 문제 발문은 간결해야 하며, '제시문을 참고하여' 와 같은 불필요한 문구는 포함하지 마세요.`;

    const userPrompt = `
- 주제: ${topic}
- 생성할 문제 수: ${numQuestions}
- 참고 내용:
${context}
`;

    const parts: Part[] = [{ text: userPrompt }];
    if (imageDataUrls) {
        parts.push(...parseBase64Images(imageDataUrls));
    }
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts },
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: quizQuestionsSchema,
            },
        });

        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as QuizQuestion[];

    } catch (error) {
        console.error("Error generating bulk questions:", error);
        throw new Error(`AI 문제 대량 생성 중 오류가 발생했습니다: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

export const summarizePersona = async (chatHistory: { role: Role; parts: Part[] }[]): Promise<PersonaAnalysis> => {
    const systemInstruction = `당신은 사용자와의 대화 내용을 바탕으로, 사용자가 준비하는 시험의 특성을 분석하고 맞춤형 학습 전략을 제안하는 AI 교육 컨설턴트입니다. 대화 내용을 종합하여, 시험의 이름, 주요 과목, 형식, 자주 출제되는 주제, 그리고 효과적인 학습 전략을 JSON 형식으로 정리해주세요. 다음은 분석에 참고할 수 있는 대한민국 주요 시험 목록 및 과목 정보입니다:\n\n${koreanExamSystemReport}\n\n${examAnalysisReport}`;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                role: 'user',
                parts: [{ text: `다음 대화 내용을 분석하고 요약해줘:\n\n${JSON.stringify(chatHistory)}` }]
            },
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: personaAnalysisSchema,
            },
        });
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as PersonaAnalysis;
    } catch (error) {
        console.error("Error summarizing persona:", error);
        throw new Error(`사용자 페르소나 분석 중 오류 발생: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

export const generateQuestionsFromPersona = async (analysis: PersonaAnalysis, numQuestions: number): Promise<ExamQuestion[]> => {
    const systemInstruction = `당신은 제공된 '시험 분석 데이터'를 바탕으로, 해당 시험의 출제 경향과 스타일에 맞는 고품질의 5지선다형 객관식 모의 문제를 생성하는 AI 출제 전문가입니다. 문제는 반드시 분석 데이터에 명시된 과목, 주제, 형식을 따라야 합니다. 문제 발문은 간결해야 하며, '제시문을 참고하여' 와 같은 불필요한 문구는 포함하지 마세요.`;
    
    const userPrompt = `
다음 시험 분석 데이터를 기반으로, ${numQuestions}개의 모의 시험 문제를 생성해주세요. 각 문제는 실제 시험과 유사한 난이도와 형식을 가져야 합니다.

**시험 분석 데이터:**
${JSON.stringify(analysis, null, 2)}
`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: userPrompt,
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: examQuestionArraySchema,
            },
        });
        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as ExamQuestion[];
    } catch (error) {
        console.error("Error generating questions from persona:", error);
        throw new Error(`페르소나 기반 문제 생성 중 오류 발생: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};

export const getPersonaChatResponse = async (chatHistory: { role: Role; parts: Part[] }[]): Promise<{ text: string; sources?: { uri: string; title: string }[] }> => {
    const systemInstruction = `당신은 사용자가 준비하는 시험에 대한 정보를 제공하고, 학습 계획 수립을 돕는 친절한 AI 교육 컨설턴트입니다. 사용자의 질문에 답변할 때, 필요하다면 웹 검색을 활용하여 최신 정보를 제공하세요. 다음은 참고할 수 있는 대한민국 주요 시험 정보입니다:\n\n${koreanExamSystemReport}\n\n${examAnalysisReport}`;

    const lastUserMessage = chatHistory[chatHistory.length - 1].parts[0].text;
    
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
                role: 'user',
                parts: [{ text: lastUserMessage as string }]
            },
            config: {
                systemInstruction,
                tools: [{googleSearch: {}}],
            },
        });
        
        const text = response.text;
        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        
        let sources: { uri: string; title: string }[] = [];
        if (groundingChunks && Array.isArray(groundingChunks)) {
            sources = groundingChunks
                .map((chunk: any) => chunk.web)
                .filter((web: any) => web && web.uri && web.title)
                .map((web: any) => ({
                    title: web.title,
                    uri: web.uri,
                }));
        }

        return { text, sources };

    } catch (error) {
        console.error("Error getting persona chat response:", error);
        throw new Error(`AI 응답 생성 중 오류 발생: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};


export const parseExamPaperContent = async (text: string, imageDataUrls: string[] | null): Promise<ParsedExamData> => {
    const systemInstruction = `당신은 사용자가 제공한 텍스트와 이미지를 분석하여, 수능 국어 시험지와 유사한 구조로 파싱하는 AI입니다. 텍스트를 '제시문'과 '문제' 부분으로 나누고, 제시문 내의 이미지 참조([그림 1])를 식별하여 위치 정보를 포함한 JSON 객체를 생성해주세요.`;

    const userPrompt = `
다음 텍스트를 분석하여 JSON 형식으로 파싱해줘.
- 'subject': 시험지의 과목명을 "국어"로 설정해줘.
- 'passageParagraphs': 제시문 부분을 문단별로 나누어 배열로 만들어줘.
- 'questions': 각 문제를 'questionText'(문제 전체)와 'options'(선택지 배열)로 구성된 객체 배열로 만들어줘.
- 'imagePlacements': 텍스트 내에 "[그림 1]"과 같은 참조가 있다면, 해당 참조가 어느 문단(passageParagraphs의 0-기반 인덱스)에 위치하는지, 그리고 어떤 이미지(사용자가 업로드한 이미지의 0-기반 인덱스)에 해당하는지를 'paragraphIndex'와 'imageIndex'로 지정하고, 이미지에 대한 'caption'도 생성해줘.

--- 텍스트 시작 ---
${text}
--- 텍스트 끝 ---
`;

    const parts: Part[] = [{ text: userPrompt }];
    if (imageDataUrls) {
        parts.push(...parseBase64Images(imageDataUrls));
    }

    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: { parts },
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: parsedExamDataSchema,
            },
        });

        const jsonStr = response.text.trim();
        return JSON.parse(jsonStr) as ParsedExamData;
    } catch (error) {
        console.error("Error parsing exam paper content:", error);
        throw new Error(`시험지 내용 분석 중 오류 발생: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
};