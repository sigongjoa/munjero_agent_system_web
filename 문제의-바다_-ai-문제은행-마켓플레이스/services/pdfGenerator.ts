
// This service uses pdfmake.js to generate PDFs on the client-side.
// It must be initialized by calling initializePdfFonts() at app startup.

import pdfMake from 'pdfmake/build/pdfmake';
import type { TDocumentDefinitions, StyleDictionary } from 'pdfmake/interfaces';
import type { TestResult, ExamQuestion, ParsedExamData, QuizData, HighSchoolSubject, QuizSet } from '../types';
import { ExamType, Subject, ShortAnswerType } from '../types';

// URLs for all required fonts. We fetch these manually.
const RobotoRegularURL = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/fonts/Roboto/Roboto-Regular.ttf';
const RobotoMediumURL = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/fonts/Roboto/Roboto-Medium.ttf';
const RobotoItalicURL = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/fonts/Roboto/Roboto-Italic.ttf';
const RobotoMediumItalicURL = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/fonts/Roboto/Roboto-MediumItalic.ttf';
const IBMPlexSansKRRegularURL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsanskr/IBMPlexSansKR-Regular.ttf';
const IBMPlexSansKRBoldURL = 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/ibmplexsanskr/IBMPlexSansKR-Bold.ttf';

// This will hold our mutable, configured instance of pdfmake
let pdfMakerInstance: any = null;
let fontsHaveBeenInitialized = false;

async function fetchFontAsBase64(url: string): Promise<string> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch font: ${response.statusText} from ${url}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

export const areFontsInitialized = () => fontsHaveBeenInitialized;

export const initializePdfFonts = async () => {
    if (fontsHaveBeenInitialized) return;
    
    try {
        const [
            robotoRegular,
            robotoMedium,
            robotoItalic,
            robotoMediumItalic,
            ibmPlexSansKRRegular,
            ibmPlexSansKRBold,
        ] = await Promise.all([
            fetchFontAsBase64(RobotoRegularURL),
            fetchFontAsBase64(RobotoMediumURL),
            fetchFontAsBase64(RobotoItalicURL),
            fetchFontAsBase64(RobotoMediumItalicURL),
            fetchFontAsBase64(IBMPlexSansKRRegularURL),
            fetchFontAsBase64(IBMPlexSansKRBoldURL),
        ]);
        
        const vfs = {
            'Roboto-Regular.ttf': robotoRegular,
            'Roboto-Medium.ttf': robotoMedium,
            'Roboto-Italic.ttf': robotoItalic,
            'Roboto-MediumItalic.ttf': robotoMediumItalic,
            'IBMPlexSansKR-Regular.ttf': ibmPlexSansKRRegular,
            'IBMPlexSansKR-Bold.ttf': ibmPlexSansKRBold,
        };

        const fonts = {
            Roboto: {
                normal: 'Roboto-Regular.ttf',
                bold: 'Roboto-Medium.ttf',
                italics: 'Roboto-Italic.ttf',
                bolditalics: 'Roboto-MediumItalic.ttf'
            },
            IBMPlexSansKR: {
                normal: 'IBMPlexSansKR-Regular.ttf',
                bold: 'IBMPlexSansKR-Bold.ttf',
                italics: 'IBMPlexSansKR-Regular.ttf', // pdfmake requires all 4 styles
                bolditalics: 'IBMPlexSansKR-Bold.ttf',
            },
        };

        // Create a single, configured, and mutable instance for PDF creation
        pdfMakerInstance = {
            ...pdfMake,
            vfs,
            fonts,
        };

        fontsHaveBeenInitialized = true;
    } catch (error) {
        console.error("Failed to initialize PDF fonts:", error);
        throw new Error("PDF 폰트 초기화에 실패했습니다.");
    }
};

const getStyles = (fontSize: 'standard' | 'large'): StyleDictionary => {
    const scale = fontSize === 'large' ? 1.2 : 1.0;
    return {
        header: { fontSize: 22 * scale, bold: true, alignment: 'center', margin: [0, 0, 0, 5] },
        subtitle: { fontSize: 11 * scale, alignment: 'center', color: '#4b5563', margin: [0, 0, 0, 20] },
        sectionTitle: { fontSize: 14 * scale, bold: true, margin: [0, 15, 0, 10], decoration: 'underline' },
        questionStem: { fontSize: 11 * scale, bold: true, margin: [0, 10, 0, 8] },
        choiceList: { margin: [15, 0, 0, 10] },
        explanationTitle: { bold: true, margin: [0, 0, 0, 4] },
        passageParagraph: { margin: [0, 5, 0, 5], alignment: 'justify' },
        explanationParagraph: { margin: [0, 3, 0, 3], alignment: 'justify' },
        conditionsTitle: { fontSize: 11 * scale, bold: true, color: '#334155', margin: [0, 0, 0, 5] },
        conditionsItem: { fontSize: 10 * scale, color: '#475569' },
    };
};

