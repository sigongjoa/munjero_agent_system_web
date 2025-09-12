import React from 'react';
import type { ActiveView } from '../types';

interface Feature {
    title: string;
    description: string;
    icon: React.FC<{ className?: string }>;
    view: ActiveView;
}

interface ExamHubProps {
    icon: React.FC<{ className?: string }>;
    title: string;
    description: string;
    features: Feature[];
    onNavigate: (view: ActiveView) => void;
}

const ExamHub: React.FC<ExamHubProps> = ({ icon: HubIcon, title, description, features, onNavigate }) => {
    return (
        <div className="animate-fade-in space-y-8">
            <div className="text-center p-8 bg-white rounded-2xl shadow-sm border border-slate-200">
                <HubIcon className="w-12 h-12 text-primary-600 mx-auto mb-4" />
                <h1 className="text-3xl font-bold text-slate-800">{title}</h1>
                <p className="text-slate-500 mt-2 max-w-2xl mx-auto">{description}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {features.map((feature, index) => (
                    <button
                        key={index}
                        onClick={() => onNavigate(feature.view)}
                        className="text-left p-6 bg-white rounded-xl shadow-sm border border-slate-200 flex items-start gap-5 hover:border-primary-500 hover:ring-2 hover:ring-primary-200 transition-all duration-200 transform hover:-translate-y-1"
                    >
                        <div className="flex-shrink-0 bg-primary-100 p-3 rounded-full">
                            <feature.icon className="w-6 h-6 text-primary-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-lg text-slate-800">{feature.title}</h3>
                            <p className="text-slate-600 text-sm mt-1">{feature.description}</p>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
};

export default ExamHub;
