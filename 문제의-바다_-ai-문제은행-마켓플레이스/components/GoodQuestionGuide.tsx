
import React from 'react';
import { goodQuestionGuide } from '../services/goodQuestionGuide';

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

const GoodQuestionGuide: React.FC = () => {
    // Basic parser for the content
    const renderContent = () => {
        const content = goodQuestionGuide.replace('좋은 문제란 무엇인가?', '').trim();
        const sections = content.split(/\n(?=\d\.\s|선생님)/);

        return sections.map((section, index) => {
            const lines = section.trim().split('\n').filter(line => line.trim() !== '');
            const title = lines[0];
            const body = lines.slice(1);

            if (title.startsWith('선생님')) {
                return (
                    <div key={index}>
                        <h2 className="text-2xl font-bold text-slate-900 mt-10 mb-4 border-b border-slate-200 pb-2">{renderWithBold(title)}</h2>
                        <p className="mb-4 text-slate-700 leading-relaxed">{renderWithBold(body.join('\n'))}</p>
                    </div>
                )
            }
            if (title.match(/^\d\.\s/)) {
                 return (
                    <div key={index}>
                        <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">{renderWithBold(title)}</h3>
                        {body.map((line, lineIndex) => {
                            if (line.match(/^[가-힣\s]+:/)) {
                                const parts = line.split(':');
                                return <p key={lineIndex} className="mb-4 text-slate-700 leading-relaxed"><strong className="font-semibold text-slate-800">{renderWithBold(parts[0])}:</strong>{renderWithBold(parts.slice(1).join(':'))}</p>;
                            }
                            return <p key={lineIndex} className="mb-4 text-slate-700 leading-relaxed">{renderWithBold(line)}</p>
                        })}
                    </div>
                )
            }
            
            // Handle the first section ('핵심적인 특징')
            if (title.startsWith('핵심적인')) {
                 return (
                    <div key={index}>
                         <h3 className="text-xl font-bold text-slate-800 mt-6 mb-3">{renderWithBold(title)}</h3>
                         {body.map((item, itemIndex) => (
                              <div key={itemIndex} className="flex items-start mb-3">
                                <span className="text-primary-600 font-bold mr-2">✓</span>
                                <p className="text-slate-700 leading-relaxed">{renderWithBold(item)}</p>
                            </div>
                         ))}
                    </div>
                 )
            }

            return <p key={index} className="mb-4 text-slate-700 leading-relaxed">{renderWithBold(section)}</p>;
        });
    };

    return (
        <div className="animate-fade-in bg-white p-6 sm:p-10 rounded-2xl shadow-lg border border-slate-200 w-full">
            <h1 className="text-3xl font-bold text-slate-900 mb-4">좋은 문제란 무엇인가?</h1>
            <p className="mb-4 text-slate-700 leading-relaxed">'좋은 문제'는 단순히 지식을 암기했는지 확인하는 것을 넘어, 학생들의 사고력과 문제 해결 능력을 효과적으로 측정하고 향상시키는 데 기여하는 문제입니다.</p>
            {renderContent()}
        </div>
    );
};

export default GoodQuestionGuide;