const getDocDefinition = (title: string, subtitle?: string, fontSize: 'standard' | 'large' = 'standard'): TDocumentDefinitions => {
    const scale = fontSize === 'large' ? 1.2 : 1.0;
    const baseFontSize = 10;
    return {
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        defaultStyle: { font: 'IBMPlexSansKR', fontSize: baseFontSize * scale, lineHeight: 1.5, color: '#333' },
        header: (currentPage: number, pageCount: number) => ({
            text: `${currentPage.toString()} / ${pageCount.toString()}`,
            alignment: 'right',
            margin: [0, 30, 40, 0],
            fontSize: 8 * scale,
            color: 'grey'
        }),
        footer: {
            stack: [
                { text: '생성: 문제로' },
                { text: 'https://munjero.xyz/ 여기에서 추가로 더 많은 문제를 받을 수 있습니다' },
                { text: '이 문제는 AI로 생성된 문제입니다.' }
            ],
            alignment: 'center',
            fontSize: 8 * scale,
            color: 'grey',
            margin: [0, 20, 0, 0]
        },
        content: [
            { text: title, style: 'header' },
            ...(subtitle ? [{ text: subtitle, style: 'subtitle' }] : []),
        ],
        styles: getStyles(fontSize)
    };
};

const buildQuestionsContent = (questions: ExamQuestion[], images?: string[] | null) => {
    const content: any[] = [];
    questions.forEach((q, qIndex) => {
        let questionStem = q.stem;
        const imageRegex = /\[그림 (\d+)\]/g;
        
        // Find image references in the question stem and render them as separate blocks before the text.
        const imageMatches = [...questionStem.matchAll(imageRegex)];
        if (imageMatches.length > 0 && images) {
            const uniqueImageIndices = [...new Set(imageMatches.map(match => parseInt(match[1], 10) - 1))];
            uniqueImageIndices.forEach(imageIndex => {
                if (images[imageIndex]) {
                    content.push({
                        image: images[imageIndex],
                        width: 300,
                        alignment: 'center',
                        margin: [0, 5, 0, 10]
                    });
                }
            });
        }
        
        // Remove image tags from the stem text
        questionStem = questionStem.replace(imageRegex, '').trim();

        content.push({ text: `문항 ${qIndex + 1}. ${questionStem}`, style: 'questionStem' });
        const choices = q.choices;
        content.push({
            stack: choices.map((choice, cIndex) => ({ text: `${'①②③④⑤'[cIndex]} ${choice}` })),
            style: 'choiceList'
        });
    });
    return content;
};

const buildAnswersContent = (questions: ExamQuestion[]) => {
    const content: any[] = [];
    questions.forEach((q, qIndex) => {
        content.push({ text: `문항 ${qIndex + 1} 해설`, style: 'questionStem' });
        const answer_index = q.answer_index;
        content.push({ text: `정답: ${'①②③④⑤'[answer_index]}`, bold: true, margin: [0, 0, 0, 5] });
        
        const explanationParagraphs = q.explanation.split('\n').filter(p => p.trim() !== '').map(p => ({
            text: p.trim(),
            style: 'explanationParagraph'
        }));

        content.push({
            table: {
                widths: ['*'],
                body: [[{
                    stack: [
                        { text: '해설', style: 'explanationTitle' },
                        ...explanationParagraphs,
                    ],
                    border: [false, false, false, false],
                    margin: [10, 10, 10, 10]
                }]]
            },
            layout: {
                fillColor: '#f9fafb',
                defaultBorder: false,
            },
            margin: [0, 0, 0, 15]
        });
    });
    return content;
};

const buildPassageContent = (passage: string, images?: string[] | null) => {
    if (!passage || !passage.trim()) return [];

    const content: any[] = [];
    const parts = passage.split(/(\[그림 \d+\])/g);

    parts.forEach(part => {
        if (!part) return; // Skip empty parts
        const match = part.match(/\[그림 (\d+)\]/);
        if (match && images) {
            const imageIndex = parseInt(match[1], 10) - 1;
            if (images[imageIndex]) {
                content.push({
                    image: images[imageIndex],
                    width: 300,
                    alignment: 'center',
                    margin: [0, 10, 0, 10]
                });
            }
        } else if (part.trim() !== '') {
            const paragraphs = part.trim().split('\n').filter(p => p.trim() !== '');
            paragraphs.forEach(p => {
                content.push({ text: p.trim(), style: 'passageParagraph', firstLineIndent: 15 });
            });
        }
    });

    return content;
};

