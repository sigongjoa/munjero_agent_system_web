
import React, { useMemo } from 'react';
import { shortAnswerQuestionAnalysis } from '../services/shortAnswerQuestionAnalysis';

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

const KnowledgeBase: React.FC = () => {

    const { intro, sections, conclusion, tocTitles } = useMemo(() => {
        const fullText = shortAnswerQuestionAnalysis;
        const introEnd = fullText.indexOf('II. 문제 유형별 상세 분석');
        const introText = fullText.substring(0, introEnd);

        const conclusionStart = fullText.indexOf('IV. 결론 및 제언');
        const conclusionText = fullText.substring(conclusionStart);
        
        const mainContent = fullText.substring(introEnd, conclusionStart);
        const sectionTexts = mainContent.split(/(?=\n[A-J]\.)/).map(s => s.trim()).filter(s => s);

        const titles = {
            intro: introText.match(/^I\..+/m)?.[0] || '서론',
            analysis: mainContent.match(/^II\..+/m)?.[0] || '문제 유형별 상세 분석',
            conclusion: conclusionText.match(/^IV\..+/m)?.[0] || '결론 및 제언',
        }
        
        return { intro: introText, sections: sectionTexts, conclusion: conclusionText, tocTitles: titles };
    }, []);
    
    const renderBlock = (text: string, isIntroList: boolean = false) => {
        return text.split('\n').map((line, index) => {
            const trimmedLine = line.trim();
            if (trimmedLine === '') return null;
            if (trimmedLine.match(/^[가-힣\s]+:/)) {
                 return <h4 key={index} className="text-lg font-semibold text-slate-800 mt-6 mb-2">{renderWithBold(trimmedLine)}</h4>
            }
            if (isIntroList && trimmedLine.endsWith('형')) {
                 return <li key={index} className="text-slate-700 leading-relaxed">{renderWithBold(trimmedLine)}</li>;
            }
            return <p key={index} className="mb-4 text-slate-700 leading-relaxed whitespace-pre-wrap">{renderWithBold(trimmedLine)}</p>
        }).filter(Boolean);
    };

    const renderIntro = (text: string) => {
        const parts = text.split('각 문제 유형에 대한 분석을 통해, 현대 교육 평가가 지향하는 바와 학습자들이 갖춰야 할 핵심 역량에 대한 포괄적인 이해를 제공하고자 한다.');
        const part1 = parts[0];
        const listAndPart2 = parts[1];
        
        const listText = "사료(텍스트) 해석형\n\n그래프·통계 자료 해석형\n\n개념 이해형\n\n비교·대조형\n\n사례 적용형\n\n순서 배열형\n\n원인·결과 분석형\n\n논쟁형(찬반형)\n\n용어 정의형\n\n통합·융합형";
        
        const afterList = listAndPart2.replace(listText.replace(/\n\n/g, '\n'),'');

        return (
            <>
                {renderBlock(part1)}
                <ul className="list-disc list-inside bg-slate-50 p-4 my-4 rounded-lg border">
                    {renderBlock(listText, true)}
                </ul>
                <p className="mb-4 text-slate-700 leading-relaxed">각 문제 유형에 대한 분석을 통해, 현대 교육 평가가 지향하는 바와 학습자들이 갖춰야 할 핵심 역량에 대한 포괄적인 이해를 제공하고자 한다.</p>
                {renderBlock(afterList)}
            </>
        )
    }

    return (
        <div className="animate-fade-in bg-white p-6 sm:p-10 rounded-2xl shadow-lg border border-slate-200 w-full">
            <div id="introduction">
                <h2 className="text-3xl font-bold text-slate-900 mt-4 mb-6 border-b-2 border-slate-300 pb-3">{renderWithBold(tocTitles.intro)}</h2>
                {renderIntro(intro.split('\n').slice(1).join('\n'))}
            </div>
            
            <h2 id="main-analysis" className="text-3xl font-bold text-slate-900 mt-12 mb-6 border-b-2 border-slate-300 pb-3">{renderWithBold(tocTitles.analysis)}</h2>
            {sections.map((sectionText) => {
                const firstLine = sectionText.split('\n')[0];
                const restOfText = sectionText.substring(firstLine.length).trim();
                const id = `section-${firstLine.charAt(0).toLowerCase()}`;
                return (
                    <div key={id} id={id}>
                        <h3 className="text-2xl font-bold text-primary-700 mt-10 mb-4">{renderWithBold(firstLine)}</h3>
                        {renderBlock(restOfText)}
                    </div>
                );
            })}

            <div id="conclusion" className="mt-12">
                 <h2 className="text-3xl font-bold text-slate-900 mt-4 mb-6 border-b-2 border-slate-300 pb-3">{renderWithBold(tocTitles.conclusion)}</h2>
                {renderBlock(conclusion.split('\n').slice(1).join('\n'))}
            </div>
        </div>
    );
};

export default KnowledgeBase;