const buildDataTableContent = (dataTable: string[][]) => {
  if (!dataTable || dataTable.length === 0) return [];
  const header = dataTable[0];
  const body = dataTable.slice(1);
  return [{
    table: {
      headerRows: 1,
      widths: Array(header.length).fill('*'),
      body: [
        header.map(cell => ({ text: cell, style: { bold: true, alignment: 'center' }})),
        ...body
      ]
    },
    layout: {
        hLineWidth: function (i: number, node: any) {
            return (i === 0 || i === 1 || i === node.table.body.length) ? 1.5 : 1;
        },
        vLineWidth: function (i: number, node: any) {
            return (i === 0 || i === node.table.widths.length) ? 1.5 : 0;
        },
        hLineColor: function (i: number, node: any) {
            return (i === 0 || i === 1 || i === node.table.body.length) ? 'black' : 'gray';
        },
        vLineColor: function (i: number, node: any) {
            return (i === 0 || i === node.table.widths.length) ? 'black' : 'gray';
        },
        paddingTop: function(i: number, node: any) { return 4; },
        paddingBottom: function(i: number, node: any) { return 4; },
    },
    margin: [0, 5, 0, 15]
  }];
};


const createAndDownloadPdf = (docDefinition: TDocumentDefinitions, filename: string) => {
    if (!pdfMakerInstance) {
        throw new Error("PDF generator is not initialized. Cannot create PDF.");
    }
    // Pass fonts and vfs explicitly to the createPdf call to ensure they are available.
    pdfMakerInstance.createPdf(docDefinition, undefined, pdfMakerInstance.fonts, pdfMakerInstance.vfs).download(filename);
}

export const convertQuizSetToTestResult = (quizSet: QuizSet): TestResult => {
    const questions: ExamQuestion[] = quizSet.questions.map((q, index) => ({
        exam: ExamType.COMMUNITY,
        year: new Date().getFullYear(),
        source: quizSet.author.name,
        subject: quizSet.tags[0] || '커뮤니티 문제',
        section: quizSet.title,
        question_id: `${quizSet.id}-${index}`,
        stem: q.question,
        choices: q.options,
        answer_index: q.answer,
        explanation: q.explanation,
        tags: quizSet.tags,
        difficulty: 3, // Default difficulty
    }));

    return {
        title: quizSet.title,
        config: {
            examType: ExamType.COMMUNITY,
            subject: (quizSet.tags[0] as Subject) || Subject.COMMUNICATION, // Cast and provide a default
            numQuestions: questions.length
        },
        questions,
        userAnswers: {},
        score: 0,
        totalQuestions: questions.length,
        timeTaken: 0,
        date: new Date().toISOString()
    };
};

export const generateTestPdf = async (result: TestResult, includeAnswers: boolean, includeConditions: boolean, fontSize: 'standard' | 'large') => {
    if (!areFontsInitialized()) await initializePdfFonts();

    const docDefinition = getDocDefinition(result.title || result.config.subject, result.config.examType, fontSize);
    
    const newContent: any[] = Array.isArray(docDefinition.content) ? [...docDefinition.content] : [docDefinition.content];

    if (includeConditions && result.generationConditions) {
        const { goal, questionType, subject, passageLength, difficulty, numQuestions, questionStemStyle, questionChoicesStyle } = result.generationConditions;
        
        let conditions: {text: string, style: string}[] = [
            { text: `• 학습 목표: ${goal}`, style: 'conditionsItem' },
            { text: `• 문제 유형: ${questionType}`, style: 'conditionsItem' },
            { text: `• 교과 과목: ${subject.main} > ${subject.sub}`, style: 'conditionsItem' },
            { text: `• 세부 조건: 본문 ${passageLength}자 내외, 난이도 ${difficulty}, ${numQuestions}문제`, style: 'conditionsItem' }
        ];

        if (questionStemStyle) {
            conditions.push({ text: `• 문제 스타일: ${questionStemStyle}`, style: 'conditionsItem' });
        }
        if (questionChoicesStyle) {
             conditions.push({ text: `• 선택지 스타일: ${questionChoicesStyle}`, style: 'conditionsItem' });
        }

        newContent.push({
            table: {
                widths: ['*'],
                body: [[{
                    stack: [
                        { text: '문제 생성 조건', style: 'conditionsTitle' },
                       ...conditions
                    ],
                    border: [true, true, true, true],
                    borderColor: ['#e2e8f0', '#e2e8f0', '#e2e8f0', '#e2e8f0'],
                    margin: [10, 10, 10, 10],
                }]]
            },
            layout: {
                defaultBorder: false,
                fillColor: '#f8fafc',
            },
            margin: [0, 0, 0, 20],
        });
    }

    // Adapt layout based on quiz type
    if (result.dialogue) {
        newContent.push({ text: '대화문', style: 'sectionTitle' });
        const dialogueContent = result.dialogue.map(turn => {
            const isStudent = turn.speaker.includes('학생');
            const bubbleColor = isStudent ? '#f1f5f9' : '#eff6ff'; // slate-100 or blue-50
            const speakerColor = isStudent ? '#0ea5e9' : '#4f46e5'; // sky-500 or indigo-600

            return {
                table: {
                    widths: ['auto', '*'],
                    body: [[
                        { text: turn.speaker, bold: true, color: speakerColor, margin: [0, 8, 10, 0] },
                        {
                            table: {
                                widths: ['*'],
                                body: [[{
                                    text: turn.line,
                                    border: [false, false, false, false],
                                    margin: [8, 8, 8, 8]
                                }]]
                            },
                            layout: {
                                fillColor: bubbleColor,
                                defaultBorder: false,
                            },
                        }
                    ]]
                },
                layout: 'noBorders',
                margin: [0, 0, 0, 5]
            };
        });
        newContent.push(...dialogueContent);
        newContent.push({ text: '', margin: [0, 0, 0, 15] });

    } else if (result.dataTable || result.passage) {
        const passageContentContainer: any[] = [];
        passageContentContainer.push({ text: '제시문', style: 'sectionTitle' });
        
        if (result.dataTable) {
            passageContentContainer.push(...buildDataTableContent(result.dataTable));
        }
        if (result.passage) {
            passageContentContainer.push(...buildPassageContent(result.passage, result.images));
        }
        newContent.push(...passageContentContainer);
    }
    
    // For types like 'CONCEPT_UNDERSTANDING', no passage/dialogue is added, just questions.

    newContent.push({ text: '문제', style: 'sectionTitle' });
    newContent.push(...buildQuestionsContent(result.questions, result.images));

    if (includeAnswers) {
        newContent.push({ text: '정답 및 해설', style: 'sectionTitle', pageBreak: 'before' });
        newContent.push(...buildAnswersContent(result.questions));
    }

    if (result.userProvidedLinks && result.userProvidedLinks.length > 0) {
        newContent.push({
            text: '제공된 참고 링크',
            style: 'sectionTitle',
            margin: [0, 20, 0, 10]
        });

        const linksContent = {
            ul: result.userProvidedLinks.map(link => ({
                text: link, link: link, color: 'blue', decoration: 'underline', fontSize: 9 * (fontSize === 'large' ? 1.2 : 1.0)
            }))
        };
        newContent.push(linksContent);
    }
    
    if (result.suggestedLinks && result.suggestedLinks.length > 0) {
        newContent.push({
            text: 'AI 추천 학습 자료',
            style: 'sectionTitle',
            margin: [0, 20, 0, 10]
        });

        const linksContent = {
            ul: result.suggestedLinks.map(link => ({
                stack: [
                    { text: link.title, bold: true },
                    { text: link.uri, link: link.uri, color: 'blue', decoration: 'underline', fontSize: 9 * (fontSize === 'large' ? 1.2 : 1.0) }
                ],
                margin: [0, 0, 0, 5]
            }))
        };
        newContent.push(linksContent);
    }
    
    docDefinition.content = newContent;
    
    const safeTitle = (result.title || '문제')
        .replace(/[/\\?%*:|"<>]/g, '') // Remove invalid filename characters
        .replace(/\s+/g, '_');         // Replace spaces with underscores
    
    const difficulty = result.generationConditions?.difficulty || '난이도';
    const filename = `${result.config.subject}_${safeTitle}_${difficulty}.pdf`;
    
    createAndDownloadPdf(docDefinition, filename);
};

export const generateTextPdf = async (text: string, images: string[] | null = null) => {
    if (!areFontsInitialized()) await initializePdfFonts();

    const title = images && images.length > 0 ? '텍스트 및 이미지 문서' : '텍스트 문서';
    const filename = images && images.length > 0 ? 'document_with_images.pdf' : 'document.pdf';
    const docDefinition = getDocDefinition(title);
    
    const newContent = Array.isArray(docDefinition.content) ? [...docDefinition.content] : [docDefinition.content];
    
    // Add the text
    if(text) {
        newContent.push({ text: text, style: 'passageParagraph' });
    }

    // Add the images
    if (images && images.length > 0) {
        newContent.push({ text: '첨부 이미지', style: 'sectionTitle', margin: [0, 20, 0, 10] });
        images.forEach((imageUrl, index) => {
            newContent.push({
                image: imageUrl,
                width: 450,
                alignment: 'center',
                margin: [0, 0, 0, 10] // Add some margin between images
            });
            newContent.push({
                text: `[그림 ${index + 1}]`,
                fontSize: 9,
                italics: true,
                alignment: 'center',
                margin: [0, 0, 0, 20]
            });
        });
    }

    docDefinition.content = newContent;

    createAndDownloadPdf(docDefinition, filename);
};

export const generateSuneungStylePdf = async (data: ParsedExamData, images: string[] | null) => {
    if (!areFontsInitialized()) await initializePdfFonts();

    const docDefinition = getDocDefinition(data.subject, '모의 평가');

    // Build content for the passage column
    const passageContent: any[] = [];
    data.passageParagraphs.forEach((paragraph, pIndex) => {
        passageContent.push({ text: paragraph, style: 'passageParagraph' });
        
        const imagePlacement = data.imagePlacements?.find(p => p.paragraphIndex === pIndex);
        if (imagePlacement && images && images[imagePlacement.imageIndex]) {
            passageContent.push({
                image: images[imagePlacement.imageIndex],
                width: 220, // width suitable for a column
                alignment: 'center',
                margin: [0, 5, 0, 5]
            });
            if (imagePlacement.caption) {
                 passageContent.push({ text: `[그림 ${imagePlacement.imageIndex+1}] ${imagePlacement.caption}`, fontSize: 9, italics: true, alignment: 'center', margin: [0, 0, 0, 10] });
            }
        }
    });

    // Build content for the questions column
    const questionsContent: any[] = [];
    data.questions.forEach((q, qIndex) => {
        questionsContent.push({ text: q.questionText, style: 'questionStem' });
        questionsContent.push({
            ol: q.options.map((choice) => ({ text: choice })),
            style: 'choiceList'
        });
    });
    
    if (Array.isArray(docDefinition.content)) {
        docDefinition.content.push({
             // Two-column layout
            columns: [
                {
                    width: '50%',
                    stack: passageContent,
                    margin: [0, 0, 10, 0] // right margin
                },
                {
                    width: '50%',
                    stack: questionsContent,
                    margin: [10, 0, 0, 0] // left margin
                }
            ],
            columnGap: 15
        });
    }
    
    createAndDownloadPdf(docDefinition, `${data.subject}_시험지.pdf`);
};

/**
 * Converts AI-generated quiz data into the standard TestResult format for PDF generation.
 */
export const convertAiQuizToTestResult = (
  quizData: QuizData, 
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
  }
): TestResult => {
    const questions: ExamQuestion[] = quizData.quiz.map((q, index) => ({
        exam: ExamType.COMMUNITY,
        year: new Date().getFullYear(),
        source: 'AI Tutor',
        subject: userInput.subject.main,
        section: userInput.subject.sub,
        question_id: `ai-gen-${Date.now()}-${index}`,
        stem: q.question,
        choices: q.options,
        answer_index: q.answer,
        explanation: q.explanation,
        tags: [q.knowledgeTag],
        difficulty: 3, // Default difficulty
    }));

    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const foundUrls = userInput.text.match(urlRegex);

    return {
        title: userInput.goal,
        passage: quizData.passage,
        images: userInput.image || undefined,
        dataTable: quizData.dataTable,
        dialogue: quizData.dialogue,
        config: {
            examType: ExamType.COMMUNITY,
            subject: userInput.subject.main as unknown as Subject,
            numQuestions: questions.length,
        },
        questions,
        userAnswers: {},
        score: 0,
        totalQuestions: questions.length,
        timeTaken: 0,
        date: new Date().toISOString(),
        generationConditions: {
            goal: userInput.goal,
            questionType: userInput.questionType,
            subject: userInput.subject,
            passageLength: userInput.passageLength,
            difficulty: userInput.difficulty,
            numQuestions: userInput.numQuestions,
            useOriginalText: userInput.useOriginalText,
            questionStemStyle: userInput.questionStemStyle,
            questionChoicesStyle: userInput.questionChoicesStyle,
        },
        suggestedLinks: quizData.suggestedLinks,
        userProvidedLinks: foundUrls || undefined,
    };
};
